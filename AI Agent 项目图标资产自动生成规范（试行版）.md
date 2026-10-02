```md
# AI Agent 项目图标资产自动生成规范（试行版）

**文档名称：** AI Agent Icon Asset Generation Standard  
**版本：** v0.1 Trial  
**状态：** 试行  
**适用范围：** Web / PWA / iOS / Android / Windows / macOS 项目  
**目标：** 建立 AI Agent 自动生成、管理和部署项目视觉资产的统一流程

---

# 1. 背景与目的

随着 AI Agent 自动开发项目数量增加，每个项目需要具备独立、完整、专业的视觉识别资产。

传统开发流程中，favicon、App Icon、系统图标通常由人工设计师后期补充，容易出现：

- 项目缺少 favicon
- 使用默认模板图标
- Web 与移动端图标不一致
- 不同平台尺寸缺失
- 发布前临时补图

因此，本规范要求 AI Agent 在项目开发过程中主动完成项目图标资产设计、生成、转换和集成。

---

# 2. 核心原则

## 2.1 一个项目，一个统一视觉源

所有平台图标必须来源于同一个 Master Icon。

统一关系：

```

Master Icon (1024x1024)

```
    |
    |
    +---- Web favicon
    |
    +---- PWA Icon
    |
    +---- iOS App Icon
    |
    +---- Android Icon
    |
    +---- Windows Icon
    |
    +---- macOS Icon
```

```

禁止：

- 不同平台单独设计不同 Logo
- 使用随机模板
- 使用无关图片
- 使用默认系统图标

---

# 3. Agent 必须执行的任务

每个项目在进入 Beta 阶段之前，Agent 必须完成：

```

[ ] 项目图标设计分析

[ ] Icon Design Brief 文档

[ ] Master Icon 生成

[ ] Web favicon 生成

[ ] PWA 图标生成

[ ] iOS 图标生成

[ ] Android 图标生成

[ ] Windows 图标生成

[ ] macOS 图标生成

[ ] 项目配置文件更新

[ ] 自动检查通过

```

---

# 4. Icon Design Brief

Agent 必须在项目中生成：

```

/docs/icon-design-brief.md

````

内容至少包括：

```md
项目名称：

项目类型：

核心功能：

目标用户：

品牌关键词：

视觉方向：

推荐颜色：

禁止元素：

生成 Prompt：
````

示例：

```md
项目名称：

AI Knowledge Assistant


项目类型：

AI SaaS Application


关键词：

- Intelligence
- Search
- Knowledge


视觉方向：

Modern minimalist technology icon.


要求：

- 无文字
- 小尺寸可识别
- 高对比度
- 专业 SaaS 风格
```

---

# 5. 图标生成方式

## 5.1 推荐流程

Agent 不直接手工绘制所有尺寸。

推荐：

```
Agent

 ↓

生成设计描述

 ↓

调用 Image Generation API

 ↓

生成 1024x1024 Master Icon

 ↓

自动转换全部尺寸

 ↓

写入项目
```

---

# 6. Master Icon 标准

必须生成：

```
master-icon.png
```

规格：

| 项目 | 要求        |
| -- | --------- |
| 尺寸 | 1024x1024 |
| 格式 | PNG       |
| 背景 | 支持透明      |
| 文字 | 默认禁止      |
| 质量 | 高清        |
| 用途 | 所有平台源文件   |

要求：

* 在 32x32 favicon 尺寸下仍可识别
* 避免过度复杂
* 避免细小文字
* 避免版权元素

---

# 7. 项目目录规范

所有项目必须包含：

```
assets/

└── icons/

    ├── master-icon.png

    ├── favicon.ico
    ├── favicon.svg
    ├── favicon-16.png
    ├── favicon-32.png

    ├── apple-touch-icon.png

    ├── android/
    │
    │   ├── android-192.png
    │   └── android-512.png

    ├── ios/
    │
    │   └── AppIcon.appiconset/

    ├── android-native/
    │
    │   └── mipmap/

    ├── windows/
    │
    │   └── app.ico

    └── macos/
        │
        └── app.icns
```

---

# 8. Web 项目要求

必须包含：

## favicon

```
favicon.ico
favicon.svg
favicon-16.png
favicon-32.png
```

## Apple Touch Icon

```
apple-touch-icon.png

尺寸：

180x180
```

## Android PWA

```
android-192.png

