import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collapseDuplicates, deadlinePresentation, extractAnchors, extractProject, isSupervisionText, projectFingerprint, projectIdentity, retainProjectWithLatestLinkState, supervisionScope, withinRetention } from "../crawler/core.mjs";
import { runScan } from "../crawler/scan-run.mjs";
import { excludedTitlePattern, lowEntryIssue, resolveScanEntries, scanSource } from "../crawler/sources.mjs";
import { evaluateSnapshot } from "../scripts/verify-snapshot.mjs";
import { buildSummary } from "../crawler/summary.mjs";
import { SOURCE_DEFINITIONS } from "../crawler/sources.mjs";
import { classifyBidDeadline, documentAcquirePresentation, normalizeProjectTimeFields } from "../shared/project-time.mjs";

const source = {
  name: "开封市公共资源交易中心",
  type: "公共资源交易中心",
  region: "河南省 · 开封市 · 通许县",
};

function extractSentence(sentence, title = "截止时间语义测试监理项目") {
  return extractProject({
    title,
    html: `<h2>${title}</h2><p>${sentence}</p>`,
    url: `https://example.test/${encodeURIComponent(sentence)}`,
    publishedAt: "2026-08-01",
    source,
  }, new Date("2026-08-01T00:00:00+08:00"));
}

test("extracts the PRD sample fields without guessing", () => {
  const html = `
    <h2>通许县宏达大道（人民路-第一污水处理厂）排水管网改造工程-第二标段招标公告</h2>
    <p>发布时间：2026-08-04 19:12:17</p>
    <p>招标人为：通许县城市管理局（通许县城市综合执法局）。</p>
    <p>现委托河南省开兴工程管理咨询有限公司就该项目进行公开招标。</p>
    <p>项目名称：通许县宏达大道（人民路-第一污水处理厂）排水管网改造工程</p>
    <p>投资总额：项目总投资为 6961.37 万元。</p>
    <p>第二标段：施工阶段及缺陷责任期阶段的监理及服务。</p>
    <h3>五、投标截止时间及地点</h3>
    <p>5.1时间：2026年8月25日上午09点30分（北京时间）</p>
    <p>招标代理机构：河南省开兴工程管理咨询有限公司</p>
  `;
  const project = extractProject({
    title: "通许县宏达大道（人民路-第一污水处理厂）排水管网改造工程-第二标段招标公告",
    html,
    url: "http://www.kfsggzyjyw.cn/jzbtxx/81223.jhtml",
    publishedAt: "2026-08-04",
    source,
  }, new Date("2026-08-20T00:00:00+08:00"));

  assert.ok(project);
  assert.equal(project.name, "通许县宏达大道（人民路-第一污水处理厂）排水管网改造工程");
  assert.equal(project.section, "第二标段");
  assert.equal(project.investment, "6,961.37 万元");
  assert.equal(project.deadline, "2026-08-25 09:30");
  assert.equal(project.deadlineState, "urgent");
  assert.equal(project.agency, "河南省开兴工程管理咨询有限公司");
  assert.equal(project.originalUrl, "http://www.kfsggzyjyw.cn/jzbtxx/81223.jhtml");
  assert.equal(project.linkStatus, "available");
});

test("extracts investments when punctuation and approximation qualifiers are chained", () => {
  const cases = [
    ["2.4 本工程总投资：约4650万元。其中施工约4600万元，监理约50万元。", "4,650.00 万元"],
    ["项目总投资: 约 6961.37 万元。", "6,961.37 万元"],
    ["工程总投资约为8000万元。", "8,000.00 万元"],
    ["总投资为约1200万元。", "1,200.00 万元"],
  ];

  for (const [sentence, expected] of cases) {
    const project = extractProject({
      title: "投资格式测试监理项目",
      html: `<h2>投资格式测试监理项目</h2><p>${sentence}</p>`,
      url: `https://example.test/investment/${encodeURIComponent(sentence)}`,
      publishedAt: "2026-08-01",
      source,
    }, new Date("2026-08-01T00:00:00+08:00"));

    assert.ok(project);
    assert.equal(project.investment, expected, sentence);
  }
});

function investmentOf(sentence) {
  const project = extractProject({
    title: "投资召回测试监理项目",
    html: `<h2>投资召回测试监理项目</h2><p>${sentence}</p>`,
    url: `https://example.test/investment-recall/${encodeURIComponent(sentence)}`,
    publishedAt: "2026-08-01",
    source,
  }, new Date("2026-08-01T00:00:00+08:00"));
  assert.ok(project, sentence);
  return project.investment;
}

// 线上快照里 43/62 个项目的「总投资」是待核验，下面每条都取自 public/data/radar.json
// 中真实存在、但旧的两个正则识别不出来的写法。
test("recovers investment from real-world label variants missed by the two legacy patterns", () => {
  const cases = [
    // 政府站把 PDF 转成 HTML 时会在数字中间插空格（同一段里的「202 6 年」是同样成因）。
    ["本建设工程项目总投资约为 5 80 万元，最终金额以经政府相关部门审定的为准。", "580.00 万元"],
    // 「总投资」后面多一个「额」字。
    ["项目总投资额约为 3920.29万元。", "3,920.29 万元"],
    // 亿元计价。
    ["项目地块用地性质为商业用地，总投资约 7.2亿元。", "72,000.00 万元"],
    // 元计价，需要换算成万元。
    ["本项目投资估算为 29037408.97 元。", "2,903.74 万元"],
    // 「工程投资」而不是「总投资」。
    ["工程投资约780万元。", "780.00 万元"],
    // 「建安投资」，旧正则只认「建安费」。
    ["工程建安投资约 51919.3 万元，施工计划工期约 31 个月。", "51,919.30 万元"],
    // 「计划投资」。
    ["2.3项目计划投资： 1947.73万元。", "1,947.73 万元"],
    // 标签与金额之间隔着一小段限定语。
    ["2.5项目投资金额：本项目工程概算为63711.6万元，本项目为费率报价。", "63,711.60 万元"],
    ["2.4 投资预算：本项目暂估工程费用约24167.04万元。", "24,167.04 万元"],
    // 「总投资额度」旧正则读不到，于是退而读括号里的建安费，报出了偏小的数字。
    ["2.4 总投资额度：约 8000 万元（其中建安费约： 6483.53 万元）。", "8,000.00 万元"],
  ];

  for (const [sentence, expected] of cases) {
    assert.equal(investmentOf(sentence), expected, sentence);
  }
});

// 召回率不能靠猜：PRD 要求识别不出来的字段只能显示「待核验」。
test("keeps 待核验 rather than guessing from section-scoped or unrelated amounts", () => {
  const cases = [
    // 金额被限定到某个标段，不是项目总投资。
    "2.2投资金额：一标段：38809958.34元。",
    "2. 3、 预算金额 ： 29037408.97 元 (1标段： 18705299.47 元)",
    // 逗号之后的金额属于另一个字段，不能跨句抓。
    "本项目总投资由上级财政资金安排，投标保证金 5 万元。",
    // 招标控制价、监理服务费都不是总投资。
    "本次招标最高投标限价为 88.66 万元。",
    "监理服务费为 50 万元。",
    // 「投资」后面跟的根本不是金额单位。
    "总投资规模详见招标文件，总建筑面积 41943.94 平方米。",
    "2.4 建设规模：建设用地面积 4272.48 平方米，总建筑面积 41943.94 平方米。",
  ];

  for (const sentence of cases) {
    assert.equal(investmentOf(sentence), "待核验", sentence);
  }
});

