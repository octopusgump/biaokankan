// 发布前的快照门禁。
//
// 原来的判据写死在 pages.yml 的一行 node -e 里：
//   status === "成功" && succeededSources === sourceCount
// 它是 all-or-nothing 的：18 个来源里任何一个部分失败，整轮新鲜数据就被整体丢弃、
// 退回上一份快照；反过来，所有来源都「成功 + 0 条」时它又照常放行一份空快照。
// 这里改成按结果判断——数据有没有塌方——而不是按过程判断有没有 18/18 全绿，
// 并且从 YAML 里搬进仓库，才能被 tests/crawler.test.mjs 覆盖。
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const DEFAULT_THRESHOLDS = {
  // 允许「部分失败」发布，但活着的来源要占多数，否则这轮数据不值得信。
  minSucceededSourceRatio: 0.5,
  // 项目总数相对上一份快照的塌方阈值。保留逻辑正常时新旧应当接近。
  minRetainedProjectRatio: 0.6,
};

export function evaluateSnapshot(next, previous, thresholds = {}) {
  const { minSucceededSourceRatio, minRetainedProjectRatio } = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const reasons = [];

  if (!next || typeof next !== "object" || !Array.isArray(next.projects)) {
    return { accepted: false, reasons: ["新快照无法解析或缺少 projects 数组"] };
  }

  const run = next.run || {};
  const sourceCount = Number(run.sourceCount) || 0;
  const succeeded = Number(run.succeededSources) || 0;
  const previousCount = Array.isArray(previous?.projects) ? previous.projects.length : 0;
  const nextCount = next.projects.length;

  if (run.status === "失败" || succeeded === 0) {
    reasons.push(`本轮扫描状态为 ${run.status ?? "未知"}，成功来源 ${succeeded} 个`);
  }
  if (sourceCount > 0 && succeeded < sourceCount * minSucceededSourceRatio) {
    reasons.push(`成功来源 ${succeeded}/${sourceCount} 低于 ${Math.round(minSucceededSourceRatio * 100)}%`);
  }
  // 空快照永远不发布：上游全线改版时它才是最像「成功」的那种失败。
  if (nextCount === 0 && previousCount > 0) {
    reasons.push(`新快照 0 个项目，上一份有 ${previousCount} 个`);
  } else if (previousCount > 0 && nextCount < previousCount * minRetainedProjectRatio) {
    reasons.push(`项目数从 ${previousCount} 掉到 ${nextCount}，低于 ${Math.round(minRetainedProjectRatio * 100)}%`);
  }

  // 不阻断发布，但要在日志里点名，避免静默失效的来源无人发现。
  const warnings = (next.sources || [])
    .filter((source) => Number(source.read) === 0 && source.result !== "失败")
    .map((source) => `${source.name} 本轮读到 0 条，请人工核对列表页`);

  return { accepted: reasons.length === 0, reasons, warnings };
}

async function readSnapshot(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const [nextPath, previousPath] = process.argv.slice(2);
  if (!nextPath) {
    console.error("用法：node scripts/verify-snapshot.mjs <新快照> [上一份快照]");
    process.exitCode = 2;
    return;
  }
  const next = await readSnapshot(nextPath);
  const previous = previousPath ? await readSnapshot(previousPath) : null;
  const { accepted, reasons, warnings } = evaluateSnapshot(next, previous);
  for (const warning of warnings || []) console.log(`⚠️ ${warning}`);
  if (accepted) {
    console.log(`快照通过门禁：${next.projects.length} 个项目，状态 ${next.run?.status ?? "未知"}`);
    return;
  }
  for (const reason of reasons) console.log(`✗ ${reason}`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