android-512.png
```

---

# 9. Web 自动配置要求

Agent 必须自动检查 HTML：

```html
<link rel="icon"
href="/assets/icons/favicon.ico">

<link rel="apple-touch-icon"
href="/assets/icons/apple-touch-icon.png">
```

并检查：

```
manifest.json
```

包含：

```json
{
 "icons":[
   {
    "src":
    "/assets/icons/android/android-192.png",
    "sizes":"192x192"
   },
   {
    "src":
    "/assets/icons/android/android-512.png",
    "sizes":"512x512"
   }
 ]
}
```

---

# 10. iOS 图标规范

必须支持：

```
1024x1024 App Store Icon
```

并生成：

```
20x20

29x29

40x40

60x60

76x76

83.5x83.5

1024x1024
```

目录：

```
ios/AppIcon.appiconset/
```

必须包含：

```
Contents.json
```

---

# 11. Android 图标规范

必须支持：

普通 Icon：

```
mdpi

hdpi

xhdpi

xxhdpi

xxxhdpi
```

Adaptive Icon：

```
foreground.png

background.png
```

---

# 12. Windows 图标规范

生成：

```
app.ico
```

支持尺寸：

```
16x16

32x32

48x48

64x64

128x128

256x256
```

---

# 13. macOS 图标规范

生成：

```
app.icns
```

支持：

```
16

32

128

256

512

1024
```

---

# 14. 自动转换工具要求

推荐使用：

* ImageMagick
* Sharp
* Pillow
* png2icons
* favicon generator

转换流程：

```
master-icon.png

        ↓

image processor

        ↓

platform assets
```

---

# 15. CI/CD 检查

项目发布前必须执行：

```
icon-validator
```

检查：

```
✓ Master Icon 存在

✓ favicon 存在

✓ Web 配置正确

✓ PWA 配置正确

✓ iOS 图标完整

✓ Android 图标完整

✓ Windows 图标完整

✓ macOS 图标完整

✓ 无默认占位图
```

失败示例：

```
BUILD FAILED

Reason:

Missing android 512 icon
```

---

# 16. Agent 完成声明标准

Agent 不得在以下情况宣布项目完成：

```
- favicon 缺失
- 使用默认图标
- 平台图标缺少
- manifest 未配置
- App Icon 未生成
```

完成标准：

```
Icon Asset Pipeline Completed.

All required platform icons generated.

Validation Passed.
```

---

# 17. 安全与版权要求

禁止：

* 使用第三方品牌 Logo
* 复制商业产品图标
* 使用受版权保护角色
* 使用未经授权图片

允许：

* AI 原创设计
* 抽象图形
* 几何 Logo
* 自定义品牌元素

---

# 18. 后续扩展方向

未来版本可加入：

* 自动生成 Logo
* 自动生成品牌色板
* 自动生成启动页
* 自动生成 OpenGraph 图片
* 自动生成 App Store 宣传图
* 自动生成产品宣传 Banner

---

# 文档结束

版本：

v0.1 Trial

维护：

AI Agent Development Infrastructure

```
```
---
# 参考分析



### 1. 要不要做？值不值得？
**必须做。**  
- 浏览器标签页、书签、PWA 安装、手机主屏幕、Windows 磁贴、macOS Dock 等都会用到。  
- 没有图标的项目看起来像半成品。  
- 人工做一次很容易，但 agent 自动做能保证每个项目都有，且风格统一。

### 2. 生成方式选择：生图 API vs Agent CLI
| 方式 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **生图 API**（Grok Imagine / Flux / DALL-E / SD 等） | 真正从零根据项目语义生成相关图标，创意好 | 需要 API 权限/额度，偶尔风格不稳定 | **首选** |
| **纯 CLI**（ImageMagick + 占位图 / SVG） | 零外部依赖，稳定可重复 | 无法从零创造有意义的图标，只能处理已有图或极简几何 | 备选 |
| **混合**（生图 API 出主图 → CLI 批量缩放转格式） | 质量高 + 可控 + 全尺寸覆盖 | 需要 agent 同时具备生图能力和 ImageMagick | **最推荐** |

**结论**：优先让 agent 调用生图能力生成一张高质量主图（1024×1024 或更大），然后用 ImageMagick（或同类工具）一键生成全套尺寸。纯 CLI 只适合兜底（生成纯色+文字占位）。

### 3. 必须生成的文件清单（2026 年标准最小集）
把这些写死在文档里：

**必做：**
- `favicon.ico`（内含 16×16 + 32×32 + 48×48）
- `apple-touch-icon.png`（180×180，iPhone/iPad 主屏幕）
- `icon-192.png`（Android / PWA）
- `icon-512.png`（PWA 安装 & 启动屏）
- `favicon-32x32.png` / `favicon-16x16.png`（可选但推荐）

**推荐额外：**
- `icon-maskable-512.png`（Android 自适应安全区）
- `favicon.svg`（现代浏览器矢量）
- Windows 相关（如需要 `.ico` 多尺寸或 tile）
- macOS `.icns`（如果项目涉及原生桌面端）

目录建议统一放到 `public/icons/` 或 `assets/icons/`，并同步更新 `index.html` 的 `<link>` 和 `manifest.webmanifest`。

### 4. 在开发文档中如何规定（可直接复制）

在每个项目的开发文档（或 `AGENTS.md` / `DEVELOPMENT.md`）中增加以下强制章节：

```markdown
## 图标生成强制要求（Agent 必须执行）