test("rejects institution placeholders and strips trailing contact fields", () => {
  const placeholderCases = [
    {
      sentence: "招标人：详见招标文件 招标代理机构：见招标文件。",
      pending: ["招标人", "招标代理机构"],
    },
    {
      sentence: "本项目招标人为：待定。",
      pending: ["招标人"],
    },
    {
      sentence: "招标人：/ 代理机构：无。",
      pending: ["招标人", "招标代理机构"],
    },
  ];

  for (const { sentence, pending } of placeholderCases) {
    const project = extractSentence(sentence);
    for (const field of pending) assert.equal(project.pendingFields.includes(field), true, `${sentence} ${field}`);
    if (pending.includes("招标人")) assert.equal(project.client, "待核验", sentence);
    if (pending.includes("招标代理机构")) assert.equal(project.agency, "待核验", sentence);
  }

  const cleaned = extractSentence("招标人：郑州市城建局 联系电话：0371-12345678 传真：0371-1 邮箱：test@example.test。");
  assert.equal(cleaned.client, "郑州市城建局");
  assert.equal(cleaned.pendingFields.includes("招标人"), false);

  const validInstitutions = [
    ["招标人：兴业银行股份有限公司郑州分行。", "client", "兴业银行股份有限公司郑州分行"],
    ["招标人：尉氏县城市管理局 ( 尉氏县城市综合执法局 )。", "client", "尉氏县城市管理局 ( 尉氏县城市综合执法局 )"],
    ["招标人：尉氏永达国家粮食储备库。", "client", "尉氏永达国家粮食储备库"],
    ["招标代理机构：汇衡昊远项目管理咨询有限公司 联 系 人：王英杰。", "agency", "汇衡昊远项目管理咨询有限公司"],
  ];
  for (const [sentence, field, expected] of validInstitutions) {
    assert.equal(extractSentence(sentence)[field], expected, sentence);
  }

  const polluted = extractSentence("招标代理机构：河南中晟工程管理有限公司 项目。");
  assert.equal(polluted.agency, "待核验");
  assert.equal(polluted.pendingFields.includes("招标代理机构"), true);
});

test("prefers the original announcement body over its list summary", () => {
  const title = "原阳县原兴路、文岩街、惠民街、新一路雨污水管网及新一路污水提升泵站新建工程1标段、2标段、3标段";
  const listText = `[河南省·新乡市·新乡市] [公开招标] [监理] ${title} [正在报名]`;
  const html = `
    <!-- <p>项目名称：xx宁东能源化工基地管理委员会宁东基地土地评估机构比选入库采购项目</p> -->
    <h2>[河南省·新乡市·新乡市] [公开招标] [监理] ${title}</h2>
    <p>本项目招标人为：原阳县住房建设和城市管理局。</p>
    <p>5.1、投标文件递交的截止及开标时间：2026年09月14日 9 时 00 分。</p>
    <p>招标代理机构：河南众志鑫荣项目管理有限公司</p>
  `;
  const project = extractProject({
    title,
    html,
    text: listText,
    url: "https://ggzy.xinxiang.gov.cn/jyxx/089003/089003001/20260819/fcab3f7a-c142-4e7d-8897-02ffe0bdeac5.html",
    publishedAt: "2026-08-19",
    source: {
      name: "新乡市公共资源交易中心",
      type: "公共资源交易中心",
      region: "河南省 · 新乡市",
    },
  }, new Date("2026-08-21T00:00:00+08:00"));

  assert.ok(project);
  assert.equal(project.deadline, "2026-09-14 09:00");
  assert.equal(project.client, "原阳县住房建设和城市管理局");
  assert.equal(project.agency, "河南众志鑫荣项目管理有限公司");
  assert.equal(project.pendingFields?.includes("投标截止时间"), false);
});

test("scores category evidence only from the title and project overview", () => {
  const title = "渑池至淅川高速公路洛宁至嵩县段施工监理及试验检测招标公告";
  const project = extractProject({
    title,
    html: `
      <h2>${title}</h2>
      <p>项目概况：本项目为高速公路交通工程，包含公路路基、互通及服务区施工监理。</p>
      <p>投标截止时间：2026年8月24日09时30分。</p>
      <h3>环境保护通用要求</h3>
      <p>施工须执行水土保持、河道保护、水库周边管理要求。</p>
    `,
    url: "https://example.test/highway-category",
    publishedAt: "2026-08-01",
    source,
  }, new Date("2026-08-01T00:00:00+08:00"));

  assert.equal(project.category, "交通工程监理");
});

test("extracts numbered sections whether or not they start with 第", () => {
  const cases = [
    ["滑县智泊停车场建设项目（医院地下停车场）二标段监理招标公告", "二标段"],
    ["水利枢纽工程SLZYQJL-1标段施工监理招标公告", "1标段"],
    ["某水库除险加固工程第三标段监理招标公告", "第三标段"],
  ];

  for (const [title, expected] of cases) {
    const project = extractProject({
      title,
      html: `<h2>${title}</h2><p>项目概况：本标段提供施工监理服务。</p>`,
      url: `https://example.test/section/${encodeURIComponent(title)}`,
      publishedAt: "2026-08-01",
      source,
    }, new Date("2026-08-01T00:00:00+08:00"));
    assert.equal(project.section, expected, title);
  }
});

test("does not infer a numbered supervision section from unrelated body headings", () => {
  const title = "2026年上蔡县无量寺乡猪场提升改造项目监理标段、设计采购施工总承包（EPC）标段";
  const project = extractProject({
    title,
    html: `<h2>${title}</h2><p>1标段：设计采购施工总承包。</p><p>2标段：设备采购。</p><p>本公告对应监理标段。</p>`,
    url: "https://example.test/section/body-heading-regression",
    publishedAt: "2026-08-01",
    source,
  }, new Date("2026-08-01T00:00:00+08:00"));

  assert.equal(project.section, "监理标段");
});

test("selects the section declared as supervision instead of an EPC section mentioning supervision management", () => {
  const title = "长葛市农村自来水提升项目工程总承包（EPC）及监理项目招标公告";
  const project = extractProject({
    title,
    html: `
      <h2>${title}</h2>
      <p>第一标段：工程总承包（EPC）标段，并对工程项目进行监理管理管控。</p>
      <p>第二标段：监理。</p>
    `,
    url: "https://example.test/section/epc-supervision-management",
    publishedAt: "2026-08-01",
    source,
  }, new Date("2026-08-01T00:00:00+08:00"));

  assert.equal(project.section, "第二标段");
});

test("normalizes fragmented dates and common deadline label variants", () => {
  const cases = [
    ["投标文件递交的截止时间（投标截止时间，下同）为 20 26 年 9 月 9 日上午 09 时 00 分。", "2026-09-09 09:00"],
    ["投标文件上传的截止时间（投标截止时间，下同）为2026年8月24日09时30分。", "2026-08-24 09:30"],
    ["五、投标文件的递交 5.1 时间：2026 年 09 月 01 日上午 9 时 30 分。", "2026-09-01 09:30"],
    ["投标文件的上传/递交截止时间（投标截止时间：202 6 年 07 月 28 日 9时00分）。", "2026-07-28 09:00"],
    ["投标文件上传的截止时间为2026年8月1 1日9时00分。", "2026-08-11 09:00"],
  ];

  for (const [sentence, expected] of cases) {
    const project = extractProject({
      title: "[监理]日期格式测试工程",
      html: `<h2>[监理]日期格式测试工程</h2><p>${sentence}</p>`,
      url: `https://example.test/${encodeURIComponent(sentence)}`,
      publishedAt: "2026-07-01",
      source: {
        name: "日期格式测试来源",
        type: "公共资源交易中心",
        region: "河南省",
      },
    }, new Date("2026-07-01T00:00:00+08:00"));

    assert.ok(project);
    assert.equal(project.deadline, expected, sentence);
  }
});

test("uses one complete label set for confirmed and document-required deadlines", () => {
  const confirmedCases = [
    "投标文件提交截止时间：2026年8月24日09时30分。",
    "投标文件上传截止时间：2026年8月24日09时30分。",
  ];
  for (const sentence of confirmedCases) {
    const project = extractSentence(sentence);
    assert.equal(project.bidDeadline, "2026-08-24 09:30", sentence);
    assert.equal(project.bidDeadlineStatus, "confirmed", sentence);
  }

  const documentRequiredCases = [
    "响应文件提交截止时间：详见招标文件。",
    "响应文件递交截止时间：见招标文件。",
  ];
  for (const sentence of documentRequiredCases) {
    const project = extractSentence(sentence);
    assert.equal(project.bidDeadline, null, sentence);
    assert.equal(project.bidDeadlineStatus, "document_required", sentence);
  }
});

