"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PublicFooter, PublicIntro } from "./public-intro";
import { documentAcquirePresentation, formatDocumentAcquireWindow, normalizeProjectTimeFields, parseChinaDateTime } from "../shared/project-time.mjs";

type DeadlineState = "normal" | "reminder" | "urgent" | "expired" | "pending";
type BidDeadlineStatus = "confirmed" | "document_required" | "pending";
type DataState = "loading" | "ready" | "never" | "unavailable";
type DetailState = "inactive" | "loading" | "ready" | "missing" | "never" | "unavailable";
type MainView = "radar" | "admin";
type RadarTab = "urgent" | "reminder" | "today" | "all";
type SortMode = "deadline" | "discovered" | "published" | "updated" | "investment";

type Project = {
  id: number; name: string; section: string; category: string; investment: string;
  deadline: string | null; deadlineShort: string; remaining: string; deadlineState: DeadlineState;
  bidDeadline: string | null; bidDeadlineStatus: BidDeadlineStatus; bidDeadlineEvidence: string | null;
  bidDeadlineVerifiedAt: string | null; documentAcquireStart: string | null; documentAcquireDeadline: string | null;
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
  type: string; enabled: boolean; lastScan: string; result: "待首次扫描" | "成功" | "部分失败" | "失败" | "候选" | "待确认" | "待适配" | "扫描中";
  found: number; read?: number; lastError?: string | null; note?: string; candidate?: boolean;
  managed?: boolean; onboardingStatus?: string; projects?: Project[]; sourceNote?: string;
};

type ScanRun = {
  id: string; type: string; status: "成功" | "部分失败" | "失败"; startedAt: string; finishedAt: string;
  durationMs: number; sourceCount: number; succeededSources: number; read: number; matched: number;
  newProjects: number; updatedProjects: number; date: string;
};

type ScanError = { id: string; level: string; source: string; project?: string; url?: string; time: string; detail: string; action?: string };
type SummaryProject = { projectId: number; name: string; section: string; bidDeadline: string };
type DailySummary = { summaryVersion: 2; date: string; generatedAt: string; newProjectCount: number; urgentWithin7DaysCount: number; reminderFrom8To14DaysCount: number; urgentProjects: SummaryProject[]; reminderProjects: SummaryProject[]; abnormalSourceCount: number };
export type RadarSnapshot = { schemaVersion: number; mode: "live"; generatedAt: string | null; projects: Project[]; sources: Source[]; run: ScanRun | null; summary: DailySummary | null; errors: ScanError[] };

const sortStorageKey = "biaokankan-project-sort-v1";
const mobileWorkbenchQuery = "(max-width: 833px), (max-width: 960px) and (max-height: 520px) and (orientation: landscape)";
const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: "deadline", label: "截止时间由近到远" },
  { value: "discovered", label: "首次发现最新" },
  { value: "published", label: "公告发布时间最新" },
  { value: "updated", label: "最近更新优先" },
  { value: "investment", label: "总投资由高到低" },
];
const sortModes = sortOptions.map((option) => option.value);
const statusOptions = ["全部状态", "7天内紧急", "8–14天提醒", "待核验", "已截止"].map((value) => ({ value, label: value }));

function isStale(value: string | null) {
  if (!value) return false; const age = Date.now() - new Date(value).getTime();
  return Number.isFinite(age) && age > 36 * 60 * 60 * 1000;
}

function timeValue(value: string | null | undefined) {
  if (!value) return Number.NaN;
  return new Date(value.replace(" ", "T")).getTime();
}

function bidDeadlineTimeValue(value: string | null | undefined) {
  return parseChinaDateTime(value)?.getTime() ?? Number.NaN;
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
  const now = Date.now();
  const left = bidDeadlineTimeValue(a.bidDeadlineStatus === "confirmed" ? a.bidDeadline : null);
  const right = bidDeadlineTimeValue(b.bidDeadlineStatus === "confirmed" ? b.bidDeadline : null);
  const group = (value: number) => !Number.isFinite(value) ? 2 : value < now ? 1 : 0;
  const leftGroup = group(left); const rightGroup = group(right);
  if (leftGroup !== rightGroup) return leftGroup - rightGroup;
  if (leftGroup === 2) return 0;
  return leftGroup === 0 ? left - right : right - left;
}

