"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeProjectTimeFields } from "../shared/project-time.mjs";
import { siteConfig } from "./site-config";

type PreviewProject = {
  id: number;
  name: string;
  section: string;
  investment: string;
  deadlineShort: string;
  remaining: string;
  deadlineState: "normal" | "reminder" | "urgent" | "expired" | "pending";
  bidDeadline: string | null;
  bidDeadlineStatus: "confirmed" | "document_required" | "pending";
  source: string;
};

export type PreviewSnapshot = {
  generatedAt: string | null;
  projects: PreviewProject[];
  sources: unknown[];
  errors: unknown[];
  summary: {
    summaryVersion: 2;
    newProjectCount: number;
    urgentWithin7DaysCount: number;
    reminderFrom8To14DaysCount: number;
    abnormalSourceCount: number;
  } | null;
};

type PreviewState = "loading" | "ready" | "empty" | "error";

const workflow = [
  ["每天巡检", "每天 07:30 访问已适配的公共资源交易中心，持续发现新的监理招标公告。"],
  ["识别与整理", "提取项目、标段、投资、关键单位与截止时间，不确定字段明确标注待核验。"],
  ["汇总与回源", "生成同一份真实项目快照，并保留原公告入口供投标人员完成最终判断。"],
];

const boundaries = [
  "只整理公开招标信息，不代替原公告与招标文件",
  "识别不确定的内容明确标注待核验，不进行猜测",
  "首版不做投标决策、机会评分和自动投标",
];

