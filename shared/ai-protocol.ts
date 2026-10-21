export class AiProtocolError extends Error {}

export function chatContent(payload: unknown, streamed = false): string {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as Record<string, any>;
  if (data.error)
    throw new AiProtocolError("服务商返回了错误，请检查密钥、模型名称和账户额度。");
  const value = streamed ? data.choices?.[0]?.delta?.content : data.choices?.[0]?.message?.content;
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.map((part) => typeof part?.text === "string" ? part.text : "").join("");
  return "";
}

export async function* readChatEvents(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", data: string[] = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  const parse = (lines: string[]) => {
    const value = lines.join("\n").trim();
    if (value === "[DONE]") return { done: true };
    if (!value) return {};
    try { return { payload: JSON.parse(value) as unknown }; }
    catch { throw new AiProtocolError("服务商返回的数据格式不正确，请确认接口兼容 Chat Completions。"); }
  };
  try {
    while (true) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      signal?.throwIfAborted();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      if (buffer.length + data.join("\n").length > 128 * 1024)
        throw new AiProtocolError("服务商返回的数据过长或格式不正确。");
      // Flush the final event even when its trailing newline is omitted.
      if (chunk.done && buffer && !buffer.endsWith("\n")) buffer += "\n";
      let end: number;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);
        if (!line) {
          const event = parse(data); data = [];
          if (event.done) return;
          if (event.payload !== undefined) yield event.payload;
        } else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (chunk.done) {
        const event = parse(data);
        if (event.payload !== undefined) yield event.payload;
        return;
      }
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
