# Cloudflare 免费部署

Cloudflare 版本使用静态网页 + 免费 Worker，C 代码在访问者的浏览器里通过 Clang / WebAssembly 编译运行。
不使用 Containers、Durable Objects、外部编译服务器或付费套餐。原 Python / Gradio 项目仍然保留，可以继续通过 Docker 或本机运行。

## 功能

- 题库有“零基础练习”和“深大考题”两个分类，共 13 个章节 / 专题、141 题。新增的 84 题按常规、链表、结构体、文件分组，保留资料原编号，并补充输入输出、样例与参考解答。
- 在线 C 编辑器支持语法高亮、四空格自动缩进、括号与单双引号配对补全、成对删除、选区包裹、Tab / Shift+Tab 缩进，以及撤销 / 重做。习题练习与在线编译共用编辑器。
- 支持程序输入、编译错误、运行输出、5 秒超时和手动停止。文件题使用浏览器沙箱内的临时文件，按题意读写并把结果打印出来，每次运行独立。
- 参考答案可放入编辑器，支持运行题目全部样例；需要人工自检的题目不会被误判为失败。
- 草稿仅存储在当前浏览器，不需要注册账号。
- 可选 AI 助教支持 DeepSeek 预设和自定义的 OpenAI 兼容 Chat Completions 服务商，可填写 Base URL、模型 ID 和 API Key。只记住本机的服务地址与模型，密钥仅存在页面内存中，不持久化、不写入日志。
- 设置页可直接检测当前表单中的配置，实际向所选模型发送一条简短测试消息；收到有效文本才显示连接成功及首次回复耗时，区分密钥、权限、余额、模型、地址、超时等错误。支持取消检测，修改配置会取消过期检测。

## 部署

需要 Node.js 24，无需安装 Docker、Python 或 GCC：

```sh
npm ci
npm run check
npm test
npm run test:compiler
npm run test:exercises
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
构建脚本根据 `src/data/catalog.json` 汇总各个分类，自动复制 SDK 到静态目录并生成题库；无需手动维护这些生成文件。深大题目的来源与补充约定见 [题库说明](src/data/szu_exam/README.md)。

## 免费范围与限制

- [Cloudflare 静态资源请求免费](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)。AI 代理受 Workers Free 的请求和 CPU 限额约束。
- [Cloudflare Workers Free 限额](https://developers.cloudflare.com/workers/platform/limits/)由平台管理；保持免费套餐即可，不需要付费订阅。
- 首次运行 C 程序需要从 Wasmer 下载约 100 MB 的编译器，之后会使用浏览器缓存。网络较慢时需要等待。
- 使用 Clang 16 / WebAssembly，适合标准 C 学习练习，不等同于原生 Linux GCC 环境，不提供本机操作系统、任意网络或原生系统库访问。
- [Wasmer JavaScript SDK](https://docs.wasmer.io/runtime/js/)在客户端执行，不使用付费远程计算。
- 题库和编译器不需要 API Key；AI 分析和连通性检测按用户选择的服务商账户计费，网站不会提供共享付费密钥。检测只发送简短测试消息，不包含代码或题目，收到第一段文本就结束请求。
- 点击 AI 分析时，代码、输入、输出和题目经本站 `/api/feedback` 发送到当前保存的服务地址和模型；检测通过 `/api/ai/test` 发送到当前表单配置。代理只使用该请求提供的密钥，不跟随服务商重定向。切换服务商或修改地址会清除已有密钥。
- 自定义服务需提供公网 HTTPS 域名并兼容 `POST /chat/completions`。例如 `https://api.example.com/v1` 会请求 `/v1/chat/completions`，也支持填写完整接口地址。支持 SSE 流式回复及兼容服务返回的普通 JSON 回复，不支持直接连接访问者本机或局域网服务。
- 连通性检测等待模型文本回复的上限为 20 秒；AI 分析上限为 90 秒。检测成功代表当时的服务地址、密钥和模型组合可用。

## GitHub Actions

`Cloudflare` 工作流在 PR 和主分支推送时执行类型检查、单元测试、打包，以及真实 WebAssembly 编译、输入输出、多个样例、错误处理和超时验证。还会逐一编译全部 84 个深大题参考解答并检查 140 个样例。

若要通过 Actions 部署，在仓库 Actions secrets 中设置 `CLOUDFLARE_ACCOUNT_ID` 和具有 Workers 部署权限的 `CLOUDFLARE_API_TOKEN`，然后手动运行工作流并勾选 `deploy`。
也可在本机通过 Wrangler 登录后直接部署，无需向 GitHub 保存 Cloudflare 令牌。
