import { chatContent, readChatEvents } from "../shared/ai-protocol.ts";

export async function readAiResponse(response, { signal, onContent = () => {} } = {}) {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `AI 请求失败（HTTP ${response.status}）。`);
  }
  let content = "";
  if (response.headers.get("Content-Type")?.includes("application/json")) {
    content = chatContent(await response.json());
    if (content) onContent(content);
  } else {
    if (!response.body) throw new Error("AI 服务没有返回内容。");
    for await (const event of readChatEvents(response.body, signal)) {
      const delta = chatContent(event, true);
      if (delta) { content += delta; onContent(content); }
    }
  }
  if (!content.trim()) throw new Error("AI 没有返回文本内容，请检查模型设置后重试。");
  return content;
}
