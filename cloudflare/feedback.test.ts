import assert from "node:assert/strict";
import test from "node:test";
import { handleFeedback } from "./feedback.ts";

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
      return new Response('data: {"choices":[]}\n\n');
    },
  );
  assert.equal(called, true);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.match(await response.text(), /^data:/);
});
