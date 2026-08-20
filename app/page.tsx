"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PublicFooter, PublicIntro } from "./public-intro";

type DeadlineState = "normal" | "warning" | "danger" | "expired" | "pending";
type DataState = "loading" | "ready" | "never" | "unavailable";
type MainView = "radar" | "admin";
type RadarTab = "today" | "upcoming" | "all";
type SortMode = "deadline" | "discovered" | "published" | "updated" | "investment";

type Project = {
  id: number; name: string; section: string; category: string; investment: string;
  deadline: string | null; deadlineShort: string; remaining: string; deadlineState: DeadlineState;
  client: string; clientExtra?: string; agency: string; source: string; sourceType: string;
  url: string; originalUrl?: string; listUrl?: string; homeUrl?: string;
  linkStatus?: "available" | "original_unavailable" | "source_unavailable";
  listAvailable?: boolean | null; homeAvailable?: boolean | null; lastVerifiedAt?: string;
  linkFailureReason?: string | null; region: string; originalTitle: string; publishedAt: string;
  discoveredAt: string; updatedAt: string; summary: string; createdToday: boolean;
  related?: { type: string; title: string; date: string }; pendingFields?: string[];
};

type Source = {
  id: number; key?: string; name: string; entry: string; listEntry?: string; region: string;
  type: string; enabled: boolean; lastScan: string; result: "待首次扫描" | "成功" | "部分失败" | "失败" | "候选";
  found: number; read?: number; lastError?: string | null; note?: string; candidate?: boolean;
};

type ScanRun = {
  id: string; type: string; status: "成功" | "部分失败" | "失败"; startedAt: string; finishedAt: string;
  durationMs: number; sourceCount: number; succeededSources: number; read: number; matched: number;
  newProjects: number; updatedProjects: number; date: string;
};

type ScanError = { id: string; level: string; source: string; project?: string; url?: string; time: string; detail: string; action?: string };
type DailySummary = { date: string; generatedAt: string; newProjectCount: number; expiringWithin3DaysCount: number; earliestProjects: Array<{ projectId: number; name: string; section: string; deadline: string }>; abnormalSourceCount: number };
type RadarSnapshot = { schemaVersion: number; mode: "live"; generatedAt: string | null; projects: Project[]; sources: Source[]; run: ScanRun | null; summary: DailySummary | null; errors: ScanError[] };
type CandidateDraft = Pick<Source, "name" | "entry" | "listEntry" | "region" | "type" | "note">;

const candidateStorageKey = "biaokankan-candidate-sources-v2";
const sortStorageKey = "biaokankan-project-sort-v1";
const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: "deadline", label: "截止时间由近到远" },
  { value: "discovered", label: "首次发现最新" },
  { value: "published", label: "公告发布时间最新" },
  { value: "updated", label: "最近更新优先" },
  { value: "investment", label: "总投资由高到低" },
];
const sortModes = sortOptions.map((option) => option.value);
const statusOptions = ["全部状态", "临近截止", "待核验", "已截止"].map((value) => ({ value, label: value }));
const sourceTypeOptions = ["公共资源交易中心", "政府采购网", "招标代理机构", "其他公开网站"].map((value) => ({ value, label: value }));
const emptyDraft: CandidateDraft = { name: "", entry: "", listEntry: "", region: "河南省", type: "公共资源交易中心", note: "" };
const sourceHints = [
  ["henan.gov.cn", "河南省公共资源交易中心", "河南省"],
  ["zhengzhou.gov.cn", "郑州市公共资源交易中心", "河南省 · 郑州市"],
  ["kfsggzyjyw.cn", "开封市公共资源交易中心", "河南省 · 开封市"],
  ["xinxiang.gov.cn", "新乡市公共资源交易中心", "河南省 · 新乡市"],
  ["ly.gov.cn", "洛阳市公共资源交易中心", "河南省 · 洛阳市"],
];

function normalizeUrl(value: string) {
  const input = value.trim();
  if (!input) throw new Error("请输入网站地址");
  if (/\s/.test(input)) throw new Error("网站地址不能包含空格");
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!url.hostname.includes(".")) throw new Error("请输入完整的公网域名");
  return url.toString();
}

