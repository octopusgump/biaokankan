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
