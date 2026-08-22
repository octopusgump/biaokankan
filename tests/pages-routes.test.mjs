import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decryptPreviewJson, derivePreviewKey } from "../shared/pages-preview-crypto.mjs";

const outputRoot = new URL("../pages-dist/", import.meta.url);

test("GitHub Pages ships entry files for every public route", async () => {
  const index = await readFile(new URL("index.html", outputRoot), "utf8");
  const routes = [
    "radar/index.html",
    "radar/admin/index.html",
    "radar/project/index.html",
    "404.html",
  ];

  for (const route of routes) {
    assert.equal(await readFile(new URL(route, outputRoot), "utf8"), index, `${route} must use the current app entry`);
  }

  assert.match(index, /\/biaokankan\/assets\/index-[^"']+\.js/);
});

test("the static entry dispatches deep links to the correct screen", async () => {
  const entry = await readFile(new URL("../github-pages/main.tsx", import.meta.url), "utf8");
  const landing = await readFile(new URL("../app/public-intro.tsx", import.meta.url), "utf8");

  assert.match(entry, /pathname === "\/radar"/);
  assert.match(entry, /pathname === "\/radar\/admin"/);
  assert.match(entry, /pathname === "\/radar\/project"/);
  assert.match(entry, /detailFromQuery/);
  assert.match(entry, /<PreviewAccess>/);
  assert.match(entry, /<Home initialSnapshot=\{snapshot\}/);
  assert.match(landing, /if \(initialSnapshot\) return;/);
  assert.match(await readFile(new URL("../vite.pages.config.ts", import.meta.url), "utf8"), /BIAOKANKAN_PAGES_ENCRYPTED": "true"/);
  assert.match(await readFile(new URL("../vite.china.config.ts", import.meta.url), "utf8"), /BIAOKANKAN_PAGES_ENCRYPTED": "false"/);
});

test("stored credentials use a quiet branded transition instead of flashing the password form", async () => {
  const component = await readFile(new URL("../github-pages/preview-access.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../github-pages/preview-access.css", import.meta.url), "utf8");
  const checkingStart = component.indexOf('if (state === "checking")');
  const lockedStart = component.indexOf('const unavailable = state === "unavailable"');

  assert.notEqual(checkingStart, -1, "the credential check needs its own render branch");
  assert.ok(lockedStart > checkingStart, "the locked screen must render after the checking branch");
  const checkingMarkup = component.slice(checkingStart, lockedStart);
  assert.match(checkingMarkup, /<PreviewBrand \/>/);
  assert.match(checkingMarkup, /showCheckingProgress && !isExiting/);
  assert.doesNotMatch(checkingMarkup, /输入临时访问密码|<form|<input/);
  assert.match(component, /const checkingProgressDelayMs = 300;/);
  assert.match(component, /const gateExitDurationMs = 200;/);
  assert.match(styles, /\.preview-access-content[\s\S]*?240ms ease-out/);
  assert.match(styles, /\.preview-access-exit[\s\S]*?200ms ease-out/);
  assert.match(styles, /@media \(prefers-reduced-motion: no-preference\)/);
});

test("the published snapshot keeps bid deadlines separate from document acquisition windows", async () => {
  const password = process.env.BIAOKANKAN_PREVIEW_PASSWORD;
  assert.ok(password, "encrypted Pages tests require BIAOKANKAN_PREVIEW_PASSWORD");
  const envelope = JSON.parse(await readFile(new URL("data/radar.enc.json", outputRoot), "utf8"));
  const key = await derivePreviewKey(password, envelope, ["decrypt"]);
  const snapshot = await decryptPreviewJson(envelope, key);
  assert.equal(snapshot.schemaVersion, 4);
  assert.equal(snapshot.storage.contractVersion, 4);
  assert.equal(snapshot.summary.summaryVersion, 2);
  assert.equal(Object.hasOwn(snapshot.summary, "expiringWithin3DaysCount"), false);
  // 不再断言某几条线上公告必须存在。它们会随来源下架或 90 天保留期到期而消失，
  // 届时失败的是测试而不是产品，而这两个测试位于 pnpm build:pages 的部署链路上。
  // 改为断言规则：快照中出现的每一条 document_required 项目都必须满足
  // “投标截止时间与招标文件获取窗口分离”的契约。
  // 这两条公告本身的完整字段由 tests/crawler.test.mjs 的 fixture 单测覆盖，不依赖线上数据。
  const documentRequired = snapshot.projects.filter((project) => project.bidDeadlineStatus === "document_required");
  for (const project of documentRequired) {
    assert.equal(project.bidDeadline, null, project.name);
    assert.equal(project.deadline, null, project.name);
    assert.match(project.bidDeadlineEvidence, /(?:详?见|以)[^。；;]{0,40}招标文件/, project.name);
    assert.equal(project.bidDeadlineVerifiedAt, null, project.name);
    assert.equal(project.deadlineState, "pending", project.name);
  }
});
