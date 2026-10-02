#!/usr/bin/env node
// 从 branding/icon.svg（或 1024 PNG）生成各平台图标。用法：node tools/icons/generate-icons.mjs [项目根目录]
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import png2icons from 'png2icons';
import {
  loadConfig, sourceHash, expectedOutputs, webManifestIcons, isSvg,
  HASH_PATH, ANDROID_DENSITIES,
} from './icons-lib.mjs';

const root = path.resolve(process.argv[2] || '.');
const cfg = loadConfig(root);
const abs = (p) => path.join(root, p);
const bg = cfg.background;

async function loadSource(rel) {
  const buf = await readFile(abs(rel));
  if (isSvg(rel)) {
    const text = buf.toString('utf8');
    if (/<image[\s>]/i.test(text)) throw new Error(`${rel} 内嵌位图，不是真正的矢量源`);
    const vb = text.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (!vb) throw new Error(`${rel} 缺少 viewBox`);
    if (Math.abs(+vb[1] - +vb[2]) > 1e-6) throw new Error(`${rel} 的 viewBox 不是正方形`);
    return { buf, svg: true, width: +vb[1] };
  }
  const meta = await sharp(buf).metadata();
  if (meta.width !== meta.height || meta.width < 1024) throw new Error(`${rel} 必须是正方形且不小于 1024px`);
  return { buf, svg: false, width: meta.width };
}

// 把源渲染成 size×size、透明背景的 PNG
async function render(src, size) {
  const img = src.svg ? sharp(src.buf, { density: Math.min(72 * (size / src.width) * 2, 100000) }) : sharp(src.buf);
  return img.resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

// 符号按比例缩放后居中放到 size×size 画布上；fill 为底色（null 为透明）
async function compose(src, size, scale, fill = null) {
  const inner = Math.round(size * scale);
  const symbol = await render(src, inner);
  const canvas = sharp({
    create: { width: size, height: size, channels: 4, background: fill || { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: symbol, gravity: 'center' }]);
  return fill ? canvas.flatten({ background: fill }).removeAlpha().png().toBuffer() : canvas.png().toBuffer();
}

const maskWith = (buf, svgMask) => sharp(buf).composite([{ input: Buffer.from(svgMask), blend: 'dest-in' }]).png().toBuffer();
const circle = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}"/></svg>`;

// 单色剪影（Android 13 主题图标）：白色 + 原 alpha
async function monochrome(buf, size) {
  return sharp({ create: { width: size, height: size, channels: 4, background: '#FFFFFF' } })
    .composite([{ input: buf, blend: 'dest-in' }]).png().toBuffer();
}

function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

async function put(rel, data) {
  await mkdir(path.dirname(abs(rel)), { recursive: true });
  await writeFile(abs(rel), data);
  console.log(`  写入 ${rel}`);
}

const src = await loadSource(cfg.source);
const fav = cfg.faviconSource ? await loadSource(cfg.faviconSource) : src;
const { opaque, maskable, macos } = cfg.scale;

if (cfg.profiles.includes('web')) {
  const d = cfg.out.web;
  console.log('web');
  await put(path.join(d, 'favicon.ico'), ico(await Promise.all([16, 32, 48].map(async (s) => ({ size: s, data: await render(fav, s) })))));
  if (fav.svg) {
    await mkdir(abs(d), { recursive: true });
    await copyFile(abs(cfg.faviconSource || cfg.source), abs(path.join(d, 'icon.svg')));
    console.log(`  写入 ${path.join(d, 'icon.svg')}`);
  }
  await put(path.join(d, 'apple-touch-icon.png'), await compose(src, 180, opaque, bg));
  await put(path.join(d, 'icon-192.png'), await render(src, 192));
  await put(path.join(d, 'icon-512.png'), await render(src, 512));
  await put(path.join(d, 'icon-maskable-512.png'), await compose(src, 512, maskable, bg));
  const mf = path.join(d, cfg.web.manifest);
  const manifest = existsSync(abs(mf)) ? JSON.parse(await readFile(abs(mf), 'utf8')) : { name: cfg.name, short_name: cfg.name };
  manifest.icons = webManifestIcons(cfg);
  await put(mf, JSON.stringify(manifest, null, 2) + '\n');
}

if (cfg.profiles.includes('ios')) {
  const d = cfg.out.ios;
  console.log('ios');
  await put(path.join(d, 'icon-1024.png'), await compose(src, 1024, opaque, bg));
  await put(path.join(d, 'Contents.json'), JSON.stringify({
    images: [{ filename: 'icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info: { author: 'xcode', version: 1 },
  }, null, 2) + '\n');
}

if (cfg.profiles.includes('android')) {
  const d = cfg.out.android;
  console.log('android');
  for (const [density, f] of Object.entries(ANDROID_DENSITIES)) {
    const m = path.join(d, `mipmap-${density}`);
    const legacy = await compose(src, 48 * f, opaque, bg);
    await put(path.join(m, 'ic_launcher.png'), legacy);
    await put(path.join(m, 'ic_launcher_round.png'), await maskWith(await sharp(legacy).ensureAlpha().png().toBuffer(), circle(48 * f)));
    const fg = await compose(src, 108 * f, maskable);
    await put(path.join(m, 'ic_launcher_foreground.png'), fg);
    await put(path.join(m, 'ic_launcher_monochrome.png'), await monochrome(fg, 108 * f));
  }
  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
  await put(path.join(d, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptive);
  await put(path.join(d, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptive);
  await put(path.join(d, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${bg}</color>
</resources>
`);
}

if (cfg.profiles.includes('windows')) {
  console.log('windows');
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  await put(cfg.out.windows, ico(await Promise.all(sizes.map(async (s) => ({ size: s, data: await render(fav, s) })))));
}

if (cfg.profiles.includes('macos')) {
  console.log('macos');
  // macOS 不会自动加圆角：在 1024 画布内放 824 的圆角底板，四周留透明边
  const plate = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="100" y="100" width="824" height="824" rx="185" fill="${bg}"/></svg>`;
  const symbol = await render(src, Math.round(824 * macos));
  const master = await sharp(Buffer.from(plate)).composite([{ input: symbol, gravity: 'center' }]).png().toBuffer();
  const icns = png2icons.createICNS(master, png2icons.BICUBIC, 0);
  if (!icns) throw new Error('ICNS 生成失败');
  await put(cfg.out.macos, icns);
}

await put(HASH_PATH, sourceHash(root, cfg) + '\n');
console.log(`完成：${expectedOutputs(cfg).length} 个产物。下一步运行 validate-icons.mjs`);
