import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const dataRoot = resolve(root, "src/data/zero_basis");
const index = await readJson(resolve(dataRoot, "index.json"));
const chapters = [];
for (const chapter of index.chapters) {
  const metadata = await readJson(
    resolve(dataRoot, chapter.path, "metadata.json"),
  );
  const exercises = [];
  for (const exercise of metadata.exercises) {
    exercises.push(
      await readJson(resolve(dataRoot, chapter.path, exercise.path)),
    );
  }
  chapters.push({
    id: chapter.id,
    title: chapter.title,
    description: metadata.description,
    exercises,
  });
}
const publicRoot = resolve(root, "web/public");
await mkdir(resolve(publicRoot, "data"), { recursive: true });
await writeFile(
  resolve(publicRoot, "data/exercises.json"),
  JSON.stringify({ chapters }),
);
const sdkRoot = resolve(root, "node_modules/@wasmer/sdk");
const vendorRoot = resolve(publicRoot, "vendor/wasmer-0.19.1");
await mkdir(vendorRoot, { recursive: true });
for (const path of ["dist", "pkg", "LICENSE"]) {
  await cp(resolve(sdkRoot, path), resolve(vendorRoot, path), {
    recursive: true,
    force: true,
  });
}
console.log(
  `已准备 ${chapters.length} 章、${chapters.reduce((n, c) => n + c.exercises.length, 0)} 道习题和浏览器运行环境。`,
);