function formatGeneratedAt(value: string | null) {
  if (!value) return "等待首次扫描";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "最近一次扫描";
  return `${date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" })} ${date.toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

function ProductPreview({ snapshot, state }: { snapshot: PreviewSnapshot | null; state: PreviewState }) {
  const [referenceNow, setReferenceNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setReferenceNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const projects = useMemo(() => {
    if (!snapshot) return [];
    const normalized = snapshot.projects.map((project) => normalizeProjectTimeFields(project, referenceNow) as PreviewProject);
    const active = normalized.filter((project) => project.deadlineState !== "expired");
    return (active.length ? active : normalized).slice(0, 3);
  }, [referenceNow, snapshot]);
  const deadlineCounts = useMemo(() => {
    if (!snapshot) return { urgent: 0, reminder: 0 };
    const normalized = snapshot.projects.map((project) => normalizeProjectTimeFields(project, referenceNow) as PreviewProject);
    return {
      urgent: normalized.filter((project) => project.deadlineState === "urgent").length,
      reminder: normalized.filter((project) => project.deadlineState === "reminder").length,
    };
  }, [referenceNow, snapshot]);

  const statusMessage = state === "loading"
    ? "正在读取真实扫描数据"
    : state === "error"
      ? "项目数据暂时无法读取"
      : state === "empty"
        ? "扫描完成后，真实项目会显示在这里"
        : `已载入 ${snapshot?.projects.length ?? 0} 条真实项目`;

  return (
    <div className="product-preview" aria-label="真实项目雷达预览">
      <p className="visually-hidden" role="status" aria-atomic="true">{statusMessage}</p>
      <div className="product-preview-bar">
        <span className="product-preview-mark">标</span>
        <strong>项目雷达</strong>
        <small>{formatGeneratedAt(snapshot?.generatedAt ?? null)}</small>
      </div>

      {state === "loading" && (
        <div className="product-preview-loading" aria-label="正在读取真实扫描数据">
          <div className="preview-skeleton-summary" />
          <div className="preview-skeleton-row" />
          <div className="preview-skeleton-row" />
          <div className="preview-skeleton-row" />
        </div>
      )}

      {state === "error" && (
        <div className="product-preview-message">
          <strong>项目数据暂时无法读取</strong>
          <span>系统不会使用演示项目替代真实数据。</span>
          <a href="./radar/">进入项目雷达</a>
        </div>
      )}

      {state === "empty" && (
        <div className="product-preview-message">
          <strong>等待首次扫描</strong>
          <span>扫描完成后，真实项目会显示在这里。</span>
        </div>
      )}

      {state === "ready" && snapshot && (
        <>
          <div className="product-preview-summary" aria-label="扫描汇总">
            <div><span>7天内紧急</span><strong>{deadlineCounts.urgent}</strong></div>
            <div><span>8–14天提醒</span><strong>{deadlineCounts.reminder}</strong></div>
            <div><span>真实项目</span><strong>{snapshot.projects.length}</strong></div>
          </div>
          <div className="product-preview-list">
            {projects.map((project) => (
              <a key={project.id} href={`./radar/project/?id=${project.id}`} className="product-preview-row">
                <span className={`preview-deadline ${project.deadlineState}`}>
                  <b>{project.deadlineShort}</b>
                  <small>{project.remaining}</small>
                </span>
                <span className="preview-project-copy">
                  <strong>{project.name}</strong>
                  <small>{project.source}</small>
                </span>
                <span className="preview-project-action">查看详情</span>
              </a>
            ))}
          </div>
          <div className="product-preview-foot">
            <span>数据来自公开招标公告</span>
            <a href="./radar/">查看全部项目</a>
          </div>
        </>
      )}
    </div>
  );
}

export function PublicIntro({ initialSnapshot = null }: { initialSnapshot?: PreviewSnapshot | null }) {
  const [fetchedSnapshot, setFetchedSnapshot] = useState<PreviewSnapshot | null>(null);
  const [fetchedPreviewState, setFetchedPreviewState] = useState<PreviewState>("loading");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileNavigationRef = useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const snapshot = initialSnapshot ?? fetchedSnapshot;
  const previewState = initialSnapshot
    ? (initialSnapshot.projects.length ? "ready" : "empty")
    : fetchedPreviewState;

  useEffect(() => {
    if (initialSnapshot) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("./data/radar.json", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("snapshot unavailable");
        const data = await response.json() as PreviewSnapshot;
        if (!Array.isArray(data.projects) || !Array.isArray(data.sources)) throw new Error("invalid snapshot");
        setFetchedSnapshot(data);
        setFetchedPreviewState(data.projects.length ? "ready" : "empty");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setFetchedPreviewState("error");
      }
    })();
    return () => controller.abort();
  }, [initialSnapshot]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileMenuOpen(false);
      window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!mobileNavigationRef.current?.contains(event.target as Node)) setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [mobileMenuOpen]);

  const metrics = [
    [snapshot ? `${snapshot.sources.length} 个` : "--", "已适配真实信息源"],
    [snapshot ? `${snapshot.projects.length} 条` : "--", "本次真实项目记录"],
    [snapshot?.summary ? `${snapshot.summary.newProjectCount} 条` : "--", "今日新增项目"],
    [snapshot?.summary ? `${snapshot.summary.abnormalSourceCount} 个` : "--", "异常信息源"],
  ];

  return (
    <main className="public-site" aria-label="产品介绍">
      <header className="public-nav">
        <a className="public-brand" href="#top" aria-label={`${siteConfig.productName}首页`}>
          <span>标</span>
          <strong>{siteConfig.productName}</strong>
        </a>
        <nav aria-label="网站导航">
          <a href="#how-it-works">工作方式</a>
          <a href="#product-boundary">产品边界</a>
        </nav>
        <div className="public-mobile-navigation" ref={mobileNavigationRef}>
          <button
            ref={mobileMenuButtonRef}
            type="button"
            className="public-mobile-menu-button"
            aria-expanded={mobileMenuOpen}
            aria-controls="public-mobile-menu"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            菜单
          </button>
          <div id="public-mobile-menu" className="public-mobile-menu" hidden={!mobileMenuOpen}>
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>工作方式</a>
            <a href="#product-boundary" onClick={() => setMobileMenuOpen(false)}>产品边界</a>
          </div>
        </div>
        <a className="public-nav-action" href="./radar/">进入项目雷达</a>
      </header>

      <section className="public-hero" id="top">
        <div className="public-hero-copy">
          <p className="public-kicker">监理标讯助手</p>
          <h1>帮监理企业更早发现值得跟进的标讯</h1>
          <p className="public-lead">每天巡检 18 个已接入来源，整理截止时间、项目规模与关键单位，并保留原公告入口供人工核验。</p>
          <div className="public-actions">
            <a className="public-primary" href="./radar/">进入项目雷达</a>
            <a className="public-secondary" href="#how-it-works">了解工作方式</a>
          </div>
        </div>
        <ProductPreview snapshot={snapshot} state={previewState} />
      </section>

      <section className="public-value-strip" aria-label="最新扫描数据">
        {metrics.map(([value, label]) => (
          <div key={label}><strong>{value}</strong><span>{label}</span></div>
        ))}
      </section>

      <section className="public-section workflow-section" id="how-it-works">
        <div className="public-section-heading">
          <h2>系统负责发现和整理，人负责判断与决策</h2>
          <p>把重复的信息巡检交给系统，把最终判断留给专业人员。</p>
        </div>
        <div className="workflow-list">
          {workflow.map(([title, copy]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section boundary-section" id="product-boundary">
        <div>
          <h2>清楚说明边界，才能长期可信</h2>
          <p>标看看是一名勤快的信息助理，不替代投标团队的专业判断。</p>
        </div>
        <ul>
          {boundaries.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    </main>
  );
}

export function PublicFooter() {
  const hasOperator = Boolean(siteConfig.operatorName);
  const hasIcp = Boolean(siteConfig.icpNumber);
  const hasPoliceRecord = Boolean(siteConfig.policeRecordNumber && siteConfig.policeRecordUrl);

  return (
    <footer className="public-footer">
      <div className="public-footer-main">
        <div>
          <span className="public-footer-mark">标</span>
          <strong>{siteConfig.fullName}</strong>
          <p>{siteConfig.tagline}</p>
        </div>
        <div className="public-footer-links">
          <a href="#how-it-works">工作方式</a>
          <a href="#product-boundary">产品边界</a>
          <a href="./radar/">项目雷达</a>
          <a href="#privacy">隐私说明</a>
          <a href="#terms">服务条款</a>
        </div>
      </div>

      <div className="legal-panels">
        <section id="privacy">
          <h2>隐私说明</h2>
          <p>当前版本仅供内部试用，不对外开放注册或收费，也不收集身份证、付款信息等敏感个人信息。公开页面只读取 GitHub Pages 发布的项目与信息源快照，不提供网页新增信息源或云端保存。未来增加外部账号、日志、消息推送或收费能力前，将先更新完整隐私政策并说明处理目的、范围和保存期限。</p>
        </section>
        <section id="terms">
          <h2>服务条款</h2>
          <p>本产品用于整理公开招标信息，可能因来源网站调整、网络异常或文本识别误差出现遗漏与延迟。所有投标判断、报名与文件递交应以招标人发布的原公告和招标文件为准；产品不提供中标承诺，也不替代专业法律或招投标意见。</p>
        </section>
      </div>

      <div className="public-footer-records">
        <span>© 2026 {hasOperator ? siteConfig.operatorName : siteConfig.fullName}</span>
        {hasOperator ? <span>主办单位：{siteConfig.operatorName}</span> : <span className="record-pending">主办单位信息待备案前补充</span>}
        {hasIcp ? <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">{siteConfig.icpNumber}</a> : <span className="record-pending">ICP备案号待审核通过后公示</span>}
        {hasPoliceRecord && <a href={siteConfig.policeRecordUrl} target="_blank" rel="noreferrer">{siteConfig.policeRecordNumber}</a>}
      </div>
    </footer>
  );
}
