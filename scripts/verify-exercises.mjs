import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { loadExerciseCatalog } from "./exercise-catalog.mjs";
import { createCompiler, assessOutput } from "../web/compiler-core.js";

// Default: the exact Clang/WebAssembly runtime used by the website.
// --native is a faster optional check for developers who already have GCC.
const native = process.argv.includes("--native");
const catalog = await loadExerciseCatalog();
const exercises = catalog.chapters.filter((chapter) => chapter.category_id === "szu_exam").flatMap((chapter) => chapter.exercises);
let directory, compiler, cases = 0;
try {
  if (native) directory = await mkdtemp(join(tmpdir(), "easyc-questions-"));
  else {
    const { Wasmer } = await import("@wasmer/sdk/node");
    compiler = createCompiler(() => new Wasmer({ parallelism: 2 }));
  }
  for (const exercise of exercises) {
    if (native) {
      const source = join(directory, "main.c");
      const binary = join(directory, process.platform === "win32" ? "main.exe" : "main");
      await writeFile(source, exercise.solution);
      const compiled = spawnSync(process.env.CC || "gcc", [source, "-o", binary, "-std=c17", "-Wall", "-Wextra", "-lm"], { encoding: "utf8", timeout: 60000 });
      assert.equal(compiled.status, 0, `${exercise.id}: ${compiled.error ?? compiled.stderr}`);
      for (const [i, sample] of exercise.test_cases.entries()) {
        const sandbox = join(directory, `${exercise.id}-${i}`);
        await mkdir(sandbox);
        const result = spawnSync(binary, [], { input: sample.input, cwd: sandbox, encoding: "utf8", timeout: 5000 });
        assert.equal(result.status, 0, `${exercise.id} #${i + 1}: ${result.error ?? result.stderr}`);
        assert.equal(assessOutput(result.stdout, sample.expected_output), "pass", `${exercise.id} #${i + 1}: expected ${JSON.stringify(sample.expected_output)}, got ${JSON.stringify(result.stdout)}`);
      }
    } else {
      const result = await compiler.run({ code: exercise.solution, cases: exercise.test_cases });
      assert.ok(!result.error, `${exercise.id}: ${result.error}`);
      assert.ok(result.results.every((item) => item.ok && item.assessment === "pass"), `${exercise.id}: ${JSON.stringify(result)}`);
    }
    cases += exercise.test_cases.length;
    console.log(`${exercise.id}: ${exercise.test_cases.length} samples OK`);
  }
  console.log(`${exercises.length} reference solutions and ${cases} samples passed (${native ? "GCC" : "Clang/WebAssembly"}).`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (directory) {
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1).startsWith("easyc-questions-"));
    await rm(target, { recursive: true, force: true });
  }
  if (compiler) {
    const shutdown = setTimeout(() => process.exit(process.exitCode ?? 0), 1000);
    shutdown.unref();
    await compiler.close();
  }
}