function sourceIdentity(value: string) {
  try { const url = new URL(normalizeUrl(value)); return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "") || "/"}`.toLowerCase(); }
  catch { return value.trim().toLowerCase(); }
}

function inferDraft(value: string): CandidateDraft {
  const entry = normalizeUrl(value); const host = new URL(entry).hostname;
  const hint = sourceHints.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  return { ...emptyDraft, entry, name: hint?.[1] || `${host.replace(/^www\./, "")} 信息源`, region: hint?.[2] || "河南省" };
}

function isStale(value: string | null) {
  if (!value) return false; const age = Date.now() - new Date(value).getTime();
  return Number.isFinite(age) && age > 36 * 60 * 60 * 1000;
}

function timeValue(value: string | null | undefined) {
  if (!value) return Number.NaN;
  return new Date(value.replace(" ", "T")).getTime();
}

function compareProjects(a: Project, b: Project, mode: SortMode) {
  if (mode === "investment") {
    const amount = (project: Project) => Number.parseFloat(project.investment.replace(/[^\d.]/g, ""));
    const left = amount(a); const right = amount(b);
    if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
    if (!Number.isFinite(right)) return -1;
    return right - left;
  }
  if (mode !== "deadline") {
    const key = mode === "discovered" ? "discoveredAt" : mode === "published" ? "publishedAt" : "updatedAt";
    const left = timeValue(a[key]); const right = timeValue(b[key]);
    if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
    if (!Number.isFinite(right)) return -1;
    return right - left;
  }
  const now = Date.now(); const left = timeValue(a.deadline); const right = timeValue(b.deadline);
  const group = (value: number) => !Number.isFinite(value) ? 2 : value < now ? 1 : 0;
  const leftGroup = group(left); const rightGroup = group(right);
  if (leftGroup !== rightGroup) return leftGroup - rightGroup;
  if (leftGroup === 2) return 0;
  return leftGroup === 0 ? left - right : right - left;
}

function Deadline({ project }: { project: Project }) {
  return <div className={`deadline-block ${project.deadlineState}`}><i className="deadline-dot" /><span className="deadline-copy"><strong>{project.deadlineShort}</strong><small>{project.remaining}</small></span></div>;
}

function UpdateIndicator() { return <em className="update-indicator"><i />公告有更新</em>; }

function DataMessage({ state, filtered, onRetry }: { state: DataState; filtered: boolean; onRetry: () => void }) {
  const content = state === "loading" ? ["···", "正在读取真实扫描数据", "请稍候"]
    : state === "unavailable" ? ["!", "项目数据暂时无法读取", "系统没有使用静态项目替代真实数据"]
      : state === "never" ? ["○", "等待首次扫描", "扫描完成后，真实项目会显示在这里"]
        : filtered ? ["⌕", "没有符合当前条件的项目", "请调整搜索词或筛选条件"]
          : ["✓", "本次扫描未发现监理项目", "当前没有符合收录规则的真实公告"];
  return <div className="empty-state"><div>{content[0]}</div><strong>{content[1]}</strong><span>{content[2]}</span>{state === "unavailable" && <button onClick={onRetry}>重新读取</button>}</div>;
}

function appHref(path: string) {
  const base = typeof window !== "undefined" && window.location.pathname.startsWith("/biaokankan/") ? "/biaokankan" : "";
  if (!base) return path;
  const [pathname, query] = path.split("?");
  const directoryRoutes = ["/radar", "/radar/admin", "/radar/project"];
  const routedPath = directoryRoutes.includes(pathname) ? `${pathname}/` : pathname;
  return `${base}${routedPath}${query ? `?${query}` : ""}`;
}

function SelectMenu<T extends string>({ label, value, options, onChange, variant = "filter" }: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  variant?: "filter" | "compact" | "field";
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const labelId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
    const frame = window.requestAnimationFrame(() => listRef.current?.focus());
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [open, selectedIndex]);

  const closeAndFocus = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const choose = (option: T) => {
    onChange(option);
    closeAndFocus();
  };
  const move = (offset: number) => setActiveIndex((index) => (index + offset + options.length) % options.length);
  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Home") { event.preventDefault(); setActiveIndex(0); }
    else if (event.key === "End") { event.preventDefault(); setActiveIndex(options.length - 1); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(options[activeIndex].value); }
    else if (event.key === "Escape") { event.preventDefault(); closeAndFocus(); }
    else if (event.key === "Tab") setOpen(false);
  };

  return <div className={`select-menu-control ${variant}`} ref={rootRef}>
    <span id={labelId} className="visually-hidden">{label}</span>
    <div className="select-custom">
      <button
        ref={triggerRef}
        type="button"
        className={`select-trigger ${open ? "open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={`${labelId} ${listboxId}-value`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      ><span id={`${listboxId}-value`}>{selected.label}</span><i aria-hidden="true" /></button>
      {open && <div
        ref={listRef}
        id={listboxId}
        className="select-popover"
        role="listbox"
        aria-labelledby={labelId}
        aria-activedescendant={`${listboxId}-option-${activeIndex}`}
        tabIndex={-1}
        onKeyDown={handleListKeyDown}
      >{options.map((option, index) => <div
        key={option.value}
        id={`${listboxId}-option-${index}`}
        className={`select-option ${index === activeIndex ? "active" : ""} ${option.value === value ? "selected" : ""}`}
        role="option"
        aria-selected={option.value === value}
        onPointerMove={() => setActiveIndex(index)}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => choose(option.value)}
      ><span className="select-check" aria-hidden="true">{option.value === value ? "✓" : ""}</span><span>{option.label}</span></div>)}</div>}
    </div>
    <div className="select-native"><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as T)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
  </div>;
}

