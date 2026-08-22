// run.mjs 过去是一整段顶层 await 副作用脚本，validateProject、
// retainConfirmedBidDeadline 和合并/保留/排序逻辑全部无法导出、无法单测——
// 这正是「上游改版导致静默成功」和「截止时间静默降级」两类问题能长期存在的原因。
// 这里把整条流水线抽成注入依赖的 runScan()，run.mjs 只剩一个薄壳。
import { chinaDateKey, collapseDuplicates, deadlinePresentation, formatChinaTime, projectFingerprint, retainProjectWithLatestLinkState, withinRetention } from "./core.mjs";
import { lowEntryIssue, scanSource as defaultScanSource, SOURCE_DEFINITIONS } from "./sources.mjs";
import { createSnapshotStore } from "./storage.mjs";
import { buildSummary } from "./summary.mjs";

function normalizeMatchText(value = "") {
  return String(value).replace(/[^\p{Script=Han}a-zA-Z0-9]/gu, "").toLowerCase();
}

export function validateProject(project, source) {
  if (!project.url) return "项目缺少自己的原公告 URL";
  let projectHost;
  let sourceHost;
  try {
    projectHost = new URL(project.url).hostname.replace(/^www\./, "");
    sourceHost = new URL(source.entry).hostname.replace(/^www\./, "");
  } catch {
    return "项目原公告 URL 格式无效";
  }
  if (projectHost !== sourceHost && !projectHost.endsWith(`.${sourceHost}`) && !sourceHost.endsWith(`.${projectHost}`)) {
    return `项目原公告域名 ${projectHost} 与来源 ${sourceHost} 不一致`;
  }
  const nameKey = normalizeMatchText(project.name).slice(0, 14);
  const evidence = normalizeMatchText(`${project.originalTitle} ${project.summary}`);
  if (nameKey.length < 4 || !evidence.includes(nameKey)) return "项目名称无法与原公告标题或正文对应";
  return null;
}

// 新一轮解析不出截止时间时沿用上一轮已确认的值，但必须留痕：
// 旧实现把 bidDeadlineStale 之类的标记和 pendingFields 里的「投标截止时间」
// 一起抹掉，于是过期值继续以 confirmed 倒计时，指纹还不变——运维完全看不见。
export function mergeBidDeadline(project, old) {
  const fresh = { ...project, bidDeadlineStale: false };
  if (project.bidDeadlineStatus === "confirmed") return fresh;
  // 公告显式改口「截止时间见招标文件」是新的事实，旧的 confirmed 不再成立。
  if (project.bidDeadlineStatus === "document_required") return fresh;
  if (old?.bidDeadlineStatus !== "confirmed" || !old?.bidDeadline) return fresh;
  return {
    ...project,
    bidDeadline: old.bidDeadline,
    bidDeadlineStatus: "confirmed",
    bidDeadlineEvidence: old.bidDeadlineEvidence,
    bidDeadlineVerifiedAt: old.bidDeadlineVerifiedAt,
    deadline: old.bidDeadline,
    // 沿用的是上一轮的值，本轮公告里已经读不到了。
    bidDeadlineStale: true,
    // 保留「投标截止时间」待核验，前端的人工核验告警不能因为沿用旧值而消失。
    pendingFields: project.pendingFields,
  };
}

export function upsertSummary(previousSummaries = [], summary) {
  return [summary, ...previousSummaries.filter((item) => item.date !== summary.date)].slice(0, 30);
}

