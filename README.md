# CocyNoric Blog

一个自托管、文件驱动的 Material Design 3 个人博客。它把公开博客、Markdown 写作、图片画廊、文件仓库和可视化管理后台放在同一个应用中，不依赖外部数据库。

## 功能特性

- **内容展示**：首页、文章列表与详情、文章搜索、标签筛选、图片画廊和公开文件仓库。
- **Markdown 写作**：支持 GFM（表格、任务列表等）、LaTeX/KaTeX 公式、实时预览、草稿与发布状态。
- **文章导入**：可导入 `.md`、`.markdown` 或 ZIP；ZIP 中被文章引用的图片会保留目录结构并自动改写为站内地址。
- **画廊管理**：上传 PNG、JPEG、WebP，编辑标题和说明，拖拽排序，并分别设置卡片与详情缩略图的焦点和比例。
- **文件仓库**：公开浏览文章资源、画廊原图以及代码/工具项目；代码项目支持文件夹上传、ZIP 安全解压、保留 ZIP 和整包下载。
- **外观配置**：可调整品牌信息、亮暗色主题、种子色、背景、首页 Hero、内容宽度、卡片密度、详情页信息栏和仓库布局。
- **本地持久化**：文章、设置、媒体和索引都保存在 `data/`，便于迁移和备份。
- **基础安全防护**：Markdown HTML 白名单过滤、CSP、安全响应头、scrypt 密码摘要、HttpOnly 会话 Cookie、CSRF/Origin 校验和登录限流。

## 技术栈

- React 19、React Router 7、TypeScript
- Vite 8
- Express 5
- Unified / Remark / Rehype、KaTeX
- Zod、Sharp
- Node.js 文件系统存储（Markdown + JSON + 原始媒体文件）

## 快速开始

### 环境要求

- Node.js 22 或更高版本
- npm

### 本地开发

```bash
npm install
npm run admin:create
npm run dev
```

`admin:create` 会交互式创建管理员密码，密码至少需要 12 个字符。开发命令会先启动后端，再启动 Vite 开发服务器。

| 入口 | 默认地址 |
| --- | --- |
| 公开站点 | `http://127.0.0.1:5173` |
| 管理员登录 | `http://127.0.0.1:5173/admin/login` |
| 后端 API | `http://127.0.0.1:3000/api` |

首次启动时会自动创建 `data/`、默认站点设置和三篇示例文章。登录后台后可以修改站点资料、编辑示例文章，或删除它们并开始发布自己的内容。

## 使用说明

### 后台管理

后台包含四个区域：

- **文章**：新建、编辑、预览、导入、发布或删除文章，并向已保存的文章插入图片。
- **画廊**：上传图片、修改元数据与裁切焦点、调整顺序。
- **仓库**：查看 Markdown 和画廊内容，管理公开的代码与工具项目。
- **站点设置**：配置基础资料、首页、文章浏览、画廊浏览和仓库外观。

管理员密码保存在运行时数据目录中。后续修改密码可执行：

```bash
npm run admin:change-password
```

### 导入文章

不包含本地图片时，可以直接导入 UTF-8 编码的 `.md` 或 `.markdown` 文件。Front Matter 可提供以下字段：

```markdown
---
title: 一篇示例文章
slug: example-post
excerpt: 文章摘要
date: 2026-07-27
tags:
  - 技术
  - 随笔
---

# 正文标题

这里开始书写 Markdown 正文。
```

Front Matter 是可选的：标题会依次从 `title`、首个一级标题和文件名推断；路径会由 `slug` 或标题生成；日期缺省为导入当天。所有导入文章都会先保存为**草稿**，确认内容后再从编辑器发布。

文章引用相对路径图片时，请将文章和图片一起打包为 ZIP：

```text
my-post.zip
└── my-post/
    ├── article.md
    └── images/
        └── cover.webp
```

在 Markdown 中使用 `![封面](images/cover.webp)` 即可。ZIP 只能包含一篇 Markdown，只有文章实际引用的 PNG、JPEG 或 WebP 会被导入；嵌套相对目录会保留。主要限制如下：

- Markdown 正文最大 1 MB。
- ZIP 文件最大 128 MB，解压后最大 100 MB。
- ZIP 最多 128 个条目、64 张被引用的图片，单张图片最大 20 MB。
- 不接受加密 ZIP、符号链接、越界路径、重复路径或异常压缩比。

### 画廊与代码项目

- 画廊支持 PNG、JPEG、WebP，单张最大 25 MB。图片使用从 `00000001` 开始递增且不复用的 8 位编号；原图会被保留，超过 5 MB 时会另外生成 `display.webp` 用于页面展示。
- 代码项目可以选择一个文件夹，或上传最大 128 MB 的 ZIP。解压后的项目最多 1000 个文件、总计 100 MB，单个文件最大 20 MB。
- ZIP 也可以选择“保留 ZIP”，此时文件不会解压，只作为附件公开下载。
- 公开整包下载采用无压缩 ZIP 流，并限制为每个客户端每分钟 6 次、全局同时 2 个下载，单次最长 5 分钟，以避免动态压缩造成资源耗尽。
- 仓库文件始终作为附件下载并禁止 MIME 嗅探，不会由应用执行。

## 生产部署

```bash
npm ci
npm run build
npm start
```

