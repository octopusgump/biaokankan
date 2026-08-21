import { readdir, readFile, rename, rm, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encryptPreviewJson, MINIMUM_PBKDF2_ITERATIONS } from "../shared/pages-preview-crypto.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "public", "data", "radar.json");
const outputRoot = path.join(projectRoot, "pages-dist");
const outputDirectory = path.join(outputRoot, "data");
const plaintextOutputPath = path.join(outputDirectory, "radar.json");
const encryptedOutputPath = path.join(outputDirectory, "radar.enc.json");
const temporaryOutputPath = `${encryptedOutputPath}.tmp`;
const cryptoConfigPath = path.join(projectRoot, "deploy", "pages", "preview-crypto.json");

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const resolved = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(resolved) : [resolved];
  }));
  return nested.flat();
}

async function pathExists(value) {
  try {
    await stat(value);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function representativeProjectNames(snapshot) {
  if (!Array.isArray(snapshot.projects)) return [];
  return snapshot.projects
    .map((project) => typeof project?.name === "string" ? project.name.trim() : "")
    .filter((name) => name.length >= 8)
    .sort((left, right) => right.length - left.length)
    .slice(0, 12);
}

async function auditPublishedFiles(password, snapshot) {
  if (await pathExists(plaintextOutputPath)) throw new Error("Pages artifact still contains plaintext radar.json");
  const forbidden = [password, ...representativeProjectNames(snapshot)].map((value) => Buffer.from(value));
  const files = await listFiles(outputRoot);

  for (const file of files) {
    const content = await readFile(file);
    for (const value of forbidden) {
      if (value.length && content.includes(value)) {
        throw new Error(`Pages artifact audit found forbidden plaintext in ${path.relative(outputRoot, file)}`);
      }
    }
  }
}

async function main() {
  const password = process.env.BIAOKANKAN_PREVIEW_PASSWORD;
  if (typeof password !== "string" || password.trim().length === 0) {
    throw new Error("BIAOKANKAN_PREVIEW_PASSWORD is required and cannot be empty");
  }

  const [sourceText, cryptoConfigText] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(cryptoConfigPath, "utf8"),
  ]);
  const snapshot = JSON.parse(sourceText);
  const cryptoConfig = JSON.parse(cryptoConfigText);
  if (cryptoConfig.pbkdf2?.iterations < MINIMUM_PBKDF2_ITERATIONS) {
    throw new Error(`PBKDF2 iterations must be at least ${MINIMUM_PBKDF2_ITERATIONS}`);
  }

  const envelope = await encryptPreviewJson(snapshot, password, cryptoConfig);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(temporaryOutputPath, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
  await rename(temporaryOutputPath, encryptedOutputPath);
  await rm(plaintextOutputPath, { force: true });
  await auditPublishedFiles(password, snapshot);
  console.log(`Pages encrypted snapshot ready: keyVersion=${envelope.keyVersion}`);
}

await main();