test("explicit document-required deadlines override every nearby date", () => {
  const cases = [
    "投标文件递交截止时间：详见招标文件（不早于2026年8月24日09时00分）。",
    "投标截止时间详见招标文件，招标文件发售至2026年8月10日。",
  ];

  for (const sentence of cases) {
    const project = extractSentence(sentence);
    assert.equal(project.bidDeadline, null, sentence);
    assert.equal(project.bidDeadlineStatus, "document_required", sentence);
    assert.match(project.bidDeadlineEvidence, /见招标文件/, sentence);
    assert.equal(project.pendingFields.includes("投标截止时间"), true, sentence);
  }
});

test("keeps an explicit deadline when only its following location is in the tender document", () => {
  const cases = [
    ["7.2投标文件的上传/递交截止时间（投标截止时间: 2026年07月24日 9时00分）和地点见招标文件。", "2026-07-24 09:00"],
    ["7.2投标文件的上传/递交截止时间为2026年8月11日 9时00分（北京时间），地点详见招标文件。", "2026-08-11 09:00"],
  ];

  for (const [sentence, expected] of cases) {
    const project = extractProject({
      title: "截止时间与递交地点语义测试监理项目",
      html: `<h2>截止时间与递交地点语义测试监理项目</h2><p>${sentence}</p>`,
      url: `https://example.test/deadline-location/${encodeURIComponent(sentence)}`,
      publishedAt: "2026-07-01",
      source,
    }, new Date("2026-07-01T00:00:00+08:00"));
    assert.equal(project.bidDeadline, expected, sentence);
    assert.equal(project.bidDeadlineStatus, "confirmed", sentence);
  }
});

test("P0-1 distinguishes earliest, latest, and nearest deadline strategies", () => {
  const sentence = "报名自2026年8月3日开始，投标文件递交截止时间为2026年8月24日09时30分，补充文件于2026年8月30日发布。";
  const project = extractSentence(sentence);
  assert.equal(project.bidDeadline, "2026-08-24 09:30");
  assert.equal(project.bidDeadlineStatus, "confirmed");
});

test("resolves deadline ranges and rejects ambiguous date alternatives", () => {
  const cases = [
    ["投标截止时间：自2026年8月5日起至2026年8月24日09时30分止。", "2026-08-24 09:30", "confirmed"],
    ["投标文件递交截止时间为2026年8月24日09时30分，开标时间2026年8月24日09时30分，报名自2026年8月3日开始。", "2026-08-24 09:30", "confirmed"],
    ["5.1 投标文件上传的截止时间：2026年08月24日09时30分（其中2026年08月10日前完成注册）。", "2026-08-24 09:30", "confirmed"],
    ["投标截止时间：2026年8月24日09时30分或2026年8月25日09时30分，以交易系统显示为准。", null, "pending"],
  ];

  for (const [sentence, deadline, status] of cases) {
    const project = extractSentence(sentence);
    assert.equal(project.bidDeadline, deadline, sentence);
    assert.equal(project.bidDeadlineStatus, status, sentence);
  }
});

test("does not treat a later document-download date as the bid deadline", () => {
  const project = extractProject({
    title: "[监理]截止时间邻近性测试工程",
    html: `
      <h2>[监理]截止时间邻近性测试工程</h2>
      <p>查询信息的截止时间为投标截止时间。其他资格要求、证明材料及平台查询结果均应真实有效。</p>
      <p>4.招标文件的获取：投标人于2026年7月31日至2026年8月7日在网上下载招标文件。</p>
      <p>5.1 投标文件上传的截止时间（投标截止时间，下同）为2026年8月24日09时30分。</p>
    `,
    url: "https://example.test/deadline-proximity",
    publishedAt: "2026-07-31",
    source: {
      name: "截止时间邻近性测试来源",
      type: "公共资源交易中心",
      region: "河南省",
    },
  }, new Date("2026-07-31T00:00:00+08:00"));

  assert.ok(project);
  assert.equal(project.deadline, "2026-08-24 09:30");
  assert.equal(project.bidDeadline, "2026-08-24 09:30");
  assert.equal(project.bidDeadlineStatus, "confirmed");
  assert.equal(project.documentAcquireStart, "2026-07-31 00:00");
  assert.equal(project.documentAcquireDeadline, "2026-08-07 00:00");
});

test("keeps the two reviewed document-acquisition windows separate from bid deadlines", () => {
  const samples = [
    {
      name: "西平县乡村振兴肉牛产业融合发展建设项目",
      url: "https://ggzy.zhumadian.gov.cn/TPFront/InfoDetail/?InfoID=23ea2508-bafc-47ec-a099-4f7c5154fc3b&CategoryNum=003001001002",
      sentence: "招标文件获取：2026年06月16日8：00时至2026年06月23日18:00时。",
      start: "2026-06-16 08:00",
      end: "2026-06-23 18:00",
    },
    {
      name: "正阳县慎南路（花都大道—正陡路）道路工程项目",
      url: "https://ggzy.zhumadian.gov.cn/TPFront/InfoDetail/?InfoID=028d3f52-f512-4175-88a4-f74c10daa0f7&CategoryNum=003001001005",
      sentence: "招标文件的获取时间：2026年5月14日8：00时至2026年5月20日18:00时。",
      start: "2026-05-14 08:00",
      end: "2026-05-20 18:00",
    },
  ];

  for (const sample of samples) {
    const project = extractProject({
      title: `${sample.name}监理招标公告`,
      html: `<h2>${sample.name}监理招标公告</h2><p>${sample.sentence}</p><p>投标截止时间及地点：详见招标文件。</p>`,
      url: sample.url,
      publishedAt: "2026-05-01",
      source: {
        name: "驻马店市公共资源交易中心",
        type: "公共资源交易中心",
        region: "河南省 · 驻马店市",
      },
    }, new Date("2026-08-21T00:00:00+08:00"));

    assert.ok(project);
    assert.equal(project.bidDeadline, null, sample.name);
    assert.equal(project.deadline, null, sample.name);
    assert.equal(project.bidDeadlineStatus, "document_required", sample.name);
    assert.match(project.bidDeadlineEvidence, /见招标文件/, sample.name);
    assert.equal(project.bidDeadlineVerifiedAt, null, sample.name);
    assert.equal(project.documentAcquireStart, sample.start, sample.name);
    assert.equal(project.documentAcquireDeadline, sample.end, sample.name);
    assert.equal(project.deadlineState, "pending", sample.name);
    assert.equal(project.remaining, "公告注明：见招标文件", sample.name);
  }
});

test("uses opening time only when the announcement explicitly equates it with the bid deadline", () => {
  const create = (sentence) => extractProject({
    title: "开标时间语义测试监理项目",
    html: `<h2>开标时间语义测试监理项目</h2><p>${sentence}</p>`,
    url: `https://example.test/${encodeURIComponent(sentence)}`,
    publishedAt: "2026-08-01",
    source,
  }, new Date("2026-08-01T00:00:00+08:00"));

  const openingOnly = create("开标时间：2026年8月25日09时30分。");
  assert.equal(openingOnly.bidDeadline, null);
  assert.equal(openingOnly.bidDeadlineStatus, "pending");

  const explicitlyEqual = create("开标时间：2026年8月25日09时30分，与投标截止时间相同。");
  assert.equal(explicitlyEqual.bidDeadline, "2026-08-25 09:30");
  assert.equal(explicitlyEqual.bidDeadlineStatus, "confirmed");
});

test("uses the eighteen confirmed public-resource sources", () => {
  assert.deepEqual(SOURCE_DEFINITIONS.map((item) => item.name), [
    "河南省公共资源交易中心",
    "郑州市公共资源交易中心",
    "开封市公共资源交易中心",
    "洛阳市公共资源交易中心",
    "平顶山市公共资源交易中心",
    "安阳市公共资源交易中心",
    "鹤壁市公共资源交易中心",
    "新乡市公共资源交易中心",
    "焦作市公共资源交易中心",
    "许昌市公共资源交易中心",
    "漯河市公共资源交易中心",
    "三门峡市公共资源交易中心",
    "南阳市公共资源交易中心",
    "商丘市公共资源交易中心",
    "信阳市公共资源交易中心",
    "驻马店市公共资源交易中心",
    "郑州航空港经济综合实验区公共资源交易中心",
    "济源市公共资源交易中心",
  ]);
  assert.equal(SOURCE_DEFINITIONS.some((item) => /政府采购网|河南兴达/.test(item.name)), false);
  assert.equal(new Set(SOURCE_DEFINITIONS.map((item) => item.entry)).size, 18);
});

