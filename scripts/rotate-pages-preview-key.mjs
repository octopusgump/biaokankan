import { randomBytes } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(projectRoot, "deploy", "pages", "preview-crypto.json");
const temporaryPath = `${configPath}.tmp`;
const config = JSON.parse(await readFile(configPath, "utf8"));

config.keyVersion = `preview-${randomBytes(8).toString("hex")}`;
config.pbkdf2.salt = randomBytes(16).toString("base64");

await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
await rename(temporaryPath, configPath);
console.log(`Pages password version rotated: ${config.keyVersion}`);
