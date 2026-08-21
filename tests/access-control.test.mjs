import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
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

async function runPreflight({
  trusted = "allow 198.51.100.24/32;\n",
  password = "enterprise-a:$2y$05$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuu\n",
} = {}) {
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

  await Promise.all([
    writeFile(paths.trusted, trusted),
    writeFile(paths.password, password),
    writeFile(paths.certificate, "test certificate\n"),
    writeFile(paths.key, "test private key\n"),
  ]);

  return execFileAsync("sh", [preflightFilename], { env });
}

async function assertPreflightRejects(options, expectedMessage) {
  await assert.rejects(runPreflight(options), (error) => {
    assert.match(error.stderr, expectedMessage);
    return true;
  });
}

async function reserveLocalPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function waitForNginx(url, nginxProcess, stderr) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (nginxProcess.exitCode !== null) {
      throw new Error(`nginx exited before accepting requests:\n${stderr.join("")}`);
    }
    try {
      return await fetch(url);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`nginx did not accept requests:\n${stderr.join("")}`);
}

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
  assert.match(config, /\/data\/radar\.json "private, no-store"/);
  assert.doesNotMatch(config, /=\/data\/radar\.json "private, no-store"/);
  assert.match(config, /"private, max-age=604800, immutable"/);
  assert.match(config, /add_header Cache-Control \$biaokankan_cache_control always;/);

  for (const location of config.matchAll(/location[^{]+{([\s\S]*?)\n {2}}/g)) {
    assert.doesNotMatch(location[1], /\b(?:allow|deny)\b|auth_basic/);
  }
});

test(
  "nginx applies the intended cache policy to each resource type",
  { skip: process.env.BIAOKANKAN_RUN_NGINX_INTEGRATION !== "1" },
  async (t) => {
    const productionConfig = await readFile(nginxPath, "utf8");
    const mapBlock = productionConfig.match(
      /map \$uri \$biaokankan_cache_control \{[\s\S]*?\n\}/,
    )?.[0];
    assert.ok(mapBlock, "production cache-control map was not found");

    const fixtureRoot = await mkdtemp(join(tmpdir(), "biaokankan-nginx-"));
    const webRoot = join(fixtureRoot, "www");
    await mkdir(join(webRoot, "data"), { recursive: true });
    await Promise.all([
      writeFile(join(webRoot, "index.html"), "test home\n"),
      writeFile(join(webRoot, "data", "radar.json"), "{}\n"),
      writeFile(join(webRoot, "app.css"), "body {}\n"),
    ]);

    const port = await reserveLocalPort();
    const nginxFixturePath = join(fixtureRoot, "nginx.conf");
    const nginxFixture = `
pid ${JSON.stringify(join(fixtureRoot, "nginx.pid"))};
error_log ${JSON.stringify(join(fixtureRoot, "error.log"))} notice;
events {}
http {
  ${mapBlock}
  server {
    listen 127.0.0.1:${port};
    root ${JSON.stringify(webRoot)};
    location / { try_files $uri $uri/ /index.html; }
    location = /data/radar.json { try_files $uri =404; }
    location ~* \\.(?:css|js|png|jpg|jpeg|gif|webp|ico|woff2?)$ { try_files $uri =404; }
    add_header Cache-Control $biaokankan_cache_control always;
  }
}
`;
    await writeFile(nginxFixturePath, nginxFixture);

    const stderr = [];
    const nginxProcess = spawn("nginx", ["-c", nginxFixturePath, "-g", "daemon off;"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    nginxProcess.stderr.on("data", (chunk) => stderr.push(chunk.toString()));
    t.after(async () => {
      if (nginxProcess.exitCode === null) {
        nginxProcess.kill("SIGTERM");
        await new Promise((resolve) => nginxProcess.once("exit", resolve));
      }
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    const dataResponse = await waitForNginx(
      `${baseUrl}/data/radar.json`,
      nginxProcess,
      stderr,
    );
    assert.equal(dataResponse.status, 200);
    assert.equal(dataResponse.headers.get("cache-control"), "private, no-store");

    const homeResponse = await fetch(`${baseUrl}/`);
    assert.equal(homeResponse.status, 200);
    assert.equal(homeResponse.headers.get("cache-control"), "private, no-cache");

    const cssResponse = await fetch(`${baseUrl}/app.css`);
    assert.equal(cssResponse.status, 200);
    assert.equal(
      cssResponse.headers.get("cache-control"),
      "private, max-age=604800, immutable",
    );
  },
);

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

test("the startup preflight rejects an empty required file", async () => {
  await assertPreflightRejects({ trusted: "" }, /文件缺失或为空/);
});

test("the startup preflight rejects an IPv4 allowlist covering the whole internet", async () => {
  await assertPreflightRejects(
    { trusted: "allow 0.0.0.0/0;\n" },
    /IPv4 前缀不得小于 \/24/,
  );
});

test("the startup preflight rejects the nginx allow-all directive", async () => {
  await assertPreflightRejects({ trusted: "allow all;\n" }, /不能允许所有地址/);
});

test("the startup preflight rejects an IPv4 prefix broader than /24", async () => {
  await assertPreflightRejects(
    { trusted: "allow 198.51.100.0/23;\n" },
    /IPv4 前缀不得小于 \/24/,
  );
});

test("the startup preflight rejects an IPv6 allowlist covering the whole internet", async () => {
  await assertPreflightRejects(
    { trusted: "allow ::/0;\n" },
    /当前部署不监听 IPv6/,
  );
});

test("the startup preflight rejects a 192.168 private network", async () => {
  await assertPreflightRejects(
    { trusted: "allow 192.168.0.0/16;\n" },
    /不能使用 RFC1918 内网地址/,
  );
});

test("the startup preflight rejects a 10 private network", async () => {
  await assertPreflightRejects(
    { trusted: "allow 10.0.0.0/8;\n" },
    /不能使用 RFC1918 内网地址/,
  );
});

test("the startup preflight rejects a 172.16 private network", async () => {
  await assertPreflightRejects(
    { trusted: "allow 172.16.0.0/12;\n" },
    /不能使用 RFC1918 内网地址/,
  );
});

test("the startup preflight rejects an IPv4 loopback network", async () => {
  await assertPreflightRejects(
    { trusted: "allow 127.0.0.0/8;\n" },
    /不能使用回环地址/,
  );
});

test("the startup preflight rejects an IPv4 link-local network", async () => {
  await assertPreflightRejects(
    { trusted: "allow 169.254.0.0/16;\n" },
    /不能使用链路本地地址/,
  );
});

test("the startup preflight rejects any IPv6 allowlist entry", async () => {
  await assertPreflightRejects(
    { trusted: "allow 2001:4860:4860::8888/128;\n" },
    /当前部署不监听 IPv6/,
  );
});

test("the startup preflight rejects a weak credential mixed with bcrypt", async () => {
  await assertPreflightRejects(
    {
      password:
        "weak:plaintext\nenterprise-a:$2y$05$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuu\n",
    },
    /密码文件第 1 行不是 bcrypt 企业凭证/,
  );
});

test("GitHub Pages publishes only through the encrypted preview build", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /BIAOKANKAN_PREVIEW_PASSWORD:\s*\$\{\{ secrets\.BIAOKANKAN_PREVIEW_PASSWORD \}\}/);
  assert.match(workflow, /actions\/deploy-pages|actions\/upload-pages-artifact/);
  assert.doesNotMatch(workflow, /octopusgump\.github\.io\/biaokankan/);
  assert.match(workflow, /pnpm build:pages/);
});
