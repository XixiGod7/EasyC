import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const username = "easyc";
const password = randomBytes(24).toString("base64url");
// Never silently replace credentials from an earlier setup.
writeFileSync(".dev.vars", `EASYC_USERNAME=${username}\nEASYC_PASSWORD=${password}\n`, { flag: "wx", mode: 0o600 });
writeFileSync("cloudflare-access.local.txt", `用户名：${username}\n密码：${password}\n`, { flag: "wx", mode: 0o600 });
console.log("已生成访问密码，保存在 cloudflare-access.local.txt（Git 和 Docker 已忽略）。");
console.log("运行 npx wrangler secret bulk .dev.vars 可将凭据保存为 Cloudflare Worker Secrets。");
