import assert from "node:assert/strict";
import test from "node:test";
import { readAiResponse } from "./ai-client.js";
import { completionEndpoint, normalizeAiConfig, validateApiKey } from "../shared/ai-config.ts";

test("base URLs and full completion endpoints normalize consistently", () => {
  for (const baseUrl of ["https://api.vendor.example/v1", "https://api.vendor.example/v1/", "https://api.vendor.example/v1/chat/completions/"]) {
    const config = normalizeAiConfig({ provider: "custom", baseUrl, model: " vendor/model " });
    assert.equal(completionEndpoint(config), "https://api.vendor.example/v1/chat/completions");
    assert.equal(config.model, "vendor/model");
  }
  assert.equal(validateApiKey("  custom-api-key  "), "custom-api-key");
  assert.throws(() => validateApiKey("short"));
  assert.throws(() => validateApiKey("key with spaces"));
});

test("the streaming reader handles split UTF-8, CRLF, keepalives and a final event without newline", async () => {
  const bytes = new TextEncoder().encode(': keepalive\r\n\r\ndata: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"，C！"}}]}');
  const updates = [];
  const response = new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } });
  assert.equal(await readAiResponse(response, { onContent: text => updates.push(text) }), "你好，C！");
  assert.deepEqual(updates, ["你好", "你好，C！"]);
});

test("ordinary compatible JSON replies render as assistant text", async () => {
  assert.equal(await readAiResponse(Response.json({ choices: [{ message: { content: "代码正确。" } }] })), "代码正确。");
});

test("HTTP errors and in-stream errors are displayed instead of false success", async () => {
  await assert.rejects(readAiResponse(Response.json({ error: "密钥无效" }, { status: 401 })), /密钥无效/);
  await assert.rejects(readAiResponse(new Response('data: {"error":{"message":"invalid model"}}\n\n', { headers: { "Content-Type": "text/event-stream" } })), /服务商返回了错误/);
  await assert.rejects(readAiResponse(Response.json({ choices: [] })), /没有返回文本/);
});
