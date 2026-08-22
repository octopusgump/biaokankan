// 薄壳：只负责接线和输出，全部流水线逻辑在 scan-run.mjs 里，可注入依赖、可单测。
import { runScan } from "./scan-run.mjs";

const { sources, projects, status, newProjects, updatedProjects, succeeded } = await runScan();

for (const source of sources) {
  const suffix = source.lastError ? `：${source.lastError}` : `，读取 ${source.read} 条，命中 ${source.found} 条`;
  console.log(`[${source.result}] ${source.name}${suffix}`);
}
console.log(`扫描完成：${status}，项目 ${projects.length} 个，新增 ${newProjects} 个，更新 ${updatedProjects} 个`);

if (succeeded === 0) process.exitCode = 1;