export function RadarApp({ initialView = "radar", detailFromQuery = false }: { initialView?: MainView; detailFromQuery?: boolean }) {
  const [view] = useState<MainView>(initialView);
  const [tab, setTab] = useState<RadarTab>("today");
  const [sortMode, setSortMode] = useState<SortMode>("deadline");
  const [adminTab, setAdminTab] = useState<"sources" | "errors">("sources");
  const [query, setQuery] = useState(""); const [sourceFilter, setSourceFilter] = useState("全部来源"); const [statusFilter, setStatusFilter] = useState("全部状态");
  const [selected, setSelected] = useState<Project | null>(null); const [projects, setProjects] = useState<Project[]>([]); const [sources, setSources] = useState<Source[]>([]);
  const [candidates, setCandidates] = useState<Source[]>(() => {
    if (typeof window === "undefined") return [];
    try { const parsed = JSON.parse(localStorage.getItem(candidateStorageKey) || "[]"); return Array.isArray(parsed) ? parsed.filter((item) => item?.candidate) : []; }
    catch { localStorage.removeItem(candidateStorageKey); return []; }
  }); const [run, setRun] = useState<ScanRun | null>(null); const [summary, setSummary] = useState<DailySummary | null>(null);
  const [errors, setErrors] = useState<ScanError[]>([]); const [generatedAt, setGeneratedAt] = useState<string | null>(null); const [dataState, setDataState] = useState<DataState>("loading");
  const [reload, setReload] = useState(0); const [toast, setToast] = useState(""); const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => { let cancelled = false; (async () => { setDataState("loading"); try {
    const response = await fetch(appHref("/data/radar.json"), { cache: "no-store" }); if (!response.ok) throw new Error();
    const snapshot = await response.json() as RadarSnapshot; if (snapshot.mode !== "live" || !Array.isArray(snapshot.projects) || !Array.isArray(snapshot.sources)) throw new Error();
    if (cancelled) return; setProjects(snapshot.projects); setSources(snapshot.sources); setRun(snapshot.run); setSummary(snapshot.summary); setErrors(snapshot.errors || []); setGeneratedAt(snapshot.generatedAt); setDataState(snapshot.run ? "ready" : "never");
  } catch { if (!cancelled) { setProjects([]); setSources([]); setRun(null); setSummary(null); setErrors([]); setGeneratedAt(null); setDataState("unavailable"); } } })(); return () => { cancelled = true; }; }, [reload]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(sortStorageKey) as SortMode | null;
      if (saved && sortModes.includes(saved)) setSortMode(saved);
    } catch { /* 本地存储不可用时继续使用默认排序 */ }
  }, []);

  useEffect(() => {
    if (!detailFromQuery || !projects.length) return;
    const id = Number(new URLSearchParams(window.location.search).get("id"));
    setSelected(projects.find((project) => project.id === id) || null);
  }, [detailFromQuery, projects]);

  const filtered = useMemo(() => { const keyword = query.trim().toLowerCase(); return projects.filter((project) => {
    const tabMatch = tab === "all" || (tab === "today" && project.createdToday) || (tab === "upcoming" && ["warning", "danger"].includes(project.deadlineState));
    const queryMatch = !keyword || [project.name, project.section, project.client, project.agency, project.source].join(" ").toLowerCase().includes(keyword);
    const sourceMatch = sourceFilter === "全部来源" || project.source === sourceFilter;
    const statusMatch = statusFilter === "全部状态" || (statusFilter === "临近截止" && ["warning", "danger"].includes(project.deadlineState)) || (statusFilter === "待核验" && project.deadlineState === "pending") || (statusFilter === "已截止" && project.deadlineState === "expired");
    return tabMatch && queryMatch && sourceMatch && statusMatch;
  }).sort((a, b) => compareProjects(a, b, sortMode)); }, [projects, query, sourceFilter, statusFilter, tab, sortMode]);

  const stale = dataState === "ready" && (run?.status !== "成功" || isStale(generatedAt));
  const todayCount = summary?.newProjectCount ?? projects.filter((p) => p.createdToday).length;
  const upcomingCount = summary?.expiringWithin3DaysCount ?? projects.filter((p) => ["warning", "danger"].includes(p.deadlineState)).length;
  const tomorrowCount = projects.filter((p) => p.deadlineState === "danger").length;
  const currentDate = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const scanTime = run?.finishedAt?.split(" ")[1] || "";
  const scanMeta = dataState === "loading" ? "正在读取今日扫描记录"
    : dataState === "unavailable" ? "请检查真实数据文件"
      : dataState === "never" ? "等待今日首次扫描"
        : stale ? `上次成功于 ${run?.finishedAt || "待核验"}`
          : run ? `${run.date === todayIso ? "今日" : run.date} ${scanTime} 已完成扫描` : "等待有效扫描结果";
  const hasFilters = Boolean(query || sourceFilter !== "全部来源" || statusFilter !== "全部状态");
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2800); };
  const changeSortMode = (value: SortMode) => {
    setSortMode(value);
    try { localStorage.setItem(sortStorageKey, value); } catch { /* 不阻断排序交互 */ }
  };

  const openOriginal = (project: Project) => {
    const status = project.linkStatus || "available"; const original = project.originalUrl || project.url;
    if (status === "available") { window.open(original, "_blank", "noopener,noreferrer"); return; }
    const fallback = project.listAvailable !== false && project.listUrl ? ["公告列表页", project.listUrl] : project.homeAvailable !== false && project.homeUrl ? ["来源主页", project.homeUrl] : null;
    if (!fallback || status === "source_unavailable") { window.alert(`原公告无法访问，且没有可用的上级入口。\n最后核验：${project.lastVerifiedAt || "待核验"}\n原因：${project.linkFailureReason || "来源网站暂时不可用"}`); return; }
    if (window.confirm(`原公告暂时无法访问。\n最后核验：${project.lastVerifiedAt || "待核验"}\n是否改为打开${fallback[0]}？`)) window.open(fallback[1], "_blank", "noopener,noreferrer");
  };

  const persistCandidates = (next: Source[]) => { setCandidates(next); localStorage.setItem(candidateStorageKey, JSON.stringify(next)); };
  const addCandidate = (draft: CandidateDraft) => {
    const entry = normalizeUrl(draft.entry); if ([...sources, ...candidates].some((s) => sourceIdentity(s.entry) === sourceIdentity(entry))) throw new Error("该信息源已经存在");
    persistCandidates([...candidates, { ...draft, id: Date.now(), entry, listEntry: draft.listEntry?.trim() ? normalizeUrl(draft.listEntry) : "", enabled: false, lastScan: "尚未参与扫描", result: "候选", found: 0, candidate: true }]); notify("候选来源已保存到当前设备，尚未参与自动扫描");
  };
  const updateCandidate = (id: number, draft: CandidateDraft) => {
    const entry = normalizeUrl(draft.entry); if ([...sources, ...candidates.filter((s) => s.id !== id)].some((s) => sourceIdentity(s.entry) === sourceIdentity(entry))) throw new Error("该信息源已经存在");
    persistCandidates(candidates.map((s) => s.id === id ? { ...s, ...draft, entry, listEntry: draft.listEntry?.trim() ? normalizeUrl(draft.listEntry) : "" } : s)); notify("候选来源已更新");
  };
  const deleteCandidate = (id: number) => { persistCandidates(candidates.filter((s) => s.id !== id)); notify("候选来源已从当前设备删除"); };
  const openProject = (project: Project) => { window.location.href = appHref(`/radar/project?id=${project.id}`); };

  return <main className="app-shell"><aside className={`sidebar ${mobileNav ? "open" : ""}`}><a className="brand" href={appHref("/")}><div className="brand-mark">标</div><div><strong>标看看</strong><span>监理标讯助手</span></div></a><nav>
    <a className={`nav-item ${view === "radar" ? "active" : ""}`} href={appHref("/radar")}><i>01</i><span><b>项目雷达</b><small>真实项目与截止</small></span></a>
    <a className={`nav-item ${view === "admin" ? "active" : ""}`} href={appHref("/radar/admin")}><i>02</i><span><b>系统管理</b><small>信息源与异常</small></span></a>
  </nav></aside><section className="workspace"><header className="mobile-header"><div className="brand-mark">标</div><strong>标看看</strong><button onClick={() => setMobileNav(!mobileNav)}>菜单</button></header>
  {selected ? <ProjectDetail project={selected} onBack={() => { window.location.href = appHref("/radar"); }} onOpenOriginal={openOriginal} /> : view === "radar" ? <>
    <header className="topbar"><div><p className="eyebrow">{currentDate}</p><h1>项目雷达</h1><p className="subtitle">集中查看真实发现的监理项目，优先处理临近截止机会。</p></div><div className={`scan-status static ${stale ? "warning" : ""}`}><span className="health-dot" /><b>{dataState === "loading" ? "正在读取" : dataState === "unavailable" ? "数据不可用" : dataState === "never" ? "等待首次扫描" : stale ? "部分来源异常" : "扫描正常"}</b><small>{scanMeta}</small></div></header>
    {stale && <div className="stale-banner"><strong>当前显示上次成功扫描数据</strong><span>扫描时间：{run?.finishedAt}。部分来源本次访问失败，请以原公告为准。</span></div>}
    <div className="summary-grid" role="tablist"><button className={tab === "today" ? "selected" : ""} onClick={() => setTab("today")}><span>今日新增</span><strong>{dataState === "ready" ? todayCount : "—"}</strong><small>按系统首次发现时间计算</small></button><button className={`warning ${tab === "upcoming" ? "selected" : ""}`} onClick={() => setTab("upcoming")}><span>3 天内截止</span><strong>{dataState === "ready" ? upcomingCount : "—"}</strong><small>{dataState === "ready" ? `其中 ${tomorrowCount} 个剩余 1 天` : "等待有效数据"}</small></button><button className={tab === "all" ? "selected" : ""} onClick={() => setTab("all")}><span>全部项目</span><strong>{dataState === "ready" ? projects.length : "—"}</strong><small>来自 {dataState === "ready" ? sources.length : "—"} 个已接入来源</small></button></div>
    <section className="project-panel"><div className="filters"><label className="search-box"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索项目名称、招标人或代理机构" /></label><SelectMenu label="信息来源" value={sourceFilter} options={[{ value: "全部来源", label: "全部来源" }, ...[...new Set(projects.map((p) => p.source))].map((source) => ({ value: source, label: source }))]} onChange={setSourceFilter} /><SelectMenu label="截止状态" value={statusFilter} options={statusOptions} onChange={setStatusFilter} />{hasFilters && <button className="clear-filter" onClick={() => { setQuery(""); setSourceFilter("全部来源"); setStatusFilter("全部状态"); }}>清除筛选</button>}</div><div className="list-meta"><span>共找到 <b>{dataState === "ready" ? filtered.length : 0}</b> 个项目</span><SelectMenu label="排序方式" value={sortMode} options={sortOptions} onChange={changeSortMode} variant="compact" /></div>
    {dataState === "ready" && filtered.length ? <><div className="project-table"><div className="table-row table-head"><span>投标截止</span><span>项目名称 / 标段</span><span>总投资</span><span>招标人</span><span>招标代理机构</span><span>信息来源 / 原公告</span></div>{filtered.map((p) => <ProjectRow key={p.id} project={p} onOpen={() => openProject(p)} onOpenOriginal={() => openOriginal(p)} />)}</div><div className="mobile-projects">{filtered.map((p) => <MobileProject key={p.id} project={p} onOpen={() => openProject(p)} onOpenOriginal={() => openOriginal(p)} />)}</div></> : <DataMessage state={dataState} filtered={hasFilters || tab !== "all"} onRetry={() => setReload((n) => n + 1)} />}<div className="notice"><strong>信息核验提示</strong><span>系统仅整理公开信息，无法确定的字段显示“待核验”；原公告及招标文件是唯一最终依据。</span></div></section>
  </> : <AdminCenter tab={adminTab} setTab={setAdminTab} sources={sources} candidates={candidates} errors={errors} run={run} onAdd={addCandidate} onUpdate={updateCandidate} onDelete={deleteCandidate} />}</section>{toast && <div className="toast"><span>✓</span>{toast}</div>}</main>;
}

