import assert from "node:assert/strict";
import test from "node:test";
import { handleConnectionTest, handleFeedback } from "./feedback.ts";

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://easyc.example/api/feedback", {
    method: "POST",
    body,
    headers: { Authorization: "Bearer user-provided-test-key", ...headers },
  });
}
test("missing key and cross-site requests never call the AI provider", async () => {
  const forbiddenFetch = async () => {
    throw new Error("provider must not be called");
  };
  assert.equal(
    (await handleFeedback(request("{}", { Authorization: "" }), forbiddenFetch))
      .status,
    401,
  );
  assert.equal(
    (
      await handleFeedback(
        request("{}", { Origin: "https://other.example" }),
        forbiddenFetch,
      )
    ).status,
    403,
  );
});
test("invalid or oversized input is rejected before forwarding", async () => {
  assert.equal((await handleFeedback(request("invalid"))).status, 400);
  assert.equal((await handleFeedback(request("{}"))).status, 400);
  assert.equal(
    (await handleFeedback(request("x".repeat(49 * 1024)))).status,
    413,
  );
});
test("AI response streams through and uses only the supplied key", async () => {
  let called = false;
  const response = await handleFeedback(
    request(JSON.stringify({ code: "int main(void) {return 0;}" })),
    async (url, options) => {
      called = true;
      assert.equal(url, "https://api.deepseek.com/chat/completions");
      assert.equal(
        new Headers(options?.headers).get("Authorization"),
        "Bearer user-provided-test-key",
      );
      assert.equal(JSON.parse(String(options?.body)).stream, true);
      return new Response('data: {"choices":[]}\n\n', { headers: { "Content-Type": "text/event-stream" } });
    },
  );
  assert.equal(called, true);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.match(await response.text(), /^data:/);
});

const customConfig = { provider: "custom", baseUrl: "https://api.vendor.example/v1/", model: "vendor/custom-model" };
const streamHeaders = { "Content-Type": "text/event-stream" };
const okEvent = 'data: {"choices":[{"delta":{"content":"OK"}}]}\n\n';

