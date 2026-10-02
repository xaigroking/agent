# AI Agent 项目图标资产规范

| 项 | 内容 |
|---|---|
| 版本 | v1.0（标准版，替代 v0.1 Trial，勘误见附录 A） |
| 适用 | 新项目、旧项目；Web / PWA / iOS / Android / Windows / macOS |
| 受众 | 施工的 Agent 与人 |
| 配套工具 | 本仓库 `tools/icons/`：`generate-icons.mjs`（生成）、`validate-icons.mjs`（校验，零依赖） |

**加载方式：按需加载，不要放进常驻上下文。** 项目的 `AGENTS.md` / `CLAUDE.md` 只加一行：

```markdown
- 涉及图标、favicon、App Icon 的任务，先读 docs/standards/icon-assets.md 并按其执行；完成前运行 `node tools/icons/validate-icons.mjs`。
```

---

## 1. 原则

1. **一个来源**：所有平台图标由同一个源文件生成，禁止按平台分别设计。
2. **按平台档位生成**：只生成项目实际发布的平台，不为纯 Web 项目生成 iOS / Android / 桌面图标。
3. **工具生成，工具校验**：尺寸、格式、透明度、引用由脚本生成和检查，不靠 Agent 自述"已完成"。
4. **旧项目不覆盖品牌**：已有品牌图标时以它为源，不得擅自重新设计。

---

## 2. 平台档位（profiles）

| profile | 何时启用 | 产物 |
|---|---|---|
| `web` | 任何以网站或 PWA 形式发布的项目 | favicon、Apple Touch Icon、PWA 图标、manifest |
| `ios` | 有 iOS 原生工程（Swift、React Native、Flutter、Capacitor 等） | `AppIcon.appiconset`（单尺寸 1024） |
| `android` | 有 Android 原生工程 | `mipmap-*` 传统图标 + 自适应图标 + 主题单色图标 |
| `windows` | 发布 Windows 桌面程序 | `app.ico`（16–256） |
| `macos` | 发布 macOS 桌面程序 | `app.icns` |

---

## 3. 源文件

### 3.1 位置与格式

```
branding/
├── icon.svg               # 首选：矢量源
├── icon-1024.png          # 备选：位图源（旧项目已有品牌图、人工设计稿、生图结果）
├── favicon.svg            # 可选：小尺寸专用简化版（仅用于 favicon 与 Windows ico）
├── icon-brief.md          # 设计说明
├── icon.config.json       # 配置
└── icon.hash              # 生成器写入的指纹，勿手改
```

| 源 | 要求（校验器强制） |
|---|---|
| SVG | 有 `viewBox` 且为正方形；不得内嵌位图（`<image>`）；不得含 `<text>`、`<script>` |
| PNG | 正方形，≥ 1024×1024 |

### 3.2 设计要求

源文件是**符号层**：透明背景，背景色由配置的 `background` 统一提供（各平台需要不透明底时由生成器合成）。

* 无文字、无细线：笔画宽度 ≥ 画布的 1/16，16×16 下仍可辨认
* 颜色 ≤ 3 种，与 `background` 高对比
* 主体居中，约占画布 80%
* 透明背景的 favicon 需在浅色和深色标签栏上都可见；做不到时提供 `favicon.svg`（自带底色），或在 SVG 内用 `@media (prefers-color-scheme: dark)` 切换颜色
* 禁止：第三方品牌标志、知名产品图标的仿制、受版权保护的角色、来源不明的图片

### 3.3 设计说明 `branding/icon-brief.md`

```markdown
项目名称：
一句话描述：
目标用户：
关键词（3 个以内）：
图形方案：（例：圆环 + 十字，表示"添加知识"）
配色：符号 #38BDF8 / #F8FAFC，背景 #0F172A
来源：Agent 绘制 SVG / 生图（模型与提示词）/ 人工设计稿
确认人与日期：
```

---

## 4. 配置 `branding/icon.config.json`

```json
{
  "name": "Demo App",
  "status": "draft",
  "source": "branding/icon.svg",
  "background": "#0F172A",
  "profiles": ["web", "ios", "android"],
  "out": {
    "web": "public",
    "ios": "ios/App/App/Assets.xcassets/AppIcon.appiconset",
    "android": "android/app/src/main/res"
  },
  "web": {
    "basePath": "/",
    "manifest": "manifest.webmanifest",
    "htmlFiles": ["index.html"]
  }
}
```

