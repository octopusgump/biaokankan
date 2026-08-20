import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deadlinePresentation, extractAnchors, extractProject, isSupervisionText, retainProjectWithLatestLinkState } from "../crawler/core.mjs";
import { SOURCE_DEFINITIONS } from "../crawler/sources.mjs";

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

test("uses only the seven confirmed public-resource sources", () => {
  assert.deepEqual(SOURCE_DEFINITIONS.map((item) => item.name), [
    "开封市公共资源交易中心",
    "郑州市公共资源交易中心",
    "河南省公共资源交易中心",
    "新乡市公共资源交易中心",
    "洛阳市公共资源交易中心",
    "商丘市公共资源交易中心",
    "郑州航空港经济综合实验区公共资源交易中心",
  ]);
  assert.equal(SOURCE_DEFINITIONS.some((item) => /政府采购网|河南兴达/.test(item.name)), false);
  assert.equal(new Set(SOURCE_DEFINITIONS.map((item) => item.entry)).size, 7);
});

test("deadline thresholds match the product rules", () => {
  const now = new Date("2026-08-20T09:30:00+08:00");
  assert.equal(deadlinePresentation("2026-08-21 09:30", now).deadlineState, "danger");
  assert.equal(deadlinePresentation("2026-08-23 09:30", now).deadlineState, "warning");
  assert.equal(deadlinePresentation("2026-08-19 09:30", now).deadlineState, "expired");
  assert.equal(deadlinePresentation(null, now).deadlineState, "pending");
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

test("published snapshot stays live, source-bound and link-unique", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../public/data/radar.json", import.meta.url), "utf8"));
  const configured = new Map(SOURCE_DEFINITIONS.map((source) => [source.name, new URL(source.entry).hostname.replace(/^www\./, "")]));
  assert.equal(snapshot.mode, "live");
  assert.deepEqual(snapshot.sources.map((source) => source.name), SOURCE_DEFINITIONS.map((source) => source.name));
  assert.equal(new Set(snapshot.projects.map((project) => project.originalUrl)).size, snapshot.projects.length);
  assert.equal(snapshot.projects.some((project) => /政府采购网|河南兴达/.test(project.source)), false);
  for (const project of snapshot.projects) {
    assert.equal(new URL(project.originalUrl).hostname.replace(/^www\./, ""), configured.get(project.source));
    assert.match(project.name, /监理|施工及监理|工程/);
  }
  assert.equal(snapshot.summary.newProjectCount, snapshot.projects.filter((project) => project.createdToday).length);
});