function BidDeadline({ project }: { project: Project }) {
  return <div className={`deadline-block ${project.deadlineState}`}><i className="deadline-dot" /><span className="deadline-copy"><b className="time-kind">投标截止</b><strong>{project.deadlineShort}</strong><small>{project.remaining}</small></span></div>;
}

function DocumentAcquire({ project }: { project: Project }) {
  const presentation = documentAcquirePresentation(project.documentAcquireStart, project.documentAcquireDeadline);
  if (!presentation) return null;
  return <div className={`document-acquire ${presentation.status}`}><i /><span><b className="time-kind">文件获取</b><strong>{presentation.short}</strong><small>{presentation.label}</small></span></div>;
}

function ProjectTimes({ project }: { project: Project }) {
  return <div className="project-time-stack"><BidDeadline project={project} /><DocumentAcquire project={project} /></div>;
}

function UpdateIndicator() { return <em className="update-indicator"><i />公告有更新</em>; }

function DataMessage({ state, filtered, emptyCopy, onRetry }: { state: DataState; filtered: boolean; emptyCopy?: [string, string]; onRetry: () => void }) {
  const content = state === "loading" ? ["···", "正在读取真实扫描数据", "请稍候"]
    : state === "unavailable" ? ["!", "项目数据暂时无法读取", "系统没有使用静态项目替代真实数据"]
      : state === "never" ? ["○", "等待首次扫描", "扫描完成后，真实项目会显示在这里"]
        : emptyCopy ? ["✓", emptyCopy[0], emptyCopy[1]]
          : filtered ? ["⌕", "没有符合当前条件的项目", "请调整搜索词或筛选条件"]
          : ["✓", "本次扫描未发现监理项目", "当前没有符合收录规则的真实公告"];
  return <div className="empty-state"><div>{content[0]}</div><strong>{content[1]}</strong><span>{content[2]}</span>{state === "unavailable" && <button onClick={onRetry}>重新读取</button>}</div>;
}

function ProjectDetailMessage({ state, onBack, onRetry }: { state: Exclude<DetailState, "inactive" | "ready">; onBack: () => void; onRetry: () => void }) {
  const content = state === "loading" ? ["正在读取项目详情", "正在从真实扫描快照中查找该项目。"]
    : state === "unavailable" ? ["项目数据暂时无法读取", "系统不会使用演示项目代替真实数据。"]
      : state === "never" ? ["等待首次扫描", "扫描完成后，真实项目详情会显示在这里。"]
        : ["没有找到这个项目", "项目 ID 无效，或该项目已不在最近一次真实扫描快照中。"];
  return <div className="detail-route-state"><div className="breadcrumb"><button onClick={onBack}>项目雷达</button><span>/</span><span>项目详情</span></div><section><span aria-hidden="true">{state === "missing" ? "?" : "···"}</span><h1>{content[0]}</h1><p>{content[1]}</p><div><button onClick={onBack}>返回项目雷达</button>{state === "unavailable" && <button className="secondary" onClick={onRetry}>重新读取</button>}</div></section></div>;
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
    const frame = window.requestAnimationFrame(() => listRef.current?.focus());
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [open]);

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
        onClick={() => {
          setOpen((current) => {
            if (!current) setActiveIndex(selectedIndex);
            return !current;
          });
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            setActiveIndex(selectedIndex);
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
      >{options.map((option, index) => <button
        type="button"
        key={option.value}
        id={`${listboxId}-option-${index}`}
        className={`select-option ${index === activeIndex ? "active" : ""} ${option.value === value ? "selected" : ""}`}
        role="option"
        aria-selected={option.value === value}
        onPointerMove={() => setActiveIndex(index)}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => choose(option.value)}
      ><span className="select-check" aria-hidden="true">{option.value === value ? "✓" : ""}</span><span>{option.label}</span></button>)}</div>}
    </div>
    <div className="select-native"><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as T)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
  </div>;
}

