const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export const MINIMUM_PBKDF2_ITERATIONS = 600_000;
export const PREVIEW_CREDENTIAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function requirePreviewParameters(value) {
  if (!value || value.formatVersion !== 1 || typeof value.keyVersion !== "string" || !value.keyVersion) {
    throw new Error("Invalid preview encryption metadata");
  }
  if (value.pbkdf2?.hash !== "SHA-256" || !Number.isInteger(value.pbkdf2.iterations) || value.pbkdf2.iterations < MINIMUM_PBKDF2_ITERATIONS) {
    throw new Error("Invalid preview PBKDF2 parameters");
  }
  const salt = base64ToBytes(value.pbkdf2.salt);
  if (salt.byteLength < 16) throw new Error("Preview salt must contain at least 16 random bytes");
  if (value.cipher?.name !== "AES-GCM" || value.cipher?.keyLength !== 256) {
    throw new Error("Invalid preview cipher parameters");
  }
  return salt;
}

export async function derivePreviewKey(password, parameters, usages = ["decrypt"]) {
  if (typeof password !== "string" || password.length === 0) throw new Error("Preview password is required");
  const salt = requirePreviewParameters(parameters);
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: parameters.pbkdf2.iterations,
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

export async function encryptPreviewJson(value, password, parameters) {
  requirePreviewParameters(parameters);
  const ivLength = parameters.cipher.ivLength;
  if (!Number.isInteger(ivLength) || ivLength < 12) throw new Error("Invalid preview IV length");
  const iv = crypto.getRandomValues(new Uint8Array(ivLength));
  const key = await derivePreviewKey(password, parameters, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: textEncoder.encode(parameters.keyVersion),
    },
    key,
    textEncoder.encode(JSON.stringify(value)),
  );

  return {
    formatVersion: parameters.formatVersion,
    keyVersion: parameters.keyVersion,
    pbkdf2: parameters.pbkdf2,
    cipher: parameters.cipher,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptPreviewJson(envelope, key) {
  requirePreviewParameters(envelope);
  if (typeof envelope.iv !== "string" || typeof envelope.ciphertext !== "string") {
    throw new Error("Invalid encrypted preview payload");
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(envelope.iv),
      additionalData: textEncoder.encode(envelope.keyVersion),
    },
    key,
    base64ToBytes(envelope.ciphertext),
  );
  return JSON.parse(textDecoder.decode(plaintext));
}

export function isStoredPreviewCredentialUsable(record, keyVersion, now = Date.now()) {
  return Boolean(
    record
    && record.keyVersion === keyVersion
    && Number.isFinite(record.expiresAt)
    && record.expiresAt > now,
  );
}
