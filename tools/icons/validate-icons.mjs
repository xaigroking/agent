#!/usr/bin/env node
// 图标资产校验器（零依赖，可直接用于 CI）。
// 用法：node tools/icons/validate-icons.mjs [项目根目录] [--release]
// 退出码：0 通过；1 失败。--release 时 status=placeholder 视为失败。
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, sourceHash, expectedOutputs, webManifestIcons, isSvg, HASH_PATH } from './icons-lib.mjs';

const args = process.argv.slice(2);
const release = args.includes('--release');
const root = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
const abs = (p) => path.join(root, p);

let failed = 0;
const ok = (m) => console.log(`✓ ${m}`);
const fail = (m) => { failed++; console.log(`✗ ${m}`); };
const warn = (m) => console.log(`! ${m}`);

function png(buf) {
  if (buf.length < 26 || buf.toString('latin1', 1, 4) !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colorType: buf[25] };
}
function icoSizes(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const n = buf.readUInt16LE(4);
  return Array.from({ length: n }, (_, i) => buf[6 + 16 * i] || 256).sort((a, b) => a - b);
}
function icnsTypes(buf) {
  if (buf.length < 8 || buf.toString('latin1', 0, 4) !== 'icns') return null;
  const types = [];
  for (let o = 8; o + 8 <= buf.length;) {
    const len = buf.readUInt32BE(o + 4);
    if (len < 8) break;
    types.push(buf.toString('latin1', o, o + 4));
    o += len;
  }
  return types;
}

let cfg;
try { cfg = loadConfig(root); ok(`配置 branding/icon.config.json（profiles: ${cfg.profiles.join(', ')}）`); }
catch (e) { fail(e.message); process.exit(1); }

// 状态
if (cfg.status === 'placeholder') (release ? fail : warn)('status=placeholder：占位图标，发布前必须替换');
else if (cfg.status === 'draft') warn('status=draft：图标未经人工确认');
else ok('status=approved');

// 源文件
for (const src of [cfg.source, cfg.faviconSource].filter(Boolean)) {
  if (!existsSync(abs(src))) { fail(`源文件不存在：${src}`); continue; }
  const buf = readFileSync(abs(src));
  if (isSvg(src)) {
    const t = buf.toString('utf8');
    const vb = t.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (!vb) fail(`${src} 缺少 viewBox`);
    else if (Math.abs(+vb[1] - +vb[2]) > 1e-6) fail(`${src} 的 viewBox 不是正方形`);
    if (/<image[\s>]/i.test(t)) fail(`${src} 内嵌位图`);
    if (/<text[\s>]/i.test(t)) fail(`${src} 含 <text>：图标默认禁止文字`);
    if (/<script[\s>]/i.test(t)) fail(`${src} 含 <script>`);
    ok(`源文件 ${src}`);
  } else {
    const p = png(buf);
    if (!p) fail(`${src} 不是 PNG`);
    else if (p.w !== p.h || p.w < 1024) fail(`${src} 为 ${p.w}x${p.h}，须为正方形且 ≥1024`);
    else ok(`源文件 ${src}（${p.w}x${p.h}）`);
  }
}

// 产物是否与源同步
if (!existsSync(abs(HASH_PATH))) fail(`缺少 ${HASH_PATH}：尚未运行生成器`);
else if (failed === 0 && readFileSync(abs(HASH_PATH), 'utf8').trim() !== sourceHash(root, cfg)) {
  fail('源文件或配置在生成后被修改：重新运行 generate-icons.mjs');
}

// 产物
for (const item of expectedOutputs(cfg)) {
  const f = item.file;
  if (!existsSync(abs(f))) { fail(`[${item.profile}] 缺少 ${f}`); continue; }
  const buf = readFileSync(abs(f));
  if (item.kind === 'png') {
    const p = png(buf);
    if (!p) { fail(`[${item.profile}] ${f} 不是 PNG`); continue; }
    if (p.w !== item.size || p.h !== item.size) { fail(`[${item.profile}] ${f} 为 ${p.w}x${p.h}，应为 ${item.size}x${item.size}`); continue; }
    if (item.opaque && (p.colorType === 4 || p.colorType === 6)) { fail(`[${item.profile}] ${f} 含透明通道，该平台要求不透明`); continue; }
  } else if (item.kind === 'ico') {
    const sizes = icoSizes(buf);
    const missing = sizes ? item.sizes.filter((s) => !sizes.includes(s)) : item.sizes;
    if (missing.length) { fail(`[${item.profile}] ${f} 缺少尺寸 ${missing.join(', ')}`); continue; }
  } else if (item.kind === 'icns') {
    const types = icnsTypes(buf);
    if (!types || !types.some((t) => ['ic10', 'ic09', 'ic14'].includes(t))) { fail(`[${item.profile}] ${f} 不是有效 ICNS 或缺少 512/1024 尺寸`); continue; }
  } else if (item.kind === 'json') {
    try { JSON.parse(buf.toString('utf8')); } catch { fail(`[${item.profile}] ${f} 不是有效 JSON`); continue; }
  }
  ok(`[${item.profile}] ${f}`);
}

// Web：manifest 与 HTML 引用
if (cfg.profiles.includes('web')) {
  const mf = path.join(cfg.out.web, cfg.web.manifest);
  if (existsSync(abs(mf))) {
    try {
      const icons = JSON.parse(readFileSync(abs(mf), 'utf8')).icons || [];
      for (const want of webManifestIcons(cfg)) {
        const hit = icons.find((i) => i.src === want.src && i.sizes === want.sizes && (i.purpose || 'any') === (want.purpose || 'any'));
        if (!hit) fail(`[web] ${mf} 缺少图标条目 ${want.src}（${want.sizes}${want.purpose ? ' ' + want.purpose : ''}）`);
      }
      if (icons.some((i) => /logo(192|512)\.png$/.test(i.src))) fail(`[web] ${mf} 仍引用模板默认图标 logo192/logo512`);
    } catch { /* JSON 错误已在上面报告 */ }
  }
  if (!cfg.web.htmlFiles.length) warn('[web] 未配置 web.htmlFiles，跳过 <head> 检查（Next.js 等框架按其文件约定检查）');
  for (const h of cfg.web.htmlFiles) {
    if (!existsSync(abs(h))) { fail(`[web] HTML 文件不存在：${h}`); continue; }
    const t = readFileSync(abs(h), 'utf8');
    const has = (rel) => new RegExp(`<link[^>]*rel=["']${rel}["']`, 'i').test(t);
    for (const rel of ['icon', 'apple-touch-icon', 'manifest']) {
      if (!has(rel)) fail(`[web] ${h} 缺少 <link rel="${rel}">`);
    }
    if (/vite\.svg|logo192\.png|react\.svg/i.test(t)) fail(`[web] ${h} 仍引用模板默认图标`);
    if (has('icon') && has('apple-touch-icon') && has('manifest')) ok(`[web] ${h} <head> 引用`);
  }
}

console.log(failed ? `\n校验失败：${failed} 项` : '\n校验通过');
process.exit(failed ? 1 : 0);
