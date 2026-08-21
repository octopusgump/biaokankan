import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { RadarSnapshot } from "../app/page";
import {
  decryptPreviewJson,
  derivePreviewKey,
  isStoredPreviewCredentialUsable,
  PREVIEW_CREDENTIAL_TTL_MS,
} from "../shared/pages-preview-crypto.mjs";
import "./preview-access.css";

type PreviewEnvelope = {
  formatVersion: number;
  keyVersion: string;
  pbkdf2: { hash: string; iterations: number; salt: string };
  cipher: { name: string; keyLength: number; ivLength: number };
  iv: string;
  ciphertext: string;
};

type StoredCredential = {
  id: "active";
  key: CryptoKey;
  keyVersion: string;
  expiresAt: number;
};

type AccessState = "checking" | "locked" | "unlocking" | "unlocked" | "unavailable";

const databaseName = "biaokankan-preview-access-v1";
const storeName = "credentials";
const credentialId = "active";
const encryptedDataUrl = `${import.meta.env.BASE_URL}data/radar.enc.json`;

function openCredentialDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredCredential() {
  const database = await openCredentialDatabase();
  try {
    return await new Promise<StoredCredential | null>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).get(credentialId);
      request.onsuccess = () => resolve((request.result as StoredCredential | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function saveStoredCredential(key: CryptoKey, keyVersion: string) {
  const database = await openCredentialDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put({
        id: credentialId,
        key,
        keyVersion,
        expiresAt: Date.now() + PREVIEW_CREDENTIAL_TTL_MS,
      } satisfies StoredCredential);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function deleteStoredCredential() {
  const database = await openCredentialDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(credentialId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function fetchEnvelope() {
  const response = await fetch(encryptedDataUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("encrypted snapshot unavailable");
  return response.json() as Promise<PreviewEnvelope>;
}

function requireRadarSnapshot(value: unknown): RadarSnapshot {
  const snapshot = value as Partial<RadarSnapshot> | null;
  if (!snapshot || snapshot.mode !== "live" || !Array.isArray(snapshot.projects) || !Array.isArray(snapshot.sources)) {
    throw new Error("invalid radar snapshot");
  }
  return snapshot as RadarSnapshot;
}

export function PreviewAccess({ children }: { children: (snapshot: RadarSnapshot) => ReactNode }) {
  const [state, setState] = useState<AccessState>("checking");
  const [envelope, setEnvelope] = useState<PreviewEnvelope | null>(null);
  const [snapshot, setSnapshot] = useState<RadarSnapshot | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const passwordId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextEnvelope = await fetchEnvelope();
        if (cancelled) return;
        setEnvelope(nextEnvelope);

        let stored: StoredCredential | null = null;
        try { stored = await readStoredCredential(); } catch { /* IndexedDB 不可用时仍允许本次手动解锁 */ }
        if (cancelled) return;
        if (!stored || !isStoredPreviewCredentialUsable(stored, nextEnvelope.keyVersion)) {
          if (stored) { try { await deleteStoredCredential(); } catch { /* 失效记录留存不影响重新解锁 */ } }
          if (!cancelled) setState("locked");
          return;
        }

        try {
          const restored = requireRadarSnapshot(await decryptPreviewJson(nextEnvelope, stored.key));
          if (!cancelled) { setSnapshot(restored); setState("unlocked"); }
        } catch {
          try { await deleteStoredCredential(); } catch { /* 解密失败后继续显示解锁页 */ }
          if (!cancelled) setState("locked");
        }
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (state !== "locked") return;
    const frame = window.requestAnimationFrame(() => passwordRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [state]);

  const unlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!envelope || !password) return;
    setState("unlocking");
    setError("");
    try {
      const key = await derivePreviewKey(password, envelope, ["decrypt"]);
      const decrypted = requireRadarSnapshot(await decryptPreviewJson(envelope, key));
      try { await saveStoredCredential(key, envelope.keyVersion); } catch { /* 私密模式可能不允许持久化，本次仍可使用 */ }
      setPassword("");
      setSnapshot(decrypted);
      setState("unlocked");
    } catch {
      setPassword("");
      setError("密码不正确，请重新输入。");
      setState("locked");
    }
  };

  if (state === "unlocked" && snapshot) return children(snapshot);

  return <main className="preview-lock-shell">
    <section className="preview-lock-card" aria-busy={state === "checking" || state === "unlocking"}>
      <div className="preview-lock-brand"><span>标</span><div><strong>标看看</strong><small>监理标讯助手</small></div></div>
      <p className="preview-lock-kicker">封闭试用</p>
      <h1>{state === "unavailable" ? "暂时无法读取加密数据" : "输入临时访问密码"}</h1>
      <p className="preview-lock-copy">{state === "unavailable" ? "请稍后重试；系统不会显示未加密的备用数据。" : "解锁后，此浏览器会安全记住 30 天。"}</p>
      {state === "checking" ? <div className="preview-lock-progress" role="status">正在检查本地凭证…</div>
        : state === "unavailable" ? <button className="preview-lock-retry" type="button" onClick={() => window.location.reload()}>重新加载</button>
          : <form onSubmit={unlock}>
            <label htmlFor={passwordId}>访问密码</label>
            <input
              id={passwordId}
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={state === "unlocking"}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={error ? `${passwordId}-error` : undefined}
            />
            {error && <p id={`${passwordId}-error`} className="preview-lock-error" role="alert">{error}</p>}
            <button type="submit" disabled={state === "unlocking" || !password}>{state === "unlocking" ? "正在解锁…" : "进入标看看"}</button>
          </form>}
      <small className="preview-lock-note">新设备、无痕窗口、清除网站数据或密码版本更新后需要重新输入。</small>
    </section>
  </main>;
}
