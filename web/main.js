import "./style.css";
import "./compiler-layout.css";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { compiler } from "./browser-compiler.js";
import { createCodeEditor } from "./code-editor.js";
import { DEFAULT_AI_CONFIG, normalizeAiConfig, validateApiKey } from "../shared/ai-config.ts";
import { readAiResponse } from "./ai-client.js";

const $ = (id) => document.getElementById(id);
const renderMarkdown = (node, text) => {
  node.innerHTML = DOMPurify.sanitize(marked.parse(String(text)));
};
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
  categories: [],
  key: "",
  aiConfig: { ...DEFAULT_AI_CONFIG },
  testController: null,
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

const editor = createCodeEditor($("code-editor"), {
  onChange: (code) => writeStorage(draftKey(), code),
  onRun: () => void run(),
});
const setCode = (code) => editor.setCode(code);
const exerciseNumber = (exercise) =>
  exercise.source?.number ?? exercise.id.replace("ex", "").replace("_", ".");
function resetOutput() {
  chooseFeedbackPanel("output");
  state.output = "";
  $("program-output").textContent = "";
  $("sample-results").replaceChildren();
  $("runtime-progress").textContent = "写好代码，点击「运行代码」。";
  $("result-status").textContent = "等待运行";
  $("result-status").className = "result-status";
  $("ai-feedback").textContent = state.key
    ? `当前模型：${state.aiConfig.model}，点击「分析代码」获取帮助。`
    : "在设置中配置 AI 服务商、模型和 API Key 后，可以请 AI 帮你分析代码。";
  $("ai-feedback").classList.add("muted");
}
function chooseFeedbackPanel(panel) {
  document.querySelector(".workspace").dataset.feedbackPanel = panel;
  $("output-view-button").setAttribute("aria-pressed", String(panel === "output"));
  $("assistant-view-button").setAttribute("aria-pressed", String(panel === "assistant"));
}
function setCompilerFocus(focused) {
  document.body.classList.toggle("compiler-focus", focused);
  $("compiler-focus").setAttribute("aria-pressed", String(focused));
  $("compiler-focus").textContent = focused ? "退出专注" : "专注模式";
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
    `${exerciseNumber(exercise)} ${exercise.title}`;
  const difficulty = { easy: "基础", medium: "进阶", hard: "挑战" };
  $("question-difficulty").textContent =
    difficulty[exercise.difficulty] ?? exercise.difficulty;
  $("question-difficulty").className = `difficulty ${exercise.difficulty}`;
  renderMarkdown($("question-description"), exercise.description);
  $("question-source").textContent = exercise.source
    ? `来源：所提供的深大复习资料 · ${exercise.source.section}第 ${exercise.source.number} 题（${exercise.source.image}）。输入输出与参考解答为练习补充。`
    : "";
  $("question-source").hidden = !exercise.source;
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
    state.chapters.find((item) => item.id === chapterId) ??
    state.chapters.find((item) => item.category_id === $("category-select").value);
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
    number.textContent = exerciseNumber(exercise);
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
function showCategory(categoryId, chapterId, exerciseId) {
  const category = state.categories.find((item) => item.id === categoryId);
  if (!category) return;
  $("category-select").value = category.id;
  $("category-description").textContent = category.description;
  const chapters = state.chapters.filter((item) => item.category_id === category.id);
  $("chapter-select").replaceChildren();
  for (const [i, chapter] of chapters.entries()) {
    const option = document.createElement("option");
    option.value = chapter.id;
    option.textContent = `${i + 1}. ${chapter.title}`;
    $("chapter-select").append(option);
  }
  showChapter(chapters.find((item) => item.id === chapterId)?.id ?? chapters[0]?.id, exerciseId);
}
function route() {
  const requested = location.hash.slice(1).split("/")[0] || "home";
  const next = ["home", "practice", "compiler", "settings"].includes(requested)
    ? requested
    : "home";
  const previous = state.mode;
  cancel();
  state.mode = next;
  document.body.classList.toggle("compiler-active", next === "compiler");
  if (next !== "compiler") setCompilerFocus(false);
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
  $("compiler-controls").hidden = next !== "compiler";
  if (next === "practice") {
    const id = state.exercise?.id ?? readStorage("easyc:exercise", "ex1_1");
    const chapter =
      state.chapters.find((c) => c.exercises.some((e) => e.id === id)) ??
      state.chapters[0];
    showCategory(chapter?.category_id, chapter?.id, id);
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
      code: editor.getCode(),
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
  chooseFeedbackPanel("assistant");
  if (!state.key) {
    $("ai-feedback").innerHTML =
      '请先在<a href="#settings">设置</a>中配置服务商、模型和 API Key，并保存本次设置。';
    return;
  }
  const controller = new AbortController();
  state.aiController?.abort();
  state.aiController = controller;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(95000)]);
  $("ai-button").disabled = true;
  $("ai-feedback").textContent = "正在分析…";
  $("ai-feedback").classList.remove("muted");
  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.key}`,
      },
      body: JSON.stringify({
        config: state.aiConfig,
        code: editor.getCode(),
        input: $("program-input").value,
        output: state.output.slice(0, 16000),
        exercise: state.mode === "practice" ? state.exercise.description : "",
      }),
    });
    await readAiResponse(response, {
      signal,
      onContent(content) {
        if (state.aiController === controller) renderMarkdown($("ai-feedback"), content);
      },
    });
  } catch (error) {
    if (!controller.signal.aborted && state.aiController === controller)
      $("ai-feedback").textContent = signal.aborted ? "AI 服务响应超时，请稍后重试。" : error.message;
  } finally {
    if (state.aiController === controller) {
      state.aiController = null;
      $("ai-button").disabled = false;
    }
  }
}

function stopAiAnalysis() {
  state.aiController?.abort();
  state.aiController = null;
  $("ai-button").disabled = false;
}
function setSettingsMessage(id, message, kind = "") {
  $(id).textContent = message;
  $(id).className = `settings-message ${kind}`;
}
function abortConnectionTest(message = "") {
  state.testController?.abort();
  state.testController = null;
  $("test-api").disabled = false;
  $("cancel-api-test").hidden = true;
  if (message) setSettingsMessage("api-test-status", message);
}
function readAiForm() {
  return {
    config: normalizeAiConfig({
      provider: $("ai-provider").value,
      baseUrl: $("api-base-url").value,
      model: $("api-model").value,
    }),
    key: validateApiKey($("api-key").value),
  };
}
async function testConnection() {
  let settings;
  try { settings = readAiForm(); }
  catch (error) { setSettingsMessage("api-test-status", error.message, "error"); return; }
  abortConnectionTest();
  const controller = new AbortController();
  state.testController = controller;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]);
  $("test-api").disabled = true;
  $("cancel-api-test").hidden = false;
  setSettingsMessage("api-test-status", "正在检测服务地址、密钥和模型，请稍候…", "busy");
  try {
    const response = await fetch("/api/ai/test", {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.key}` },
      body: JSON.stringify({ config: settings.config }),
    });
    const result = await response.json().catch(() => ({ error: "检测接口未返回有效数据，请稍后重试。" }));
    if (!response.ok || result.ok !== true) throw new Error(result.error || "检测失败，服务未返回有效结果。");
    if (typeof result.model !== "string" || !Number.isFinite(result.latency_ms))
      throw new Error("检测结果不完整，请稍后重试。");
    if (state.testController === controller)
      setSettingsMessage("api-test-status", `连接成功 · ${result.model} · 首次回复 ${result.latency_ms} ms。保存本次设置后用于 AI 助教。`, "success");
  } catch (error) {
    if (!controller.signal.aborted && state.testController === controller)
      setSettingsMessage("api-test-status", signal.aborted ? "检测超时，请检查服务地址或稍后重试。" : error.message, "error");
  } finally {
    if (state.testController === controller) abortConnectionTest();
  }
}

