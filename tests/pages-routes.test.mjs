import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

  assert.match(entry, /pathname === "\/radar"/);
  assert.match(entry, /pathname === "\/radar\/admin"/);
  assert.match(entry, /pathname === "\/radar\/project"/);
  assert.match(entry, /detailFromQuery/);
});

test("the published snapshot keeps bid deadlines separate from document acquisition windows", async () => {
  const snapshot = JSON.parse(await readFile(new URL("data/radar.json", outputRoot), "utf8"));
  const samples = [
    ["西平县乡村振兴肉牛产业融合发展建设项目", "2026-06-16 08:00", "2026-06-23 18:00"],
    ["正阳县慎南路", "2026-05-14 08:00", "2026-05-20 18:00"],
  ];

  for (const [name, start, end] of samples) {
    const project = snapshot.projects.find((item) => item.name.includes(name));
    assert.ok(project, `${name} must remain in the real snapshot`);
    assert.equal(project.bidDeadline, null);
    assert.equal(project.deadline, null);
    assert.equal(project.bidDeadlineStatus, "document_required");
    assert.match(project.bidDeadlineEvidence, /见招标文件/);
    assert.equal(project.documentAcquireStart, start);
    assert.equal(project.documentAcquireDeadline, end);
    assert.equal(project.deadlineState, "pending");
  }
});
