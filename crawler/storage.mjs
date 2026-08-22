import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeProjectTimeFields } from "../shared/project-time.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSnapshotPath = path.join(projectRoot, "public", "data", "radar.json");

export function createSnapshotStore() {
  const driver = process.env.TENDER_STORE || "json";
  if (driver === "json") return new JsonSnapshotStore(process.env.TENDER_SNAPSHOT_PATH || defaultSnapshotPath);
  if (driver === "database") return new DatabaseSnapshotStore();
  throw new Error(`未知存储驱动：${driver}`);
}

export class JsonSnapshotStore {
  constructor(snapshotPath) {
    this.snapshotPath = path.resolve(snapshotPath);
  }

  async load() {
    const remoteUrl = process.env.TENDER_PREVIOUS_SNAPSHOT_URL;
    if (remoteUrl) {
      try {
        const response = await fetch(remoteUrl, { headers: { accept: "application/json" } });
        if (response.ok) return validateSnapshot(await response.json());
      } catch {
        // A missing public snapshot is expected on the very first deployment.
      }
    }
    try {
      return validateSnapshot(JSON.parse(await readFile(this.snapshotPath, "utf8")));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return emptySnapshot();
      throw error;
    }
  }

  async save(snapshot) {
    const validated = validateSnapshot(snapshot);
    await mkdir(path.dirname(this.snapshotPath), { recursive: true });
    const tempPath = `${this.snapshotPath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
    await rename(tempPath, this.snapshotPath);
  }
}

export class DatabaseSnapshotStore {
  async load() {
    throw new Error("数据库存储尚未启用。实现 DatabaseSnapshotStore 后设置 TENDER_STORE=database；前端与抓取器无需修改。");
  }

  async save() {
    throw new Error("数据库存储尚未启用。实现 DatabaseSnapshotStore 后设置 TENDER_STORE=database；前端与抓取器无需修改。");
  }
}

function validateSnapshot(value) {
  if (!value || typeof value !== "object") throw new Error("雷达快照必须是对象");
  if (!Array.isArray(value.projects) || !Array.isArray(value.sources)) throw new Error("雷达快照缺少 projects 或 sources 数组");
  return {
    schemaVersion: 4,
    mode: "live",
    generatedAt: value.generatedAt || null,
    storage: { ...(value.storage || { driver: "json" }), contractVersion: 4 },
    projects: value.projects.map((project) => normalizeProjectTimeFields(project)),
    sources: value.sources,
    run: value.run || null,
    summary: value.summary ? { summaryVersion: value.summary.summaryVersion || 1, ...value.summary } : null,
    summaries: Array.isArray(value.summaries)
      ? value.summaries.slice(0, 30).map((summary) => ({ summaryVersion: summary.summaryVersion || 1, ...summary }))
      : [],
    runs: Array.isArray(value.runs) ? value.runs.slice(0, 30) : [],
    errors: Array.isArray(value.errors) ? value.errors.slice(0, 100) : [],
  };
}

function emptySnapshot() {
  return validateSnapshot({ projects: [], sources: [] });
}
