"use client";

import { useMemo, useState } from "react";

type DeadlineState = "normal" | "warning" | "danger" | "expired" | "pending";
type MainView = "radar" | "reminders" | "admin";
type RadarTab = "today" | "upcoming" | "all";
type AdminTab = "sources" | "status" | "errors";

type Project = {
  id: number;
  name: string;
  section: string;
  category: string;
  investment: string;
  deadline: string | null;
  deadlineShort: string;
  remaining: string;
  deadlineState: DeadlineState;
  client: string;
  clientExtra?: string;
  agency: string;
  source: string;
  sourceType: string;
  url: string;
  region: string;
  originalTitle: string;
  publishedAt: string;
  discoveredAt: string;
  updatedAt: string;
  summary: string;
  createdToday: boolean;
  related?: { type: string; title: string; date: string };
  pendingFields?: string[];
};

type Source = {
  id: number;
  name: string;
  entry: string;
  region: string;
  type: string;
  enabled: boolean;
  lastScan: string;
  result: "成功" | "部分失败" | "失败";
  found: number;
};

const projects: Project[] = [
  {
    id: 1,
    name: "通许县宏达大道（人民路-第一污水处理厂）排水管网改造工程",
    section: "第二标段",
    category: "市政工程监理",
    investment: "6,961.37 万元",
    deadline: "2026-08-25 09:30",
    deadlineShort: "08月25日 09:30",
    remaining: "剩余 6 天",
    deadlineState: "normal",
    client: "通许县城市管理局",
    clientExtra: "通许县城市综合执法局",
    agency: "河南省开兴工程管理咨询有限公司",
    source: "开封市公共资源交易中心",
    sourceType: "公共资源交易中心",
    url: "http://www.kfsggzyjyw.cn/jzbtxx/81223.jhtml",
    region: "河南省 · 开封市 · 通许县",
    originalTitle: "通许县宏达大道（人民路-第一污水处理厂）排水管网改造工程招标公告",
    publishedAt: "2026-08-18 16:42",
    discoveredAt: "2026-08-19 08:03",
    updatedAt: "2026-08-19 08:12",
    summary: "本项目为通许县宏达大道排水管网改造工程，建设内容包括雨污水管网、检查井及道路恢复等配套工程。第二标段为施工及保修阶段全过程监理服务，投标文件递交截止时间为 2026 年 8 月 25 日 09 时 30 分。",
    createdToday: true,
    related: { type: "补充公告", title: "关于招标文件下载时间的补充说明", date: "2026-08-19 10:20" },
  },
  {
    id: 2,
    name: "郑东新区龙湖片区综合管廊建设项目监理",
    section: "监理一标段",
    category: "市政工程监理",
    investment: "18,420.00 万元",
    deadline: "2026-08-22 17:00",
    deadlineShort: "08月22日 17:00",
    remaining: "剩余 3 天",
    deadlineState: "warning",
    client: "郑州新区建设投资有限公司",
    agency: "河南兴达工程咨询有限公司",
    source: "郑州市公共资源交易中心",
    sourceType: "公共资源交易中心",
    url: "http://www.kfsggzyjyw.cn/jzbtxx/81223.jhtml",
    region: "河南省 · 郑州市",
    originalTitle: "郑东新区龙湖片区综合管廊建设项目监理招标公告",
    publishedAt: "2026-08-19 07:20",
    discoveredAt: "2026-08-19 08:05",
    updatedAt: "2026-08-19 08:12",
    summary: "项目主要建设地下综合管廊及附属设施，招标范围为施工准备期、施工期及缺陷责任期监理服务。",
    createdToday: true,
  },
  {
    id: 3,
    name: "开封市老旧小区连片改造项目全过程监理",
    section: "第三标段",
    category: "房屋建筑监理",
    investment: "12,680.50 万元",
    deadline: "2026-08-20 10:00",
    deadlineShort: "08月20日 10:00",
    remaining: "剩余 1 天",
    deadlineState: "danger",
    client: "开封市住房和城乡建设局",
    agency: "中建山河建设管理集团有限公司",
    source: "开封市公共资源交易中心",
    sourceType: "公共资源交易中心",
    url: "http://www.kfsggzyjyw.cn/jzbtxx/81223.jhtml",
    region: "河南省 · 开封市",
    originalTitle: "开封市老旧小区连片改造项目全过程监理招标公告",
    publishedAt: "2026-08-17 15:30",
    discoveredAt: "2026-08-19 08:06",
    updatedAt: "2026-08-19 08:12",
    summary: "对老旧小区基础设施、建筑公共部位及公共服务设施改造提供全过程监理服务。",
    createdToday: true,
    related: { type: "变更公告", title: "投标文件递交截止时间变更公告", date: "2026-08-19 09:40" },
  },
  {
    id: 4,
    name: "兰考县乡村振兴产业园二期建设项目监理",
    section: "第一标段",
    category: "房屋建筑监理",
    investment: "8,930.00 万元",
    deadline: "2026-08-18 09:30",
    deadlineShort: "08月18日 09:30",
    remaining: "已截止",
    deadlineState: "expired",
    client: "兰考县兴业建设有限公司",
    agency: "河南良智行工程管理咨询有限公司",
    source: "开封市公共资源交易中心",
    sourceType: "公共资源交易中心",
    url: "http://www.kfsggzyjyw.cn/jzbtxx/81223.jhtml",
    region: "河南省 · 开封市 · 兰考县",
    originalTitle: "兰考县乡村振兴产业园二期建设项目监理招标公告",
    publishedAt: "2026-08-12 11:20",
    discoveredAt: "2026-08-19 08:07",
    updatedAt: "2026-08-19 08:12",
    summary: "产业园二期建设项目施工阶段及工程保修阶段监理服务。",
    createdToday: false,
  },
  {
    id: 5,
    name: "尉氏县城区河道综合治理工程施工监理",
    section: "监理标",
    category: "水利工程监理",
    investment: "待核验",
    deadline: null,
    deadlineShort: "待核验",
    remaining: "时间无法可靠识别",
    deadlineState: "pending",
    client: "尉氏县水利工程建设管理局",
    agency: "河南展坤工程管理有限公司",
    source: "河南省政府采购网",
    sourceType: "政府采购网",
    url: "http://www.kfsggzyjyw.cn/jzbtxx/81223.jhtml",
    region: "河南省 · 开封市 · 尉氏县",
    originalTitle: "尉氏县城区河道综合治理工程施工及监理公开招标公告",
    publishedAt: "2026-08-19 06:58",
    discoveredAt: "2026-08-19 08:08",
    updatedAt: "2026-08-19 08:12",
    summary: "系统在公告正文与附件中识别到多个时间，暂时无法确认投标文件递交截止时间，请打开原公告人工核验。",
    createdToday: true,
    pendingFields: ["投标截止时间", "总投资"],
  },
  {
    id: 6,
    name: "新乡市平原示范区道路提升改造工程监理",
    section: "第二包",
    category: "市政工程监理",
    investment: "5,260.00 万元",
    deadline: "2026-09-03 09:00",
    deadlineShort: "09月03日 09:00",
    remaining: "剩余 15 天",
    deadlineState: "normal",
    client: "新乡市平原城乡一体化示范区管理委员会",
    agency: "河南省机电设备招标股份有限公司",
    source: "河南省政府采购网",
    sourceType: "政府采购网",
    url: "http://www.kfsggzyjyw.cn/jzbtxx/81223.jhtml",
    region: "河南省 · 新乡市",
    originalTitle: "新乡市平原示范区道路提升改造工程监理招标公告",
    publishedAt: "2026-08-19 08:01",
    discoveredAt: "2026-08-19 08:09",
    updatedAt: "2026-08-19 08:12",
    summary: "示范区道路提升改造及附属工程施工全过程监理。",
    createdToday: true,
  },
];

