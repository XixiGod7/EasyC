# Cloudflare 免费部署

Cloudflare 版本使用静态网页 + 免费 Worker，C 代码在访问者的浏览器里通过 Clang / WebAssembly 编译运行。
不使用 Containers、Durable Objects、外部编译服务器或付费套餐。原 Python / Gradio 项目仍然保留，可以继续通过 Docker 或本机运行。

## 功能

- 从原项目 JSON 题库生成 9 章、57 道练习，保留题目、输入输出和参考答案。
- 在线 C 编辑器，支持语法高亮、程序输入、编译错误、运行输出、5 秒超时和手动停止。
- 参考答案可放入编辑器，支持运行题目全部样例；需要人工自检的题目不会被误判为失败。
- 草稿仅存储在当前浏览器，不需要注册账号。
- 可选 AI 分析使用访问者自己的 DeepSeek API Key，密钥只存在页面内存中，不持久化、不写入日志。

## 部署

需要 Node.js 24，无需安装 Docker、Python 或 GCC：

```sh
npm ci
npm run check
npm test
npm run test:compiler
npm run build
npx wrangler login
npm run deploy
```

部署命令会输出 `https://easyc.<你的 Workers 子域名>.workers.dev`。
`wrangler.jsonc` 只配置静态资源和 AI 代理 Worker，不会申请收费容器或开通付费套餐。

## 本地预览

```sh
npm run dev
```

通过终端给出的 `http://localhost:8787` 地址访问。不能直接双击 HTML 文件：浏览器运行环境需要 HTTPS 或 localhost，并要求跨源隔离响应头。
构建脚本自动复制 SDK 到静态目录并生成题库；无需手动维护这些生成文件。

## 免费范围与限制

- [Cloudflare 静态资源请求免费](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)。AI 代理受 Workers Free 的请求和 CPU 限额约束。
- [Cloudflare Workers Free 限额](https://developers.cloudflare.com/workers/platform/limits/)由平台管理；保持免费套餐即可，不需要付费订阅。
- 首次运行 C 程序需要从 Wasmer 下载约 100 MB 的编译器，之后会使用浏览器缓存。网络较慢时需要等待。
- 使用 Clang 16 / WebAssembly，适合标准 C 学习练习，不等同于原生 Linux GCC 环境，不提供本机操作系统、任意网络或原生系统库访问。
- [Wasmer JavaScript SDK](https://docs.wasmer.io/runtime/js/)在客户端执行，不使用付费远程计算。
- 题库和编译器不需要 API Key；如果主动启用 AI，DeepSeek 仍按用户自己的账户计费，网站不会提供共享付费密钥。
- 点击 AI 分析时，代码、输入、输出和题目经本站 `/api/feedback` 转发到固定的 DeepSeek API。代理只使用当前请求提供的密钥。

## GitHub Actions

`Cloudflare` 工作流在 PR 和主分支推送时执行类型检查、单元测试、打包，以及真实 WebAssembly 编译、输入输出、多个样例、错误处理和超时验证。

若要通过 Actions 部署，在仓库 Actions secrets 中设置 `CLOUDFLARE_ACCOUNT_ID` 和具有 Workers 部署权限的 `CLOUDFLARE_API_TOKEN`，然后手动运行工作流并勾选 `deploy`。
本次通过本机 Wrangler 授权部署，无需向 GitHub 保存 Cloudflare 令牌。