export default function LandingPage() {
  return <><PublicIntro /><PublicFooter /></>;
}

function ProjectRow({ project, onOpen, onOpenOriginal }: { project: Project; onOpen: () => void; onOpenOriginal: () => void }) {
  const linkLabel = project.linkStatus === "source_unavailable" ? "链接不可用" : project.linkStatus === "original_unavailable" ? "原公告不可用 · 查看上级入口" : "查看原公告 ↗";
  return <div className="table-row data-row"><Deadline project={project} /><div className="project-name"><button onClick={onOpen}>{project.name}</button><span>{project.section} · {project.category}</span>{project.related && <UpdateIndicator />}</div><div className="cell"><strong>{project.investment.replace(" 万元", "")}</strong><span>{project.investment.includes("万元") ? "万元" : "需人工确认"}</span></div><div className="cell"><strong>{project.client}</strong><span>{project.clientExtra || project.region}</span></div><div className="cell"><strong>{project.agency}</strong><span>招标代理机构</span></div><div className="source-cell"><strong>{project.source}</strong><button className={project.linkStatus && project.linkStatus !== "available" ? "link-warning" : ""} onClick={onOpenOriginal}>{linkLabel}</button></div></div>;
}

function MobileProject({ project, onOpen, onOpenOriginal }: { project: Project; onOpen: () => void; onOpenOriginal: () => void }) {
  return <article className="mobile-project-card"><Deadline project={project} /><button className="mobile-project-title" onClick={onOpen}>{project.name}</button><p>{project.section} · {project.category}</p>{project.related && <UpdateIndicator />}<dl><div><dt>总投资</dt><dd>{project.investment}</dd></div><div><dt>招标人</dt><dd>{project.client}</dd></div><div><dt>代理机构</dt><dd>{project.agency}</dd></div><div><dt>信息来源</dt><dd>{project.source}</dd></div></dl><div className="mobile-actions"><button onClick={onOpen}>查看详情</button><button onClick={onOpenOriginal}>{project.linkStatus === "available" || !project.linkStatus ? "原公告 ↗" : "核验链接"}</button></div></article>;
}