const initialSources: Source[] = [
  { id: 1, name: "开封市公共资源交易中心", entry: "www.kfsggzyjyw.cn", region: "河南 · 开封", type: "交易中心", enabled: true, lastScan: "今日 08:12", result: "成功", found: 4 },
  { id: 2, name: "郑州市公共资源交易中心", entry: "zzggzy.zhengzhou.gov.cn", region: "河南 · 郑州", type: "交易中心", enabled: true, lastScan: "今日 08:10", result: "成功", found: 1 },
  { id: 3, name: "河南省政府采购网", entry: "zfcg.henan.gov.cn", region: "河南省", type: "政府采购网", enabled: true, lastScan: "今日 08:08", result: "部分失败", found: 2 },
  { id: 4, name: "新乡市公共资源交易中心", entry: "ggzy.xinxiang.gov.cn", region: "河南 · 新乡", type: "交易中心", enabled: true, lastScan: "今日 08:05", result: "成功", found: 1 },
  { id: 5, name: "河南兴达工程咨询官网", entry: "www.xingdazx.com", region: "河南省", type: "代理机构", enabled: false, lastScan: "08月18日 08:06", result: "成功", found: 0 },
  { id: 6, name: "洛阳市公共资源交易中心", entry: "lyggzyjy.ly.gov.cn", region: "河南 · 洛阳", type: "交易中心", enabled: true, lastScan: "今日 08:02", result: "失败", found: 0 },
];

