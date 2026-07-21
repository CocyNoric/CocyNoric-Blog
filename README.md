# CocyNoric Blog

一个自托管的 Material Design 3 个人博客，支持 Markdown、GFM、LaTeX、文章管理、画廊和全站外观设置。

## 环境要求

- Node.js 22 或更高版本
- npm

## 本地启动

```bash
npm install
npm run admin:create
npm run dev
```

开发页面默认运行在 `http://127.0.0.1:5173`。

## 生产运行

```bash
npm run build
npm start
```

常用环境变量：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `BLOG_HOST` | 服务监听地址，仅支持 `127.0.0.1` 或 `0.0.0.0` | 开发为 `127.0.0.1`，生产为 `0.0.0.0` |
| `BLOG_PORT` | 后端端口 | `3000` |
| `BLOG_DEV_HOST` | Vite 开发服务器监听地址 | 跟随 `BLOG_HOST` |
| `BLOG_DEV_PORT` | Vite 开发服务器端口 | `5173` |
| `BLOG_PROXY_HOST` | 开发代理连接后端的地址 | `127.0.0.1` |
| `BLOG_PUBLIC_ORIGINS` | 允许执行写操作的来源，多个来源使用逗号分隔 | 本机开发地址 |
| `BLOG_DATA_DIR` | 文章、设置、图片和会话的保存目录 | `./data` |
| `BLOG_COOKIE_SECURE` | 是否只通过 HTTPS 发送登录 Cookie | 生产环境为 `true` |

Windows PowerShell 开放局域网访问示例：

```powershell
$env:BLOG_HOST = "0.0.0.0"
$env:BLOG_DEV_HOST = "0.0.0.0"
npm run dev
```

## 数据与安全

`data/` 包含内容仓库、上传图片、站点设置、管理员密码摘要和登录会话，已被 Git 忽略。请单独备份该目录，不要将它、环境变量文件、私钥或本地配置提交到仓库。

内容仓库使用以下结构：

```text
data/repository/
├── markdown/       # 已发布/草稿 Markdown 与文章图片
├── gallery/        # index.json 以及 00000001/ 等独立图片目录
└── code-tools/     # index.json 与 items/<uuid>/<原文件名>
```

公开 `/repository` 只显示这三个受控内容目录，不会列出 `admin.json`、登录会话、临时文件或任意服务器文件。Markdown 继续通过文章导入并先保存为草稿，画廊继续使用独立管理器；普通文件只能上传到 `code-tools`，归档文件不会被解压，下载始终作为附件并禁止 MIME 嗅探。新画廊图片使用从 `00000001` 开始且不会复用的 8 位编号，每个编号目录保留经过安全校验的上传文件名。

从旧版本升级前，请停止所有博客实例并备份完整的 `BLOG_DATA_DIR`。首次启动会自动迁移旧文章、画廊和存储布局；v1 布局中的空 `code-tools` 会升级为版本化文件清单，如果该目录包含无法识别的旧文件，服务会停止启动而不会猜测或覆盖。源文件与新目录存在内容冲突时也会安全停止。旧版本没有保存图片原文件名，因此历史画廊图片迁移后只能继续使用原 UUID 文件名，新上传图片才会保留原文件名。

生产环境应通过 HTTPS 提供服务，设置准确的 `BLOG_PUBLIC_ORIGINS`，并保持 `BLOG_COOKIE_SECURE=true`。

## 常用命令

```bash
npm run typecheck
npm test
npm run build
npm run admin:change-password
```