| 字段 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `name` | 是 | — | 新建 manifest 时使用 |
| `status` | 否 | `draft` | `placeholder`（占位）/ `draft`（未经人工确认）/ `approved` |
| `source` | 否 | `branding/icon.svg` | 也可为 `branding/icon-1024.png` |
| `faviconSource` | 否 | 同 `source` | favicon 与 Windows ico 专用源 |
| `background` | 否 | `#FFFFFF` | `#RRGGBB`，不透明平台的底色 |
| `profiles` | 否 | `["web"]` | 见第 2 节 |
| `out.web` | 否 | `public` | 网站根目录（部署后对应 `/`） |
| `out.ios` / `out.android` | 否 | `branding/generated/...` | 指向原生工程的资源目录 |
| `out.windows` / `out.macos` | 否 | `branding/generated/...` | 输出文件路径 |
| `web.basePath` | 否 | `/` | 站点部署在子路径时修改，如 `/app/` |
| `web.manifest` | 否 | `manifest.webmanifest` | 已存在则只替换 `icons` 字段 |
| `web.htmlFiles` | 否 | `[]` | 需要校验 `<head>` 引用的 HTML 文件 |
| `scale.opaque` / `scale.maskable` / `scale.macos` | 否 | 0.8 / 0.6 / 0.7 | 符号在不同底板上的占比 |

---

## 5. 产物清单

生成器与校验器使用同一份清单（`tools/icons/icons-lib.mjs`）。

| profile | 文件 | 规格 |
|---|---|---|
| web | `favicon.ico` | 内含 16、32、48 |
| web | `icon.svg` | 源为 SVG 时复制 |
| web | `apple-touch-icon.png` | 180×180，**不透明** |
| web | `icon-192.png`、`icon-512.png` | 透明背景，`purpose: any` |
| web | `icon-maskable-512.png` | 512×512，**不透明**，符号在中心 80% 安全区内 |
| web | `manifest.webmanifest` | `icons` 含以上三项 |
| ios | `AppIcon.appiconset/icon-1024.png` + `Contents.json` | 1024×1024，**不透明**（App Store 拒绝透明图标）；单尺寸，Xcode 14+ 自动派生其余尺寸 |
| android | `mipmap-{mdpi…xxxhdpi}/ic_launcher.png`、`ic_launcher_round.png` | 48dp（48–192px），旧系统使用 |
| android | `mipmap-*/ic_launcher_foreground.png`、`ic_launcher_monochrome.png` | 108dp（108–432px），符号在 66dp 安全区内；单色版用于 Android 13 主题图标 |
| android | `mipmap-anydpi-v26/ic_launcher.xml`、`ic_launcher_round.xml`、`values/ic_launcher_background.xml` | 自适应图标定义 + 背景色 |
| windows | `app.ico` | 16、24、32、48、64、128、256 |
| macos | `app.icns` | 16–1024；macOS 不自动加圆角，生成器在 1024 画布内绘制 824 圆角底板 |

---

## 6. 施工流程

### 6.1 准备（每个项目一次）

```bash
# 从本仓库复制 tools/icons/ 到项目，然后：
npm --prefix tools/icons install          # 依赖 sharp、png2icons，需要 Node ≥ 20
echo "tools/icons/node_modules/" >> .gitignore
```

生成的图标**提交进仓库**，CI 只运行零依赖的校验器，不需要安装图像库。

### 6.2 新项目

1. 确定 profiles（第 2 节）和 `out` 路径（第 7 节）。
2. 写 `branding/icon-brief.md`。
3. 产出源文件（第 8 节），写 `branding/icon.config.json`，`status: "draft"`。
4. `node tools/icons/generate-icons.mjs`
5. 接入平台（第 7 节）：Web 的 `<head>` / 框架配置等。
6. `node tools/icons/validate-icons.mjs` 通过。
7. 把 `public/icon-512.png`、`favicon.ico` 等交给人确认；确认后改为 `approved`，重新生成并校验。

### 6.3 旧项目

1. **盘点**：查找现有图标（`favicon.*`、`apple-touch-icon*`、`manifest*`、`AppIcon.appiconset`、`mipmap-*`、`*.ico`、`*.icns`），记录在 `icon-brief.md`。
2. **定源**：
   * 有品牌图标（非框架模板默认图）→ 用它的矢量稿或 ≥1024 位图作源，`status: "approved"`，**不得重新设计**
   * 只有模板默认图标（Vite、React、Next.js、Flutter、Android Studio 默认图标等）→ 按新项目流程
   * 只有低于 1024 的位图 → 不放大使用；报告需要源文件（`status: "placeholder"` 暂用）