const deadlineLabels: Record<DeadlineState, string> = {
  normal: "正常",
  warning: "3 天内",
  danger: "1 天内",
  expired: "已截止",
  pending: "待核验",
};

function Deadline({ project }: { project: Project }) {
  return (
    <div className={`deadline-block ${project.deadlineState}`}>
      <strong>{project.deadlineShort}</strong>
      <span>{project.remaining}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div>⌕</div>
      <strong>没有找到符合条件的项目</strong>
      <span>请调整关键词或筛选条件后再试</span>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<MainView>("radar");
  const [radarTab, setRadarTab] = useState<RadarTab>("today");
  const [adminTab, setAdminTab] = useState<AdminTab>("sources");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("全部来源");
  const [statusFilter, setStatusFilter] = useState("全部状态");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sources, setSources] = useState(initialSources);
  const [reminderType, setReminderType] = useState("截止前 3 天提醒");
  const [sendCount, setSendCount] = useState(3);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const filteredProjects = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return projects.filter((project) => {
      const tabMatch =
        radarTab === "all" ||
        (radarTab === "today" && project.createdToday) ||
        (radarTab === "upcoming" && ["warning", "danger"].includes(project.deadlineState));
      const keywordMatch =
        !keyword ||
        [project.name, project.section, project.client, project.agency, project.source]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      const sourceMatch = sourceFilter === "全部来源" || project.source === sourceFilter;
      const statusMatch =
        statusFilter === "全部状态" ||
        (statusFilter === "临近截止" && ["warning", "danger"].includes(project.deadlineState)) ||
        (statusFilter === "待核验" && project.deadlineState === "pending") ||
        (statusFilter === "已截止" && project.deadlineState === "expired");
      return tabMatch && keywordMatch && sourceMatch && statusMatch;
    });
  }, [query, radarTab, sourceFilter, statusFilter]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const navigate = (nextView: MainView) => {
    setView(nextView);
    setSelectedProject(null);
    setMobileNav(false);
  };

  const openProject = (project: Project) => {
    setSelectedProject(project);
    setView("radar");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleSource = (id: number) => {
    setSources((items) => items.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)));
  };

  const navItems: { key: MainView; label: string; hint: string }[] = [
    { key: "radar", label: "项目雷达", hint: "发现与截止" },
    { key: "reminders", label: "提醒中心", hint: "企业微信模拟" },
    { key: "admin", label: "系统管理", hint: "信息源与扫描" },
  ];

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">监</div>
          <div><strong>监理招标雷达</strong><span>项目机会工作台</span></div>
        </div>
        <nav aria-label="主导航">
          {navItems.map((item, index) => (
            <button key={item.key} className={`nav-item ${view === item.key ? "active" : ""}`} onClick={() => navigate(item.key)}>
              <i>0{index + 1}</i><span><b>{item.label}</b><small>{item.hint}</small></span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="health-dot" /> 系统运行正常
          <small>今日 08:12 完成扫描</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="mobile-header">
          <div className="brand-mark">监</div>
          <strong>监理招标雷达</strong>
          <button aria-label="打开导航" onClick={() => setMobileNav(!mobileNav)}>菜单</button>
        </header>

        {selectedProject ? (
          <ProjectDetail project={selectedProject} onBack={() => setSelectedProject(null)} />
        ) : view === "radar" ? (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">2026 年 8 月 19 日 · 星期三</p>
                <h1>项目雷达</h1>
                <p className="subtitle">集中查看新发现的监理项目，优先处理临近截止机会。</p>
              </div>
              <button className="scan-status" onClick={() => showToast("模拟扫描任务已启动，预计 2 分钟完成")}>
                <span className="health-dot" /><b>扫描正常</b><small>上次完成 08:12</small>
              </button>
            </header>

            <section className="summary-grid" role="tablist" aria-label="项目概览与分组">
              <button role="tab" aria-selected={radarTab === "today"} onClick={() => setRadarTab("today")} className={radarTab === "today" ? "selected" : ""}>
                <span>今日新增</span><strong>5</strong><small>较昨日增加 2 个</small>
              </button>
              <button role="tab" aria-selected={radarTab === "upcoming"} onClick={() => setRadarTab("upcoming")} className={`warning ${radarTab === "upcoming" ? "selected" : ""}`}>
                <span>3 天内截止</span><strong>2</strong><small>其中 1 个明日截止</small>
              </button>
              <button role="tab" aria-selected={radarTab === "all"} onClick={() => setRadarTab("all")} className={radarTab === "all" ? "selected" : ""}>
                <span>全部项目</span><strong>28</strong><small>来自 6 个信息源</small>
              </button>
            </section>

            <section className="project-panel">
              <div className="filters">
                <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索项目" placeholder="搜索项目名称、招标人或代理机构" /></label>
                <label><span>信息来源</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option>全部来源</option>{[...new Set(projects.map((project) => project.source))].map((source) => <option key={source}>{source}</option>)}</select></label>
                <label><span>截止状态</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>全部状态</option><option>临近截止</option><option>待核验</option><option>已截止</option></select></label>
                {(query || sourceFilter !== "全部来源" || statusFilter !== "全部状态") && <button className="clear-filter" onClick={() => { setQuery(""); setSourceFilter("全部来源"); setStatusFilter("全部状态"); }}>清除筛选</button>}
              </div>

              <div className="list-meta"><span>共找到 <b>{filteredProjects.length}</b> 个项目</span><span>按截止时间优先排列</span></div>
              {filteredProjects.length ? (
                <>
                  <div className="project-table" role="table" aria-label="项目列表">
                    <div className="table-row table-head" role="row">
                      <span>投标截止</span><span>项目名称 / 标段</span><span>总投资</span><span>招标人</span><span>招标代理机构</span><span>信息来源 / 原公告</span>
                    </div>
                    {filteredProjects.map((project) => (
                      <div className="table-row data-row" role="row" key={project.id}>
                        <Deadline project={project} />
                        <div className="project-name"><button onClick={() => openProject(project)}>{project.name}</button><span>{project.section} · {project.category}</span>{project.related && <em>有更新</em>}</div>
                        <div className="cell"><strong>{project.investment.replace(" 万元", "")}</strong><span>{project.investment.includes("万元") ? "万元" : "需人工确认"}</span></div>
                        <div className="cell"><strong>{project.client}</strong><span>{project.clientExtra || project.region}</span></div>
                        <div className="cell"><strong>{project.agency}</strong><span>招标代理机构</span></div>
                        <div className="source-cell"><strong>{project.source}</strong><a href={project.url} target="_blank" rel="noreferrer">查看原公告 ↗</a></div>
                      </div>
                    ))}
                  </div>
                  <div className="mobile-projects">
                    {filteredProjects.map((project) => (
                      <article key={project.id} className="mobile-project-card">
                        <Deadline project={project} />
                        <button className="mobile-project-title" onClick={() => openProject(project)}>{project.name}</button>
                        <p>{project.section} · {project.category}</p>
                        <dl><div><dt>总投资</dt><dd>{project.investment}</dd></div><div><dt>招标人</dt><dd>{project.client}</dd></div><div><dt>代理机构</dt><dd>{project.agency}</dd></div><div><dt>信息来源</dt><dd>{project.source}</dd></div></dl>
                        <div className="mobile-actions"><button onClick={() => openProject(project)}>查看详情</button><a href={project.url} target="_blank" rel="noreferrer">原公告 ↗</a></div>
                      </article>
                    ))}
                  </div>
                </>
              ) : <EmptyState />}
              <div className="notice"><strong>信息核验提示</strong><span>系统仅整理公开信息，无法确定的字段显示“待核验”；原公告及招标文件是唯一最终依据。</span></div>
            </section>
          </>
        ) : view === "reminders" ? (
          <ReminderCenter reminderType={reminderType} setReminderType={setReminderType} sendCount={sendCount} onSend={() => { setSendCount((count) => count + 1); showToast("模拟消息发送成功，已写入发送记录"); }} />
        ) : (
          <AdminCenter tab={adminTab} setTab={setAdminTab} sources={sources} onToggle={toggleSource} onScan={() => showToast("模拟全量扫描已启动，状态将在本页更新")} />
        )}
      </section>

      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const fields = [
    ["投标截止时间", project.deadline || "待核验"],
    ["标段", project.section],
    ["总投资", project.investment],
    ["招标人", project.clientExtra ? `${project.client}（${project.clientExtra}）` : project.client],
    ["招标代理机构", project.agency],
    ["项目地区", project.region],
    ["公告发布时间", project.publishedAt],
    ["信息来源", project.source],
  ];
  return (
    <>
      <div className="breadcrumb"><button onClick={onBack}>项目雷达</button><span>/</span><span>项目详情</span></div>
      <header className="detail-hero">
        <div className="detail-title">
          <div className="detail-tags"><span>{project.category}</span><span>{project.region.split(" · ").at(-1)}</span>{project.related && <em>有更新</em>}</div>
          <h1>{project.name}</h1>
          <p>{project.section} · 原始公告发布时间 {project.publishedAt}</p>
        </div>
        <div className="detail-deadline"><small>投标截止时间</small><Deadline project={project} /></div>
      </header>

      {project.pendingFields && <div className="verify-alert"><strong>需要人工核验</strong><span>系统暂时无法可靠识别：{project.pendingFields.join("、")}。请以原公告为准。</span></div>}
      {project.related && <div className="update-alert"><strong>该项目有最新{project.related.type}</strong><span>{project.related.title} · {project.related.date}</span></div>}

      <div className="detail-layout">
        <div className="detail-main">
          <section className="detail-card">
            <div className="section-title"><span>01</span><h2>项目关键信息</h2></div>
            <dl className="detail-grid">
              {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value === "待核验" ? "pending-text" : ""}>{value}</dd></div>)}
            </dl>
          </section>
          <section className="detail-card">
            <div className="section-title"><span>02</span><h2>原公告摘要</h2></div>
            <div className="original-title"><small>原始公告标题</small><strong>{project.originalTitle}</strong></div>
            <p className="summary-text">{project.summary}</p>
            <p className="summary-note">以上内容由系统从公开公告中自动提取，仅用于快速浏览，请打开原公告核验完整招标范围、资格要求和时间安排。</p>
          </section>
          <section className="detail-card">
            <div className="section-title"><span>03</span><h2>关联公告</h2></div>
            {project.related ? <div className="related-item"><span>{project.related.type}</span><div><strong>{project.related.title}</strong><small>{project.related.date} · 已关联至本项目</small></div><button>查看</button></div> : <div className="no-related">暂未发现补充、变更、暂停或终止公告</div>}
          </section>
        </div>
        <aside className="detail-side">
          <a className="primary-link" href={project.url} target="_blank" rel="noreferrer">打开原公告 <span>↗</span></a>
          <div className="trace-card">
            <h3>信息追踪</h3>
            <div><span>系统发现时间</span><strong>{project.discoveredAt}</strong></div>
            <div><span>最后更新时间</span><strong>{project.updatedAt}</strong></div>
            <div><span>扫描状态</span><strong className="success-text">已完成解析</strong></div>
            <small>记录编号：JL-20260819-{String(project.id).padStart(3, "0")}</small>
          </div>
          <div className="future-card">
            <h3>投标决策辅助</h3>
            <div><span>适合我投</span><b>后续开放</b></div>
            <div><span>匹配度</span><b>后续开放</b></div>
            <div><span>机会评分</span><b>后续开放</b></div>
            <p>后续将基于企业资质、人员与业绩数据开放。</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function ReminderCenter({ reminderType, setReminderType, sendCount, onSend }: { reminderType: string; setReminderType: (value: string) => void; sendCount: number; onSend: () => void }) {
  const isDaily = reminderType === "每日扫描汇总";
  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">消息预览 · 不连接真实接口</p><h1>企业微信提醒</h1><p className="subtitle">预览临期提醒消息并模拟发送，验证首版通知闭环。</p></div>
        <span className="simulation-badge">模拟模式</span>
      </header>
      <div className="reminder-layout">
        <section className="reminder-config panel-card">
          <div className="section-title"><span>01</span><h2>消息设置</h2></div>
          <label><span>提醒类型</span><select value={reminderType} onChange={(event) => setReminderType(event.target.value)}><option>每日扫描汇总</option><option>截止前 3 天提醒</option><option>截止前 1 天提醒</option><option>截止当天提醒</option></select></label>
          <label><span>接收群</span><select><option>正博监理 · 投标信息群</option><option>市场经营部 · 项目雷达群</option></select></label>
          <label><span>发送时间</span><input value="2026-08-19 08:30" readOnly /></label>
          <div className="config-note"><strong>演示说明</strong><p>点击“模拟发送”只会在本页面增加一条发送记录，不会调用企业微信接口或发送真实消息。</p></div>
        </section>
        <section className="message-preview">
          <div className="phone-bar"><span>消息预览</span><small>企业微信机器人</small></div>
          <div className="wechat-stage">
            <div className="wechat-message">
              <div className="message-brand"><span>监</span><div><strong>监理招标雷达</strong><small>{reminderType}</small></div></div>
              {isDaily ? <><h3>今日扫描已完成</h3><div className="message-stats"><div><b>5</b><span>今日新增</span></div><div><b>2</b><span>3 天内截止</span></div></div></> : <><span className="message-urgent">{reminderType}</span><h3>通许县宏达大道（人民路-第一污水处理厂）排水管网改造工程</h3><p>第二标段 · 市政工程监理</p><dl><div><dt>总投资</dt><dd>6,961.37 万元</dd></div><div><dt>投标截止</dt><dd>08月25日 09:30</dd></div><div><dt>招标人</dt><dd>通许县城市管理局</dd></div></dl></>}
              <button>查看项目详情 <span>›</span></button>
              <small className="message-foot">公开信息自动整理，请以原公告和招标文件为准</small>
            </div>
          </div>
          <button className="send-button" onClick={onSend}>模拟发送到企业微信群</button>
        </section>
      </div>
      <section className="send-history panel-card">
        <div className="section-title"><span>02</span><h2>模拟发送记录</h2><b>共 {sendCount} 条</b></div>
        <div className="history-row history-head"><span>发送时间</span><span>消息类型</span><span>接收群</span><span>项目数</span><span>状态</span></div>
        {Array.from({ length: Math.min(sendCount, 4) }).map((_, index) => <div className="history-row" key={index}><span>{index === 0 && sendCount > 3 ? "刚刚" : `2026-08-${19 - index} 08:30`}</span><strong>{index === 0 && sendCount > 3 ? reminderType : index === 1 ? "截止前 1 天提醒" : "每日扫描汇总"}</strong><span>正博监理 · 投标信息群</span><span>{index === 1 ? "1 个项目" : "5 个项目"}</span><em>模拟成功</em></div>)}
      </section>
    </>
  );
}

function AdminCenter({ tab, setTab, sources, onToggle, onScan }: { tab: AdminTab; setTab: (tab: AdminTab) => void; sources: Source[]; onToggle: (id: number) => void; onScan: () => void }) {
  const enabledCount = sources.filter((source) => source.enabled).length;
  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">管理后台</p><h1>系统管理</h1><p className="subtitle">管理公开信息源，查看每日扫描状态与异常记录。</p></div>
        <button className="primary-button" onClick={onScan}>执行模拟扫描</button>
      </header>
      <div className="admin-tabs">
        <button className={tab === "sources" ? "active" : ""} onClick={() => setTab("sources")}>信息源管理</button>
        <button className={tab === "status" ? "active" : ""} onClick={() => setTab("status")}>扫描状态</button>
        <button className={tab === "errors" ? "active" : ""} onClick={() => setTab("errors")}>扫描异常 <b>2</b></button>
      </div>
      {tab === "sources" ? (
        <section className="panel-card admin-panel">
          <div className="admin-heading"><div><h2>信息源管理</h2><p>已启用 {enabledCount} / {sources.length} 个公开信息源</p></div><button onClick={() => alert("首版演示：添加信息源表单将在后续版本开放")}>＋ 添加信息源</button></div>
          <div className="source-table">
            <div className="source-row source-head"><span>网站名称 / 扫描入口</span><span>地区</span><span>来源类型</span><span>最后扫描</span><span>扫描结果</span><span>启用</span></div>
            {sources.map((source) => <div className="source-row" key={source.id}><div><strong>{source.name}</strong><small>{source.entry}</small></div><span>{source.region}</span><span>{source.type}</span><div><strong>{source.lastScan}</strong><small>发现 {source.found} 条相关公告</small></div><em className={source.result === "成功" ? "status-success" : source.result === "部分失败" ? "status-warning" : "status-error"}>{source.result}</em><button className={`toggle ${source.enabled ? "on" : ""}`} onClick={() => onToggle(source.id)} role="switch" aria-checked={source.enabled} aria-label={`${source.name}${source.enabled ? "停用" : "启用"}`}><span /></button></div>)}
          </div>
          <div className="source-cards">{sources.map((source) => <article key={source.id}><div><strong>{source.name}</strong><small>{source.entry}</small></div><em className={source.result === "成功" ? "status-success" : source.result === "部分失败" ? "status-warning" : "status-error"}>{source.result}</em><dl><div><dt>地区</dt><dd>{source.region}</dd></div><div><dt>类型</dt><dd>{source.type}</dd></div><div><dt>最后扫描</dt><dd>{source.lastScan}</dd></div><div><dt>扫描发现</dt><dd>{source.found} 条公告</dd></div></dl><button className={`toggle ${source.enabled ? "on" : ""}`} onClick={() => onToggle(source.id)} role="switch" aria-checked={source.enabled}><span /></button></article>)}</div>
        </section>
      ) : tab === "status" ? (
        <ScanStatus sources={sources} />
      ) : (
        <ErrorLog />
      )}
    </>
  );
}

