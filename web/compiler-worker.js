import { createCompiler } from "./compiler-core.js";

const compiler = createCompiler(async () => {
  const { Wasmer } = await import(
    /* @vite-ignore */ "/vendor/wasmer-0.19.1/dist/index.js"
  );
  return new Wasmer({
    parallelism: 2,
    outputBytes: 64 * 1024,
    cache: { namespace: "easyc-clang-16-v1" },
  });
});
self.onmessage = async ({ data }) => {
  try {
    const result = await compiler.run({
      ...data,
      onProgress: (progress) =>
        self.postMessage({ type: "progress", progress }),
    });
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error.message || String(error),
    });
  }
  // The owner terminates this worker and its children after the result.
};