在项目初始化完成后、或首次构建前，Agent **必须**自动完成以下图标生成流程，不得跳过：

1. **生成主图标**  
   使用可用的图像生成能力（优先内置生图工具/API），根据项目名称 + 一句话描述，生成一张简洁、高对比度、适合小尺寸缩放的方形图标。  
   推荐 Prompt 模板：  
   “Minimal flat vector-style app icon for [项目名], [核心功能简述], clean geometric design, high contrast, no text, centered symbol, suitable for favicon and mobile app icon, square, solid background”

2. **输出主图**  
   保存为 `icons/source-1024.png`（至少 1024×1024，PNG，透明或实色背景均可）。

3. **CLI 批量生成全套尺寸**（必须使用 ImageMagick 或等效工具）  
   执行类似以下命令（Agent 自行调整路径）：
   ```bash
   # 生成多尺寸 PNG
   convert source-1024.png -resize 16x16 favicon-16x16.png
   convert source-1024.png -resize 32x32 favicon-32x32.png
   convert source-1024.png -resize 180x180 apple-touch-icon.png
   convert source-1024.png -resize 192x192 icon-192.png
   convert source-1024.png -resize 512x512 icon-512.png
   # 生成 multi-size favicon.ico
   convert source-1024.png -define icon:auto-resize=16,32,48 favicon.ico
   ```

4. **文件放置与引用**  
   - 所有图标放入项目 `public/icons/`（或框架约定目录）  
   - 自动更新 HTML `<head>` 中的 link 标签  
   - 更新或生成 `site.webmanifest` / `manifest.json`

5. **验收标准**  
   - 浏览器标签页能正确显示 favicon  
   - 手机“添加到主屏幕”能显示正确图标  
   - 文件全部提交到仓库

失败时回退：生成纯色背景 + 项目首字母的极简占位图标，并在文档中标注“需人工替换”。
```

### 5. 实际执行建议（给 Agent 的最优路径）
1. **有生图能力时**（推荐）：  
   Agent 调用生图 API → 得到 `source-1024.png` → 用 ImageMagick 一条龙生成所有尺寸 → 写文件 → 改 HTML/manifest。

2. **没有生图能力时**：  
   用 CLI 生成极简 SVG 或纯色 PNG + 文字，再转全套尺寸（质量较差，但至少有东西）。

3. **工具依赖**：  
   开发环境必须预装 ImageMagick（`apt install imagemagick` / `brew install imagemagick`）。Agent 在文档中可要求检查并安装。

4. **风格一致性**：  
   同一组织下的所有项目可固定一套 Prompt 风格关键词（颜色、线条粗细、是否扁平等），保证视觉统一。

### 6. 边界与注意事项
- 图标必须是正方形，关键元素放在中心安全区（尤其 Android maskable）。
- 小尺寸（16×16）要足够简洁，复杂细节会被糊掉。
- 生成后建议 Agent 做一次简单验证（文件是否存在、尺寸是否正确）。
- 版权：生图结果默认可用于项目，但避免直接抄知名品牌。
- 性能：一次生成即可，不需要每次构建都重新跑。

这套规定写进文档后，agent 就能稳定、可重复地产出可用图标，人工几乎零介入。  

