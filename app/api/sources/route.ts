import { desc, eq } from "drizzle-orm";
import { getChatGPTUser, isTenderAdmin } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { managedSources } from "../../../db/schema";
import { fetchText, formatChinaTime } from "../../../crawler/core.mjs";
import { scanSource, SOURCE_DEFINITIONS } from "../../../crawler/sources.mjs";

export const dynamic = "force-dynamic";

type SourceDraft = {
  id?: number;
  name?: string;
  entry?: string;
  listEntry?: string;
  region?: string;
  type?: string;
  note?: string;
};

type SourceAction = SourceDraft & {
  action?: "save" | "delete" | "probe" | "scan";
};

class RouteError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function normalizeUrl(value = "") {
  const input = value.trim();
  if (!input) throw new RouteError("请填写信息源网址");
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!url.hostname.includes(".")) throw new RouteError("请填写完整的公网域名");
  if (!/^https?:$/.test(url.protocol)) throw new RouteError("信息源只支持 HTTP 或 HTTPS");
  return url.toString();
}

function hostIdentity(value: string) {
  return new URL(normalizeUrl(value)).hostname.replace(/^www\./, "").toLowerCase();
}

function configuredSource(entry: string) {
  const host = hostIdentity(entry);
  return SOURCE_DEFINITIONS.find((source) => hostIdentity(source.entry) === host) || null;
}

function parseProjects(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function presentSource(row: typeof managedSources.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    entry: row.entry,
    listEntry: row.listEntry,
    region: row.region,
    type: row.type,
    note: row.note,
    adapter: row.adapter,
    onboardingStatus: row.status,
    enabled: row.enabled,
    lastScan: row.lastScan || "尚未扫描",
    result: row.result,
    found: row.found,
    read: row.read,
    lastError: row.lastError,
    projects: parseProjects(row.projectsJson),
    managed: true,
    candidate: row.status !== "已接入",
  };
}

async function requireWriter(request: Request) {
  const user = await getChatGPTUser();
  if (user && isTenderAdmin(user)) return user.userId;
  if (user) throw new RouteError("当前账号没有信息源管理权限", 403);
  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") return "local-development";
  throw new RouteError("请先登录后再管理信息源", 401);
}

export async function GET() {
  try {
    const rows = await getDb().select().from(managedSources).orderBy(desc(managedSources.updatedAt), desc(managedSources.id));
    return Response.json({ sources: rows.map(presentSource) });
  } catch (error) {
    return routeFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const createdBy = await requireWriter(request);
    const payload = await request.json() as SourceAction;
    const action = payload.action || "save";
    if (action === "delete") return deleteSource(payload);
    if (action === "probe") return probeManagedSource(payload);
    if (action === "scan") return scanManagedSource(payload, createdBy);
    return saveSource(payload, createdBy);
  } catch (error) {
    return routeFailure(error);
  }
}

async function probeManagedSource(payload: SourceDraft) {
  const entry = normalizeUrl(payload.entry);
  const source = configuredSource(entry);
  if (!source) throw new RouteError("网站可以保存为候选，但当前没有匹配的抓取适配器，需要完成适配后才能扫描。", 422);

  const checks = await Promise.allSettled([
    fetchText(source.entry),
    fetchText(source.listEntry, { headers: { referer: source.entry } }),
  ]);
  const [home, list] = checks.map((check, index) => check.status === "fulfilled"
    ? { ok: true, status: 200, label: index === 0 ? "网站主页" : "公告入口" }
    : { ok: false, status: 0, label: index === 0 ? "网站主页" : "公告入口", error: check.reason instanceof Error ? check.reason.message : String(check.reason) });
  if (!home.ok || !list.ok) {
    const detail = [home, list].filter((check) => !check.ok).map((check) => `${check.label}：${check.error}`).join("；");
    throw new RouteError(`已识别网站类型，但入口检测失败。${detail}`, 502);
  }
  return Response.json({
    supported: true,
    source: { name: source.name, adapter: source.adapter, entry: source.entry, listEntry: source.listEntry },
    home,
    list,
    message: `已识别为“${source.name}”，主页和公告入口均可访问。`,
  });
}

