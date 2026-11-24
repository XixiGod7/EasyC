import test from "node:test";
import assert from "node:assert/strict";
import { assessOutput } from "./compiler-core.js";

test("sample comparison ignores layout whitespace but retains significant values", () => {
  assert.equal(assessOutput("数组：1  2 3\n", " 数组：1 2 3 "), "pass");
  assert.equal(assessOutput("41", "42"), "fail");
});
test("self-check exercises do not produce false failures", () => {
  assert.equal(
    assessOutput("整型变量: 42", "请与答案自检变量定义是否正确"),
    "manual",
  );
  assert.equal(assessOutput("Hello"), "manual");
});
