import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedTargets = [
  ".next",
  ".vinext",
  "dist",
  "pages-dist",
  "china-dist",
  "tsconfig.tsbuildinfo",
];

for (const target of generatedTargets) {
  const resolved = path.resolve(projectRoot, target);
  if (path.dirname(resolved) !== projectRoot) {
    throw new Error(`拒绝清理项目根目录之外的路径：${resolved}`);
  }
  await rm(resolved, { recursive: true, force: true });
  console.log(`已清理 ${target}`);
}

console.log("本地构建产物已清理；源码、真实数据和 node_modules 均未改动。");
