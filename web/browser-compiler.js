export const compiler = {
  run({ code, input, cases, onProgress, signal }) {
    if (!crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
      return Promise.reject(
        new Error(
          "当前浏览器不支持本地编译。请使用新版 Chrome、Edge 或 Firefox，并通过本站正式网址访问。",
        ),
      );
    }
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL("./compiler-worker.js", import.meta.url),
        { type: "module" },
      );
      let timer;
      function finish(result, error) {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        worker.terminate();
        if (error) reject(error);
        else resolve(result);
      }
      function deadline(milliseconds) {
        clearTimeout(timer);
        timer = setTimeout(
          () =>
            finish(
              null,
              new Error(
                "本次操作超过等待时间，已终止运行。请重试或检查代码与网络。",
              ),
            ),
          milliseconds,
        );
      }
      function cancel() {
        finish(null, new DOMException("已停止运行。", "AbortError"));
      }
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) {
        cancel();
        return;
      }
      worker.onmessage = ({ data }) => {
        if (data.type === "progress") {
          deadline(
            data.progress.stage === "running"
              ? 9000
              : data.progress.stage === "compiling"
                ? 75000
                : 180000,
          );
          onProgress?.(data.progress);
        } else if (data.type === "result") finish(data.result);
        else finish(null, new Error(data.message));
      };
      worker.onerror = (event) => {
        event.preventDefault();
        finish(
          null,
          new Error(event.message || "编译器启动失败，请刷新后重试。"),
        );
      };
      deadline(180000);
      worker.postMessage({ code, input, cases });
    });
  },
};
