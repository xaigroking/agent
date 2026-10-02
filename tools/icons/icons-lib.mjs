// 生成器与校验器共用：配置读取、产物清单、源指纹。仅依赖 Node 内置模块。
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SPEC_VERSION = '1.0';
export const CONFIG_PATH = 'branding/icon.config.json';
export const HASH_PATH = 'branding/icon.hash';

const DEFAULTS = {
  status: 'draft',
  source: 'branding/icon.svg',
  faviconSource: null,
  background: '#FFFFFF',
  profiles: ['web'],
  out: {
    web: 'public',
    ios: 'branding/generated/ios/AppIcon.appiconset',
    android: 'branding/generated/android/res',
    windows: 'branding/generated/windows/app.ico',
    macos: 'branding/generated/macos/app.icns',
  },
  web: { basePath: '/', manifest: 'manifest.webmanifest', htmlFiles: [] },
  scale: { opaque: 0.8, maskable: 0.6, macos: 0.7 },
};

export const PROFILES = ['web', 'ios', 'android', 'windows', 'macos'];
export const STATUSES = ['placeholder', 'draft', 'approved'];
export const WEB_ICO_SIZES = [16, 32, 48];
export const WINDOWS_ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
export const ANDROID_DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

export function loadConfig(root) {
  const file = path.join(root, CONFIG_PATH);
  if (!existsSync(file)) throw new Error(`缺少配置文件 ${CONFIG_PATH}`);
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const cfg = {
    ...DEFAULTS,
    ...raw,
    out: { ...DEFAULTS.out, ...raw.out },
    web: { ...DEFAULTS.web, ...raw.web },
    scale: { ...DEFAULTS.scale, ...raw.scale },
  };
  if (!cfg.name) throw new Error('配置缺少 name');
  if (!STATUSES.includes(cfg.status)) throw new Error(`status 只能是 ${STATUSES.join(' / ')}`);
  const bad = cfg.profiles.filter((p) => !PROFILES.includes(p));
  if (bad.length) throw new Error(`未知 profiles：${bad.join(', ')}`);
  if (!/^#[0-9a-fA-F]{6}$/.test(cfg.background)) throw new Error('background 必须是 #RRGGBB');
  return cfg;
}

// 源文件 + 配置的指纹。源或配置改了而没重新生成，校验器会报错。
export function sourceHash(root, cfg) {
  const h = crypto.createHash('sha256');
  h.update(SPEC_VERSION);
  h.update(readFileSync(path.join(root, CONFIG_PATH)));
  for (const src of [cfg.source, cfg.faviconSource]) {
    if (src) h.update(readFileSync(path.join(root, src)));
  }
  return h.digest('hex');
}

export const isSvg = (p) => p.toLowerCase().endsWith('.svg');

// 期望产物清单：生成器按它输出，校验器按它检查。
// kind: png（size, opaque）| ico（sizes）| icns | svg | json | xml
export function expectedOutputs(cfg) {
  const items = [];
  const add = (profile, file, spec) => items.push({ profile, file, ...spec });

  if (cfg.profiles.includes('web')) {
    const d = cfg.out.web;
    add('web', path.join(d, 'favicon.ico'), { kind: 'ico', sizes: WEB_ICO_SIZES });
    if (isSvg(cfg.faviconSource || cfg.source)) add('web', path.join(d, 'icon.svg'), { kind: 'svg' });
    add('web', path.join(d, 'apple-touch-icon.png'), { kind: 'png', size: 180, opaque: true });
    add('web', path.join(d, 'icon-192.png'), { kind: 'png', size: 192 });
    add('web', path.join(d, 'icon-512.png'), { kind: 'png', size: 512 });
    add('web', path.join(d, 'icon-maskable-512.png'), { kind: 'png', size: 512, opaque: true });
    add('web', path.join(d, cfg.web.manifest), { kind: 'json' });
  }
  if (cfg.profiles.includes('ios')) {
    const d = cfg.out.ios;
    add('ios', path.join(d, 'icon-1024.png'), { kind: 'png', size: 1024, opaque: true });
    add('ios', path.join(d, 'Contents.json'), { kind: 'json' });
  }
  if (cfg.profiles.includes('android')) {
    const d = cfg.out.android;
    for (const [density, f] of Object.entries(ANDROID_DENSITIES)) {
      const m = path.join(d, `mipmap-${density}`);
      add('android', path.join(m, 'ic_launcher.png'), { kind: 'png', size: 48 * f, opaque: true });
      add('android', path.join(m, 'ic_launcher_round.png'), { kind: 'png', size: 48 * f });
      add('android', path.join(m, 'ic_launcher_foreground.png'), { kind: 'png', size: 108 * f });
      add('android', path.join(m, 'ic_launcher_monochrome.png'), { kind: 'png', size: 108 * f });
    }
    add('android', path.join(d, 'mipmap-anydpi-v26', 'ic_launcher.xml'), { kind: 'xml' });
    add('android', path.join(d, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), { kind: 'xml' });
    add('android', path.join(d, 'values', 'ic_launcher_background.xml'), { kind: 'xml' });
  }
  if (cfg.profiles.includes('windows')) {
    add('windows', cfg.out.windows, { kind: 'ico', sizes: WINDOWS_ICO_SIZES });
  }
  if (cfg.profiles.includes('macos')) {
    add('macos', cfg.out.macos, { kind: 'icns' });
  }
  return items;
}

export function webManifestIcons(cfg) {
  const base = cfg.web.basePath.endsWith('/') ? cfg.web.basePath : cfg.web.basePath + '/';
  return [
    { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
    { src: `${base}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
}
