import assert from "node:assert/strict";
import test from "node:test";
import { authorizeRequest } from "./auth.ts";

const secrets = { EASYC_USERNAME: "easyc", EASYC_PASSWORD: "test-password" };
function request(credentials?: string): Request {
  return new Request("https://easyc.example/", {
    headers: credentials ? { Authorization: credentials } : {},
  });
}

test("valid credentials allow access", async () => {
  assert.equal(await authorizeRequest(request(`Basic ${btoa("easyc:test-password")}`), secrets), null);
});

test("missing, incorrect and malformed credentials cannot reach the compiler", async () => {
  for (const value of [undefined, `Basic ${btoa("easyc:wrong")}`, "Basic !!!", "Bearer test-password"]) {
    const response = await authorizeRequest(request(value), secrets);
    assert.equal(response?.status, 401);
    assert.equal(response?.headers.get("Cache-Control"), "no-store");
    assert.match(response?.headers.get("WWW-Authenticate") ?? "", /^Basic /);
  }
});

test("unconfigured deployment stays closed", async () => {
  const response = await authorizeRequest(request(`Basic ${btoa("easyc:test-password")}`), {});
  assert.equal(response?.status, 503);
});
