export const COMPILER_PACKAGE = "clang/clang@=0.160000.1";
export const normalizeOutput = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
export function assessOutput(actual, expected) {
  if (expected === undefined || /自检|自查/.test(expected)) return "manual";
  return normalizeOutput(actual) === normalizeOutput(expected)
    ? "pass"
    : "fail";
}

export function createCompiler(loadRuntime) {
  let runtime;
  let compiler;
  async function prepare(progress, signal) {
    runtime ??= Promise.resolve()
      .then(loadRuntime)
      .catch((error) => {
        runtime = undefined;
        throw error;
      });
    const wasmer = await runtime;
    compiler ??= wasmer.packages
      .load(COMPILER_PACKAGE, {
        signal,
        onProgress(p) {
          const percent = p.download.percent;
          const size = (p.download.downloadedBytes / 1024 / 1024).toFixed(1);
          progress({
            stage: "loading",
            message:
              p.phase === "ready"
                ? "编译器已就绪"
                : p.phase === "resolving"
                  ? "正在连接编译器下载源…"
                  : `首次加载编译器：${percent == null ? `${size} MB` : `${Math.round(percent)}%`}，之后会使用浏览器缓存。`,
          });
        },
      })
      .catch((error) => {
        compiler = undefined;
        throw error;
      });
    return { wasmer, pkg: await compiler };
  }
  async function execute(sandbox, selector, args, input, timeoutMs, signal) {
    signal?.throwIfAborted();
    const process = await sandbox.command(selector, args).spawn({
      timeoutMs,
      outputBytes: 64 * 1024,
      stdin: "pipe",
      stdout: "capture",
      stderr: "capture",
    });
    const cancel = () => {
      void process.kill().catch(() => {});
    };
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      if (input) await process.stdin.write(input);
      await process.stdin.close();
      const output = await process.wait();
      signal?.throwIfAborted();
      return output;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }
  return {
    async run({ code, input = "", cases, onProgress = () => {}, signal }) {
      if (!code.trim()) throw new Error("请先输入 C 代码。");
      const { wasmer, pkg } = await prepare(onProgress, signal);
      signal?.throwIfAborted();
      onProgress({ stage: "compiling", message: "正在编译 C 代码…" });
      const project = await wasmer.sandboxes.create({
        packages: [pkg],
        files: { "main.c": code },
      });
      let binary;
      try {
        const output = await execute(
          project,
          "clang",
          [
            "/workspace/main.c",
            "-o",
            "/workspace/main.wasm",
            "-std=gnu17",
            "-O0",
            "-lm",
          ],
          "",
          60000,
          signal,
        );
        if (!output.ok)
          return {
            error:
              output.reason === "timeout"
                ? "编译超时，请简化代码后重试。"
                : output.stderr.text(),
            results: [],
          };
        binary = await wasmer.packages.load(
          await project.fs.readFile("main.wasm"),
        );
      } finally {
        await project.close();
      }
      const results = [];
      const inputs = cases ?? [{ input }];
      for (let i = 0; i < inputs.length; i++) {
        signal?.throwIfAborted();
        onProgress({
          stage: "running",
          message:
            inputs.length > 1
              ? `正在运行样例 ${i + 1}/${inputs.length}…`
              : "正在运行…",
        });
        const sandbox = await wasmer.sandboxes.create({ packages: [binary] });
        try {
          const start = performance.now();
          const output = await execute(
            sandbox,
            binary,
            [],
            inputs[i].input ?? "",
            5000,
            signal,
          );
          const stdout = output.stdout.text();
          results.push({
            ok: output.ok,
            reason: output.reason,
            exitCode: output.exitCode,
            stdout,
            stderr: output.stderr.text(),
            truncated: output.stdout.truncated || output.stderr.truncated,
            duration: Math.round(performance.now() - start),
            expected: inputs[i].expected_output,
            assessment: output.ok
              ? assessOutput(stdout, inputs[i].expected_output)
              : "error",
          });
        } finally {
          await sandbox.close();
        }
      }
      return { results };
    },
    async close() {
      if (runtime) await (await runtime).close();
    },
  };
}
