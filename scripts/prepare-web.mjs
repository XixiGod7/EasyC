import { cp, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadExerciseCatalog } from "./exercise-catalog.mjs";

const root = resolve(import.meta.dirname, "..");
const catalog = await loadExerciseCatalog();
const { chapters } = catalog;
const publicRoot = resolve(root, "web/public");
await mkdir(resolve(publicRoot, "data"), { recursive: true });
await writeFile(
  resolve(publicRoot, "data/exercises.json"),
  JSON.stringify(catalog),
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
  `已准备 ${catalog.categories.length} 个分类、${chapters.length} 个专题、${chapters.reduce((n, c) => n + c.exercises.length, 0)} 道习题和浏览器运行环境。`,
);