function ProjectDetail({ project, onBack, onOpenOriginal }: { project: Project; onBack: () => void; onOpenOriginal: (project: Project) => void }) {
  const fields = [["投标截止时间", project.deadline || "待核验"], ["标段", project.section], ["总投资", project.investment], ["招标人", project.clientExtra ? `${project.client}（${project.clientExtra}）` : project.client], ["招标代理机构", project.agency], ["项目地区", project.region], ["公告发布时间", project.publishedAt], ["信息来源", project.source]];
  const linkLabel = project.linkStatus === "source_unavailable" ? "链接不可用" : project.linkStatus === "original_unavailable" ? "核验原公告入口" : "打开原公告";
  return <><div className="breadcrumb"><button onClick={onBack}>项目雷达</button><span>/</span><span>项目详情</span></div><header className="detail-hero"><div className="detail-title"><div className="detail-tags"><span>{project.category}</span><span>{project.region.split(" · ").at(-1)}</span>{project.related && <UpdateIndicator />}</div><h1>{project.name}</h1><p>{project.section} · 原始公告发布时间 {project.publishedAt}</p></div><div className="detail-deadline"><small>投标截止时间</small><Deadline project={project} /></div></header>
    {project.pendingFields?.length ? <div className="verify-alert"><strong>需要人工核验</strong><span>系统暂时无法可靠识别：{project.pendingFields.join("、")}。请以原公告为准。</span></div> : null}
    {project.linkStatus && project.linkStatus !== "available" ? <div className="verify-alert"><strong>原公告无法访问</strong><span>{project.linkFailureReason || "最近一次扫描无法打开该链接"} · 最后核验 {project.lastVerifiedAt || "待核验"}</span></div> : null}
    {project.related && <div className="update-alert"><strong>该项目有最新{project.related.type}</strong><span>{project.related.title} · {project.related.date}</span></div>}
    <div className="detail-layout"><div className="detail-main"><section className="detail-card"><div className="section-title"><span>01</span><h2>项目关键信息</h2></div><dl className="detail-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value === "待核验" ? "pending-text" : ""}>{value}</dd></div>)}</dl></section><section className="detail-card"><div className="section-title"><span>02</span><h2>原公告摘要</h2></div><div className="original-title"><small>原始公告标题</small><strong>{project.originalTitle}</strong></div><p className="summary-text">{project.summary}</p><p className="summary-note">内容由系统从公开公告自动提取，仅用于快速浏览。请打开原公告核验完整招标范围、资格要求和时间安排。</p></section><section className="detail-card"><div className="section-title"><span>03</span><h2>关联公告</h2></div>{project.related ? <div className="related-item"><span>{project.related.type}</span><div><strong>{project.related.title}</strong><small>{project.related.date} · 已关联至本项目</small></div></div> : <div className="no-related">暂未发现补充、变更、暂停或终止公告</div>}</section></div><aside className="detail-side"><button className={`primary-link ${project.linkStatus === "source_unavailable" ? "disabled" : ""}`} onClick={() => onOpenOriginal(project)}>{linkLabel}<span>↗</span></button><div className="trace-card"><h3>信息追踪</h3><div><span>首次发现时间</span><strong>{project.discoveredAt}</strong></div><div><span>扫描时间</span><strong>{project.lastVerifiedAt || "待核验"}</strong></div><div><span>更新时间</span><strong>{project.updatedAt}</strong></div><div><span>链接状态</span><strong className={project.linkStatus === "available" || !project.linkStatus ? "success-text" : "pending-text"}>{project.linkStatus === "available" || !project.linkStatus ? "原公告可访问" : "需要人工核验"}</strong></div><small>记录编号：JL-{String(project.id)}</small></div></aside></div></>;
}