test("deadline thresholds match the product rules", () => {
  const now = new Date("2026-08-20T09:30:00+08:00");
  assert.equal(deadlinePresentation("2026-08-21 09:30", now).deadlineState, "urgent");
  assert.equal(deadlinePresentation("2026-08-28 09:30", now).deadlineState, "reminder");
  assert.equal(deadlinePresentation("2026-09-04 09:30", now).deadlineState, "normal");
  assert.equal(deadlinePresentation("2026-08-19 09:30", now).deadlineState, "expired");
  assert.equal(deadlinePresentation(null, now).deadlineState, "pending");
  assert.equal(deadlinePresentation("2026-08-19 09:30", now, "document_required").deadlineState, "pending");
  assert.equal(deadlinePresentation("2026-08-19 09:30", now, "document_required").remaining, "公告注明：见招标文件");

  const sevenDayDeadline = "2026-08-27 09:30";
  assert.equal(classifyBidDeadline(sevenDayDeadline, "confirmed", now).deadlineState, "urgent");
  assert.equal(classifyBidDeadline(sevenDayDeadline, "confirmed", new Date(now.getTime() - 1)).deadlineState, "reminder");
  const fourteenDayDeadline = "2026-09-03 09:30";
  assert.equal(classifyBidDeadline(fourteenDayDeadline, "confirmed", now).deadlineState, "reminder");
  assert.equal(classifyBidDeadline(fourteenDayDeadline, "confirmed", new Date(now.getTime() - 1)).deadlineState, "normal");
});

test("historical deadline fields migrate without breaking existing projects", () => {
  const migrated = normalizeProjectTimeFields({
    deadline: "2026-08-25 09:30",
    lastVerifiedAt: "2026-08-20 07:30",
  }, new Date("2026-08-20T00:00:00+08:00"));
  assert.equal(migrated.bidDeadline, "2026-08-25 09:30");
  assert.equal(migrated.bidDeadlineStatus, "confirmed");
  assert.equal(migrated.deadline, migrated.bidDeadline);
  assert.match(migrated.bidDeadlineEvidence, /历史 deadline 字段兼容迁移/);
  assert.equal(migrated.bidDeadlineVerifiedAt, "2026-08-20 07:30");
});

test("document acquisition status is independent from bid deadline state", () => {
  assert.equal(documentAcquirePresentation("2026-08-22 08:00", "2026-08-25 18:00", new Date("2026-08-21T00:00:00+08:00")).label, "未开始");
  assert.equal(documentAcquirePresentation("2026-08-20 08:00", "2026-08-25 18:00", new Date("2026-08-21T00:00:00+08:00")).label, "获取中");
  assert.equal(documentAcquirePresentation("2026-08-10 08:00", "2026-08-20 18:00", new Date("2026-08-21T00:00:00+08:00")).label, "已结束");
});

test("daily summary only counts confirmed bid deadlines", () => {
  const now = new Date("2026-08-20T09:30:00+08:00");
  const projects = [
    { id: 1, name: "已确认", section: "监理标段", bidDeadline: "2026-08-21 09:30", bidDeadlineStatus: "confirmed", documentAcquireDeadline: null, discoveredAt: "2026-08-20 08:00" },
    { id: 2, name: "见招标文件", section: "监理标段", bidDeadline: null, bidDeadlineStatus: "document_required", documentAcquireDeadline: "2026-08-21 09:30", discoveredAt: "2026-08-20 08:00" },
    { id: 3, name: "未确认", section: "监理标段", bidDeadline: "2026-08-22 09:30", bidDeadlineStatus: "pending", documentAcquireDeadline: null, discoveredAt: "2026-08-20 08:00" },
    { id: 4, name: "七天边界", section: "监理标段", bidDeadline: "2026-08-27 09:30", bidDeadlineStatus: "confirmed", documentAcquireDeadline: null, discoveredAt: "2026-08-19 08:00" },
    { id: 5, name: "八天提醒", section: "监理标段", bidDeadline: "2026-08-28 09:30", bidDeadlineStatus: "confirmed", documentAcquireDeadline: null, discoveredAt: "2026-08-19 08:00" },
    { id: 6, name: "十四天边界", section: "监理标段", bidDeadline: "2026-09-03 09:30", bidDeadlineStatus: "confirmed", documentAcquireDeadline: null, discoveredAt: "2026-08-19 08:00" },
    { id: 7, name: "十四天以外", section: "监理标段", bidDeadline: "2026-09-03 09:31", bidDeadlineStatus: "confirmed", documentAcquireDeadline: null, discoveredAt: "2026-08-19 08:00" },
  ];
  const summary = buildSummary(projects, {
    date: "2026-08-20",
    finishedAt: "2026-08-20 09:30",
    sourceCount: 18,
    succeededSources: 18,
  }, now);

  assert.equal(summary.summaryVersion, 2);
  assert.equal(summary.generatedAt, now.toISOString());
  assert.equal(summary.urgentWithin7DaysCount, 2);
  assert.equal(summary.reminderFrom8To14DaysCount, 2);
  assert.deepEqual(summary.urgentProjects.map((project) => project.projectId), [1, 4]);
  assert.deepEqual(summary.reminderProjects.map((project) => project.projectId), [5, 6]);
  assert.equal(Object.hasOwn(summary, "expiringWithin3DaysCount"), false);
});

test("retained projects never keep a stale available-link claim after a failed verification", () => {
  const project = {
    originalUrl: "https://example.test/project/1",
    linkStatus: "available",
    lastVerifiedAt: "2026-08-19 07:30",
  };
  const retained = retainProjectWithLatestLinkState(project, {
    result: "失败",
    listAvailable: false,
    homeAvailable: false,
    lastVerifiedAt: "2026-08-20 07:30",
    lastError: "公告列表返回 HTTP 503",
  });

  assert.equal(retained.originalUrl, project.originalUrl);
  assert.equal(retained.linkStatus, "source_unavailable");
  assert.equal(retained.lastVerifiedAt, "2026-08-20 07:30");
  assert.equal(retained.linkFailureReason, "公告列表返回 HTTP 503");
});

test("only supervision opportunities pass the semantic gate", () => {
  assert.equal(isSupervisionText("排水管网工程第二标段施工阶段全过程监理服务"), true);
  assert.equal(isSupervisionText("办公设备采购公开招标公告"), false);
});

test("extracts and resolves list links deterministically", () => {
  const anchors = extractAnchors('<li><a href="/jzbtxx/81223.jhtml" title="监理公告"><span>监理公告</span><em>2026-08-04</em></a></li>', "https://example.test/list/");
  assert.deepEqual(anchors, [{ url: "https://example.test/jzbtxx/81223.jhtml", title: "监理公告", text: "监理公告 2026-08-04" }]);
});

test("a lot explicitly scoped to other work never passes the supervision gate", () => {
  const build = (title, body) => extractProject({
    title,
    html: `<p>${body}</p><p>招标人：某某单位</p>`,
    url: `https://www.kfsggzyjyw.cn/jzbqx/${title.length}.jhtml`,
    publishedAt: "2026-08-17",
    source,
  }, new Date("2026-08-21T00:00:00+08:00"));

  assert.equal(build("某某项目EPC总承包及监理（第一标段：EPC总承包）招标公告", "招标范围：设计、采购、施工。"), null);

  const supervision = build("某某项目EPC总承包及监理（第二标段：监理）招标公告", "招标范围：施工阶段监理服务。");
  assert.ok(supervision);
  assert.equal(supervision.supervisionConfidence, "explicit");
  assert.ok(!supervision.pendingFields?.includes("监理标段范围"));

  // 正文只写了"标段划分里有一个监理标段"，无法证明本条就是那个标段。
  const ambiguous = build("某某光伏项目第一标段招标公告", "标段划分：本项目共三个标段，其中工程总承包一个标段、监理一个标段。");
  assert.ok(ambiguous);
  assert.equal(ambiguous.supervisionConfidence, "loose");
  assert.equal(ambiguous.ambiguousSection, true);
  assert.ok(ambiguous.pendingFields.includes("监理标段范围"));
});

