# 部署 EasyC 到 Cloudflare

EasyC 使用 Python、Gradio 和本地 GCC，因此使用 **Worker + Cloudflare Containers** 部署。
Worker 校验访问密码，并将所有请求转发给同一个容器，保留 Gradio 的队列和设置。
这是个人使用的部署方式；同一实例中的 AI 设置和练习选择由应用共享。

## 套餐及资源

- 必须开通 [Workers Paid](https://dash.cloudflare.com/?to=/:account/workers/plans)。
- [当前基础费用为 5 美元/月](https://developers.cloudflare.com/containers/platform/pricing/)，超出包含额度的容器、网络、Worker 和 Durable Object 用量另计。
- 配置使用 `basic` 实例（1 GiB 内存），最多一个实例，空闲 2 分钟后休眠。
- 此配置限制实例数量，不代表账单上限。首次请求和休眠后的请求需要等待应用启动。
- 容器文件及界面中的设置可能随实例重启丢失。题库随镜像部署，无需数据库。

## 本机部署（需要 Docker）

安装 Node.js 24 和运行中的 Docker 引擎后，在项目目录执行：

```sh
npm ci
npm run check
npm test
npx wrangler login
npm run access:setup
npm run deploy
npx wrangler secret bulk .dev.vars
```

部署命令会输出 `https://easyc.<你的 Workers 子域名>.workers.dev`。
首次部署后需要等待数分钟完成容器创建，再打开网址，输入 `cloudflare-access.local.txt` 中的用户名和密码。
未设置访问凭据时，Worker 返回 503，不会开放编译器。
本地 `.dev.vars` 和密码文件已由 Git 和 Docker 忽略，切勿提交。

## 使用 GitHub Actions 云端构建（本机无需 Docker）

仓库的 `Cloudflare` 工作流会构建 Linux 镜像，并检查首页、题库、编译运行、输入输出、编译错误、执行超时及无密钥时的 AI 提示。

需要部署时，在 GitHub 仓库的 Actions secrets 中配置：

| Secret | 含义 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | 要部署到的 Cloudflare 账号 ID |
| `CLOUDFLARE_API_TOKEN` | 具有该账号 Workers 和 Containers 部署权限的 API Token |
| `EASYC_USERNAME` | 站点访问用户名，例如 `easyc` |
| `EASYC_PASSWORD` | 随机生成的站点访问密码 |

在 Actions → Cloudflare → Run workflow 中选择包含部署配置的分支，勾选 `deploy` 后运行。
工作流先验证镜像，验证成功后执行完整部署，并保存访问凭据为 Worker Secrets。
普通推送只进行验证；部署由手动工作流触发。

## 本地开发及验证

```sh
npm run access:setup  # 仅首次；不会覆盖已有密码
npm run dev         # 需要 Docker
```

不启动 Docker 也可以执行 `npm run check`、`npm test` 和 `npm run build`。
`build` 只验证并打包 Worker，完整镜像验证由 GitHub Actions 完成。

Python 单独启动时默认监听 `127.0.0.1:7860`；Docker 设置 `GRADIO_SERVER_NAME=0.0.0.0`。
AI 功能在界面的「设置」里填写 DeepSeek API Key 后启用；不配置密钥仍可使用题库和编译器。
为防止访问密码暴露给编译程序，Worker 不会将认证头转发到容器。
