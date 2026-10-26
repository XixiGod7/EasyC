import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import { insertBracket, deleteBracketPair } from "@codemirror/autocomplete";
import { insertNewlineAndIndent, indentMore, indentLess, undo, redo } from "@codemirror/commands";
import { editorExtensions } from "./code-editor.js";

function workspace(doc = "", anchor = doc.length, head = anchor) {
  const view = {
    state: EditorState.create({ doc, selection: { anchor, head }, extensions: editorExtensions() }),
    dispatch(transaction) { this.state = this.state.update(transaction).state; },
  };
  view.dispatch = view.dispatch.bind(view);
  return view;
}

test("Enter splits paired braces and indents C blocks with four spaces", () => {
  const view = workspace("int main(void) {}", 16);
  assert.equal(insertNewlineAndIndent(view), true);
  assert.equal(view.state.doc.toString(), "int main(void) {\n    \n}");
  assert.equal(view.state.selection.main.head, 21);
});

test("nested blocks gain another level of indentation", () => {
  const text = "int main(void) {\n    if (1) {}\n}";
  const view = workspace(text, text.indexOf("{}") + 1);
  insertNewlineAndIndent(view);
  assert.equal(view.state.doc.toString(), "int main(void) {\n    if (1) {\n        \n    }\n}");
});

for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"], ['"', '"'], ["'", "'"]]) {
  test(`${open}${close} pairs, skips an existing closer, and deletes as a pair`, () => {
    const view = workspace();
    view.dispatch(insertBracket(view.state, open));
    assert.equal(view.state.doc.toString(), open + close);
    assert.equal(view.state.selection.main.head, 1);
    const transaction = insertBracket(view.state, close);
    assert.ok(transaction);
    view.dispatch(transaction);
    assert.equal(view.state.doc.toString(), open + close);
    assert.equal(view.state.selection.main.head, 2);
    view.dispatch({ selection: { anchor: 1 } });
    assert.equal(deleteBracketPair(view), true);
    assert.equal(view.state.doc.toString(), "");
  });
}

test("selected text is wrapped without being lost", () => {
  const view = workspace("value", 0, 5);
  view.dispatch(insertBracket(view.state, "("));
  assert.equal(view.state.doc.toString(), "(value)");
  assert.equal(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to), "value");
});

test("Tab and Shift+Tab indent and unindent a selection", () => {
  const view = workspace("one;\ntwo;", 0, 9);
  indentMore(view);
  assert.equal(view.state.doc.toString(), "    one;\n    two;");
  indentLess(view);
  assert.equal(view.state.doc.toString(), "one;\ntwo;");
});

test("automatic pairs participate in Undo and Redo", () => {
  const view = workspace();
  view.dispatch(insertBracket(view.state, "("));
  assert.equal(undo(view), true);
  assert.equal(view.state.doc.toString(), "");
  assert.equal(redo(view), true);
  assert.equal(view.state.doc.toString(), "()");
});