const providerDrafts = {
  deepseek: { ...DEFAULT_AI_CONFIG },
  custom: { provider: "custom", baseUrl: "", model: "" },
};
let formProvider = "deepseek";
function showAiConfig(config) {
  formProvider = config.provider;
  $("ai-provider").value = config.provider;
  $("api-base-url").value = config.baseUrl;
  $("api-base-url").readOnly = config.provider === "deepseek";
  $("api-model").value = config.model;
  $("provider-key-link").hidden = config.provider !== "deepseek";
}
function clearAiCredential() {
  stopAiAnalysis();
  state.key = "";
  $("api-key").value = "";
  $("ai-feedback").textContent = "在设置中配置 AI 服务商、模型和 API Key 后，可以请 AI 帮你分析代码。";
  $("ai-feedback").classList.add("muted");
}

$("run-button").addEventListener("click", () => void run());
$("output-view-button").addEventListener("click", () => chooseFeedbackPanel("output"));
$("assistant-view-button").addEventListener("click", () => chooseFeedbackPanel("assistant"));
$("compiler-focus").addEventListener("click", () =>
  setCompilerFocus(!document.body.classList.contains("compiler-focus")),
);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.isComposing && document.body.classList.contains("compiler-focus"))
    setCompilerFocus(false);
});
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
  writeStorage(draftKey(), editor.getCode());
  resetOutput();
});
$("chapter-select").addEventListener("change", (e) =>
  showChapter(e.target.value),
);
$("category-select").addEventListener("change", (e) => showCategory(e.target.value));
$("question-tab").addEventListener("click", () => choosePanel(false));
$("answer-tab").addEventListener("click", () => choosePanel(true));
$("use-answer").addEventListener("click", () => {
  cancel();
  setCode(state.exercise.solution);
  writeStorage(draftKey(), state.exercise.solution);
  editor.focus();
});
$("example-select").addEventListener("change", (e) => {
  cancel();
  setCode(examples[e.target.value]);
  writeStorage(draftKey(), editor.getCode());
  $("program-input").value = e.target.value === "sum" ? "21 21" : "";
  resetOutput();
});
$("ai-button").addEventListener("click", () => void analyze());
$("settings-form").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    const settings = readAiForm();
    stopAiAnalysis();
    state.key = settings.key;
    state.aiConfig = settings.config;
    writeStorage("easyc:ai-config", JSON.stringify(settings.config));
    setSettingsMessage("settings-status", "设置已保存。密钥仅当前页面有效，服务地址与模型会在本机记住。", "success");
    $("ai-feedback").textContent = `当前模型：${settings.config.model}，点击「分析代码」获取帮助。`;
    $("ai-feedback").classList.add("muted");
  } catch (error) { setSettingsMessage("settings-status", error.message, "error"); }
});
$("clear-key").addEventListener("click", () => {
  abortConnectionTest("密钥已清除，请重新填写后检测。");
  clearAiCredential();
  setSettingsMessage("settings-status", "密钥已清除。");
});
$("test-api").addEventListener("click", () => void testConnection());
$("cancel-api-test").addEventListener("click", () => abortConnectionTest("检测已取消。"));
$("ai-provider").addEventListener("change", () => {
  providerDrafts[formProvider] = { provider: formProvider, baseUrl: $("api-base-url").value, model: $("api-model").value };
  showAiConfig(providerDrafts[$("ai-provider").value]);
  abortConnectionTest("服务商已切换，请重新检测。");
  clearAiCredential();
  setSettingsMessage("settings-status", "请填写该服务商的密钥并保存设置。");
});
for (const id of ["api-base-url", "api-model", "api-key"]) {
  $(id).addEventListener("input", () => {
    abortConnectionTest($("api-test-status").textContent ? "配置已修改，请重新检测。" : "");
    if (id === "api-base-url") {
      clearAiCredential();
      setSettingsMessage("settings-status", "服务地址已修改，请重新填写密钥并保存。");
    } else setSettingsMessage("settings-status", "配置已修改，保存后用于 AI 助教。");
  });
}
try {
  state.aiConfig = normalizeAiConfig(JSON.parse(readStorage("easyc:ai-config", JSON.stringify(DEFAULT_AI_CONFIG))));
} catch { state.aiConfig = { ...DEFAULT_AI_CONFIG }; }
showAiConfig(state.aiConfig);
window.addEventListener("hashchange", route);
try {
  const response = await fetch("/data/exercises.json");
  if (!response.ok) throw new Error("题库加载失败，请刷新页面重试。");
  const data = await response.json();
  state.chapters = data.chapters;
  state.categories = data.categories;
  $("chapter-total").textContent = state.chapters.length;
  $("exercise-total").textContent = state.chapters.reduce((count, chapter) => count + chapter.exercises.length, 0);
  for (const category of state.categories) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.title;
    $("category-select").append(option);
  }
} catch (error) {
  $("load-error").textContent = error.message;
  $("load-error").hidden = false;
}
route();
