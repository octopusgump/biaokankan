import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  decryptPreviewJson,
  derivePreviewKey,
  encryptPreviewJson,
  isStoredPreviewCredentialUsable,
  MINIMUM_PBKDF2_ITERATIONS,
  PREVIEW_CREDENTIAL_TTL_MS,
} from "../shared/pages-preview-crypto.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "pages-dist");
const sourcePath = path.join(projectRoot, "public", "data", "radar.json");
const encryptedPath = path.join(outputRoot, "data", "radar.enc.json");
const plaintextOutputPath = path.join(outputRoot, "data", "radar.json");
const encryptScriptPath = path.join(projectRoot, "scripts", "encrypt-pages-data.mjs");

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const resolved = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(resolved) : [resolved];
  }));
  return nested.flat();
}

const unitParameters = {
  formatVersion: 1,
  keyVersion: "test-version-one",
  pbkdf2: {
    hash: "SHA-256",
    iterations: MINIMUM_PBKDF2_ITERATIONS,
    salt: "AAECAwQFBgcICQoLDA0ODw==",
  },
  cipher: { name: "AES-GCM", keyLength: 256, ivLength: 12 },
};

test("the correct password decrypts the original snapshot and a wrong password fails", async () => {
  const original = { mode: "live", projects: [{ id: 1, name: "unit-only-project" }], sources: [] };
  const envelope = await encryptPreviewJson(original, "unit-only-correct-password", unitParameters);
  const correctKey = await derivePreviewKey("unit-only-correct-password", envelope, ["decrypt"]);
  assert.deepEqual(await decryptPreviewJson(envelope, correctKey), original);

  const wrongKey = await derivePreviewKey("unit-only-wrong-password", envelope, ["decrypt"]);
  await assert.rejects(decryptPreviewJson(envelope, wrongKey));
});

test("each encrypted payload uses a fresh IV", async () => {
  const first = await encryptPreviewJson({ value: 1 }, "unit-only-password", unitParameters);
  const second = await encryptPreviewJson({ value: 1 }, "unit-only-password", unitParameters);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});

test("a keyVersion change or thirty-day expiry invalidates the stored credential", () => {
  const now = Date.now();
  const record = { keyVersion: "version-one", expiresAt: now + PREVIEW_CREDENTIAL_TTL_MS };
  assert.equal(isStoredPreviewCredentialUsable(record, "version-one", now), true);
  assert.equal(isStoredPreviewCredentialUsable(record, "version-two", now), false);
  assert.equal(isStoredPreviewCredentialUsable({ ...record, expiresAt: now }, "version-one", now), false);
});

test("the Pages artifact contains ciphertext but no plaintext snapshot, password, or project names", async () => {
  const password = process.env.BIAOKANKAN_PREVIEW_PASSWORD;
  assert.ok(password, "artifact audit requires BIAOKANKAN_PREVIEW_PASSWORD");
  await access(encryptedPath);
  await assert.rejects(access(plaintextOutputPath));

  const snapshot = JSON.parse(await readFile(sourcePath, "utf8"));
  const representativeNames = snapshot.projects
    .map((project) => project.name)
    .filter((name) => typeof name === "string" && name.length >= 8)
    .sort((left, right) => right.length - left.length)
    .slice(0, 12);
  assert.ok(representativeNames.length > 0, "the real snapshot must provide representative project names");

  const forbidden = [password, ...representativeNames].map((value) => Buffer.from(value));
  for (const file of await listFiles(outputRoot)) {
    const content = await readFile(file);
    for (const value of forbidden) {
      assert.equal(content.includes(value), false, `${path.relative(outputRoot, file)} leaked protected plaintext`);
    }
  }
});

test("the encryption step fails closed when the Actions secret is missing", async () => {
  const env = { ...process.env };
  delete env.BIAOKANKAN_PREVIEW_PASSWORD;
  await assert.rejects(
    execFileAsync(process.execPath, [encryptScriptPath], { cwd: projectRoot, env }),
    /BIAOKANKAN_PREVIEW_PASSWORD is required/,
  );
});