test("the supervision gate never drops a monitoring notice on body text alone", () => {
  // 监理公告的招标范围经常在描述"被监理的施工内容"，不能据此排除。
  const scope = supervisionScope(
    "原阳县雨污水管网及污水提升泵站新建工程1标段、2标段、3标段",
    "[公开招标] [监理] 招标范围： 1标段：工程量清单及施工图纸所含的全部施工工作内容；",
  );
  assert.equal(scope.included, true);
  assert.equal(scope.confidence, "loose");
});

test("announcements of the same project collapse into one row", () => {
  const lot = (section, url, extra = {}) => ({
    name: "杞县铝型材产业基地标准化厂房 20MWP 屋顶分布式光伏项目",
    section,
    originalTitle: `杞县铝型材产业基地标准化厂房20MWP屋顶分布式光伏项目${section}招标公告`,
    tenderNumber: "HNGKZB-2026-056",
    supervisionConfidence: "loose",
    ambiguousSection: true,
    publishedAt: "2026-08-17 00:00",
    url,
    ...extra,
  });
  const collapsed = collapseDuplicates([
    lot("第一标段", "https://www.kfsggzyjyw.cn/jzbqx/81932.jhtml"),
    lot("第二标段", "https://www.kfsggzyjyw.cn/jzbqx/81933.jhtml"),
    lot("第三标段", "https://www.kfsggzyjyw.cn/jzbqx/81934.jhtml"),
  ], new Date("2026-08-21T00:00:00+08:00"));

  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].section, "标段待核验");
  assert.equal(collapsed[0].relatedAnnouncements.length, 2);
  assert.equal(collapsed[0].related.type, "同项目多标段");

  // 已确认的监理标段存在时，其余标段不再单独占一行。
  const withConfirmed = collapseDuplicates([
    lot("第一标段", "https://www.kfsggzyjyw.cn/jzbqx/81932.jhtml"),
    lot("第二标段", "https://www.kfsggzyjyw.cn/jzbqx/81933.jhtml", { supervisionConfidence: "explicit", ambiguousSection: false }),
  ], new Date("2026-08-21T00:00:00+08:00"));
  assert.equal(withConfirmed.length, 1);
  assert.equal(withConfirmed[0].section, "第二标段");
  assert.equal(withConfirmed[0].related.type, "同项目其他标段");
});

test("a re-tendered lot keeps the newest announcement and links the earlier one", () => {
  const announcement = (url, publishedAt) => ({
    name: "郑州航空工业管理学院航空港校区一期建设工程室外配套施工监理项目",
    section: "监理标段",
    originalTitle: "郑州航空工业管理学院航空港校区一期建设工程室外配套施工监理项目招标公告",
    tenderNumber: "豫财招标采购-2026-866",
    supervisionConfidence: "explicit",
    ambiguousSection: false,
    publishedAt,
    url,
  });
  const collapsed = collapseDuplicates([
    announcement("https://hnsggzyjy.henan.gov.cn/jyxx/002001/002001001/20260722/first.html", "2026-07-22 09:53"),
    announcement("https://hnsggzyjy.henan.gov.cn/jyxx/002001/002001001/20260814/second.html", "2026-08-14 11:28"),
  ], new Date("2026-08-21T00:00:00+08:00"));

  assert.equal(collapsed.length, 1);
  assert.match(collapsed[0].url, /second\.html$/);
  assert.equal(collapsed[0].related.type, "二次招标");
  assert.equal(collapsed[0].relatedAnnouncements.length, 1);
});

test("field capture stops at the next label instead of truncating mid-word", () => {
  const build = (body) => extractProject({
    title: "某某工程监理标段招标公告",
    html: body,
    url: "https://www.kfsggzyjyw.cn/jzbqx/70001.jhtml",
    publishedAt: "2026-08-17",
    source,
  }, new Date("2026-08-21T00:00:00+08:00"));

  const numbered = build("<p>（ 1 ）项目名称：浉河区林下中草药经济建设项目 EPC 总承包及监理 （ 2 ）招标编号： A3205820001002866 （ 3 ）建设地点：河南省信阳市。</p>");
  assert.equal(numbered.name, "浉河区林下中草药经济建设项目 EPC 总承包及监理");

  const listed = build("<p>招标人：卢氏县宏图实业有限公司 2 . 项目名称： 卢氏县老灌河上游历史遗留废渣综合整治 EPC项目监理</p>");
  assert.equal(listed.client, "卢氏县宏图实业有限公司");

  // 找不到字段边界的超长值必须落到"待核验"，不能返回半个词。
  const runaway = build(`<p>招标人：${"某某单位与".repeat(30)}</p>`);
  assert.equal(runaway.client, "待核验");
  assert.ok(runaway.pendingFields.includes("招标人"));
});

test("projects need a computable age to stay in the snapshot", () => {
  const now = new Date("2026-08-21T00:00:00+08:00");
  assert.equal(withinRetention({ publishedAt: "2026-08-01 09:00", discoveredAt: "2026-08-01 09:00" }, 90, now), true);
  assert.equal(withinRetention({ publishedAt: "2026-01-01 09:00", discoveredAt: "2026-01-01 09:00" }, 90, now), false);
  // 发布时间识别不出来时，用首次发现时间兜底，而不是永久保留。
  assert.equal(withinRetention({ publishedAt: "待核验", discoveredAt: "2026-08-20 07:30" }, 90, now), true);
  assert.equal(withinRetention({ publishedAt: "待核验", discoveredAt: "待核验" }, 90, now), false);
});

test("an unreadable announcement date is reported instead of silently accepted", () => {
  const project = extractProject({
    title: "某某工程监理标段招标公告",
    html: "<p>招标范围：施工阶段监理服务。</p><p>招标人：某某单位</p>",
    url: "https://www.kfsggzyjyw.cn/jzbqx/70002.jhtml",
    publishedAt: "",
    source,
  }, new Date("2026-08-21T00:00:00+08:00"));
  assert.equal(project.publishedAt, "待核验");
  assert.ok(project.pendingFields.includes("公告发布时间"));
});

test("published snapshot stays live, source-bound and link-unique", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../public/data/radar.json", import.meta.url), "utf8"));
  const configured = new Map(SOURCE_DEFINITIONS.map((source) => [source.name, new URL(source.entry).hostname.replace(/^www\./, "")]));
  assert.equal(snapshot.mode, "live");
  assert.deepEqual(snapshot.sources.map((source) => source.name), SOURCE_DEFINITIONS.map((source) => source.name));
  assert.equal(new Set(snapshot.projects.map((project) => project.originalUrl)).size, snapshot.projects.length);
  assert.equal(new Set(snapshot.projects.map(projectIdentity)).size, snapshot.projects.length, "同一项目编号与标段只能出现一次");
  assert.equal(snapshot.projects.some((project) => /政府采购网|河南兴达/.test(project.source)), false);
  for (const project of snapshot.projects) {
    assert.equal(new URL(project.originalUrl).hostname.replace(/^www\./, ""), configured.get(project.source));
    const scope = supervisionScope(project.originalTitle, project.summary);
    assert.ok(scope.included || scope.confidence !== "explicit", `${project.originalTitle} 的标题已写明本标段不是监理标段`);
    assert.ok(["explicit", "scoped", "loose"].includes(project.supervisionConfidence), project.originalTitle);
    assert.ok(["confirmed", "document_required", "pending"].includes(project.bidDeadlineStatus));
    assert.equal(project.deadline, project.bidDeadline);
    assert.ok(Object.hasOwn(project, "bidDeadlineEvidence"));
    assert.ok(Object.hasOwn(project, "bidDeadlineVerifiedAt"));
    assert.ok(Object.hasOwn(project, "documentAcquireStart"));
    assert.ok(Object.hasOwn(project, "documentAcquireDeadline"));
  }
  assert.equal(snapshot.summary.newProjectCount, snapshot.projects.filter((project) => project.createdToday).length);
  assert.equal(snapshot.schemaVersion, 4);
  assert.equal(snapshot.storage.contractVersion, 4);
  assert.equal(snapshot.summary.summaryVersion, 2);
  assert.equal(Object.hasOwn(snapshot.summary, "expiringWithin3DaysCount"), false);
  assert.equal(snapshot.summaries.every((summary) => [1, 2].includes(summary.summaryVersion)), true);
  for (const summary of snapshot.summaries.filter((item) => item.summaryVersion === 2)) {
    assert.equal(Object.hasOwn(summary, "expiringWithin3DaysCount"), false);
  }
  for (const summaryProject of [...snapshot.summary.urgentProjects, ...snapshot.summary.reminderProjects]) {
    const project = snapshot.projects.find((item) => item.id === summaryProject.projectId);
    assert.equal(project?.bidDeadlineStatus, "confirmed");
    assert.equal(summaryProject.bidDeadline, project?.bidDeadline);
  }

  // 不再断言某几条线上公告必须存在。它们会随来源下架或 90 天保留期到期而消失，
  // 届时失败的是测试而不是产品，而这两个测试位于 pnpm build:pages 的部署链路上。
  // 改为断言规则：快照中出现的每一条 document_required 项目都必须满足
  // “投标截止时间与招标文件获取窗口分离”的契约。
  // 这两条公告本身的完整字段由本文件的 fixture 单测
  // "keeps the two reviewed document-acquisition windows separate from bid deadlines" 覆盖，不依赖线上数据。
  const documentRequired = snapshot.projects.filter((project) => project.bidDeadlineStatus === "document_required");
  for (const project of documentRequired) {
    assert.equal(project.bidDeadline, null, project.name);
    assert.equal(project.deadline, null, project.name);
    assert.match(project.bidDeadlineEvidence, /(?:详?见|以)[^。；;]{0,40}招标文件/, project.name);
    assert.equal(project.bidDeadlineVerifiedAt, null, project.name);
    assert.equal(project.deadlineState, "pending", project.name);
  }
});

