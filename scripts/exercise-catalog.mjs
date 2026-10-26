import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

export async function loadExerciseCatalog(dataRoot = resolve(import.meta.dirname, "../src/data")) {
  const catalog = await readJson(resolve(dataRoot, "catalog.json"));
  const chapters = [];
  for (const category of catalog.categories) {
    const categoryRoot = resolve(dataRoot, category.path);
    const index = await readJson(resolve(categoryRoot, "index.json"));
    for (const chapter of index.chapters) {
      const metadata = await readJson(resolve(categoryRoot, chapter.path, "metadata.json"));
      const exercises = await Promise.all(metadata.exercises.map((exercise) =>
        readJson(resolve(categoryRoot, chapter.path, exercise.path)),
      ));
      chapters.push({
        id: chapter.id,
        category_id: category.id,
        title: chapter.title,
        description: metadata.description,
        exercises,
      });
    }
  }
  return {
    categories: catalog.categories.map(({ path, ...category }) => category),
    chapters,
  };
}