function ScanStatus({ sources }: { sources: Source[] }) {
  return (
    <>
      <section className="status-summary">
        <article><span>本次扫描耗时</span><strong>6 分 42 秒</strong><small>今日 08:00-08:12</small></article>
        <article><span>扫描信息源</span><strong>{sources.filter((source) => source.enabled).length} / {sources.length}</strong><small>1 个来源已停用</small></article>
        <article><span>读取公告</span><strong>186 条</strong><small>识别监理相关 8 条</small></article>
        <article><span>新增项目</span><strong>5 个</strong><small>合并重复记录 3 条</small></article>
      </section>
      <section className="panel-card scan-progress">
        <div className="section-title"><span>01</span><h2>今日扫描任务</h2><em>已完成</em></div>
        <div className="progress-track"><span /></div>
        <div className="progress-steps"><div className="done"><b>1</b><strong>访问网站</strong><small>6 个信息源</small></div><div className="done"><b>2</b><strong>筛选公告</strong><small>命中 8 条</small></div><div className="done"><b>3</b><strong>提取字段</strong><small>1 条待核验</small></div><div className="done"><b>4</b><strong>去重关联</strong><small>合并 3 条</small></div><div className="done"><b>5</b><strong>提醒计算</strong><small>生成 2 条</small></div></div>
      </section>
      <section className="panel-card scan-log">
        <div className="section-title"><span>02</span><h2>最近扫描记录</h2></div>
        {["今日 08:12|每日全量扫描|成功|新增 5 个项目 · 2 个临期", "08月18日 08:10|每日全量扫描|成功|新增 3 个项目 · 1 个临期", "08月17日 08:14|每日全量扫描|部分失败|新增 4 个项目 · 2 个来源异常"].map((row) => <div key={row}>{row.split("|").map((cell, index) => index === 2 ? <em key={cell} className={cell === "成功" ? "status-success" : "status-warning"}>{cell}</em> : <span key={cell}>{cell}</span>)}</div>)}
      </section>
    </>
  );
}