// ---------------------------------------------------------------------------
// 爬虫韧性：runScan 流水线、来源静默失效、截止时间静默降级、发布门禁
// ---------------------------------------------------------------------------

const fixtureSource = {
  id: 99,
  key: "fixture",
  name: "夹具市公共资源交易中心",
  entry: "https://fixture.test/",
  listEntry: "https://fixture.test/list",
  region: "河南省 · 夹具市",
  type: "公共资源交易中心",
  adapter: "generic-html",
};

const RUN_STARTED = new Date("2026-08-05T09:00:00+08:00");
const RUN_FINISHED = new Date("2026-08-05T09:01:00+08:00");

function fixtureProject({ id = 1, deadlineSentence = "投标截止时间：2026年8月24日09时30分。" } = {}) {
  const title = `夹具县第${id}排水管网改造工程监理标段招标公告`;
  return extractProject({
    title,
    html: `<h2>${title}</h2><p>项目总投资为 1000 万元。</p><p>${deadlineSentence}</p>`,
    url: `https://fixture.test/notice/${id}`,
    publishedAt: "2026-08-01",
    source: fixtureSource,
  }, RUN_STARTED);
}

function previousSnapshot(projects, extra = {}) {
  return {
    projects,
    sources: [{ ...fixtureSource, result: "成功", found: projects.length, read: projects.length }],
    summaries: [],
    runs: [],
    errors: [],
    ...extra,
  };
}

function memoryStore(previous) {
  return {
    saved: null,
    async load() { return previous; },
    async save(snapshot) { this.saved = snapshot; },
  };
}

function stubScan(value) {
  return async () => (value instanceof Error ? Promise.reject(value) : {
    read: 0,
    projects: [],
    issues: [],
    listAvailable: true,
    homeAvailable: null,
    ...value,
  });
}

async function scan({ previous, value, sources = [fixtureSource] }) {
  const store = memoryStore(previous);
  const result = await runScan({
    sourceDefinitions: sources,
    scanSource: stubScan(value),
    store,
    startedAt: RUN_STARTED,
    finishedAt: RUN_FINISHED,
  });
  return { ...result, store };
}

// P3-20：runScan 必须能在不联网、不碰 public/data/radar.json 的情况下跑完整条流水线。
test("runScan drives the whole pipeline through injected dependencies", async () => {
  const fresh = fixtureProject({ id: 1 });
  const { snapshot, store, run } = await scan({
    previous: previousSnapshot([]),
    value: { read: 1, projects: [fresh] },
  });

  assert.equal(snapshot.projects.length, 1);
  assert.equal(snapshot.projects[0].url, "https://fixture.test/notice/1");
  assert.equal(run.newProjects, 1);
  assert.equal(run.status, "成功");
  assert.equal(run.sourceCount, 1);
  // 快照必须真的落盘到注入的 store，而不是只在内存里算一遍。
  assert.equal(store.saved?.projects.length, 1);
  assert.equal(store.saved?.schemaVersion, 4);
});

// B-1：适配器不抛错但读到 0 条时，旧实现记「成功」并把该来源的历史项目全部删光。
test("a source that silently reads zero entries is reported as 部分失败 and keeps its history", async () => {
  const old = { ...fixtureProject({ id: 1 }), source: fixtureSource.name };
  const { snapshot, run } = await scan({
    previous: previousSnapshot([old]),
    value: { read: 0, projects: [] },
  });

  assert.equal(snapshot.sources[0].result, "部分失败", "读到 0 条不能算成功");
  assert.equal(run.status, "部分失败");
  // 历史项目必须保住——这是这条故障链里损失最大的一环。
  assert.equal(snapshot.projects.length, 1);
  assert.equal(snapshot.projects[0].url, "https://fixture.test/notice/1");
  const alert = snapshot.errors.find((error) => error.level === "来源疑似失效");
  assert.ok(alert, "必须留下一条可供人工核对的告警");
  assert.equal(alert.source, fixtureSource.name);
  assert.match(alert.detail, /只读到 0 条/);
});

// 显式抛错的适配器（epoint / henan / luohe）原本行为就是对的，不能改坏。
test("a source that throws still keeps its history and records 扫描失败", async () => {
  const old = { ...fixtureProject({ id: 1 }), source: fixtureSource.name };
  const { snapshot, run } = await scan({
    previous: previousSnapshot([old]),
    value: new Error("列表接口缺少 records"),
  });

  assert.equal(snapshot.sources[0].result, "失败");
  assert.equal(run.status, "失败");
  assert.equal(snapshot.projects.length, 1);
  assert.equal(snapshot.errors[0].level, "扫描失败");
  assert.equal(snapshot.errors[0].detail, "列表接口缺少 records");
});

// 确实长期没有监理公告的来源可以退出该检查，否则会永远停在部分失败。
test("a source may opt out of the zero-entry alarm with minExpectedEntries", async () => {
  const { snapshot, run } = await scan({
    previous: previousSnapshot([]),
    value: { read: 0, projects: [] },
    sources: [{ ...fixtureSource, minExpectedEntries: 0 }],
  });

  assert.equal(snapshot.sources[0].result, "成功");
  assert.equal(run.status, "成功");
  assert.equal(snapshot.errors.length, 0);
});

test("lowEntryIssue only fires below the source's own threshold", () => {
  assert.equal(lowEntryIssue(fixtureSource, 1), null);
  assert.equal(lowEntryIssue({ ...fixtureSource, minExpectedEntries: 3 }, 3), null);
  assert.ok(lowEntryIssue(fixtureSource, 0));
  assert.ok(lowEntryIssue({ ...fixtureSource, minExpectedEntries: 3 }, 2));
  assert.equal(lowEntryIssue({ ...fixtureSource, minExpectedEntries: 0 }, 0), null);
});

