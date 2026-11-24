import assert from "node:assert/strict";
import test from "node:test";
import { loadExerciseCatalog } from "./exercise-catalog.mjs";

test("both question banks load with unique IDs and complete exercises", async () => {
  const catalog = await loadExerciseCatalog();
  assert.deepEqual(catalog.categories.map((item) => item.id), ["zero_basis", "szu_exam"]);
  assert.equal(catalog.chapters.length, 13);
  const ids = new Set();
  for (const chapter of catalog.chapters) {
    assert.ok(catalog.categories.some((category) => category.id === chapter.category_id));
    for (const exercise of chapter.exercises) {
      assert.ok(!ids.has(exercise.id), `Duplicate: ${exercise.id}`);
      ids.add(exercise.id);
      assert.equal(exercise.chapter_id, chapter.id);
      assert.ok(exercise.title && exercise.description && exercise.solution && exercise.solution_template !== undefined);
      assert.ok(exercise.test_cases.length > 0);
      for (const item of exercise.test_cases) {
        assert.equal(typeof item.input, "string");
        assert.equal(typeof item.expected_output, "string");
      }
    }
  }
  assert.equal(ids.size, 141);
  const exams = catalog.chapters.filter((item) => item.category_id === "szu_exam");
  assert.deepEqual(exams.map((item) => item.exercises.length), [52, 6, 12, 14]);
  for (const chapter of exams) {
    assert.deepEqual(chapter.exercises.map((item) => item.source.number), Array.from({ length: chapter.exercises.length }, (_, i) => i + 1));
    for (const exercise of chapter.exercises) {
      assert.match(exercise.source.image, /^[2-6]\.jpg$/);
      assert.doesNotMatch(exercise.test_cases.map((item) => item.expected_output).join(""), /自检|自查/);
    }
  }
});
