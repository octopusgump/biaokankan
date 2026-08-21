import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import test from "node:test";

const execFileAsync = promisify(execFile);

const nginxPath = new URL("../deploy/china/nginx.conf", import.meta.url);
const trustedNetworksExamplePath = new URL(
  "../deploy/china/trusted-networks.conf.example",
  import.meta.url,
);
const jailPath = new URL(
  "../deploy/china/fail2ban/jail.d/biaokankan-auth.local",
  import.meta.url,
);
const preflightPath = new URL(
  "../deploy/china/check-access-control.sh",
  import.meta.url,
);
const preflightFilename = fileURLToPath(preflightPath);
const workflowPath = new URL("../.github/workflows/pages.yml", import.meta.url);

test("the protected origin requires a trusted network or enterprise credential", async () => {
  const config = await readFile(nginxPath, "utf8");

  assert.match(config, /listen 80 default_server;/);
  assert.match(config, /return 301 https:\/\/biaokankan\.com\$request_uri;/);
  assert.match(config, /listen 443 ssl default_server;/);
  assert.match(config, /ssl_reject_handshake on;/);
  assert.match(config, /satisfy any;/);
  assert.match(config, /include \/etc\/nginx\/biaokankan\/trusted-networks\.conf;/);
  assert.match(config, /deny all;/);
  assert.match(config, /auth_basic "标看看封闭试用";/);
  assert.match(config, /auth_basic_user_file \/etc\/nginx\/biaokankan\/\.htpasswd;/);
  assert.doesNotMatch(config, /auth_basic\s+off/);
});

test("the data snapshot and static assets inherit the server access gate", async () => {
  const config = await readFile(nginxPath, "utf8");

  assert.match(config, /location = \/data\/radar\.json/);
  assert.match(config, /=\/data\/radar\.json "private, no-store"/);
  assert.match(config, /"private, max-age=604800, immutable"/);
  assert.match(config, /add_header Cache-Control \$biaokankan_cache_control always;/);

  for (const location of config.matchAll(/location[^{]+{([\s\S]*?)\n {2}}/g)) {
    assert.doesNotMatch(location[1], /\b(?:allow|deny)\b|auth_basic/);
  }
});

test("the committed network file is documentation, not a live allowlist", async () => {
  const example = await readFile(trustedNetworksExamplePath, "utf8");
  const activeRules = example
    .split("\n")
    .filter((line) => line.trim() && !line.trimStart().startsWith("#"))
    .join("\n");

  assert.match(example, /203\.0\.113\.10\/32/);
  assert.doesNotMatch(activeRules, /(?:^|\s)(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/m);
});

test("repeated authentication failures are banned for fifteen minutes", async () => {
  const jail = await readFile(jailPath, "utf8");

  assert.match(jail, /maxretry = 5/);
  assert.match(jail, /findtime = 15m/);
  assert.match(jail, /bantime = 15m/);
});

test("the startup preflight rejects missing files and accepts complete protected config", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "biaokankan-access-"));
  const paths = {
    trusted: join(fixtureRoot, "trusted-networks.conf"),
    password: join(fixtureRoot, ".htpasswd"),
    certificate: join(fixtureRoot, "fullchain.pem"),
    key: join(fixtureRoot, "privkey.pem"),
  };
  const env = {
    ...process.env,
    BIAOKANKAN_TRUSTED_NETWORKS_FILE: paths.trusted,
    BIAOKANKAN_PASSWORD_FILE: paths.password,
    BIAOKANKAN_CERTIFICATE_FILE: paths.certificate,
    BIAOKANKAN_CERTIFICATE_KEY_FILE: paths.key,
  };

  await assert.rejects(execFileAsync("sh", [preflightFilename], { env }));

  await Promise.all([
    writeFile(paths.trusted, "allow 198.51.100.24/32;\n"),
    writeFile(paths.password, "enterprise-a:$2y$05$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuu\n"),
    writeFile(paths.certificate, "test certificate\n"),
    writeFile(paths.key, "test private key\n"),
  ]);

  const result = await execFileAsync("sh", [preflightFilename], { env });
  assert.match(result.stdout, /访问控制启动检查通过/);
});

test("GitHub Pages publishes only through the encrypted preview build", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /BIAOKANKAN_PREVIEW_PASSWORD:\s*\$\{\{ secrets\.BIAOKANKAN_PREVIEW_PASSWORD \}\}/);
  assert.match(workflow, /actions\/deploy-pages|actions\/upload-pages-artifact/);
  assert.doesNotMatch(workflow, /octopusgump\.github\.io\/biaokankan/);
  assert.match(workflow, /pnpm build:pages/);
});