// B-1：完全成功的来源才算「问题已解决」，部分失败的来源不能把自己的历史错误抹平。
test("history errors survive a partially failed source and collapse duplicates", async () => {
  const zeroEntryAlarm = {
    id: "fixture-old-alarm",
    level: "来源疑似失效",
    source: fixtureSource.name,
    project: `${fixtureSource.name}公告列表`,
    url: fixtureSource.listEntry,
    time: "2026-08-04 09:00",
    detail: "列表只读到 0 条监理公告，低于最低预期 1 条；无法区分「本期确实没有监理项目」与「上游改版导致适配器失效」",
    action: "人工打开列表页核对，必要时修复适配器或声明 minExpectedEntries",
  };
  // 内容与本轮告警不同的历史记录，只有它才能证明历史真的被保住了。
  const earlierOutage = {
    id: "fixture-old-outage",
    level: "扫描失败",
    source: fixtureSource.name,
    time: "2026-08-03 09:00",
    detail: "列表页请求超时",
    action: "检查来源适配器",
  };

  const failing = await scan({
    previous: previousSnapshot([], { errors: [zeroEntryAlarm, earlierOutage] }),
    value: { read: 0, projects: [] },
  });
  assert.ok(
    failing.snapshot.errors.some((error) => error.detail === "列表页请求超时"),
    "来源仍未恢复时，历史故障记录不能被本轮的「成功」抹掉",
  );
  assert.equal(
    failing.snapshot.errors.filter((error) => error.level === "来源疑似失效").length,
    1,
    "内容相同的告警不能每轮再堆一份",
  );

  const recovered = await scan({
    previous: previousSnapshot([], { errors: [zeroEntryAlarm, earlierOutage] }),
    value: { read: 1, projects: [fixtureProject({ id: 1 })] },
  });
  assert.equal(recovered.snapshot.errors.length, 0, "来源完全恢复后历史告警应清除");
});

// B-2：沿用上一轮已确认的截止时间可以，但不能连降级本身一起抹掉。
test("a degraded bid deadline keeps the old value but leaves a visible trace", async () => {
  const old = {
    ...fixtureProject({ id: 1 }),
    source: fixtureSource.name,
    bidDeadline: "2026-08-24 09:30",
    bidDeadlineStatus: "confirmed",
    bidDeadlineEvidence: "投标截止时间：2026年8月24日09时30分。",
    bidDeadlineVerifiedAt: "2026-08-04 09:00",
  };
  old.fingerprint = projectFingerprint(old);

  const degraded = fixtureProject({ id: 1, deadlineSentence: "投标截止时间详见公告正文。" });
  assert.equal(degraded.bidDeadlineStatus, "pending", "夹具本身要真的解析不出截止时间");

  const { snapshot, run } = await scan({
    previous: previousSnapshot([old]),
    value: { read: 1, projects: [degraded] },
  });

  const merged = snapshot.projects[0];
  assert.equal(merged.bidDeadline, "2026-08-24 09:30", "旧值仍然沿用");
  assert.equal(merged.bidDeadlineStale, true, "但必须标记为沿用值");
  assert.ok(merged.pendingFields?.includes("投标截止时间"), "人工核验告警不能消失");
  assert.notEqual(merged.fingerprint, old.fingerprint, "指纹必须变化，运维才看得见");
  assert.equal(run.updatedProjects, 1);
  assert.equal(merged.related?.type, "内容更新");
});

// B-2：公告显式改口说「见招标文件」时，新事实应当胜出，而不是继续沿用旧的 confirmed。
test("an announcement that explicitly defers to the tender document overrides the old deadline", async () => {
  const old = {
    ...fixtureProject({ id: 1 }),
    source: fixtureSource.name,
    bidDeadline: "2026-08-24 09:30",
    bidDeadlineStatus: "confirmed",
    bidDeadlineEvidence: "投标截止时间：2026年8月24日09时30分。",
    bidDeadlineVerifiedAt: "2026-08-04 09:00",
  };
  old.fingerprint = projectFingerprint(old);

  const deferred = fixtureProject({ id: 1, deadlineSentence: "投标截止时间：详见招标文件。" });
  assert.equal(deferred.bidDeadlineStatus, "document_required", "夹具本身要真的判成 document_required");

  const { snapshot } = await scan({
    previous: previousSnapshot([old]),
    value: { read: 1, projects: [deferred] },
  });

  const merged = snapshot.projects[0];
  assert.equal(merged.bidDeadlineStatus, "document_required");
  assert.equal(merged.bidDeadline, null);
  assert.notEqual(merged.bidDeadlineStale, true);
});

// 真延期时新值正常覆盖旧值，这一行原本就是对的，不能改坏。
test("a genuinely rescheduled deadline still overrides the retained one", async () => {
  const old = {
    ...fixtureProject({ id: 1 }),
    source: fixtureSource.name,
    bidDeadline: "2026-08-24 09:30",
    bidDeadlineStatus: "confirmed",
    bidDeadlineEvidence: "投标截止时间：2026年8月24日09时30分。",
    bidDeadlineVerifiedAt: "2026-08-04 09:00",
  };
  old.fingerprint = projectFingerprint(old);

  const rescheduled = fixtureProject({ id: 1, deadlineSentence: "投标截止时间：2026年9月10日09时30分。" });
  const { snapshot } = await scan({
    previous: previousSnapshot([old]),
    value: { read: 1, projects: [rescheduled] },
  });

  const merged = snapshot.projects[0];
  assert.equal(merged.bidDeadline, "2026-09-10 09:30");
  assert.equal(merged.bidDeadlineStatus, "confirmed");
  assert.notEqual(merged.bidDeadlineStale, true);
});

// 指纹升级不能让全部存量项目集体误报「内容更新」。
test("the stale flag changes the fingerprint without disturbing healthy projects", () => {
  const project = fixtureProject({ id: 1 });
  assert.equal(projectFingerprint(project), projectFingerprint({ ...project, bidDeadlineStale: false }));
  assert.notEqual(projectFingerprint(project), projectFingerprint({ ...project, bidDeadlineStale: true }));
});

// B-3：门禁按「数据有没有塌方」判断，而不是按「18/18 全绿」判断。
test("the publish gate accepts a partial run but rejects a collapsed snapshot", () => {
  const snapshotOf = (projectCount, run) => ({
    projects: Array.from({ length: projectCount }, (_, index) => ({ url: `https://fixture.test/notice/${index}` })),
    sources: [],
    run,
  });
  const previous = snapshotOf(62, { status: "成功", sourceCount: 18, succeededSources: 18 });

  // 旧门禁把这一轮整体丢弃，只因为 18 个来源里有 1 个部分失败。
  const partial = snapshotOf(60, { status: "部分失败", sourceCount: 18, succeededSources: 18 });
  assert.equal(evaluateSnapshot(partial, previous).accepted, true);

  // 旧门禁会放行这份空快照，因为它 18/18「成功」。
  const empty = snapshotOf(0, { status: "成功", sourceCount: 18, succeededSources: 18 });
  const emptyResult = evaluateSnapshot(empty, previous);
  assert.equal(emptyResult.accepted, false);
  assert.match(emptyResult.reasons.join(" "), /0 个项目/);

  // 数据塌方一半以上也要拦。
  assert.equal(evaluateSnapshot(snapshotOf(20, { status: "部分失败", sourceCount: 18, succeededSources: 17 }), previous).accepted, false);
  // 多数来源掉线时这轮数据不值得信。
  assert.equal(evaluateSnapshot(snapshotOf(60, { status: "部分失败", sourceCount: 18, succeededSources: 8 }), previous).accepted, false);
  // 整轮失败必拦。
  assert.equal(evaluateSnapshot(snapshotOf(60, { status: "失败", sourceCount: 18, succeededSources: 0 }), previous).accepted, false);
  // 首次部署没有上一份快照时不应误拦。
  assert.equal(evaluateSnapshot(snapshotOf(5, { status: "成功", sourceCount: 18, succeededSources: 18 }), null).accepted, true);
  // 无法解析的快照必拦。
  assert.equal(evaluateSnapshot(null, previous).accepted, false);
});

test("the publish gate names silently empty sources without blocking the release", () => {
  const next = {
    projects: [{ url: "https://fixture.test/notice/1" }],
    sources: [
      { name: "焦作市公共资源交易中心", read: 0, result: "部分失败" },
      { name: "郑州市公共资源交易中心", read: 12, result: "成功" },
      { name: "掉线市公共资源交易中心", read: 0, result: "失败" },
    ],
    run: { status: "部分失败", sourceCount: 18, succeededSources: 17 },
  };
  const { accepted, warnings } = evaluateSnapshot(next, { projects: [{ url: "https://fixture.test/notice/1" }] });
  assert.equal(accepted, true);
  assert.deepEqual(warnings, ["焦作市公共资源交易中心 本轮读到 0 条，请人工核对列表页"]);
});

// ---------------------------------------------------------------------------
// 来源入口：一个来源可以有多个列表/栏目入口
// ---------------------------------------------------------------------------

