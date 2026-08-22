import { chinaDateKey, collapseDuplicates, deadlinePresentation, formatChinaTime, projectFingerprint, retainProjectWithLatestLinkState, withinRetention } from "./core.mjs";
import { scanSource, SOURCE_DEFINITIONS } from "./sources.mjs";
import { createSnapshotStore } from "./storage.mjs";
import { buildSummary } from "./summary.mjs";

const started = new Date();
const store = createSnapshotStore();
const previous = await store.load();
const previousByUrl = new Map(previous.projects.map((project) => [project.url, project]));
const today = chinaDateKey(started);
const RETENTION_DAYS = Number(process.env.TENDER_RETENTION_DAYS || 90);
const configuredNames = new Set(SOURCE_DEFINITIONS.map((source) => source.name));

const settled = await Promise.allSettled(SOURCE_DEFINITIONS.map((source) => scanSource(source, started)));
const successfulNames = new Set();
const partialNames = new Set();
const freshProjects = [];
const sources = [];
const currentErrors = [];

settled.forEach((result, index) => {
  const source = SOURCE_DEFINITIONS[index];
  if (result.status === "fulfilled") {
    successfulNames.add(source.name);
    const issues = result.value.issues || [];
    if (issues.length) partialNames.add(source.name);
    for (const project of result.value.projects) {
      const validationError = validateProject(project, source);
      if (validationError) {
        currentErrors.push({
          id: `${source.key}-validation-${project.id}-${started.getTime()}`,
          level: "项目核验失败",
          source: source.name,
          project: project.name,
          time: formatChinaTime(started).slice(0, 16),
          detail: validationError,
          action: "人工核对项目与原公告",
        });
      } else {
        if (project.publishedAt === "待核验") {
          currentErrors.push({
            id: `${source.key}-published-${project.id}-${started.getTime()}`,
            level: "字段核验失败",
            source: source.name,
            project: project.name,
            url: project.url,
            time: formatChinaTime(started).slice(0, 16),
            detail: "公告发布时间无法识别，该项目按首次发现时间计算保留期",
            action: "人工核对原公告发布日期",
          });
        }
        freshProjects.push(project);
      }
    }
    for (const [issueIndex, issue] of issues.entries()) {
      currentErrors.push({
        id: `${source.key}-link-${issueIndex}-${started.getTime()}`,
        level: "链接访问异常",
        source: source.name,
        project: issue.title,
        url: issue.url,
        time: formatChinaTime(started).slice(0, 16),
        detail: issue.detail,
        action: "查看最近核验结果",
      });
    }
    sources.push({
      ...source,
      enabled: true,
      lastScan: formatChinaTime(started).slice(0, 16),
      result: issues.length ? "部分失败" : "成功",
      found: result.value.projects.length,
      read: result.value.read,
      listAvailable: result.value.listAvailable,
      homeAvailable: result.value.homeAvailable,
      lastVerifiedAt: formatChinaTime(started).slice(0, 16),
      lastError: issues[0]?.detail || null,
    });
    return;
  }

  const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
  currentErrors.push({
    id: `${source.key}-${started.getTime()}`,
    level: "扫描失败",
    source: source.name,
    time: formatChinaTime(started).slice(0, 16),
    detail: message,
    action: "检查来源适配器",
  });
  const oldSource = previous.sources.find((item) => item.name === source.name);
  sources.push({
    ...source,
    enabled: true,
    lastScan: formatChinaTime(started).slice(0, 16),
    result: "失败",
    found: oldSource?.found || 0,
    read: 0,
    listAvailable: false,
    homeAvailable: false,
    lastVerifiedAt: formatChinaTime(started).slice(0, 16),
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
  const mergedProject = retainConfirmedBidDeadline(project, old);
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
      date: formatChinaTime(started).slice(0, 16),
    },
  };
});

const retainedFromFailedSources = previous.projects
  .filter((project) => configuredNames.has(project.source) && (!successfulNames.has(project.source) || partialNames.has(project.source)))
  .map((project) => retainProjectWithLatestLinkState(project, sources.find((source) => source.name === project.source)));
const finished = new Date();
const projects = collapseDuplicates([...mergedFresh, ...retainedFromFailedSources]
  .filter((project, index, all) => all.findIndex((item) => item.url === project.url) === index)
  .filter((project) => withinRetention(project, RETENTION_DAYS, started)), started)
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
const status = succeeded === 0 ? "失败" : succeeded === SOURCE_DEFINITIONS.length && partialNames.size === 0 ? "成功" : "部分失败";
const run = {
  id: `scan-${started.toISOString()}`,
  type: process.env.GITHUB_EVENT_NAME === "schedule" ? "定时扫描" : "手动或部署扫描",
  status,
  startedAt: formatChinaTime(started).slice(0, 16),
  finishedAt: formatChinaTime(finished).slice(0, 16),
  durationMs: finished.getTime() - started.getTime(),
  sourceCount: SOURCE_DEFINITIONS.length,
  succeededSources: succeeded,
  read: sources.reduce((sum, source) => sum + (source.read || 0), 0),
  matched: freshProjects.length,
  newProjects,
  updatedProjects,
  date: today,
};

const summary = buildSummary(projects, run, finished, partialNames.size);
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
  errors: [
    ...currentErrors,
    ...previous.errors.filter((error) => !successfulNames.has(error.source)),
  ].slice(0, 100),
};

await store.save(snapshot);

for (const source of sources) {
  const suffix = source.lastError ? `：${source.lastError}` : `，读取 ${source.read} 条，命中 ${source.found} 条`;
  console.log(`[${source.result}] ${source.name}${suffix}`);
}
console.log(`扫描完成：${status}，项目 ${projects.length} 个，新增 ${newProjects} 个，更新 ${updatedProjects} 个`);

if (succeeded === 0) process.exitCode = 1;

function normalizeMatchText(value = "") {
  return String(value).replace(/[^\p{Script=Han}a-zA-Z0-9]/gu, "").toLowerCase();
}

function validateProject(project, source) {
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

function retainConfirmedBidDeadline(project, old) {
  if (project.bidDeadlineStatus === "confirmed" || old.bidDeadlineStatus !== "confirmed" || !old.bidDeadline) return project;
  return {
    ...project,
    bidDeadline: old.bidDeadline,
    bidDeadlineStatus: "confirmed",
    bidDeadlineEvidence: old.bidDeadlineEvidence,
    bidDeadlineVerifiedAt: old.bidDeadlineVerifiedAt,
    deadline: old.bidDeadline,
    pendingFields: project.pendingFields?.filter((field) => field !== "投标截止时间"),
  };
}

function upsertSummary(previousSummaries = [], summary) {
  return [summary, ...previousSummaries.filter((item) => item.date !== summary.date)].slice(0, 30);
}