export function RadarApp({ initialView = "radar", detailFromQuery = false, initialSnapshot = null }: { initialView?: MainView; detailFromQuery?: boolean; initialSnapshot?: RadarSnapshot | null }) {
  const [view] = useState<MainView>(initialView);
  const [tab, setTab] = useState<RadarTab>("urgent");
  const [sortMode, setSortMode] = useState<SortMode>("deadline");
  const [adminTab, setAdminTab] = useState<"sources" | "errors">("sources");
  const [query, setQuery] = useState(""); const [sourceFilter, setSourceFilter] = useState("全部来源"); const [statusFilter, setStatusFilter] = useState("全部状态");
  const [projects, setProjects] = useState<Project[]>([]); const [sources, setSources] = useState<Source[]>([]);
  const [run, setRun] = useState<ScanRun | null>(null);
  const [errors, setErrors] = useState<ScanError[]>([]); const [generatedAt, setGeneratedAt] = useState<string | null>(null); const [dataState, setDataState] = useState<DataState>("loading");
  const [reload, setReload] = useState(0); const [mobileNav, setMobileNav] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { let cancelled = false; (async () => { setDataState("loading"); try {
    let snapshot = initialSnapshot;
    if (!snapshot) {
      const response = await fetch(appHref("/data/radar.json"), { cache: "no-store" }); if (!response.ok) throw new Error();
      snapshot = await response.json() as RadarSnapshot;
    }
    if (snapshot.mode !== "live" || !Array.isArray(snapshot.projects) || !Array.isArray(snapshot.sources)) throw new Error();
    if (cancelled) return; setProjects(snapshot.projects.map((project) => normalizeProjectTimeFields(project) as Project)); setSources(snapshot.sources); setRun(snapshot.run); setErrors(snapshot.errors || []); setGeneratedAt(snapshot.generatedAt); setDataState(snapshot.run ? "ready" : "never");
  } catch { if (!cancelled) { setProjects([]); setSources([]); setRun(null); setErrors([]); setGeneratedAt(null); setDataState("unavailable"); } } })(); return () => { cancelled = true; }; }, [initialSnapshot, reload, view]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(sortStorageKey) as SortMode | null;
        if (saved && sortModes.includes(saved)) setSortMode(saved);
      } catch { /* 本地存储不可用时继续使用默认排序 */ }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (dataState !== "ready") return;
    const refreshDeadlineStates = () => {
      const now = new Date();
      setProjects((current) => current.map((project) => normalizeProjectTimeFields(project, now) as Project));
    };
    const interval = window.setInterval(refreshDeadlineStates, 60_000);
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refreshDeadlineStates(); };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [dataState]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const mobileViewport = window.matchMedia(mobileWorkbenchQuery);
    const syncSidebarAccessibility = () => {
      const hidden = mobileViewport.matches && !mobileNav;
      sidebar.toggleAttribute("inert", hidden);
      if (hidden) sidebar.setAttribute("aria-hidden", "true");
      else sidebar.removeAttribute("aria-hidden");
    };
    syncSidebarAccessibility();
    mobileViewport.addEventListener("change", syncSidebarAccessibility);
    return () => {
      mobileViewport.removeEventListener("change", syncSidebarAccessibility);
      sidebar.removeAttribute("inert");
      sidebar.removeAttribute("aria-hidden");
    };
  }, [mobileNav]);

  useEffect(() => {
    if (!mobileNav) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileNav(false);
      window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNav]);

  const { selected, detailState } = useMemo<{ selected: Project | null; detailState: DetailState }>(() => {
    if (!detailFromQuery) return { selected: null, detailState: "inactive" };
    if (dataState !== "ready") return { selected: null, detailState: dataState };
    const rawId = new URLSearchParams(window.location.search).get("id");
    const id = rawId && /^\d+$/.test(rawId) ? Number(rawId) : Number.NaN;
    const project = Number.isSafeInteger(id) ? projects.find((item) => item.id === id) : undefined;
    return { selected: project || null, detailState: project ? "ready" : "missing" };
  }, [dataState, detailFromQuery, projects]);

  const filtered = useMemo(() => { const keyword = query.trim().toLowerCase(); return projects.filter((project) => {
    const tabMatch = tab === "all" || (tab === "today" && project.createdToday) || project.deadlineState === tab;
    const queryMatch = !keyword || [project.name, project.section, project.client, project.agency, project.source].join(" ").toLowerCase().includes(keyword);
    const sourceMatch = sourceFilter === "全部来源" || project.source === sourceFilter;
    const statusMatch = statusFilter === "全部状态" || (statusFilter === "7天内紧急" && project.deadlineState === "urgent") || (statusFilter === "8–14天提醒" && project.deadlineState === "reminder") || (statusFilter === "待核验" && project.deadlineState === "pending") || (statusFilter === "已截止" && project.deadlineState === "expired");
    return tabMatch && queryMatch && sourceMatch && statusMatch;
  }).sort((a, b) => compareProjects(a, b, sortMode)); }, [projects, query, sourceFilter, statusFilter, tab, sortMode]);

  const stale = dataState === "ready" && (run?.status !== "成功" || isStale(generatedAt));
  const urgentCount = projects.filter((p) => p.deadlineState === "urgent").length;
  const reminderCount = projects.filter((p) => p.deadlineState === "reminder").length;
  const todayCount = projects.filter((p) => p.createdToday).length;
  const currentDate = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const scanTime = run?.finishedAt?.split(" ")[1] || "";
  const scanMeta = dataState === "loading" ? "正在读取今日扫描记录"
    : dataState === "unavailable" ? "请检查真实数据文件"
      : dataState === "never" ? "等待今日首次扫描"
        : stale ? `上次成功于 ${run?.finishedAt || "待核验"}`
          : run ? `${run.date === todayIso ? "今日" : run.date} ${scanTime} 已完成扫描` : "等待有效扫描结果";
  const hasFilters = Boolean(query || sourceFilter !== "全部来源" || statusFilter !== "全部状态");
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

  const openProject = (project: Project) => { window.location.assign(appHref(`/radar/project?id=${project.id}`)); };

  return <main className="app-shell"><aside ref={sidebarRef} id="workbench-sidebar" className={`sidebar ${mobileNav ? "open" : ""}`}><a className="brand" href={appHref("/")} onClick={() => setMobileNav(false)}><div className="brand-mark">标</div><div><strong>标看看</strong><span>监理标讯助手</span></div></a><nav>
    <a className={`nav-item ${view === "radar" ? "active" : ""}`} href={appHref("/radar")} onClick={() => setMobileNav(false)}><i>01</i><span><b>项目雷达</b><small>真实项目与截止</small></span></a>
    <a className={`nav-item ${view === "admin" ? "active" : ""}`} href={appHref("/radar/admin")} onClick={() => setMobileNav(false)}><i>02</i><span><b>系统管理</b><small>信息源与异常</small></span></a>
  </nav></aside>{mobileNav && <button type="button" className="sidebar-scrim" aria-label="关闭主菜单" onClick={() => setMobileNav(false)} />}<section className="workspace"><header className="mobile-header"><div className="brand-mark">标</div><strong>标看看</strong><button ref={mobileMenuButtonRef} type="button" aria-expanded={mobileNav} aria-controls="workbench-sidebar" aria-label={mobileNav ? "关闭主菜单" : "打开主菜单"} onClick={() => setMobileNav((open) => !open)}>菜单</button></header>
  {detailFromQuery ? selected && detailState === "ready" ? <ProjectDetail project={selected} onBack={() => { window.location.assign(appHref("/radar")); }} onOpenOriginal={openOriginal} /> : <ProjectDetailMessage state={detailState === "inactive" || detailState === "ready" ? "loading" : detailState} onBack={() => { window.location.assign(appHref("/radar")); }} onRetry={() => setReload((n) => n + 1)} /> : view === "radar" ? <>
    <header className="topbar"><div><p className="eyebrow">{currentDate}</p><h1>项目雷达</h1><p className="subtitle">集中查看真实发现的监理项目，优先处理临近截止机会。</p></div><div className={`scan-status static ${stale ? "warning" : ""}`}><span className="health-dot" /><b>{dataState === "loading" ? "正在读取" : dataState === "unavailable" ? "数据不可用" : dataState === "never" ? "等待首次扫描" : stale ? "部分来源异常" : "扫描正常"}</b><small>{scanMeta}</small></div></header>
    {stale && <div className="stale-banner"><strong>当前显示上次成功扫描数据</strong><span>扫描时间：{run?.finishedAt}。部分来源本次访问失败，请以原公告为准。</span></div>}
    <div className="summary-grid" role="tablist"><button role="tab" aria-selected={tab === "urgent"} className={`urgent ${tab === "urgent" ? "selected" : ""}`} onClick={() => setTab("urgent")}><span>7天内紧急</span><strong>{dataState === "ready" ? urgentCount : "—"}</strong><small>需优先判断是否跟进</small></button><button role="tab" aria-selected={tab === "reminder"} className={`reminder ${tab === "reminder" ? "selected" : ""}`} onClick={() => setTab("reminder")}><span>8–14天提醒</span><strong>{dataState === "ready" ? reminderCount : "—"}</strong><small>提前准备并持续关注</small></button><button role="tab" aria-selected={tab === "today"} className={tab === "today" ? "selected" : ""} onClick={() => setTab("today")}><span>今日新增</span><strong>{dataState === "ready" ? todayCount : "—"}</strong><small>按系统首次发现时间计算</small></button><button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "selected" : ""} onClick={() => setTab("all")}><span>全部项目</span><strong>{dataState === "ready" ? projects.length : "—"}</strong><small>来自 {dataState === "ready" ? sources.length : "—"} 个已接入来源</small></button></div>
    <section className="project-panel"><div className="filters"><label className="search-box"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索项目名称、招标人或代理机构" /></label><SelectMenu label="信息来源" value={sourceFilter} options={[{ value: "全部来源", label: "全部来源" }, ...[...new Set(projects.map((p) => p.source))].map((source) => ({ value: source, label: source }))]} onChange={setSourceFilter} /><SelectMenu label="截止状态" value={statusFilter} options={statusOptions} onChange={setStatusFilter} />{hasFilters && <button className="clear-filter" onClick={() => { setQuery(""); setSourceFilter("全部来源"); setStatusFilter("全部状态"); }}>清除筛选</button>}</div><div className="list-meta"><span>共找到 <b>{dataState === "ready" ? filtered.length : 0}</b> 个项目</span><SelectMenu label="排序方式" value={sortMode} options={sortOptions} onChange={changeSortMode} variant="compact" /></div>
    {dataState === "ready" && filtered.length ? <><div className="project-table"><div className="table-row table-head"><span>投标截止</span><span>项目名称 / 标段</span><span>总投资</span><span>招标人</span><span>招标代理机构</span><span>信息来源 / 原公告</span></div>{filtered.map((p) => <ProjectRow key={p.id} project={p} onOpen={() => openProject(p)} onOpenOriginal={() => openOriginal(p)} />)}</div><div className="mobile-projects">{filtered.map((p) => <MobileProject key={p.id} project={p} onOpen={() => openProject(p)} onOpenOriginal={() => openOriginal(p)} />)}</div></> : <DataMessage state={dataState} filtered={hasFilters || tab !== "all"} emptyCopy={!hasFilters && tab === "urgent" ? ["未来 7 天暂无紧急项目", "可以继续查看 8–14 天提醒或今日新增"] : !hasFilters && tab === "reminder" ? ["第 8–14 天暂无提醒项目", "可以继续查看今日新增或全部项目"] : undefined} onRetry={() => setReload((n) => n + 1)} />}<div className="notice"><strong>信息核验提示</strong><span>系统仅整理公开信息，无法确定的字段显示“待核验”；原公告及招标文件是唯一最终依据。</span></div></section>
  </> : <AdminCenter tab={adminTab} setTab={setAdminTab} sources={sources} errors={errors} run={run} />}</section></main>;
}