const multiEntrySource = {
  id: 98,
  key: "duokou",
  name: "多口市公共资源交易中心",
  entry: "https://duokou.test/",
  listEntry: "https://duokou.test/jyxx/001001/moreinfojy.html",
  scanEntry: "https://duokou.test/",
  region: "河南省 · 多口市",
  type: "公共资源交易中心",
  adapter: "generic-html",
  detailPattern: /\/jyxx\/001001\/001001001\/20\d{6}\//i,
};

function listPage(links) {
  return `<ul>${links.map(({ href, title }) => `<li><a href="${href}">${title}</a> <span>2026-08-20</span></li>`).join("")}</ul>`;
}

function detailPage(title) {
  return `<h2>${title}</h2><p>项目总投资为 1000 万元。</p><p>投标截止时间：2026年8月30日09时30分。</p>`;
}

async function scanWith(source, pages, { now = new Date("2026-08-22T09:00:00+08:00") } = {}) {
  return scanSource(source, now, {
    fetchPage: async (_source, url) => {
      if (!(url in pages)) throw new Error(`${url} 抓取失败：HTTP 404`);
      return pages[url];
    },
    fetchDetail: async (_source, entry) => detailPage(entry.title),
  });
}

test("resolveScanEntries keeps one entry compatible and marks extras optional", () => {
  const single = resolveScanEntries({ listEntry: "https://a.test/list", detailPattern: /x/ });
  assert.equal(single.length, 1);
  assert.equal(single[0].url, "https://a.test/list");
  assert.equal(single[0].required, true);
  assert.equal(single[0].kind, "招标公告");

  const many = resolveScanEntries({
    detailPattern: /x/,
    scanEntries: ["https://a.test/", { url: "https://a.test/plan", kind: "招标计划", detailPattern: /plan/ }],
  });
  assert.equal(many[0].required, true);
  assert.equal(many[1].required, false, "补充入口不能拖垮主入口");
  assert.equal(many[1].kind, "招标计划");
  assert.equal(String(many[1].detailPattern), "/plan/", "补充入口可以有自己的详情页规则");
});

// 焦作、安阳、鹤壁、许昌原来只扫首页，首页挂不下的监理公告全部漏掉。
test("a source scans every declared entry, not just the first one", async () => {
  const source = {
    ...multiEntrySource,
    scanEntries: ["https://duokou.test/", "https://duokou.test/jyxx/001001/moreinfojy.html"],
  };
  const result = await scanWith(source, {
    "https://duokou.test/": listPage([{ href: "/jyxx/001001/001001001/20260820/aaa.html", title: "多口县甲工程监理标段招标公告" }]),
    "https://duokou.test/jyxx/001001/moreinfojy.html": listPage([
      { href: "/jyxx/001001/001001001/20260820/aaa.html", title: "多口县甲工程监理标段招标公告" },
      { href: "/jyxx/001001/001001001/20260820/bbb.html", title: "多口县乙工程监理标段招标公告" },
    ]),
  });

  assert.equal(result.read, 2, "两个入口的公告要合并，重复的去掉");
  assert.deepEqual(result.projects.map((project) => project.name).sort(), ["多口县乙工程监理标段", "多口县甲工程监理标段"]);
});

// 补充入口地址写错时，主入口已经抓到的公告不能跟着一起丢。
test("a broken extra entry degrades to an issue instead of failing the whole source", async () => {
  const source = {
    ...multiEntrySource,
    scanEntries: ["https://duokou.test/", "https://duokou.test/typo.html"],
  };
  const result = await scanWith(source, {
    "https://duokou.test/": listPage([{ href: "/jyxx/001001/001001001/20260820/aaa.html", title: "多口县甲工程监理标段招标公告" }]),
  });

  assert.equal(result.read, 1);
  assert.equal(result.projects.length, 1, "主入口的公告必须保住");
  const issue = result.issues.find((item) => item.level === "入口不可用");
  assert.ok(issue, "坏掉的补充入口要留下告警");
  assert.equal(issue.url, "https://duokou.test/typo.html");
});

// 主入口本身挂掉仍然按整源失败处理，这条原本就是对的，不能改坏。
test("a broken primary entry still fails the whole source", async () => {
  const source = { ...multiEntrySource, scanEntries: ["https://duokou.test/gone.html", "https://duokou.test/"] };
  await assert.rejects(
    () => scanWith(source, { "https://duokou.test/": listPage([]) }),
    /gone\.html/,
  );
});

// 三门峡的监理只出现在「招标计划」栏目，只有声明要收的入口才放行。
test("招标计划 is only collected from an entry that declares it", async () => {
  const planLink = { href: "/jyxx/001001/001001013/20260821/ccc.html", title: "多口县丙工程监理服务招标计划" };
  const noticeLink = { href: "/jyxx/001001/001001001/20260820/aaa.html", title: "多口县甲工程监理标段招标公告" };
  const pages = {
    "https://duokou.test/": listPage([noticeLink, planLink]),
    "https://duokou.test/plan.html": listPage([planLink]),
  };

  // 默认入口：招标计划仍然被当噪音排除。
  const withoutPlans = await scanWith({ ...multiEntrySource, detailPattern: /\/jyxx\/001001\/\d+\/20\d{6}\//i }, pages);
  assert.deepEqual(withoutPlans.projects.map((project) => project.noticeType), ["招标公告"]);

  // 声明 kind: "招标计划" 的补充入口才收，并且必须带上类型标记。
  const withPlans = await scanWith({
    ...multiEntrySource,
    scanEntries: [
      "https://duokou.test/",
      { url: "https://duokou.test/plan.html", kind: "招标计划", detailPattern: /\/jyxx\/001001\/001001013\/20\d{6}\//i },
    ],
  }, pages);
  const plan = withPlans.projects.find((project) => project.noticeType === "招标计划");
  assert.ok(plan, "声明后必须收到招标计划");
  assert.match(plan.name, /多口县丙工程监理服务/);
  assert.equal(withPlans.projects.filter((project) => project.noticeType === "招标公告").length, 1);
});

test("excludedTitlePattern only lets 招标计划 through for plan entries", () => {
  assert.equal(excludedTitlePattern("招标公告").test("某工程监理招标计划"), true);
  assert.equal(excludedTitlePattern("招标计划").test("某工程监理招标计划"), false);
  // 中标、结果、变更这些噪音在两种入口下都要继续排除。
  for (const kind of ["招标公告", "招标计划"]) {
    for (const noise of ["监理中标结果公告", "监理项目中标候选人公示", "监理项目变更公告", "监理合同信息"]) {
      assert.equal(excludedTitlePattern(kind).test(noise), true, `${kind} / ${noise}`);
    }
  }
});

// 配置回归：四个原来只扫首页的来源必须真的补上了列表页。
test("the four homepage-only sources now also scan their announcement list page", () => {
  const expected = {
    "安阳市公共资源交易中心": "https://ggzy.anyang.gov.cn/ayggzy/jyxx/001001/001001002/tradelist.html",
    "鹤壁市公共资源交易中心": "https://ggzy.hebi.gov.cn/jyxx/006001/006001001/transaction_infos.html?cnum=006001001",
    "焦作市公共资源交易中心": "https://ggzy.jiaozuo.gov.cn/jyxx/006001/006001001/project.html",
    "许昌市公共资源交易中心": "https://ggzy.xuchang.gov.cn/jyxx/jyxx.html",
  };
  for (const [name, listUrl] of Object.entries(expected)) {
    const source = SOURCE_DEFINITIONS.find((item) => item.name === name);
    const urls = resolveScanEntries(source).map((entry) => entry.url);
    assert.ok(urls.includes(source.entry), `${name} 仍然扫首页`);
    assert.ok(urls.includes(listUrl), `${name} 缺少招标公告列表页入口`);
  }

  const sanmenxia = SOURCE_DEFINITIONS.find((item) => item.name === "三门峡市公共资源交易中心");
  const plan = resolveScanEntries(sanmenxia).find((entry) => entry.kind === "招标计划");
  assert.ok(plan, "三门峡要收招标计划");
  assert.equal(plan.required, false, "推断出来的地址必须是非必需入口");
  assert.ok(plan.detailPattern.test("/jyxx/001001/001001013/20260821/d947913c.html"));
  assert.equal(plan.detailPattern.test("/jyxx/001001/001001001/20260821/d947913c.html"), false);
});
