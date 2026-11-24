import { EditorState } from "@codemirror/state";
import { EditorView, drawSelection, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { cpp, cppLanguage } from "@codemirror/lang-cpp";
import { highlightTree, tags } from "@lezer/highlight";

const cHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "#596f83" },
  { tag: [tags.keyword, tags.typeName], color: "#2f71a1" },
  { tag: [tags.string, tags.character], color: "#498876" },
  { tag: tags.number, color: "#bb7d45" },
  { tag: tags.meta, color: "#925fa9" },
]);

export function renderReferenceCode(node, code) {
  const fragment = document.createDocumentFragment();
  let position = 0;
  highlightTree(cppLanguage.parser.parse(code), cHighlight, (from, to, classes) => {
    fragment.append(code.slice(position, from));
    const token = document.createElement("span");
    token.className = classes;
    token.textContent = code.slice(from, to);
    fragment.append(token);
    position = to;
  });
  fragment.append(code.slice(position));
  node.replaceChildren(fragment);
}

// Shared by the compiler and exercise workspace, including their draft handling.
export function editorExtensions({ onChange = () => {}, onRun = () => {} } = {}) {
  return [
    cpp(),
    indentUnit.of("    "),
    indentOnInput(),
    closeBrackets(),
    bracketMatching(),
    history(),
    lineNumbers(),
    drawSelection(),
    syntaxHighlighting(cHighlight),
    keymap.of([
      { key: "Mod-Enter", run: () => { onRun(); return true; } },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    EditorView.contentAttributes.of({
      "aria-label": "C 代码编辑器",
      "aria-describedby": "editor-hint",
      spellcheck: "false",
      autocapitalize: "off",
      autocorrect: "off",
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
  ];
}

export function createCodeEditor(parent, options) {
  const extensions = editorExtensions(options);
  const view = new EditorView({ parent, state: EditorState.create({ extensions }) });
  return {
    getCode: () => view.state.doc.toString(),
    setCode(code) {
      // A new exercise has its own history; Undo must not restore another draft.
      view.setState(EditorState.create({ doc: code, extensions }));
    },
    focus: () => view.focus(),
  };
}