function AdminCenter({ tab, setTab, sources, candidates, errors, run, onAdd, onUpdate, onDelete }: { tab: "sources" | "errors"; setTab: (tab: "sources" | "errors") => void; sources: Source[]; candidates: Source[]; errors: ScanError[]; run: ScanRun | null; onAdd: (draft: CandidateDraft) => void; onUpdate: (id: number, draft: CandidateDraft) => void; onDelete: (id: number) => void }) {
  const runLabel = !run ? "等待扫描" : run.status === "成功" ? "扫描成功" : run.status === "部分失败" ? "部分来源异常" : "扫描失败";
  const runTone = run?.status === "失败" ? "error" : run?.status === "部分失败" ? "warning" : "";
  return <><header className="topbar"><div><p className="eyebrow">管理后台</p><h1>系统管理</h1><p className="subtitle">管理真实信息源与本机候选来源，查看最近运行异常。</p></div><div className={`scan-status static ${runTone}`}><span className="health-dot" /><b>{runLabel}</b><small>{run?.finishedAt || "尚无扫描记录"}</small></div></header><div className="status-summary compact"><article><span>已接入</span><strong>{sources.length}</strong><small>参与云端自动扫描</small></article><article><span>候选</span><strong>{candidates.length}</strong><small>仅保存在当前设备</small></article><article><span>已停用</span><strong>{sources.filter((s) => !s.enabled).length}</strong><small>不参与下次扫描</small></article><article><span>异常</span><strong>{errors.length}</strong><small>最近保留的运行记录</small></article></div><div className="admin-tabs"><button className={tab === "sources" ? "active" : ""} onClick={() => setTab("sources")}>信息源管理</button><button className={tab === "errors" ? "active" : ""} onClick={() => setTab("errors")}>运行异常 <b>{errors.length}</b></button></div>{tab === "sources" ? <SourceManager sources={sources} candidates={candidates} onAdd={onAdd} onUpdate={onUpdate} onDelete={onDelete} /> : <ErrorLog errors={errors} />}</>;
}