`npm run build` 会依次完成服务端 TypeScript 编译、客户端构建和服务端入口打包。`npm start` 设置 `NODE_ENV=production`，由 Express 在默认的 `3000` 端口同时提供 API、媒体和 `dist/client` 静态文件。

生产环境建议放在 Nginx、Caddy 等 HTTPS 反向代理之后，并至少设置公开来源：

```powershell
$env:BLOG_PUBLIC_ORIGINS = "https://blog.example.com"
$env:BLOG_COOKIE_SECURE = "true"
npm start
```

项目脚本直接读取进程环境变量，不会自动加载 `.env`。请通过 Shell、服务管理器、容器平台或反向代理的部署配置注入变量。

> `BLOG_COOKIE_SECURE` 在生产模式下默认为 `true`。如果只为本机做一次纯 HTTP 的生产构建验证，需要临时设为 `false`；正式部署请始终使用 HTTPS 并恢复为 `true`。

应用默认不信任代理转发头。只有在源站端口已通过防火墙限制为仅可信反向代理可访问时，才应把 `BLOG_TRUST_PROXY_HOPS` 设置为实际代理跳数（典型单层 Nginx/Caddy 为 `1`）。不要在源站可被公网直接访问时启用此设置。

### 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `BLOG_HOST` | 后端监听地址，仅支持 `127.0.0.1` 或 `0.0.0.0` | 开发：`127.0.0.1`；生产：`0.0.0.0` |
| `BLOG_TRUST_PROXY_HOPS` | 信任的反向代理跳数；仅在源站禁止直接访问时设置 | `0`（不信任代理头） |
| `BLOG_PORT` | 后端端口 | `3000` |
| `BLOG_DEV_HOST` | Vite 开发服务器监听地址 | 跟随 `BLOG_HOST` |
| `BLOG_DEV_PORT` | Vite 开发服务器端口 | `5173` |
| `BLOG_PROXY_HOST` | Vite 开发代理连接后端时使用的地址 | `127.0.0.1` |
| `BLOG_PUBLIC_ORIGINS` | 允许执行写操作的来源；多个来源用逗号分隔 | 开发：本机 Vite 地址；生产：`http://127.0.0.1:3000` |
| `BLOG_DATA_DIR` | 设置、文章、图片、仓库、管理员摘要和会话的保存目录 | `<项目目录>/data` |
| `BLOG_COOKIE_SECURE` | 是否只通过 HTTPS 发送登录 Cookie | 开发：`false`；生产：`true` |

Windows PowerShell 开放局域网开发访问示例：

```powershell
$env:BLOG_HOST = "0.0.0.0"
$env:BLOG_DEV_HOST = "0.0.0.0"
npm run dev
```

如果经由不同域名或端口访问，请同时把浏览器中的完整来源（协议、主机和端口）加入 `BLOG_PUBLIC_ORIGINS`。

## 数据、备份与升级

`data/` 是完整的运行时状态，已被 Git 忽略。典型结构如下：

```text
data/
├── settings.json                 # 站点与外观设置
├── admin.json                    # 管理员密码摘要
├── media/                        # 头像、图标和背景等站点媒体
├── sessions/                     # 登录会话
└── repository/
    ├── markdown/
    │   └── <slug>/                # Markdown 与文章图片资源
    ├── gallery/
    │   ├── index.json
    │   └── 00000001/             # 原图及可选的 display.webp
    └── code-tools/               # 项目、附件及 index.json
```

请定期备份完整的 `BLOG_DATA_DIR`，并确保备份包含隐藏文件。不要把该目录、环境变量文件、私钥或本地凭据提交到仓库。备份或升级前应停止所有指向同一数据目录的博客实例，以免复制到不一致的写入状态。

首次使用新版本启动时，应用会自动迁移旧存储布局：

- 平铺文章及其已引用图片会迁入独立的文章项目目录。
- 已有的大型画廊图片会生成 WebP 展示副本。
- v1 布局中空的 `code-tools` 会升级为版本化文件清单。
- 遇到无法识别的旧文件或目标内容冲突时，迁移会停止，不会猜测或覆盖文件。

旧版本没有保存图片原文件名，因此历史画廊图片迁移后可能继续使用 UUID 文件名；新上传图片会保留原文件名。

公开的 `/repository` 只展示 `markdown`、`gallery` 和 `code-tools` 三个受控内容区域，不会暴露 `admin.json`、会话、临时文件或任意服务器路径。

## 项目结构

```text
src/
├── client/       # React 页面、组件、Hooks 与样式
├── server/       # Express 服务、鉴权、存储、媒体与路由
└── shared/       # 前后端共用类型、Schema 和纯函数
scripts/          # 开发、生产启动与管理员命令
tests/            # Node.js 测试
public/           # 不经构建处理的静态资源
data/             # 本地运行时数据（不提交）
dist/             # 生产构建产物（不提交）
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 同时启动后端与 Vite 开发服务器 |
| `npm run dev:server` | 仅以 watch 模式启动后端 |
| `npm run dev:client` | 仅启动 Vite；需要已有可访问的后端 |
| `npm run typecheck` | 检查客户端与服务端 TypeScript |
| `npm test` | 运行 `tests/*.test.ts` |
| `npm run build` | 构建生产版本 |
| `npm start` | 运行已经构建的生产版本 |
| `npm run admin:create` | 创建或重设管理员凭据 |
| `npm run admin:change-password` | 修改管理员密码 |

## 许可证

本项目采用 [Apache License 2.0](LICENSE) 开源许可证。
