import { EditorState } from "@codemirror/state";
import { EditorView, drawSelection, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { cpp } from "@codemirror/lang-cpp";
import { tags } from "@lezer/highlight";

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
    syntaxHighlighting(HighlightStyle.define([
      { tag: tags.comment, color: "#8d9aab" },
      { tag: [tags.keyword, tags.typeName], color: "#2f71a1" },
      { tag: [tags.string, tags.character], color: "#498876" },
      { tag: tags.number, color: "#bb7d45" },
      { tag: tags.meta, color: "#925fa9" },
    ])),
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