function SourceStatus({ source }: { source: Source }) {
  const label = source.candidate ? "候选 · 未参与扫描" : !source.enabled ? "已停用" : source.result;
  const tone = source.candidate || !source.enabled ? "disabled" : source.result === "成功" ? "success" : source.result === "部分失败" ? "warning" : source.result === "失败" ? "error" : "pending";
  return <span className={`source-status ${tone}`}><i />{label}</span>;
}

function SourceManager({ sources, candidates, onAdd, onUpdate, onDelete }: { sources: Source[]; candidates: Source[]; onAdd: (draft: CandidateDraft) => void; onUpdate: (id: number, draft: CandidateDraft) => void; onDelete: (id: number) => void }) {
  const [open, setOpen] = useState(false); const [editingId, setEditingId] = useState<number | null>(null); const [form, setForm] = useState<CandidateDraft>(emptyDraft); const [error, setError] = useState("");
  const all = [...sources, ...candidates]; const close = () => { setOpen(false); setEditingId(null); setForm(emptyDraft); setError(""); };
  const edit = (source: Source) => { setEditingId(source.id); setForm({ name: source.name, entry: source.entry, listEntry: source.listEntry || "", region: source.region, type: source.type, note: source.note || "" }); setOpen(true); };
  const infer = () => { if (!form.entry.trim()) return; try { const next = inferDraft(form.entry); setForm((current) => ({ ...current, entry: next.entry, name: current.name || next.name, region: current.region === emptyDraft.region ? next.region : current.region })); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "网站地址无法识别"); } };
  const save = () => { try { if (!form.name.trim()) throw new Error("请填写信息源名称"); const draft = { ...form, name: form.name.trim(), entry: normalizeUrl(form.entry), listEntry: form.listEntry?.trim() ? normalizeUrl(form.listEntry) : "", region: form.region.trim(), note: form.note?.trim() }; if (editingId) onUpdate(editingId, draft); else onAdd(draft); close(); } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); } };
  return <><section className="panel-card admin-panel"><div className="admin-heading"><div><h2>信息源管理</h2><p>5 个已适配来源由云端配置；手动添加的网址只作为本机候选</p></div><button onClick={() => setOpen(true)}>＋ 添加候选来源</button></div><div className="source-table"><div className="source-row source-head"><span>网站名称 / 入口</span><span>地区</span><span>来源类型</span><span>最后扫描</span><span>状态</span><span>公告</span><span>操作</span></div>{all.map((source) => <div className="source-row" key={`${source.candidate ? "c" : "s"}-${source.id}`}><div><strong>{source.name}</strong><a href={source.entry} target="_blank" rel="noreferrer">主页：{source.entry}</a>{source.listEntry && <a href={source.listEntry} target="_blank" rel="noreferrer">列表：{source.listEntry}</a>}</div><span>{source.region}</span><span>{source.type}</span><div><strong>{source.lastScan || "尚未扫描"}</strong><small>{source.candidate ? "仅保存在当前设备" : `读取 ${source.read || 0} 条`}</small></div><SourceStatus source={source} /><span>{source.candidate ? "—" : `${source.found} 条`}</span><div className="source-actions">{source.candidate ? <><button onClick={() => edit(source)}>编辑</button><button onClick={() => onDelete(source.id)}>删除</button></> : <span className="read-only-tag">云端配置</span>}</div></div>)}</div></section>
    {open && <div className="source-drawer-layer"><button className="source-drawer-scrim" onClick={close} /><aside className="source-drawer" role="dialog" aria-modal="true"><header><div><small>候选来源 · 仅保存在当前设备</small><h2>{editingId ? "编辑候选来源" : "添加候选来源"}</h2></div><button className="drawer-close" onClick={close}>关闭</button></header><div className="candidate-explainer"><strong>添加后不会立即抓取</strong><span>开发完成适配器并通过真实公告核验后，才能成为“已接入”来源。</span></div><div className="source-form"><label className="full"><span>网站主页 URL <b>*</b></span><input value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })} onBlur={infer} placeholder="粘贴公共资源交易网站地址" /></label><label className="full"><span>信息源名称 <b>*</b></span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label><span>所属地区 <b>*</b></span><input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></label><div className="source-form-select"><span>来源类型</span><SelectMenu label="来源类型" value={form.type} options={sourceTypeOptions} onChange={(type) => setForm({ ...form, type })} variant="field" /></div><label className="full"><span>公告列表页 URL</span><input value={form.listEntry || ""} onChange={(e) => setForm({ ...form, listEntry: e.target.value })} /></label><label className="full"><span>备注</span><textarea value={form.note || ""} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={3} /></label>{error && <div className="source-form-error full">{error}</div>}</div><footer><span /><button className="drawer-secondary" onClick={close}>取消</button><button className="drawer-primary" onClick={save}>{editingId ? "保存更改" : "保存为候选来源"}</button></footer></aside></div>}</>;
}

function ErrorLog({ errors }: { errors: ScanError[] }) {
  return <section className="panel-card error-panel"><div className="admin-heading"><div><h2>运行异常</h2><p>包含来源访问、项目对应关系、链接失效和字段核验问题</p></div><span>最近 {errors.length} 条</span></div>{errors.length ? errors.map((error) => <article key={error.id}><div className={error.level === "扫描失败" ? "error-icon critical" : "error-icon"}>!</div><div className="error-main"><div><strong>{error.level}</strong><span>{error.source}</span><small>{error.time}</small></div>{error.project && <small className="error-project">{error.project}</small>}<p>{error.detail}</p>{error.url && <a href={error.url} target="_blank" rel="noreferrer">查看核验入口 ↗</a>}</div></article>) : <div className="source-empty"><strong>最近没有运行异常</strong><span>5 个已接入来源均完成最近一次扫描。</span></div>}</section>;
}
