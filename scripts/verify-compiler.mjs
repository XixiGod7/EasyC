import assert from "node:assert/strict";
import { Wasmer } from "@wasmer/sdk/node";
import { createCompiler } from "../web/compiler-core.js";

const compiler = createCompiler(() => new Wasmer({ parallelism: 2 }));
try {
  const valid = await compiler.run({
    code: '#include <stdio.h>\nint main(void) { int n; scanf("%d", &n); printf("%d", n * 2); return 0; }',
    cases: [
      { input: "21", expected_output: "42" },
      { input: "-5", expected_output: "-10" },
    ],
  });
  assert.equal(valid.results.length, 2);
  assert.ok(
    valid.results.every((r) => r.ok && r.assessment === "pass"),
    JSON.stringify(valid),
  );
  console.log("C compilation, stdin, stdout and multiple test cases: OK");
  const invalid = await compiler.run({ code: "int main( {" });
  assert.ok(invalid.error && invalid.results.length === 0);
  console.log("Compilation errors: OK");
  const timeout = await compiler.run({
    code: "int main(void) { for (;;) {} }",
  });
  assert.equal(timeout.results[0].reason, "timeout");
  console.log("5-second execution timeout: OK");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  // A pure infinite Wasm loop may outlive its logical process timeout. The
  // browser edition terminates its entire worker tree; end this CLI test's
  // worker threads as well if the runtime cannot shut down cooperatively.
  const shutdown = setTimeout(() => process.exit(process.exitCode ?? 0), 1000);
  shutdown.unref();
  void compiler.close().then(() => process.exit(process.exitCode ?? 0));
}
