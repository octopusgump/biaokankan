import { siteConfig } from "./site-config";

const workflow = [
  ["每天巡检", "每天 07:30 定时访问 5 个已适配的公共资源交易中心。"],
  ["整理关键信息", "提取项目名称、标段、总投资、招标人、代理机构与投标截止时间。"],
  ["生成每日汇总", "从同一份真实项目快照计算今日新增、3 天内截止和运行异常。"],
];

const boundaries = [
  "只整理公开招标信息，不代替原公告与招标文件",
  "识别不确定的内容明确标注“待核验”，不猜测",
  "首版不做投标决策、机会评分和自动投标",
];

export function PublicIntro() {
  return (
    <section className="public-site" aria-label="产品介绍">
      <header className="public-nav">
        <a className="public-brand" href="#top" aria-label={`${siteConfig.productName}首页`}>
          <span>标</span>
          <strong>{siteConfig.productName}</strong>
        </a>
        <nav aria-label="网站导航">
          <a href="#how-it-works">工作方式</a>
          <a href="#product-boundary">产品边界</a>
        </nav>
        <a className="public-nav-action" href="./radar">进入项目雷达</a>
      </header>

      <div className="public-hero" id="top">
        <div className="public-hero-copy">
          <p className="public-kicker">{siteConfig.fullName}</p>
          <h1>帮监理企业更早发现<br />值得跟进的标讯。</h1>
          <p className="public-lead">每天巡检 5 个已接入的公共资源交易网站，把截止时间、项目规模和关键单位整理成一张表。所有项目都能回到自己的原公告核验。</p>
          <div className="public-actions">
            <a className="public-primary" href="./radar">进入项目雷达</a>
            <a className="public-secondary" href="#how-it-works">了解怎么工作</a>
          </div>
        </div>

        <div className="radar-visual" aria-label="招标信息处理示意">
          <div className="radar-visual-head"><span>真实数据闭环</span><small>每日 07:30 扫描</small></div>
          <div className="radar-counts">
            <div><small>已接入来源</small><strong>5</strong><span>公共资源交易中心</span></div>
            <div className="urgent"><small>每日汇总</small><strong>1</strong><span>同日扫描只更新</span></div>
          </div>
          <div className="radar-row"><i /><span><b>项目与公告一一对应</b><small>项目名称、正文与原公告域名共同核验</small></span><em>真实数据</em></div>
          <div className="radar-row"><i className="amber" /><span><b>原公告访问异常</b><small>明确提示后回到该来源的公告列表或主页</small></span><em>可核验</em></div>
          <div className="radar-row"><i /><span><b>字段无法可靠识别</b><small>显示“待核验”，不猜测、不用演示内容替代</small></span><em>克制</em></div>
          <div className="radar-visual-foot">信息最终以原公告和招标文件为准</div>
        </div>
      </div>

      <div className="public-value-strip" aria-label="产品特点">
        <div><strong>5 个</strong><span>已适配真实信息源</span></div>
        <div><strong>一张表</strong><span>看清项目和截止时间</span></div>
        <div><strong>每日一份</strong><span>真实项目汇总数据</span></div>
        <div><strong>原公告直达</strong><span>所有结论可回源核验</span></div>
      </div>

      <section className="public-section" id="how-it-works">
        <p className="public-kicker">工作方式</p>
        <h2>系统负责发现和整理，<br />人负责判断与决策。</h2>
        <div className="workflow-grid">
          {workflow.map(([title, copy]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="boundary-section" id="product-boundary">
        <div>
          <p className="public-kicker">清楚、克制、可核验</p>
          <h2>它不是“自动投标神器”，<br />而是一名勤快的信息助理。</h2>
        </div>
        <ul>
          {boundaries.map((item) => <li key={item}><span>✓</span>{item}</li>)}
        </ul>
      </section>
    </section>
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
          <a href="./radar">项目雷达</a>
          <a href="#privacy">隐私说明</a>
          <a href="#terms">服务条款</a>
        </div>
      </div>

      <div className="legal-panels">
        <section id="privacy">
          <h2>隐私说明</h2>
          <p>当前版本仅供内部试用，不对外开放注册或收费，也不收集身份证、付款信息等敏感个人信息。浏览器本地仅保存管理后台中手动添加的候选信息源配置；清除浏览器数据即可移除。未来增加外部账号、日志、消息推送或收费能力前，将先更新完整隐私政策并说明处理目的、范围和保存期限。</p>
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