function ErrorLog() {
  const errors = [
    { level: "字段待核验", source: "河南省政府采购网", time: "今日 08:08", detail: "尉氏县城区河道综合治理工程公告中识别到多个截止时间，无法确认投标文件递交截止时间。", action: "打开公告核验" },
    { level: "扫描失败", source: "洛阳市公共资源交易中心", time: "今日 08:02", detail: "公告列表页面结构发生变化，未能读取公告链接。系统已保留上次成功扫描结果。", action: "查看来源配置" },
    { level: "已恢复", source: "郑州市公共资源交易中心", time: "08月18日 08:09", detail: "访问响应超时，重试后已恢复正常扫描。", action: "查看记录" },
  ];
  return (
    <section className="panel-card error-panel">
      <div className="admin-heading"><div><h2>扫描异常记录</h2><p>异常不会删除或覆盖已收录的项目记录</p></div><span>近 7 天</span></div>
      {errors.map((error) => <article key={error.detail}><div className={error.level === "扫描失败" ? "error-icon critical" : error.level === "已恢复" ? "error-icon resolved" : "error-icon"}>!</div><div className="error-main"><div><strong>{error.level}</strong><span>{error.source}</span><small>{error.time}</small></div><p>{error.detail}</p><button>{error.action} →</button></div></article>)}
    </section>
  );
}