test("custom analysis forwards the selected endpoint, model, context and credential", async () => {
  const response = await handleFeedback(request(JSON.stringify({ config: customConfig, code: "int main(void){}", input: "42", output: "84", exercise: "test" })), async (url, options) => {
    assert.equal(url, "https://api.vendor.example/v1/chat/completions");
    assert.equal(options?.redirect, "manual");
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer user-provided-test-key");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, customConfig.model);
    assert.equal(body.stream, true);
    assert.deepEqual(JSON.parse(body.messages[1].content), { code: "int main(void){}", input: "42", output: "84", exercise: "test" });
    return new Response(okEvent, { headers: streamHeaders });
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type")!, /event-stream/);
  assert.equal(await response.text(), okEvent);
});

test("connectivity sends only a tiny probe and cancels the stream after a real reply", async () => {
  let cancelled = false;
  const response = await handleConnectionTest(request(JSON.stringify({ config: customConfig, code: "PRIVATE CODE", output: "PRIVATE OUTPUT" })), async (url, options) => {
    assert.equal(url, "https://api.vendor.example/v1/chat/completions");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, customConfig.model);
    assert.deepEqual(body.messages, [{ role: "user", content: "Reply with exactly OK." }]);
    assert.ok(!String(options?.body).includes("PRIVATE"));
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(': heartbeat\n\ndata: {"choices":[{"delta":{"role":"assistant"}}]}\n\n' + okEvent));
      },
      cancel() { cancelled = true; },
    }), { headers: streamHeaders });
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.model, customConfig.model);
  assert.equal(data.endpoint, "https://api.vendor.example/v1/chat/completions");
  assert.ok(data.latency_ms >= 1);
  assert.equal(cancelled, true);
  assert.ok(!JSON.stringify(data).includes("user-provided-test-key"));
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("a complete endpoint is used once; ordinary JSON replies are supported", async () => {
  const config = { ...customConfig, baseUrl: "https://api.vendor.example/v1/chat/completions/" };
  for (const handler of [handleConnectionTest, handleFeedback]) {
    const response = await handler(request(JSON.stringify({ config, code: "int main(void){}" })), async (url) => {
      assert.equal(url, "https://api.vendor.example/v1/chat/completions");
      return Response.json({ choices: [{ message: { content: "OK" } }] });
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type")!, /application\/json/);
  }
});

test("connectivity also validates the request method, origin, key and body", async () => {
  const neverFetch = async () => { assert.fail("must not call upstream"); };
  assert.equal((await handleConnectionTest(new Request("https://easyc.example/api/ai/test"), neverFetch)).status, 405);
  for (const [body, headers, status] of [
    ["{}", { Authorization: "" }, 401],
    ["{}", { Origin: "https://other.example" }, 403],
    ["null", {}, 400], ["[]", {}, 400], ["x".repeat(49 * 1024), {}, 413],
  ] as const) assert.equal((await handleConnectionTest(request(body, headers), neverFetch)).status, status);
});

test("invalid or local endpoints and invalid models never receive the key", async () => {
  const neverFetch = async () => { assert.fail("must not call upstream"); };
  const urls = ["http://api.vendor.example/v1", "https://localhost", "https://127.0.0.1", "https://10.0.0.1", "https://[::1]", "https://api.internal/v1", "https://user:pass@api.vendor.example", "https://api.vendor.example?key=secret", "https://easyc.example/v1"];
  for (const baseUrl of urls) {
    const response = await handleConnectionTest(request(JSON.stringify({ config: { ...customConfig, baseUrl } })), neverFetch);
    assert.equal(response.status, 400, baseUrl);
  }
  for (const model of ["", "wrong model", "x\nheader", 123]) {
    assert.equal((await handleConnectionTest(request(JSON.stringify({ config: { ...customConfig, model } })), neverFetch)).status, 400);
  }
});

test("connectivity reports provider errors without returning its response or credential", async () => {
  for (const [status, message] of [[401, "密钥"], [402, "余额"], [403, "权限"], [404, "模型"], [429, "额度"], [500, "暂时"], [302, "重定向"]] as const) {
    const response = await handleConnectionTest(request(JSON.stringify({ config: customConfig })), async () => new Response("secret-key should not be echoed", { status }));
    assert.equal(response.status, status >= 500 || status < 400 ? 502 : status);
    const data = await response.json();
    assert.match(data.error, new RegExp(message));
    assert.equal(data.upstream_status, status);
    assert.ok(!JSON.stringify(data).includes("secret-key"));
  }
});

test("200 HTML, empty choices, invalid JSON and SSE errors never pass connectivity", async () => {
  for (const makeResponse of [
    () => new Response("<html>landing page</html>", { headers: { "Content-Type": "text/html" } }),
    () => Response.json({ choices: [] }),
    () => new Response("broken JSON", { headers: { "Content-Type": "application/json" } }),
    () => new Response('data: {"error":{"message":"bad key"}}\n\n', { headers: streamHeaders }),
    () => new Response('data: {"choices":[]}\n\ndata: [DONE]\n\n', { headers: streamHeaders }),
  ]) {
    const response = await handleConnectionTest(request(JSON.stringify({ config: customConfig })), async () => makeResponse());
    assert.equal(response.status, 502);
    assert.equal((await response.json()).ok, undefined);
  }
});

test("network failures and timeouts have distinct results", async () => {
  for (const [error, status] of [[new Error("network"), 502], [new DOMException("timeout", "TimeoutError"), 504]] as const) {
    const response = await handleConnectionTest(request(JSON.stringify({ config: customConfig })), async () => { throw error; });
    assert.equal(response.status, status);
  }
});

test("a cancelled probe interrupts a silent stream and closes its reader", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const req = new Request("https://easyc.example/api/ai/test", { method: "POST", body: JSON.stringify({ config: customConfig }), signal: controller.signal, headers: { Authorization: "Bearer user-provided-test-key" } });
  const pending = handleConnectionTest(req, async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: streamHeaders }));
  const abort = setTimeout(() => controller.abort(), 10);
  try {
    assert.equal((await pending).status, 499);
    assert.equal(cancelled, true);
  } finally { clearTimeout(abort); }
});