async function saveSource(payload: SourceDraft, createdBy: string) {
  const entry = normalizeUrl(payload.entry);
  const matched = configuredSource(entry);
  const name = payload.name?.trim() || matched?.name || `${new URL(entry).hostname} 信息源`;
  const values = {
    name,
    entry,
    listEntry: payload.listEntry?.trim() ? normalizeUrl(payload.listEntry) : matched?.listEntry || "",
    region: payload.region?.trim() || matched?.region || "河南省",
    type: payload.type?.trim() || matched?.type || "公共资源交易中心",
    note: payload.note?.trim() || "",
    adapter: matched?.adapter || null,
    status: matched ? "待确认" : "待适配",
    result: matched ? "待确认" : "待适配",
    createdBy,
    updatedAt: new Date().toISOString(),
  };
  const db = getDb();
  if (Number.isSafeInteger(payload.id)) {
    const [row] = await db.update(managedSources).set(values)
      .where(eq(managedSources.id, Number(payload.id)))
      .returning();
    if (!row) throw new RouteError("没有找到该信息源", 404);
    return Response.json({ source: presentSource(row) });
  }
  const [row] = await db.insert(managedSources).values(values)
    .onConflictDoUpdate({
      target: managedSources.entry,
      set: {
        name: values.name,
        listEntry: values.listEntry,
        region: values.region,
        type: values.type,
        note: values.note,
        adapter: values.adapter,
        status: values.status,
        result: values.result,
        updatedAt: values.updatedAt,
      },
    })
    .returning();
  return Response.json({ source: presentSource(row) }, { status: 201 });
}

async function deleteSource(payload: SourceDraft) {
  if (!Number.isSafeInteger(payload.id)) throw new RouteError("信息源 ID 无效");
  await getDb().delete(managedSources).where(eq(managedSources.id, Number(payload.id)));
  return Response.json({ ok: true });
}

async function scanManagedSource(payload: SourceDraft, createdBy: string) {
  const db = getDb();
  const existing = Number.isSafeInteger(payload.id)
    ? (await db.select().from(managedSources).where(eq(managedSources.id, Number(payload.id))).limit(1))[0]
    : null;
  const entry = normalizeUrl(payload.entry || existing?.entry);
  const source = configuredSource(entry);
  if (!source) throw new RouteError("该网站还没有可用的抓取适配器，已保留为“待适配”。", 422);

  const lastScan = formatChinaTime(new Date()).slice(0, 16);
  const baseValues = {
    name: existing?.name || source.name,
    entry: source.entry,
    listEntry: existing?.listEntry || source.listEntry,
    region: existing?.region || source.region,
    type: existing?.type || source.type,
    note: existing?.note || "",
    adapter: source.adapter,
    createdBy,
    status: "扫描中",
    result: "扫描中",
    lastScan,
    updatedAt: new Date().toISOString(),
  };
  const [pending] = await db.insert(managedSources).values(baseValues)
    .onConflictDoUpdate({ target: managedSources.entry, set: baseValues })
    .returning();

  try {
    const scanned = await scanSource(source, new Date());
    const issues = scanned.issues || [];
    const [row] = await db.update(managedSources).set({
      status: "已接入",
      enabled: true,
      result: issues.length ? "部分失败" : "成功",
      found: scanned.projects.length,
      read: scanned.read,
      lastError: issues[0]?.detail || null,
      projectsJson: JSON.stringify(scanned.projects),
      lastScan: formatChinaTime(new Date()).slice(0, 16),
      updatedAt: new Date().toISOString(),
    }).where(eq(managedSources.id, pending.id)).returning();
    return Response.json({ source: presentSource(row) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const [row] = await db.update(managedSources).set({
      status: "失败",
      enabled: false,
      result: "失败",
      lastError: message,
      lastScan: formatChinaTime(new Date()).slice(0, 16),
      updatedAt: new Date().toISOString(),
    }).where(eq(managedSources.id, pending.id)).returning();
    return Response.json({ source: presentSource(row), error: message }, { status: 502 });
  }
}

function routeFailure(error: unknown) {
  const status = error instanceof RouteError ? error.status : 500;
  const raw = error instanceof Error ? error.message : "信息源操作失败";
  const message = /no such table|managed_sources/i.test(raw)
    ? "云端信息源数据库尚未完成初始化"
    : raw;
  return Response.json({ error: message }, { status });
}