export default function LandingPage({ initialSnapshot = null }: { initialSnapshot?: RadarSnapshot | null }) {
  return <><PublicIntro initialSnapshot={initialSnapshot} /><PublicFooter /></>;
}

function ProjectRow({ project, onOpen, onOpenOriginal }: { project: Project; onOpen: () => void; onOpenOriginal: () => void }) {
  const linkLabel = project.linkStatus === "source_unavailable" ? "链接不可用" : project.linkStatus === "original_unavailable" ? "原公告不可用 · 查看上级入口" : "查看原公告 ↗";
  return <div className="table-row data-row"><ProjectTimes project={project} /><div className="project-name"><button onClick={onOpen}>{project.name}</button><span>{project.section} · {project.category}</span>{project.related && <UpdateIndicator />}</div><div className="cell"><strong>{project.investment.replace(" 万元", "")}</strong><span>{project.investment.includes("万元") ? "万元" : "需人工确认"}</span></div><div className="cell"><strong>{project.client}</strong><span>{project.clientExtra || project.region}</span></div><div className="cell"><strong>{project.agency}</strong><span>招标代理机构</span></div><div className="source-cell"><strong title={project.source}>{project.source}</strong><button className={project.linkStatus && project.linkStatus !== "available" ? "link-warning" : ""} onClick={onOpenOriginal}>{linkLabel}</button></div></div>;
}

