import "./style.css";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { compiler } from "./browser-compiler.js";

const $ = (id) => document.getElementById(id);
const renderMarkdown = (node, text) => {
  node.innerHTML = DOMPurify.sanitize(marked.parse(String(text)));
};
const escapeHtml = (text) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const examples = {
  hello:
    '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, EasyC!\\n");\n    return 0;\n}\n',
  sum: '#include <stdio.h>\n\nint main(void) {\n    int a, b;\n    scanf("%d %d", &a, &b);\n    printf("%d\\n", a + b);\n    return 0;\n}\n',
  pointer:
    '#include <stdio.h>\n\nint main(void) {\n    int numbers[] = {10, 20, 30};\n    int *p = numbers;\n\n    for (int i = 0; i < 3; i++) {\n        printf("%d ", *(p + i));\n    }\n    return 0;\n}\n',
};
const emptyProgram =
  "#include <stdio.h>\n\nint main(void) {\n    // 在这里编写你的代码\n\n    return 0;\n}\n";
const state = {
  mode: "home",
  exercise: null,
  chapters: [],
  key: "",
  output: "",
  controller: null,
  aiController: null,
  runId: 0,
};
function readStorage(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
const draftKey = () =>
  `easyc:draft:${state.mode === "practice" ? state.exercise?.id : "compiler"}`;

function highlight() {
  const code = $("code-editor").value;
  const token =
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|^\s*#[^\n]*|\b(?:int|float|double|char|void|long|short|unsigned|signed|const|static|struct|typedef|enum|return|if|else|for|while|do|switch|case|break|continue|sizeof|NULL)\b|\b\d+(?:\.\d+)?\b/gm;
  let html = "",
    offset = 0;
  for (const match of code.matchAll(token)) {
    html += escapeHtml(code.slice(offset, match.index));
    const text = match[0];
    const style =
      text.startsWith("//") || text.startsWith("/*")
        ? "comment"
        : /^["']/.test(text)
          ? "green"
          : /^\s*#/.test(text)
            ? "purple"
            : /^\d/.test(text)
              ? "orange"
              : "blue";
    html += `<span class="syntax-${style}">${escapeHtml(text)}</span>`;
    offset = match.index + text.length;
  }
  $("code-highlight").innerHTML = html + escapeHtml(code.slice(offset)) + "\n";
  $("line-numbers").textContent = Array.from(
    { length: code.split("\n").length },
    (_, i) => i + 1,
  ).join("\n");
  syncScroll();
}
function syncScroll() {
  const editor = $("code-editor");
  $("code-highlight").style.transform =
    `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
  $("line-numbers").scrollTop = editor.scrollTop;
}
function setCode(code) {
  $("code-editor").value = code;
  highlight();
}
function resetOutput() {
  state.output = "";
  $("program-output").textContent = "";
  $("sample-results").replaceChildren();
  $("runtime-progress").textContent = "写好代码，点击「运行代码」。";
  $("result-status").textContent = "等待运行";
  $("result-status").className = "result-status";
  $("ai-feedback").textContent =
    "配置自己的 DeepSeek API Key 后，可以请 AI 帮你分析代码。";
  $("ai-feedback").classList.add("muted");
}
function busy(value) {
  $("run-button").disabled = value;
  $("test-button").disabled = value;
  $("stop-button").hidden = !value;
}
function cancel() {
  state.controller?.abort();
  state.controller = null;
  state.aiController?.abort();
  state.aiController = null;
  $("ai-button").disabled = false;
  state.runId++;
  busy(false);
}
function choosePanel(answer) {
  $("question-content").hidden = answer;
  $("answer-content").hidden = !answer;
  for (const [id, selected] of [
    ["question-tab", !answer],
    ["answer-tab", answer],
  ]) {
    $(id).classList.toggle("active", selected);
    $(id).setAttribute("aria-selected", String(selected));
  }
}
function showExercise(exercise) {
  if (!exercise) return;
  cancel();
  state.exercise = exercise;
  $("question-title").textContent =
    `${exercise.id.replace("ex", "").replace("_", ".")} ${exercise.title}`;
  const difficulty = { easy: "基础", medium: "进阶", hard: "挑战" };
  $("question-difficulty").textContent =
    difficulty[exercise.difficulty] ?? exercise.difficulty;
  $("question-difficulty").className = `difficulty ${exercise.difficulty}`;
  renderMarkdown($("question-description"), exercise.description);
  $("reference-code").textContent = exercise.solution;
  $("test-cases").replaceChildren();
  for (const [i, item] of exercise.test_cases.entries()) {
    const card = document.createElement("div");
    card.className = "sample-card";
    const title = document.createElement("h3");
    title.textContent = `样例 ${i + 1}`;
    card.append(title);
    for (const [label, text] of [
      ["输入", item.input || "（无输入）"],
      ["预期输出", item.expected_output],
    ]) {
      const name = document.createElement("span");
      name.className = "sample-label";
      name.textContent = label;
      const value = document.createElement("pre");
      value.textContent = text;
      card.append(name, value);
    }
    $("test-cases").append(card);
  }
  setCode(readStorage(draftKey(), exercise.solution_template || emptyProgram));
  $("program-input").value = exercise.test_cases[0]?.input ?? "";
  resetOutput();
  choosePanel(false);
  for (const button of $("exercise-list").children) {
    button.classList.toggle("active", button.dataset.id === exercise.id);
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.id === exercise.id),
    );
  }
  writeStorage("easyc:exercise", exercise.id);
}
function showChapter(chapterId, exerciseId) {
  const chapter =
    state.chapters.find((item) => item.id === chapterId) ?? state.chapters[0];
  if (!chapter) return;
  $("chapter-select").value = chapter.id;
  $("exercise-count").textContent = `${chapter.exercises.length} 题`;
  $("exercise-list").replaceChildren();
  for (const exercise of chapter.exercises) {
    const button = document.createElement("button");
    button.className = "exercise-item";
    button.dataset.id = exercise.id;
    const number = document.createElement("span");
    number.className = "exercise-number";
    number.textContent = exercise.id.replace("ex", "").replace("_", ".");
    const title = document.createElement("span");
    title.textContent = exercise.title;
    button.append(number, title);
    button.addEventListener("click", () => showExercise(exercise));
    $("exercise-list").append(button);
  }
  showExercise(
    chapter.exercises.find((item) => item.id === exerciseId) ??
      chapter.exercises[0],
  );
}
function route() {
  const requested = location.hash.slice(1).split("/")[0] || "home";
  const next = ["home", "practice", "compiler", "settings"].includes(requested)
    ? requested
    : "home";
  const previous = state.mode;
  cancel();
  state.mode = next;
  $("home-view").hidden = next !== "home";
  $("lab-view").hidden = !["practice", "compiler"].includes(next);
  $("settings-view").hidden = next !== "settings";
  for (const link of document.querySelectorAll("[data-nav]")) {
    const active = link.dataset.nav === next;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  $("lab-view").classList.toggle("mode-compiler", next === "compiler");
  $("lab-title").textContent = next === "compiler" ? "在线编译" : "习题练习";
  $("lab-eyebrow").textContent =
    next === "compiler"
      ? "一个想法，一次尝试，一点新的发现"
      : "一步一步，把知识写进代码";
  $("example-picker").hidden = next !== "compiler";
  if (next === "practice") {
    const id = state.exercise?.id ?? readStorage("easyc:exercise", "ex1_1");
    const chapter =
      state.chapters.find((c) => c.exercises.some((e) => e.id === id)) ??
      state.chapters[0];
    showChapter(chapter?.id, id);
  } else if (next === "compiler" && previous !== "compiler") {
    setCode(readStorage(draftKey(), examples.hello));
    $("program-input").value = "";
    resetOutput();
  }
}

function presentResults(result, testing) {
  const label = $("result-status");
  if (result.error) {
    label.textContent = "编译错误";
    label.className = "result-status error";
    $("runtime-progress").textContent = "请根据错误信息检查代码。";
    $("program-output").textContent = result.error;
    state.output = result.error;
    return;
  }
  const failed = result.results.some((r) => !r.ok || r.assessment === "fail");
  const timedOut = result.results.some((r) => r.reason === "timeout");
  label.textContent = timedOut
    ? "执行超时"
    : failed
      ? testing
        ? "有样例未通过"
        : "运行错误"
      : testing
        ? "样例检查完成"
        : "运行成功";
  label.className = `result-status ${failed ? "error" : "success"}`;
  $("runtime-progress").textContent = timedOut
    ? "程序运行超过 5 秒，已自动停止。"
    : `运行完成 · ${result.results.reduce((n, r) => n + r.duration, 0)} ms${testing ? " · 比较时忽略多余空白" : ""}`;
  const first = result.results[0];
  $("program-output").textContent = [
    first.stdout || (first.ok ? "（程序没有输出）" : ""),
    first.stderr,
    first.truncated ? "（输出过长，已截断。）" : "",
  ]
    .filter(Boolean)
    .join("\n");
  state.output = result.results
    .map(
      (r, i) =>
        `样例 ${i + 1} (${r.reason}, exit ${r.exitCode})\n${r.stdout}\n${r.stderr}`,
    )
    .join("\n");
  if (testing)
    for (const [i, item] of result.results.entries()) {
      const card = document.createElement("div");
      card.className = `sample-result ${item.assessment}`;
      const title = document.createElement("strong");
      const text = {
        pass: "通过",
        fail: "输出不匹配",
        manual: "请对照参考答案自检",
        error: item.reason === "timeout" ? "执行超时" : "运行错误",
      };
      title.textContent = `样例 ${i + 1} · ${text[item.assessment]}`;
      card.append(title);
      if (item.assessment === "fail")
        for (const [name, value] of [
          ["预期输出", item.expected],
          ["实际输出", item.stdout],
        ]) {
          const p = document.createElement("p");
          p.textContent = name;
          const pre = document.createElement("pre");
          pre.textContent = value;
          card.append(p, pre);
        }
      $("sample-results").append(card);
    }
}
async function run(testing = false) {
  if (state.controller) return;
  state.aiController?.abort();
  $("ai-button").disabled = false;
  const id = ++state.runId;
  const controller = new AbortController();
  state.controller = controller;
  busy(true);
  resetOutput();
  $("result-status").textContent = "准备中";
  $("result-status").className = "result-status busy";
  try {
    const result = await compiler.run({
      code: $("code-editor").value,
      input: $("program-input").value,
      cases: testing ? state.exercise.test_cases : undefined,
      signal: controller.signal,
      onProgress(p) {
        if (id === state.runId) {
          $("runtime-progress").textContent = p.message;
          $("result-status").textContent =
            { loading: "加载中", compiling: "编译中", running: "运行中" }[
              p.stage
            ] ?? "准备中";
        }
      },
    });
    if (id === state.runId) presentResults(result, testing);
  } catch (error) {
    if (id === state.runId) {
      $("result-status").textContent = controller.signal.aborted
        ? "已停止"
        : "运行失败";
      $("result-status").className = "result-status error";
      $("runtime-progress").textContent = controller.signal.aborted
        ? "本次运行已停止。"
        : "请检查网络连接后重试；首次运行需要下载编译器。";
      $("program-output").textContent = controller.signal.aborted
        ? ""
        : error.message;
    }
  } finally {
    if (id === state.runId) {
      state.controller = null;
      busy(false);
    }
  }
}
async function analyze() {
  if (!state.key) {
    $("ai-feedback").innerHTML =
      '请先在<a href="#settings">设置</a>中填写自己的 DeepSeek API Key。';
    return;
  }
  const controller = new AbortController();
  state.aiController?.abort();
  state.aiController = controller;
  $("ai-button").disabled = true;
  $("ai-feedback").textContent = "正在分析…";
  $("ai-feedback").classList.remove("muted");
  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.key}`,
      },
      body: JSON.stringify({
        code: $("code-editor").value,
        input: $("program-input").value,
        output: state.output.slice(0, 16000),
        exercise: state.mode === "practice" ? state.exercise.description : "",
      }),
    });
    if (!response.ok)
      throw new Error((await response.json()).error || "AI 服务暂时不可用。");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "",
      content = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines)
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          const chunk = JSON.parse(data);
          content += chunk.choices?.[0]?.delta?.content ?? "";
        }
      if (state.aiController === controller)
        renderMarkdown($("ai-feedback"), content || "正在分析…");
    }
    if (!content && state.aiController === controller)
      $("ai-feedback").textContent = "AI 没有返回内容，请稍后重试。";
  } catch (error) {
    if (!controller.signal.aborted && state.aiController === controller)
      $("ai-feedback").textContent = error.message;
  } finally {
    if (state.aiController === controller) {
      state.aiController = null;
      $("ai-button").disabled = false;
    }
  }
}

