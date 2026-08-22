import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collapseDuplicates, deadlinePresentation, extractAnchors, extractProject, isSupervisionText, projectIdentity, retainProjectWithLatestLinkState, supervisionScope, withinRetention } from "../crawler/core.mjs";
import { buildSummary } from "../crawler/summary.mjs";
import { SOURCE_DEFINITIONS } from "../crawler/sources.mjs";
import { documentAcquirePresentation, normalizeProjectTimeFields } from "../shared/project-time.mjs";

const source = {
  name: "开封市公共资源交易中心",
  type: "公共资源交易中心",
  region: "河南省 · 开封市 · 通许县",
};

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
  assert.equal(project.deadlineState, "normal");
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
  assert.equal(deadlinePresentation("2026-08-21 09:30", now).deadlineState, "danger");
  assert.equal(deadlinePresentation("2026-08-23 09:30", now).deadlineState, "warning");
  assert.equal(deadlinePresentation("2026-08-19 09:30", now).deadlineState, "expired");
  assert.equal(deadlinePresentation(null, now).deadlineState, "pending");
  assert.equal(deadlinePresentation("2026-08-19 09:30", now, "document_required").deadlineState, "pending");
  assert.equal(deadlinePresentation("2026-08-19 09:30", now, "document_required").remaining, "公告注明：见招标文件");
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
  ];
  const summary = buildSummary(projects, {
    date: "2026-08-20",
    finishedAt: "2026-08-20 09:30",
    sourceCount: 18,
    succeededSources: 18,
  }, now);

  assert.equal(summary.expiringWithin3DaysCount, 1);
  assert.deepEqual(summary.earliestProjects.map((project) => project.projectId), [1]);
  assert.equal(summary.earliestProjects[0].bidDeadline, "2026-08-21 09:30");
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
  for (const summaryProject of snapshot.summary.earliestProjects) {
    const project = snapshot.projects.find((item) => item.id === summaryProject.projectId);
    assert.equal(project?.bidDeadlineStatus, "confirmed");
    assert.equal(summaryProject.deadline, project?.bidDeadline);
  }

  const reviewed = [
    ["西平县乡村振兴肉牛产业融合发展建设项目", "2026-06-16 08:00", "2026-06-23 18:00"],
    ["正阳县慎南路", "2026-05-14 08:00", "2026-05-20 18:00"],
  ];
  for (const [name, start, end] of reviewed) {
    const project = snapshot.projects.find((item) => item.name.includes(name));
    assert.ok(project, name);
    assert.equal(project.bidDeadline, null);
    assert.equal(project.bidDeadlineStatus, "document_required");
    assert.match(project.bidDeadlineEvidence, /见招标文件/);
    assert.equal(project.documentAcquireStart, start);
    assert.equal(project.documentAcquireDeadline, end);
    assert.equal(project.deadlineState, "pending");
  }
});
