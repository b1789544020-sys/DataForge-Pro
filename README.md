<div align="center">

# 🛠️ DataForge Pro

### 12-in-1 Privacy-First Data Toolkit — runs 100% in your browser

[🇬🇧 English](#-why-dataforge-pro) · [🇨🇳 中文](#-为什么选-dataforge-pro)

---

**Clean spreadsheets · Convert formats · Process text · Batch images**

All in one HTML file. **No upload. No install. No internet required.**

[![Platform](https://img.shields.io/badge/Platform-Browser-lightgrey.svg)](#-quick-start)
[![Offline](https://img.shields.io/badge/Works-Offline-success.svg)](#-quick-start)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-orange.svg)](#-why-dataforge-pro)
[![i18n](https://img.shields.io/badge/i18n-EN%20%7C%20中文-yellow.svg)](#-languages)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#-license)

</div>

---

## 📑 Table of Contents

- [✨ Why DataForge Pro?](#-why-dataforge-pro)
- [🎯 Who Is It For?](#-who-is-it-for)
- [🚀 Quick Start](#-quick-start)
- [🧰 The 12 Tools](#-the-12-tools)
- [🤖 Optional AI Assistant](#-optional-ai-assistant)
- [🌍 Languages](#-languages)
- [🖼️ Screenshots](#-screenshots)
- [🛠️ Tech Stack](#-tech-stack)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)
- [📬 Contact](#-contact)

---

## ✨ Why DataForge Pro?

Most online "free" converters do one thing — and quietly upload your data to a server.

**DataForge Pro flips the model:** all 12 tools run **entirely inside your browser**. Zero bytes leave your machine. You can disconnect from the internet after opening the page, and everything still works.

| Problem you face                                              | DataForge Pro's answer                                |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| Exported CSVs are full of duplicates, spaces, empty rows      | 🧹 **CSV Cleaner** — 13 one-click cleaning operations |
| Need to turn a table into JSON / SQL / Markdown               | 🔄 **Converters** — one-click output, ready to paste  |
| Minified JSON is unreadable, has a syntax error               | { } **JSON Formatter** — beautify, minify, validate   |
| Have a folder of images to compress / resize / watermark      | 🖼️ **Image Batch** — all local, no upload             |
| Need batch find/replace on a wall of text                     | ✂️ **Text Batch** — regex supported, line ops built-in |
| Bouncing between 8 different online tools, leaking data       | 📦 **12-in-1** — open one file, get the whole toolbox |
| Not sure which tool or which options you need                 | 🤖 **AI Assistant** — optional, off by default, BYO endpoint |

> 🔓 **All 12 tools are free and open source** under the MIT License. No Pro tier, no license keys, no paywalls.

> 🆕 **v2 — two flagship tools upgraded**
> - **Multi-table Merge** now reads real **Excel `.xlsx` files** (zero-dependency reader/writer using the browser's native compression), walks **every worksheet in every workbook**, adds a source column, skips empty files, and exports CSV **or `.xlsx`**.
> - **Image Batch** is a small photo workbench now: **interactive crop** (free / 1:1 / 4:3 / 16:9 / circle), **rotate / flip**, percentage & exact resizing, EXIF orientation auto-fix, configurable **text and logo watermarks** (position, color, opacity, diagonal tile), filename suffix, and one-click **ZIP** packaging for the whole batch.

---

## 🎯 Who Is It For?

- 📊 **Analysts / Ops / Finance** who handle CSVs and Excel exports daily
- 🧑‍💻 **Developers** who need quick JSON formatting, regex testing, or SQL generation
- 🎨 **Content creators / marketers** who batch-process images and text
- 🏢 **Anyone working with sensitive data** — finance, healthcare, legal, internal tools
- ✈️ **Travelers & offline workers** who need a full toolkit that works on a plane

---

## 🚀 Quick Start

> ⏱️ **30 seconds from download to first result.**

### 1. Get the file

```bash
# Option A: Clone the repo
git clone https://github.com/YOUR_USERNAME/dataforge-pro.git

# Option B: Download the ZIP from the Releases page
```

### 2. Open it

- **Unzip** the package (if you downloaded a ZIP)
- **Double-click** `index.html`
- It opens in your default browser — that's it. No install, no admin rights, no setup.

### 3. Use it

1. Pick a tool from the home page (use the search box, e.g. "CSV", "JSON", "image").
2. Paste your data **or** drag-and-drop a file into the input area.
3. Check the options you want.
4. Click **"⚡ Run"**.
5. Copy the result **or** click **"💾 Export File"**.

> 💡 Tip: Press `Ctrl/Cmd + Enter` to run the current tool instantly.

---

## 🧰 The 12 Tools

### 🧹 Table

| Tool                              | What it does                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| 🧹 **CSV Cleaner**                | Dedup, trim, remove empty rows/cols, normalize case, fill empties, validate emails, dates     |
| 📊 **Column Extractor / Reorder** | Select, sort, rename, delete columns in a table                                              |
| 🔗 **Multi-table Merge / Dedup**  | Merge multiple **CSV and Excel (.xlsx)** files and every worksheet; union/inner/outer/first-file strategies, source column, skip-empty, dedup by key; export CSV or xlsx |

### 🔄 Convert

| Tool                              | What it does                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| 🔄 **CSV ⇄ JSON**                 | Bidirectional conversion with auto type inference & pretty output                             |
| 🗄️ **CSV → SQL**                 | One-click INSERT / CREATE TABLE generation (MySQL / PostgreSQL supported)                    |
| 📝 **Table → Markdown**           | Convert to Markdown table with alignment options, ready to paste into docs                    |
| { } **JSON Formatter / Validator**| Beautify, minify, sort keys, validate syntax, locate errors                                  |
| 🔐 **Base64 / URL Encode/Decode** | Encode/decode Base64, URL, and HTML entities                                                  |

### ✂️ Text

| Tool                              | What it does                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| ✂️ **Text Batch Processor**        | Batch find/replace (regex), add prefix/suffix, line numbers, sort, drop empty lines           |
| Aa **Case Converter**             | 9 formats — camelCase, snake_case, kebab-case, PascalCase, CONSTANT_CASE, and more            |
| ⁂ **Regex Tester**               | Real-time regex test, highlight matches, preview replacements                                |

### 🖼️ Image

| Tool                              | What it does                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| 🖼️ **Image Batch Processor**      | Batch resize (fit / % / exact), **interactive crop (free / ratio / circle), rotate & flip**, EXIF orientation fix, grayscale, configurable text **and image watermarks** (position/opacity/color/tile), filename suffix, multi-file **ZIP download** — JPG/PNG/WebP, all local |

> All 12 tools are unlocked and free. Just open the page and start using them.

---

## 🤖 Optional AI Assistant

DataForge Pro ships with an **optional** AI layer. It is **disabled by default** and
**cannot** send anything anywhere until you enter an endpoint yourself.

### What it does

| Where | Feature | Offline (no endpoint) | With an endpoint |
| ----- | ------- | --------------------- | ---------------- |
| Home page | **Task finder** — describe your job, get the right tools | Keyword rules | Model ranks all 12 tools and explains why |
| Any tool | 🪄 **Suggest options** — plain-language request → option patch | Built-in rule engine | Model reads the option schema + a small sample |
| Any tool | 🔍 **Diagnose data** — duplicates, padding, empty rows/cols, bad emails, mixed dates | Full local profiler | Local profile + model commentary |
| Any tool | 💡 **Explain result** — what the run actually changed | Needs an endpoint | Short bullet summary |
| Any tool | 🔒 **Payload preview** — see the exact bytes that would be sent | Always available | Always available |

### Safety model

- **Advisory only.** The model never touches your data. It returns an *option patch*,
  which is validated against that tool's own option schema — unknown keys, wrong types
  and out-of-range enum values are dropped — then shown to you as a diff. Nothing is
  applied until you click **Apply**. All transforms are done by the offline engine.
- **Off by default.** No endpoint, no key, no requests. The badge in the header reads
  `🤖 AI off`.
- **One-time consent.** The first outbound call asks for explicit confirmation.
- **Minimised payload.** Only the first *N* rows / *N* characters are sent (configurable,
  default 20 rows / 2000 chars). Emails, phone numbers and long digit strings are masked
  unless you turn masking off.
- **Graceful fallback.** Every AI entry point has an offline rule-based equivalent, so
  nothing dead-ends when the model is unavailable — the error is shown and the local
  result is used.
- **Your endpoint, your rules.** Any OpenAI-compatible `/chat/completions` API works.

### Configuring

Click **🤖 AI** in the header. One-click presets:

| Preset | Base URL | Notes |
| ------ | -------- | ----- |
| **Ollama** (local) | `http://localhost:11434/v1` | Recommended — stays on your machine |
| **LM Studio** (local) | `http://localhost:1234/v1` | Recommended — stays on your machine |
| OpenAI | `https://api.openai.com/v1` | Requires an API key; data leaves your machine |
| DeepSeek | `https://api.deepseek.com/v1` | Requires an API key; data leaves your machine |

Settings live in `localStorage` (`dfp_ai_cfg`) on your machine only. Use **Test connection**
to verify before relying on it. Local endpoints get a green `🤖 AI local` badge.

> If you want an entirely AI-free build, delete the four `assets/js/ai*.js` script tags
> from `index.html` and `tool.html` — every one of the 12 tools keeps working.

---

## 🌍 Languages

DataForge Pro is **fully bilingual** — switch with one click in the header.

- 🇬🇧 English
- 🇨🇳 中文（简体）

Want to add your language? See [🤝 Contributing](#-contributing).

---

## 🖼️ Screenshots

> 📌 Add a screenshot of your home page here — it converts better than any text description.
>
> `![DataForge Pro — Home](docs/screenshot-home.png)`
>
> `![DataForge Pro — CSV Cleaner](docs/screenshot-csv-cleaner.png)`

A `docs/` folder with placeholder images is recommended so the README renders correctly on GitHub from day one.

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML + CSS + JavaScript (no build step, no framework)
- **Storage:** `localStorage` for user preferences and AI settings
- **Dependencies:** Zero CDN, zero sign-up. Excel `.xlsx` read/write uses the browser's native
  `CompressionStream` / `DecompressionStream` + `DOMParser` (no SheetJS). The only vendored
  third-party file is **JSZip** (~95 KB, MIT, `assets/vendor/jszip.min.js`), used solely to pack
  multi-image exports into one `.zip` locally. No external calls at runtime — the only network
  request the app can ever make is to the AI endpoint *you* configure yourself.
- **Browser support:** Chrome / Edge / Firefox / Safari (latest 2 versions)

> Because there's **no backend and no third-party CDN**, the entire app can be served as static files — including from `file://` on your local machine.

---

## 🤝 Contributing

Contributions are welcome! A few easy ways to help:

- 🐛 **Report bugs** via [Issues](../../issues)
- 💡 **Suggest tools** you'd like to see next
- 🌍 **Translate** the UI into your language — see `assets/js/i18n.js`
- 🧪 **Test** on different browsers and file sizes
- ⭐ **Star** the repo if DataForge Pro saved you time

If you'd like to submit a pull request:

```bash
# 1. Fork the repo
# 2. Create your branch
git checkout -b feature/awesome-new-tool

# 3. Make your changes
# 4. Smoke test (open index.html in your browser and verify the tool)

# 5. Commit & push
git commit -m "feat: add awesome new tool"
git push origin feature/awesome-new-tool

# 6. Open a Pull Request
```

---

## 📄 License

DataForge Pro is released under the **MIT License**. You are free to use, modify, distribute, and even sell derivative works, as long as the copyright notice is preserved.

See the full text in the [`LICENSE`](LICENSE) file.

---

## 📬 Contact

- 🐛 Issues / feature requests: [GitHub Issues](../../issues)
- 🌐 More from the author: [your-portfolio-link]

---

<div align="center">

**If DataForge Pro saved you time, consider giving it a ⭐ — it helps others find it too.**

Made with ❤️ for everyone who's ever rage-quit an online converter.

</div>

---

## 🇨🇳 中文

---

<div align="center">

# 🛠️ DataForge Pro · 数据工坊

### 12 合 1 隐私优先的数据工具集 — 100% 在你的浏览器里运行

**清洗表格 · 格式转换 · 批量处理文本 · 批量处理图片**

**零上传 · 零安装 · 零网络依赖**

</div>

---

### ✨ 为什么选 DataForge Pro？

网上那些"免费"转换器，每个只做一件事，还偷偷把你的数据传到服务器。

**DataForge Pro 思路完全反过来**：全部 12 个工具都跑在**你自己的浏览器里**。一个字节都不会离开你的电脑。打开页面之后拔掉网线，照样能用。

| 你遇到的烦恼 | DataForge Pro 的解法 |
| --- | --- |
| 导出的 CSV 一堆重复行、空格、空行 | 🧹 **CSV 清洗器** — 13 个一键清洗操作 |
| 想把表格转成 JSON / SQL / Markdown | 🔄 **格式转换器** — 一键输出，直接粘贴 |
| 一坨压缩过的 JSON 没法看，还报错 | { } **JSON 格式化** — 美化、压缩、校验、定位错误 |
| 有一堆图片要压缩 / 改尺寸 / 加水印 | 🖼️ **图片批处理** — 全部本地完成 |
| 一大段文本要批量替换 / 加行号 / 排序 | ✂️ **文本批处理** — 支持正则，自带行操作 |
| 在 8 个在线工具之间来回切，数据到处泄露 | 📦 **12 合 1** — 打开一个文件，工具箱全有了 |
| 不知道该用哪个工具、该勾哪些选项 | 🤖 **AI 助手** — 可选功能，默认关闭，接口自备 |

> 🔓 **全部 12 个工具均开源免费**，基于 MIT 协议发布。无 Pro 等级、无授权码、无付费墙。

---

### 🚀 三步上手（30 秒）

1. **打开**：解压后双击 `index.html`，浏览器自动弹出。
2. **选工具**：在首页挑一个工具（顶上有搜索框，比如搜 "CSV"、"JSON"、"image"）。
3. **处理**：把数据粘贴进去（或者直接拖文件进来）→ 勾选想要的选项 → 点 **"⚡ 运行"** → 复制或 **"💾 导出文件"**。

> 💡 快捷键：`Ctrl/Cmd + Enter` 一键运行当前工具。

---

### 🧰 12 个工具一览

**🧹 表格**

- 🧹 **CSV 清洗器**：去重、去空格、删空行/空列、统一大小写、填空值、校验邮箱、标准化日期
- 📊 **列提取 / 重排**：选择、排序、重命名、删除列
- 🔗 **多表合并 / 去重**：合并多个 CSV，按关键列去重，生成汇总表

**🔄 转换**

- 🔄 **CSV ⇄ JSON**：双向转换，自动类型推断，格式化输出
- 🗄️ **CSV → SQL**：一键生成 INSERT / CREATE TABLE（支持 MySQL / PostgreSQL）
- 📝 **表格 → Markdown**：转成 Markdown 表格，支持对齐方式
- { } **JSON 格式化 / 校验**：美化、压缩、键排序、语法校验、错误定位
- 🔐 **Base64 / URL 编码解码**

**✂️ 文本**

- ✂️ **文本批处理**：批量查找替换（支持正则）、加前后缀、加行号、排序、删空行
- Aa **大小写转换**：9 种格式（camelCase、snake_case、kebab-case、PascalCase 等）
- ⁂ **正则测试器**：实时测试，正则高亮，替换预览

**🖼️ 图像**

- 🖼️ **图片批处理**：批量压缩、改尺寸、格式转换（JPEG/PNG/WebP）、灰度、文本水印 — 全部本地

> 12 个工具全部免费可用，打开即用。

---

### 🤖 可选的 AI 助手

DataForge Pro 自带一层**可选**的 AI 能力。它**默认关闭**，在你自己填入接口地址之前，
**不可能**向任何地方发送数据。

| 位置 | 功能 | 离线（未配置接口） | 配置接口后 |
| --- | --- | --- | --- |
| 首页 | **任务导航** — 描述你要做的事，推荐对应工具 | 关键词规则 | 模型对全部 12 个工具排序并说明理由 |
| 工具页 | 🪄 **建议选项** — 一句话需求 → 选项补丁 | 内置规则引擎 | 模型读取选项 schema 与少量样本 |
| 工具页 | 🔍 **诊断数据** — 重复行、首尾空格、空行/空列、非法邮箱、日期格式混用 | 完整本地画像 | 本地画像 + 模型点评 |
| 工具页 | 💡 **解释结果** — 这次运行到底改了什么 | 需要配置接口 | 简短要点总结 |
| 工具页 | 🔒 **预览发送内容** — 查看将要发送的原始字节 | 始终可用 | 始终可用 |

**安全设计**

- **只做建议，不动数据。** 模型返回的是*选项补丁*，会先用该工具自己的选项 schema 校验
  （未知键、类型不符、枚举越界一律丢弃），再以 diff 形式展示。你点 **应用** 之前不会生效，
  所有实际变换仍由离线引擎完成。
- **默认关闭。** 没有接口、没有密钥、没有请求，顶栏显示 `🤖 AI off`。
- **一次性确认。** 第一次外发请求会明确征求同意。
- **最小化载荷。** 只发送前 N 行 / 前 N 字符（可配置，默认 20 行 / 2000 字符）；邮箱、
  手机号、长数字串默认脱敏。
- **优雅降级。** 每个 AI 入口都有对应的离线规则实现，模型不可用时展示错误并回退本地结果。
- **接口自备。** 任何兼容 OpenAI `/chat/completions` 的服务都可以用。

**配置方式**：点顶栏 **🤖 AI**，可一键套用预设——

| 预设 | 接口地址 | 说明 |
| --- | --- | --- |
| **Ollama**（本地） | `http://localhost:11434/v1` | 推荐，数据不出本机 |
| **LM Studio**（本地） | `http://localhost:1234/v1` | 推荐，数据不出本机 |
| OpenAI | `https://api.openai.com/v1` | 需要 API Key，数据会离开本机 |
| DeepSeek | `https://api.deepseek.com/v1` | 需要 API Key，数据会离开本机 |

配置只保存在本机 `localStorage`（键名 `dfp_ai_cfg`）。建议先点 **测试连接** 验证。
本地接口会显示绿色的 `🤖 AI local` 标记。

> 想要完全不含 AI 的版本：把 `index.html` 与 `tool.html` 中四个
> `assets/js/ai*.js` 的 script 标签删掉即可，12 个工具照常可用。

---

### 🌍 多语言

完全双语支持，**顶上一键切换**：

- 🇬🇧 English
- 🇨🇳 中文（简体）

想贡献新语言？见 `assets/js/i18n.js`。

---

### 🛠️ 技术栈

- **前端**：原生 HTML + CSS + JavaScript（无构建步骤、无框架）
- **存储**：`localStorage` 存用户偏好与 AI 配置
- **依赖**：**零**。没有 npm，没有 CDN，运行时唯一可能发出的网络请求，
  就是你自己配置的那个 AI 接口
- **浏览器**：Chrome / Edge / Firefox / Safari（最近两个大版本）

> 因为**没有后端、也没有第三方 CDN**，整个应用可以纯静态部署——包括直接用本地 `file://` 协议打开。

---

### 🤝 参与贡献

非常欢迎！最简单的几种方式：

- 🐛 在 [Issues](../../issues) 报 bug
- 💡 提你想看到的下一个工具
- 🌍 翻译 UI 到你的语言（参考 `assets/js/i18n.js`）
- 🧪 在不同浏览器、不同数据量下测试
- ⭐ 觉得好用就点个 Star，让更多人看到

---

### 📄 开源协议

本项目基于 **MIT 协议** 开源。你可自由使用、修改、再分发，甚至用作商业用途，只需保留版权声明。

完整协议文本见 [`LICENSE`](LICENSE) 文件。

---

### 📬 联系方式

- 🐛 问题反馈 / 功能建议：[GitHub Issues](../../issues)
- 🌐 作者更多信息：[your-portfolio-link]

---

<div align="center">

**如果 DataForge Pro 帮你省了时间，欢迎点个 ⭐，让更多人发现它。**

用 ❤️ 制作，献给每一个被在线转换器气到摔过键盘的人。

</div>