3. **先生成到默认目录**：`out` 保持 `branding/generated/...` 默认值，检查结果后再改为工程真实目录。
4. **清理冲突文件**，否则构建报错或继续使用旧图：
   * Android：删除 `mipmap-*/ic_launcher*.webp`（与新的 `.png` 同名资源冲突）
   * iOS：删除 `AppIcon.appiconset` 中旧的多尺寸 PNG
   * Web：删除模板图标（`vite.svg`、`logo192.png`、`logo512.png`、Next.js 的 `app/favicon.ico` 等）并移除其引用
5. 生成 → 接入 → 校验，同新项目第 4–6 步。用 `git diff --stat` 确认只改动了图标相关文件。

---

## 7. 平台接入

### 7.1 Web `<head>`

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
```

源为 PNG 时去掉 `icon.svg` 一行；部署在子路径时把 `/` 换成 `basePath`。

### 7.2 常见工程的 `out` 设置

| 工程 | `out.web` | 接入方式 |
|---|---|---|
| 静态站点、Vite、Create React App、Nuxt、Astro | `public` | 改 `index.html`（Nuxt 用 `nuxt.config` 的 `app.head`），并配置 `web.htmlFiles` |
| SvelteKit | `static` | 改 `src/app.html` |
| Next.js（App Router） | `public` | 删除默认 `app/favicon.ico`；在根 `layout` 的 `metadata` 中设置 `icons` 和 `manifest`；`web.htmlFiles` 留空 |
| Django / Flask / Rails 等 | 静态资源根目录 | 改基础模板；确保 `/favicon.ico` 在站点根可访问 |

| 原生工程 | `out.ios` | `out.android` |
|---|---|---|
| Xcode / Swift | `<App>/Assets.xcassets/AppIcon.appiconset` | — |
| Android Studio | — | `app/src/main/res` |
| React Native | `ios/<App>/Images.xcassets/AppIcon.appiconset` | `android/app/src/main/res` |
| Flutter | `ios/Runner/Assets.xcassets/AppIcon.appiconset` | `android/app/src/main/res` |
| Capacitor | `ios/App/App/Assets.xcassets/AppIcon.appiconset` | `android/app/src/main/res` |

Android 的 `AndroidManifest.xml` 需为 `android:icon="@mipmap/ic_launcher"`、`android:roundIcon="@mipmap/ic_launcher_round"`（模板默认即如此）。

| 桌面工程 | 做法 |
|---|---|
| Electron（electron-builder） | `out.windows: "build/icon.ico"`，`out.macos: "build/icon.icns"` |
| Tauri | 用 `tauri icon branding/icon-1024.png`（或 SVG 源）生成到 `src-tauri/icons/`；本工具只负责 `web` 部分 |
| 其他 | 将 `out.windows` / `out.macos` 指向打包配置引用的路径 |

Expo 托管工程（无 `ios/`、`android/` 目录）：在 `app.json` 的 `icon`、`android.adaptiveIcon` 中引用生成的 PNG，本工具的 profiles 只保留 `web`。

---

## 8. 源文件的产出方式

| 方式 | 适用 | 规则 |
|---|---|---|
| **A. Agent 直接编写 SVG（默认）** | 新项目、无设计师 | 几何图形，符合 3.2 节；可重复、可审阅、可直接做 `favicon.svg` |
| B. 生图模型 | 需要更有表现力的图形 | 生成 3–4 个候选 → 人工选定 → 存为 `icon-1024.png`；把模型与提示词写进 brief。注意：生图结果常有渐变、细节过多、伪文字、非透明背景，小尺寸可读性差；用于注册商标的图标应由人工设计 |
| C. 人工设计稿 | 已有品牌 | 优先要矢量稿 |
| D. 占位 | 以上都暂时做不到 | 简单几何图形或首字母色块，`status: "placeholder"`；发布校验会失败，必须替换 |

---

## 9. 校验与 CI

```bash
node tools/icons/validate-icons.mjs            # 开发阶段：placeholder 仅警告
node tools/icons/validate-icons.mjs --release  # 发布前：placeholder 视为失败
```

校验内容：配置合法；源文件规格；产物与源同步（`icon.hash`）；每个产物存在、尺寸正确、需要不透明的平台无透明通道、ico / icns 含所需尺寸；manifest 条目完整；HTML 含 `icon` / `apple-touch-icon` / `manifest` 引用；未引用模板默认图标。

| 阶段 | 要求 |
|---|---|
| 开发中 | 允许 `placeholder`、`draft` |
| 合并到主分支（CI） | `validate-icons.mjs` 通过 |
| Beta / 发布 | `validate-icons.mjs --release` 通过；`draft` 会提示未经人工确认 |

GitHub Actions 示例：

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: node tools/icons/validate-icons.mjs .            # PR
- run: node tools/icons/validate-icons.mjs . --release  # 发布工作流
```

