import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/", headers = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html", ...headers },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the public landing page without the workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>标看看｜监理标讯助手<\/title>/);
  assert.match(html, /帮监理企业更早发现/);
  assert.match(html, /隐私说明/);
  assert.match(html, /ICP备案号待审核通过后公示/);
  assert.match(html, /项目雷达/);
  assert.match(html, /18 个已适配/);
  assert.doesNotMatch(html, /正在读取真实扫描数据|搜索项目名称、招标人或代理机构/);
  assert.doesNotMatch(html, /河南省政府采购网|河南兴达工程咨询官网/);
  assert.doesNotMatch(html, /模拟发送|演示数据模式/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("server-renders the project radar as an independent route", async () => {
  const response = await render("/radar");
  assert.equal(response.status, 200);
  const html = await response.text();
  const body = (html.split("</head><body>")[1] || html).split("<script")[0];
  assert.match(html, /项目雷达/);
  assert.match(html, /正在读取真实扫描数据/);
  assert.match(html, /搜索项目名称、招标人或代理机构/);
  assert.match(html, /截止时间由近到远/);
  assert.match(html, /aria-haspopup="listbox"/);
  assert.equal((html.match(/aria-haspopup="listbox"/g) || []).length, 3);
  assert.doesNotMatch(body, /真实扫描已接入|每日汇总生成于/);
  assert.doesNotMatch(body, /帮监理企业更早发现|隐私说明/);
});

test("server-renders system management as an independent route", async () => {
  const response = await render("/radar/admin", {
    "oai-authenticated-user-id": "test-admin",
    "oai-authenticated-user-email": "admin@example.com",
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  const body = (html.split("</head><body>")[1] || html).split("<script")[0];
  assert.match(html, /信息源管理/);
  assert.match(html, /GitHub Pages 只读版/);
  assert.doesNotMatch(html, /添加信息源|保存到云端|检测并接入|立即扫描/);
  assert.doesNotMatch(body, /帮监理企业更早发现|隐私说明/);
});

test("server-renders the project detail route independently from the radar", async () => {
  const response = await render("/radar/project?id=633942592");
  assert.equal(response.status, 200);
  const html = await response.text();
  const body = (html.split("</head><body>")[1] || html).split("<script")[0];
  assert.match(body, /项目详情/);
  assert.match(body, /正在读取项目详情/);
  assert.doesNotMatch(body, /搜索项目名称、招标人或代理机构/);
  assert.doesNotMatch(body, /帮监理企业更早发现|隐私说明/);
});

test("removes starter artifacts and ships product metadata", async () => {
  const [page, layout, styles, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /标看看/);
  assert.match(page, /信息源管理/);
  assert.match(page, /首次发现时间/);
  assert.match(page, /扫描时间/);
  assert.match(page, /更新时间/);
  assert.match(page, /公开页面只读/);
  assert.doesNotMatch(page, /sourceApi|candidateStorageKey|action: "probe"/);
  assert.match(page, /扫描成功/);
  assert.match(page, /biaokankan-project-sort-v1/);
  assert.match(page, /localStorage\.setItem\(sortStorageKey, value\)/);
  assert.match(page, /function SelectMenu/);
  assert.match(page, /role="listbox"/);
  assert.match(page, /className="select-native"/);
  assert.match(styles, /backdrop-filter: blur\(10px\) saturate\(125%\)/);
  assert.match(styles, /\.select-native \{ display: flex; \}/);
  assert.doesNotMatch(page, /fallbackProjects|ReminderCenter|机会评分/);
  assert.match(layout, /title:\s*"标看看｜监理标讯助手"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