function MobileProject({ project, onOpen, onOpenOriginal }: { project: Project; onOpen: () => void; onOpenOriginal: () => void }) {
  return <article className="mobile-project-card"><ProjectTimes project={project} /><button className="mobile-project-title" onClick={onOpen}>{project.name}</button><p>{project.section} · {project.category}</p>{project.related && <UpdateIndicator />}<dl><div><dt>总投资</dt><dd>{project.investment}</dd></div><div><dt>招标人</dt><dd>{project.client}</dd></div><div><dt>代理机构</dt><dd>{project.agency}</dd></div><div><dt>信息来源</dt><dd>{project.source}</dd></div></dl><div className="mobile-actions"><button onClick={onOpenOriginal}>{project.linkStatus === "available" || !project.linkStatus ? "打开原公告 ↗" : "核验公告入口"}</button></div></article>;
}

function ProjectDetail({ project, onBack, onOpenOriginal }: { project: Project; onBack: () => void; onOpenOriginal: (project: Project) => void }) {
  const bidDeadline = project.bidDeadlineStatus === "document_required"
    ? "待核验（公告注明：见招标文件）"
    : project.bidDeadlineStatus === "confirmed" && project.bidDeadline
      ? project.bidDeadline
      : "待核验";
  const fields = [
    ["投标截止时间", bidDeadline],
    ["招标文件获取窗口", formatDocumentAcquireWindow(project.documentAcquireStart, project.documentAcquireDeadline)],
    ["投标截止依据", project.bidDeadlineEvidence || "待核验"],
    ...(project.bidDeadlineVerifiedAt ? [["投标截止核验时间", project.bidDeadlineVerifiedAt]] : []),
    ["标段", project.section],
    ["总投资", project.investment],
    ["招标人", project.clientExtra ? `${project.client}（${project.clientExtra}）` : project.client],
    ["招标代理机构", project.agency],
    ["项目地区", project.region],
    ["公告发布时间", project.publishedAt],
    ["信息来源", project.source],
  ];
  const linkLabel = project.linkStatus === "source_unavailable" ? "链接不可用" : project.linkStatus === "original_unavailable" ? "核验原公告入口" : "打开原公告";
  return <><div className="breadcrumb"><button onClick={onBack}>项目雷达</button><span>/</span><span>项目详情</span></div><header className="detail-hero"><div className="detail-title"><div className="detail-tags"><span>{project.category}</span><span>{project.region.split(" · ").at(-1)}</span>{project.related && <UpdateIndicator />}</div><h1>{project.name}</h1><p>{project.section} · 原始公告发布时间 {project.publishedAt}</p></div><div className="detail-deadline"><small>时间安排</small><ProjectTimes project={project} /></div></header>
    {project.bidDeadlineStatus === "document_required" ? <div className="verify-alert"><strong>投标截止时间需要核验</strong><span>公告注明投标截止时间见招标文件；文件获取窗口仅表示下载期限，不代表投标已经截止。</span></div> : project.pendingFields?.length ? <div className="verify-alert"><strong>需要人工核验</strong><span>系统暂时无法可靠识别：{project.pendingFields.join("、")}。请以原公告为准。</span></div> : null}
    {project.linkStatus && project.linkStatus !== "available" ? <div className="verify-alert"><strong>原公告无法访问</strong><span>{project.linkFailureReason || "最近一次扫描无法打开该链接"} · 最后核验 {project.lastVerifiedAt || "待核验"}</span></div> : null}
    {project.related && <div className="update-alert"><strong>该项目有最新{project.related.type}</strong><span>{project.related.title} · {project.related.date}</span></div>}
    <div className="detail-layout"><div className="detail-main"><section className="detail-card"><div className="section-title"><span>01</span><h2>项目关键信息</h2></div><dl className="detail-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value.includes("待核验") ? "pending-text" : ""}>{value}</dd></div>)}</dl></section><section className="detail-card"><div className="section-title"><span>02</span><h2>原公告摘要</h2></div><div className="original-title"><small>原始公告标题</small><strong>{project.originalTitle}</strong></div><p className="summary-text">{project.summary}</p><p className="summary-note">内容由系统从公开公告自动提取，仅用于快速浏览。请打开原公告核验完整招标范围、资格要求和时间安排。</p></section><section className="detail-card"><div className="section-title"><span>03</span><h2>关联公告</h2></div>{project.related ? <div className="related-item"><span>{project.related.type}</span><div><strong>{project.related.title}</strong><small>{project.related.date} · 已关联至本项目</small></div></div> : <div className="no-related">暂未发现补充、变更、暂停或终止公告</div>}</section></div><aside className="detail-side"><button className={`primary-link ${project.linkStatus === "source_unavailable" ? "disabled" : ""}`} onClick={() => onOpenOriginal(project)}>{linkLabel}<span>↗</span></button><div className="trace-card"><h3>信息追踪</h3><div><span>首次发现时间</span><strong>{project.discoveredAt}</strong></div><div><span>扫描时间</span><strong>{project.lastVerifiedAt || "待核验"}</strong></div><div><span>更新时间</span><strong>{project.updatedAt}</strong></div><div><span>链接状态</span><strong className={project.linkStatus === "available" || !project.linkStatus ? "success-text" : "pending-text"}>{project.linkStatus === "available" || !project.linkStatus ? "原公告可访问" : "需要人工核验"}</strong></div><small>记录编号：JL-{String(project.id)}</small></div></aside></div></>;
}