校验器不判断图标是否好看，也不检查真实设备上的显示效果。发布前至少人工查看一次：浏览器标签（浅色 / 深色）、手机"添加到主屏幕"、Android 圆形与方形启动器、App Store / 桌面 Dock 中的显示。

---

## 10. 完成标准

Agent 报告完成时必须包含：

```
profiles：web, ios, android
源文件：branding/icon.svg（方式 A，status: draft）
生成：34 个文件
校验：validate-icons.mjs 通过（--release 未运行 / 通过）
待人工：确认图标设计；真机查看
```

以下任一情况不得报告完成：校验失败；`status` 为 `placeholder` 却未在报告中标明；旧项目的品牌图标被替换而没有人工确认。

---

## 附录 A：v0.1 Trial 勘误

| # | v0.1 内容 | 问题 | v1.0 |
|---|---|---|---|
| 1 | 全文包在 ```` ```md ```` 代码块中，内部代码块嵌套错误 | 渲染为一整块代码，结构图错乱 | 正常 Markdown |
| 2 | 规范部分与"参考分析"部分并存 | 目录（`assets/icons/` vs `public/icons/`）、文件名（`master-icon.png` vs `source-1024.png`、`favicon-16.png` vs `favicon-16x16.png`）互相矛盾 | 单一规范，统一命名 |
| 3 | 所有项目必须生成六个平台图标 | 纯 Web 项目生成原生图标无意义 | 按 profiles 生成 |
| 4 | Web 图标放在 `assets/icons/` | 必须位于站点可访问的静态根目录；浏览器默认请求 `/favicon.ico` | `out.web` 指向静态根目录 |
| 5 | Master Icon "支持透明" | iOS App Icon 不允许透明；Apple Touch Icon 透明区域会变黑 | 符号层透明，不透明平台由生成器合成底色，校验器检查 |
| 6 | iOS 列出 20/29/40/60/76/83.5 等尺寸 | Xcode 14 起单个 1024 即可 | 单尺寸 `AppIcon.appiconset` |
| 7 | Android 仅 foreground/background 两张图 | 缺 108dp 层尺寸、安全区、`mipmap-anydpi-v26` 定义、主题单色图标 | 第 5 节完整清单 |
| 8 | manifest 示例缺 `type`、无 maskable | Android 安装图标被裁切或加白边 | 增加 `icon-maskable-512.png` 与 `purpose: maskable` |
| 9 | 从 PNG 生成 `favicon.svg` | 位图套 SVG 外壳没有意义 | 仅在源为 SVG 时输出 `icon.svg` |
| 10 | macOS 只列 icns 尺寸 | macOS 不自动加圆角，直接用方图会显示为方块 | 生成器绘制圆角底板 |
| 11 | ImageMagick `convert` 示例 | ImageMagick 7 中已弃用；各平台合成规则没有实现 | 提供 `generate-icons.mjs` |
| 12 | 要求 `icon-validator` 但未定义 | 无法执行 | 提供零依赖 `validate-icons.mjs`，附 CI 用法 |
| 13 | "Agent 不得宣布完成" | 依赖 Agent 自觉 | 以校验器退出码为准 |
| 14 | 禁止占位图 vs 失败时生成占位图 | 互相矛盾 | `status: placeholder`，发布校验失败 |
| 15 | 生图 API 为首选 | 小尺寸可读性差、不可复现、版权与商标风险 | 默认 Agent 编写 SVG，生图需人工选定 |
| 16 | 未涉及旧项目 | Agent 可能覆盖已有品牌图标；旧文件残留导致构建冲突 | 第 6.3 节 |
| 17 | 未说明文档如何提供给 Agent | 常驻加载浪费上下文 | 按需加载，`AGENTS.md` 只加一行 |

## 附录 B：维护

* 工具已在 Node 22、sharp 0.35.5、png2icons 2.0.1 下实测：全 profiles 生成 34 个文件并通过校验；源被修改未重新生成、缺文件、iOS 图标带透明、HTML 缺引用或引用模板图标、placeholder 发布、SVG 含文字、manifest 条目缺失等情况均能被校验器拦截。
* 未在真机、Xcode、Android Studio 中验证显示效果。
* 平台要求变化时（如新的 iOS 深色 / 着色图标、Android 新规格），同时更新 `icons-lib.mjs` 的产物清单与本文第 5 节。