// 错误项的 id 带时间戳，历史记录直接拼接会把同一条问题重复堆到 100 条上限。
function dedupeErrors(errors) {
  const seen = new Set();
  return errors.filter((error) => {
    const key = [error.level, error.source, error.project, error.url, error.detail].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runScan({
  sourceDefinitions = SOURCE_DEFINITIONS,
  scanSource = defaultScanSource,
  store,
  startedAt = new Date(),
  finishedAt,
  retentionDays = Number(process.env.TENDER_RETENTION_DAYS || 90),
  runType = process.env.GITHUB_EVENT_NAME === "schedule" ? "定时扫描" : "手动或部署扫描",
  save = true,
} = {}) {
  const snapshotStore = store || createSnapshotStore();
  const started = startedAt;
  const previous = await snapshotStore.load();
  const previousByUrl = new Map(previous.projects.map((project) => [project.url, project]));
  const today = chinaDateKey(started);
  const configuredNames = new Set(sourceDefinitions.map((source) => source.name));
  const stamp = formatChinaTime(started).slice(0, 16);

  const settled = await Promise.allSettled(sourceDefinitions.map((source) => scanSource(source, started)));
  const successfulNames = new Set();
  const partialNames = new Set();
  const freshProjects = [];
  const sources = [];
  const currentErrors = [];

  settled.forEach((result, index) => {
    const source = sourceDefinitions[index];
    if (result.status === "fulfilled") {
      successfulNames.add(source.name);
      const issues = [...(result.value.issues || [])];
      // 上游改版后列表页选择器失效时适配器不会抛错，只会安静地返回 0 条。
      // 补一条 issue 让它落进「部分失败」，历史项目才不会被当成「本次没有项目」删光。
      const lowEntry = lowEntryIssue(source, result.value.read);
      if (lowEntry) issues.push(lowEntry);
      if (issues.length) partialNames.add(source.name);
      for (const project of result.value.projects) {
        const validationError = validateProject(project, source);
        if (validationError) {
          currentErrors.push({
            id: `${source.key}-validation-${project.id}-${started.getTime()}`,
            level: "项目核验失败",
            source: source.name,
            project: project.name,
            time: stamp,
            detail: validationError,
            action: "人工核对项目与原公告",
          });
          continue;
        }
        if (project.publishedAt === "待核验") {
          currentErrors.push({
            id: `${source.key}-published-${project.id}-${started.getTime()}`,
            level: "字段核验失败",
            source: source.name,
            project: project.name,
            url: project.url,
            time: stamp,
            detail: "公告发布时间无法识别，该项目按首次发现时间计算保留期",
            action: "人工核对原公告发布日期",
          });
        }
        freshProjects.push(project);
      }
      for (const [issueIndex, issue] of issues.entries()) {
        currentErrors.push({
          id: `${source.key}-link-${issueIndex}-${started.getTime()}`,
          level: issue.level || "链接访问异常",
          source: source.name,
          project: issue.title,
          url: issue.url,
          time: stamp,
          detail: issue.detail,
          action: issue.action || "查看最近核验结果",
        });
      }
      sources.push({
        ...source,
        enabled: true,
        lastScan: stamp,
        result: issues.length ? "部分失败" : "成功",
        found: result.value.projects.length,
        read: result.value.read,
        listAvailable: result.value.listAvailable,
        homeAvailable: result.value.homeAvailable,
        lastVerifiedAt: stamp,
        lastError: issues[0]?.detail || null,
      });
      return;
    }

    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    currentErrors.push({
      id: `${source.key}-${started.getTime()}`,
      level: "扫描失败",
      source: source.name,
      time: stamp,
      detail: message,
      action: "检查来源适配器",
    });
    const oldSource = previous.sources.find((item) => item.name === source.name);
    sources.push({
      ...source,
      enabled: true,
      lastScan: stamp,
      result: "失败",
      found: oldSource?.found || 0,
      read: 0,
      listAvailable: false,
      homeAvailable: false,
      lastVerifiedAt: stamp,
      lastError: message,
    });
  });

  let newProjects = 0;
  let updatedProjects = 0;
  const mergedFresh = freshProjects.map((project) => {
    const old = previousByUrl.get(project.url);
    if (!old) {
      newProjects += 1;
      return { ...project, createdToday: true };
    }
    const mergedProject = mergeBidDeadline(project, old);
    mergedProject.fingerprint = projectFingerprint(mergedProject);
    const oldFingerprint = old.fingerprint || projectFingerprint(old);
    if (oldFingerprint === mergedProject.fingerprint) {
      return { ...mergedProject, discoveredAt: old.discoveredAt, updatedAt: old.updatedAt, createdToday: old.discoveredAt?.slice(0, 10) === today };
    }
    updatedProjects += 1;
    return {
      ...mergedProject,
      discoveredAt: old.discoveredAt,
      createdToday: old.discoveredAt?.slice(0, 10) === today,
      related: {
        type: "内容更新",
        title: "原公告正文或关键字段发生变化",
        date: stamp,
      },
    };
  });

  const retainedFromFailedSources = previous.projects
    .filter((project) => configuredNames.has(project.source) && (!successfulNames.has(project.source) || partialNames.has(project.source)))
    .map((project) => retainProjectWithLatestLinkState(project, sources.find((source) => source.name === project.source)));
  const finished = finishedAt || new Date();
  const projects = collapseDuplicates(
    [...mergedFresh, ...retainedFromFailedSources]
      .filter((project, index, all) => all.findIndex((item) => item.url === project.url) === index),
    started,
  )
    .filter((project) => withinRetention(project, retentionDays, started))
    .map((project) => ({
      ...project,
      deadline: project.bidDeadline,
      ...deadlinePresentation(project.bidDeadline, finished, project.bidDeadlineStatus),
    }))
    .sort((a, b) => {
      const left = a.bidDeadlineStatus === "confirmed" ? a.bidDeadline : null;
      const right = b.bidDeadlineStatus === "confirmed" ? b.bidDeadline : null;
      if (!left && !right) return b.publishedAt.localeCompare(a.publishedAt);
      if (!left) return 1;
      if (!right) return -1;
      return left.localeCompare(right);
    });

  const succeeded = successfulNames.size;
  const status = succeeded === 0 ? "失败" : succeeded === sourceDefinitions.length && partialNames.size === 0 ? "成功" : "部分失败";
  const run = {
    id: `scan-${started.toISOString()}`,
    type: runType,
    status,
    startedAt: stamp,
    finishedAt: formatChinaTime(finished).slice(0, 16),
    durationMs: finished.getTime() - started.getTime(),
    sourceCount: sourceDefinitions.length,
    succeededSources: succeeded,
    // 「部分失败」的来源仍计入 succeededSources，快照门禁靠 status 和项目留存量判断，
    // 不能只看 succeededSources === sourceCount。
    fullySucceededSources: succeeded - partialNames.size,
    read: sources.reduce((sum, source) => sum + (source.read || 0), 0),
    matched: freshProjects.length,
    newProjects,
    updatedProjects,
    date: today,
  };

  const summary = buildSummary(projects, run, finished, partialNames.size);
  // 只有完全成功的来源才算「问题已解决」，可以清掉它的历史错误；
  // 部分失败的来源必须留着历史，否则静默故障每轮都被自己抹平。
  const fullySuccessfulNames = new Set([...successfulNames].filter((name) => !partialNames.has(name)));
  const snapshot = {
    schemaVersion: 4,
    mode: "live",
    generatedAt: finished.toISOString(),
    storage: {
      driver: process.env.TENDER_STORE || "json",
      contractVersion: 4,
      databaseAdapter: "reserved",
    },
    projects,
    sources,
    run,
    summary,
    summaries: upsertSummary(previous.summaries, summary),
    runs: [run, ...previous.runs.filter((item) => item.id !== run.id)].slice(0, 30),
    errors: dedupeErrors([
      ...currentErrors,
      ...previous.errors.filter((error) => !fullySuccessfulNames.has(error.source)),
    ]).slice(0, 100),
  };

  if (save) await snapshotStore.save(snapshot);

  return { snapshot, previous, sources, projects, run, status, newProjects, updatedProjects, succeeded };
}
