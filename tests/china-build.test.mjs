import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const outputRoot = new URL("../china-dist/", import.meta.url);

test("the China build keeps its existing data path and excludes the temporary Pages gate", async () => {
  const assets = new URL("assets/", outputRoot);
  const scripts = (await readdir(assets)).filter((name) => name.endsWith(".js"));
  const javascript = (await Promise.all(scripts.map((name) => readFile(new URL(name, assets), "utf8")))).join("\n");

  assert.match(javascript, /data\/radar\.json/);
  assert.doesNotMatch(javascript, /radar\.enc\.json|输入临时访问密码/);
  await readFile(new URL("data/radar.json", outputRoot), "utf8");
});