function AdminCenter({ tab, setTab, sources, errors, run }: { tab: "sources" | "errors"; setTab: (tab: "sources" | "errors") => void; sources: Source[]; errors: ScanError[]; run: ScanRun | null }) {
  const runLabel = !run ? "等待扫描" : run.status === "成功" ? "扫描成功" : run.status === "部分失败" ? "部分来源异常" : "扫描失败";
  const runTone = run?.status === "失败" ? "error" : run?.status === "部分失败" ? "warning" : "";
  return <><header className="topbar"><div><p className="eyebrow">管理后台</p><h1>系统管理</h1><p className="subtitle">当前为 GitHub Pages 只读版；信息源由源码维护，每天 07:30 自动扫描。</p></div><div className={`scan-status static ${runTone}`}><span className="health-dot" /><b>{runLabel}</b><small>{run?.finishedAt || "尚无扫描记录"}</small></div></header><div className="status-summary compact"><article><span>已接入</span><strong>{sources.length}</strong><small>参与每日扫描</small></article><article><span>扫描成功</span><strong>{run?.succeededSources ?? 0}</strong><small>共 {run?.sourceCount ?? sources.length} 个来源</small></article><article><span>本次读取</span><strong>{run?.read ?? 0}</strong><small>符合入口规则的公告</small></article><article><span>异常</span><strong>{errors.length}</strong><small>最近保留的运行记录</small></article></div><div className="admin-tabs"><button className={tab === "sources" ? "active" : ""} onClick={() => setTab("sources")}>信息源管理</button><button className={tab === "errors" ? "active" : ""} onClick={() => setTab("errors")}>运行异常 <b>{errors.length}</b></button></div>{tab === "sources" ? <SourceManager sources={sources} /> : <ErrorLog errors={errors} />}</>;
}