$("code-editor").addEventListener("input", () => {
  highlight();
  writeStorage(draftKey(), $("code-editor").value);
});
$("code-editor").addEventListener("scroll", syncScroll);
$("code-editor").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void run();
  }
  if (event.key === "Tab" && !event.shiftKey) {
    event.preventDefault();
    const editor = $("code-editor");
    editor.setRangeText(
      "    ",
      editor.selectionStart,
      editor.selectionEnd,
      "end",
    );
    editor.dispatchEvent(new Event("input"));
  }
});
$("run-button").addEventListener("click", () => void run());
$("test-button").addEventListener("click", () => void run(true));
$("stop-button").addEventListener("click", () => {
  cancel();
  $("result-status").textContent = "已停止";
  $("runtime-progress").textContent = "本次运行已停止。";
});
$("reset-button").addEventListener("click", () => {
  cancel();
  setCode(
    state.mode === "practice"
      ? state.exercise.solution_template || emptyProgram
      : examples[$("example-select").value],
  );
  writeStorage(draftKey(), $("code-editor").value);
  resetOutput();
});
$("chapter-select").addEventListener("change", (e) =>
  showChapter(e.target.value),
);
$("question-tab").addEventListener("click", () => choosePanel(false));
$("answer-tab").addEventListener("click", () => choosePanel(true));
$("use-answer").addEventListener("click", () => {
  cancel();
  setCode(state.exercise.solution);
  writeStorage(draftKey(), state.exercise.solution);
  $("code-editor").focus();
});
$("example-select").addEventListener("change", (e) => {
  cancel();
  setCode(examples[e.target.value]);
  writeStorage(draftKey(), $("code-editor").value);
  $("program-input").value = e.target.value === "sum" ? "21 21" : "";
  resetOutput();
});
$("ai-button").addEventListener("click", () => void analyze());
$("settings-form").addEventListener("submit", (e) => {
  e.preventDefault();
  state.key = $("api-key").value.trim();
  $("settings-status").textContent = state.key
    ? "已保存，仅当前页面有效。"
    : "请输入有效的 API Key。";
});
$("clear-key").addEventListener("click", () => {
  state.aiController?.abort();
  state.key = "";
  $("api-key").value = "";
  $("settings-status").textContent = "已清除。";
});
window.addEventListener("hashchange", route);
try {
  const response = await fetch("/data/exercises.json");
  if (!response.ok) throw new Error("题库加载失败，请刷新页面重试。");
  const data = await response.json();
  state.chapters = data.chapters;
  for (const [i, chapter] of state.chapters.entries()) {
    const option = document.createElement("option");
    option.value = chapter.id;
    option.textContent = `${i + 1}. ${chapter.title}`;
    $("chapter-select").append(option);
  }
} catch (error) {
  $("load-error").textContent = error.message;
  $("load-error").hidden = false;
}
route();
