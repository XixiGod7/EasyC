export interface AiConfig {
  provider: "deepseek" | "custom";
  baseUrl: string;
  model: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
};

// Shared validation keeps the settings, probe and analysis requests consistent.
export function normalizeAiConfig(value: unknown = DEFAULT_AI_CONFIG): AiConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("AI 配置格式不正确，请重新保存设置。");
  const input = value as Record<string, unknown>;
  const provider = input.provider ?? "deepseek";
  if (provider !== "deepseek" && provider !== "custom")
    throw new Error("请选择有效的服务商。");
  const baseUrl = input.baseUrl ?? (provider === "deepseek" ? DEFAULT_AI_CONFIG.baseUrl : "");
  const model = input.model ?? (provider === "deepseek" ? DEFAULT_AI_CONFIG.model : "");
  if (typeof baseUrl !== "string" || !baseUrl.trim() || baseUrl.length > 2048)
    throw new Error("请填写有效的 API 服务地址。");
  let url: URL;
  try { url = new URL(baseUrl.trim()); }
  catch { throw new Error("服务地址格式不正确，例如 https://api.example.com/v1。"); }
  if (url.protocol !== "https:")
    throw new Error("服务地址需要使用公网 HTTPS 地址。");
  if (url.username || url.password || url.search || url.hash)
    throw new Error("服务地址不能包含用户名、密码、查询参数或片段；请在密钥栏填写 API Key。");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  // The deployed Worker can only reach public providers, not the visitor's LAN.
  if (
    !hostname.includes(".") || /^\d+(?:\.\d+){3}$/.test(hostname) ||
    hostname.includes(":") ||
    /(?:^|\.)(?:localhost|local|internal|lan)$/.test(hostname) ||
    hostname.endsWith(".home.arpa")
  ) throw new Error("请使用公网服务商的域名，不能使用本机、局域网地址或 IP 地址。");
  if (typeof model !== "string" || !model.trim() || model.length > 200 || /[\x00-\x20\x7f]/.test(model.trim()))
    throw new Error("请填写有效的模型名称，使用服务商提供的模型 ID。");
  url.hostname = hostname;
  return { provider, baseUrl: url.toString().replace(/\/+$/, ""), model: model.trim() };
}

export function completionEndpoint(config: AiConfig): string {
  return config.baseUrl.endsWith("/chat/completions")
    ? config.baseUrl
    : `${config.baseUrl}/chat/completions`;
}

export function validateApiKey(key: string): string {
  const trimmed = key.trim();
  if (!/^[\x21-\x7e]{8,4096}$/.test(trimmed))
    throw new Error("请填写有效的 API Key（至少 8 个字符，不能包含空格）。");
  return trimmed;
}
