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

`data/` 包含文章、上传图片、站点设置、管理员密码摘要和登录会话，已被 Git 忽略。请单独备份该目录，不要将它、环境变量文件、私钥或本地配置提交到仓库。

生产环境应通过 HTTPS 提供服务，设置准确的 `BLOG_PUBLIC_ORIGINS`，并保持 `BLOG_COOKIE_SECURE=true`。

## 常用命令

```bash
npm run typecheck
npm test
npm run build
npm run admin:change-password
```