function SourceStatus({ source }: { source: Source }) {
  const label = source.candidate ? source.onboardingStatus || (source.managed ? source.result : "候选 · 未同步") : !source.enabled ? "已停用" : source.result;
  const tone = source.result === "成功" ? "success" : source.result === "部分失败" ? "warning" : source.result === "失败" ? "error" : source.candidate || !source.enabled ? "disabled" : "pending";
  return <span className={`source-status ${tone}`}><i />{label}</span>;
}

function SourceManager({ sources }: { sources: Source[] }) {
  return <section className="panel-card admin-panel"><div className="admin-heading"><div><h2>信息源管理</h2><p>{sources.length} 个已适配来源；公开页面只读，新来源需完成抓取适配、本地测试和 GitHub 发布后才会显示</p></div></div><div className="source-table"><div className="source-row source-head"><span>网站名称 / 入口</span><span>地区</span><span>来源类型</span><span>最后扫描</span><span>状态</span><span>公告</span></div>{sources.map((source) => <div className="source-row" key={source.id}><div><strong>{source.name}</strong><a href={source.entry} target="_blank" rel="noreferrer">主页：{source.entry}</a>{source.listEntry && <a href={source.listEntry} target="_blank" rel="noreferrer">列表：{source.listEntry}</a>}{source.sourceNote && <small>{source.sourceNote}</small>}</div><span>{source.region}</span><span>{source.type}</span><div><strong>{source.lastScan || "尚未扫描"}</strong><small>读取 {source.read || 0} 条</small></div><SourceStatus source={source} /><span>{source.found} 条</span></div>)}</div><div className="source-cards">{sources.map((source) => <article key={source.id}><div><strong>{source.name}</strong><a href={source.entry} target="_blank" rel="noreferrer" title={source.entry}>打开来源主页 ↗</a>{source.listEntry && <a href={source.listEntry} target="_blank" rel="noreferrer" title={source.listEntry}>打开公告列表 ↗</a>}{source.sourceNote && <small>{source.sourceNote}</small>}</div><SourceStatus source={source} /><dl><div><dt>最后扫描</dt><dd>{source.lastScan || "尚未扫描"}</dd></div><div><dt>本次读取</dt><dd>{source.read || 0} 条</dd></div><div><dt>地区</dt><dd>{source.region}</dd></div><div><dt>来源类型</dt><dd>{source.type}</dd></div><div><dt>公告</dt><dd>{source.found} 条</dd></div></dl></article>)}</div></section>;
}

function ErrorLog({ errors }: { errors: ScanError[] }) {
  return <section className="panel-card error-panel"><div className="admin-heading"><div><h2>运行异常</h2><p>包含来源访问、项目对应关系、链接失效和字段核验问题</p></div><span>最近 {errors.length} 条</span></div>{errors.length ? errors.map((error) => <article key={error.id}><div className={error.level === "扫描失败" ? "error-icon critical" : "error-icon"}>!</div><div className="error-main"><div><strong>{error.level}</strong><span>{error.source}</span><small>{error.time}</small></div>{error.project && <small className="error-project">{error.project}</small>}<p>{error.detail}</p>{error.url && <a href={error.url} target="_blank" rel="noreferrer">查看核验入口 ↗</a>}</div></article>) : <div className="source-empty"><strong>最近没有运行异常</strong><span>已接入来源均完成最近一次扫描。</span></div>}</section>;
}
