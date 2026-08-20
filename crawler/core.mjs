import { createHash } from "node:crypto";

const DEFAULT_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "accept-language": "zh-CN,zh;q=0.9",
  "user-agent": "Mozilla/5.0 TenderRadar/0.1 (+public tender monitoring)",
};

const BLOCK_TAGS = /<\/(?:p|div|li|tr|h[1-6]|section|article|br)>|<br\s*\/?>/gi;
const TAGS = /<[^>]+>/g;

export function decodeHtml(input = "") {
  return String(input)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(BLOCK_TAGS, "\n")
    .replace(TAGS, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/[\t\r\f\v ]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .trim();
}

export function flattenText(input = "") {
  return decodeHtml(input).replace(/\s+/g, " ").trim();
}

export async function fetchText(url, options = {}) {
  const timeoutMs = Number(process.env.TENDER_CRAWLER_TIMEOUT_MS || 25_000);
  const attempts = Number(process.env.TENDER_CRAWLER_ATTEMPTS || 2);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        redirect: "follow",
        ...options,
        headers: { ...DEFAULT_HEADERS, ...options.headers },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "";
      const declared = contentType.match(/charset=([^;\s]+)/i)?.[1]?.replace(/["']/g, "");
      let charset = declared || "utf-8";
      if (!declared) {
        const head = new TextDecoder("utf-8", { fatal: false }).decode(buffer.slice(0, 2048));
        charset = head.match(/charset=["']?([\w-]+)/i)?.[1] || "utf-8";
      }
      try {
        return new TextDecoder(charset).decode(buffer);
      } catch {
        return new TextDecoder("utf-8").decode(buffer);
      }
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(500 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`${url} 抓取失败：${lastError instanceof Error ? lastError.message : "未知错误"}`);
}

export async function fetchJson(url, body, referer) {
  const text = await fetchText(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      referer,
    },
    body: JSON.stringify(body),
  });
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} 返回了无法解析的 JSON`);
  }
}

export async function fetchForm(url, fields, referer) {
  const text = await fetchText(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      referer,
      "x-requested-with": "XMLHttpRequest",
    },
    body: new URLSearchParams(fields).toString(),
  });
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} 返回了无法解析的 JSON`);
  }
}

export function extractAnchors(html, baseUrl) {
  const anchors = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const attrs = match[1];
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href || /^(?:javascript:|#)/i.test(href)) continue;
    const title = attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i)?.[1];
    let url;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    const text = decodeHtml(match[2]);
    anchors.push({ url, title: decodeHtml(title || text), text });
  }
  return anchors;
}

export function dedupeBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function isSupervisionText(text) {
  return /(?:工程|施工|项目|标段|全过程)[^。；\n]{0,28}监理|监理(?:服务|标段|招标|采购|项目|工程)/.test(flattenText(text));
}

function captureLabel(text, labels, maxLength = 100) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}(?:名称)?(?:\\s*[：:]|\\s*为\\s*[：:]?)\\s*([^\\n，；;。]{2,${maxLength}})`);
    const value = text.match(pattern)?.[1]?.trim();
    if (value) {
      return value
        .replace(/\s*(?:投资总额|总投资|资金来源|建设资金|项目概况|招标范围|招标代理机构|采购代理机构|地址|地 址|项目负责人|联系人|电 话|监督单位|监管部门)\s*[：:]?.*$/, "")
        .replace(/\s*(?:2\.|二、|三、).*$/, "")
        .trim();
    }
  }
  return "";
}

function parseChineseDate(value) {
  const normalized = value.replaceAll("/", "-");
  const match = normalized.match(/(20\d{2})\s*[年.-]\s*(\d{1,2})\s*[月.-]\s*(\d{1,2})\s*日?\s*(上午|下午)?\s*(\d{1,2})?\s*(?:时|点|:)?\s*(\d{1,2})?\s*分?/);
  if (!match) return null;
  let hour = Number(match[5] || 0);
  if (match[4] === "下午" && hour < 12) hour += 12;
  const minute = Number(match[6] || 0);
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function extractDeadline(text, publishedAt) {
  const labels = ["投标文件递交截止时间", "投标截止时间", "响应文件提交截止时间", "响应文件递交截止时间", "开标时间"];
  const candidates = [];
  for (const label of labels) {
    let index = text.indexOf(label);
    while (index >= 0) {
      const parsed = parseChineseDate(text.slice(index, index + 260));
      if (parsed) candidates.push(parsed);
      index = text.indexOf(label, index + label.length);
    }
  }
  const publishedDate = String(publishedAt).match(/20\d{2}-\d{2}-\d{2}/)?.[0];
  const plausible = candidates.filter((candidate) => !publishedDate || candidate.slice(0, 10) >= publishedDate);
  return plausible.sort()[0] || null;
}

function extractInvestment(text) {
  const patterns = [
    /(?:项目)?总投资(?:为|约|：|:)?\s*(?:人民币)?\s*([\d,]+(?:\.\d+)?)\s*万元/,
    /(?:工程)?总投资(?:为|约|：|:)?\s*(?:人民币)?\s*([\d,]+(?:\.\d+)?)\s*万元/,
    /建安费(?:估算)?(?:为|约|：|:)?\s*(?:人民币)?\s*([\d,]+(?:\.\d+)?)\s*万元/,
  ];
  for (const pattern of patterns) {
    const value = text.match(pattern)?.[1];
    if (value) return `${Number(value.replace(/,/g, "")).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 万元`;
  }
  return "待核验";
}

function cleanProjectName(title, text) {
  const labeled = captureLabel(text, ["招标项目或标段（以下简称：招标项目）名称", "招标项目名称", "项目名称"], 180);
  const raw = labeled || title;
  return raw
    .replace(/^\[暗标\]/, "")
    .replace(/[（(]?项目名称[）)]?$/, "")
    .replace(/\s*项目编号[：:].*$/, "")
    .replace(/\s*交易分类[：:].*$/, "")
    .replace(/\s*监督部门[：:].*$/, "")
    .replace(/[-—]?\s*(?:公开)?招标公告.*$/, "")
    .replace(/[-—]?\s*(?:竞争性磋商|竞争性谈判|采购)公告.*$/, "")
    .replace(/[；;]$/, "")
    .replace(/\s*-\s*/g, "-")
    .trim();
}

function extractSection(title, text) {
  const source = `${title} ${text.slice(0, 2500)}`;
  const monitorSection = source.match(/(第[一二三四五六七八九十\d]+标段)[^。；\n]{0,45}监理|监理[^。；\n]{0,45}(第[一二三四五六七八九十\d]+标段)/);
  if (monitorSection) return monitorSection[1] || monitorSection[2];
  return title.match(/第[一二三四五六七八九十\d]+标段/)?.[0] || "监理标段";
}

function inferCategory(text) {
  if (/水利|河道|水库|灌区|水土保持/.test(text)) return "水利工程监理";
  if (/道路|排水|污水|管网|桥梁|市政/.test(text)) return "市政工程监理";
  if (/公路|高速|交通/.test(text)) return "交通工程监理";
  if (/厂房|住宅|宿舍|建筑|楼|园区/.test(text)) return "房屋建筑监理";
  return "工程监理";
}

function excerpt(text) {
  const marker = text.search(/项目概况(?:与招标范围)?[：:]?/);
  const start = marker >= 0 ? marker : 0;
  const value = text.slice(start, start + 260).replace(/\s+/g, " ").trim();
  return value || "公告正文已抓取，关键字段仍需以原公告和招标文件为准。";
}

function hashNumber(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return Number.parseInt(hex, 16) % 2_000_000_000;
}

export function projectFingerprint(project) {
  return createHash("sha256")
    .update([project.name, project.section, project.investment, project.deadline, project.client, project.agency, project.summary].join("|"))
    .digest("hex");
}

export function formatChinaTime(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date).replaceAll("/", "-");
}

export function chinaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function deadlinePresentation(deadline, now = new Date()) {
  if (!deadline) return { deadlineShort: "待核验", remaining: "时间无法可靠识别", deadlineState: "pending" };
  const instant = new Date(`${deadline.replace(" ", "T")}:00+08:00`);
  const diff = instant.getTime() - now.getTime();
  const deadlineShort = `${deadline.slice(5, 7)}月${deadline.slice(8, 10)}日 ${deadline.slice(11, 16)}`;
  if (!Number.isFinite(diff)) return { deadlineShort: "待核验", remaining: "时间无法可靠识别", deadlineState: "pending" };
  if (diff <= 0) return { deadlineShort, remaining: "已截止", deadlineState: "expired" };
  const days = Math.ceil(diff / 86_400_000);
  if (days <= 1) return { deadlineShort, remaining: "剩余 1 天", deadlineState: "danger" };
  if (days <= 3) return { deadlineShort, remaining: `剩余 ${days} 天`, deadlineState: "warning" };
  return { deadlineShort, remaining: `剩余 ${days} 天`, deadlineState: "normal" };
}

export function extractProject({ title, html, text: providedText, url, publishedAt, source, originalAvailable = true, linkFailureReason = null }, now = new Date()) {
  const text = flattenText(providedText || html);
  if (!isSupervisionText(`${title} ${text}`)) return null;
  const deadline = extractDeadline(text, normalizePublishedAt(publishedAt));
  const presentation = deadlinePresentation(deadline, now);
  const agencyFromDelegation = text.match(/(?:现)?委托\s*([^，。；;]{2,80}(?:有限公司|事务所))/)?.[1]?.trim();
  const project = {
    id: hashNumber(url),
    name: cleanProjectName(title, text),
    section: extractSection(title, text),
    category: inferCategory(`${title} ${text}`),
    investment: extractInvestment(text),
    deadline,
    ...presentation,
    client: captureLabel(text, ["项目业主及招标人", "招标人", "采购人"], 100) || "待核验",
    agency: captureLabel(text, ["招标代理机构", "采购代理机构", "代理机构"], 100) || agencyFromDelegation || "待核验",
    source: source.name,
    sourceType: source.type,
    url,
    originalUrl: url,
    listUrl: source.listEntry,
    homeUrl: source.entry,
    linkStatus: originalAvailable ? "available" : "original_unavailable",
    lastVerifiedAt: formatChinaTime(now).slice(0, 16),
    linkFailureReason: originalAvailable ? null : (linkFailureReason || "原公告暂时无法访问"),
    region: source.region,
    originalTitle: title.trim(),
    publishedAt: normalizePublishedAt(publishedAt),
    discoveredAt: formatChinaTime(now).slice(0, 16),
    updatedAt: formatChinaTime(now).slice(0, 16),
    summary: excerpt(text),
    createdToday: normalizePublishedAt(publishedAt).slice(0, 10) === chinaDateKey(now),
    pendingFields: [],
  };
  if (!deadline) project.pendingFields.push("投标截止时间");
  if (project.investment === "待核验") project.pendingFields.push("总投资");
  if (project.client === "待核验") project.pendingFields.push("招标人");
  if (project.agency === "待核验") project.pendingFields.push("招标代理机构");
  if (!project.pendingFields.length) delete project.pendingFields;
  project.fingerprint = projectFingerprint(project);
  return project;
}

function normalizePublishedAt(value = "") {
  const match = String(value).replaceAll("/", "-").match(/20\d{2}-\d{1,2}-\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/);
  if (!match) return "待核验";
  const [date, time = "00:00"] = match[0].replaceAll("/", "-").split(/\s+/);
  const [year, month, day] = date.split("-");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${time.slice(0, 5)}`;
}

export function withinDays(publishedAt, days, now = new Date()) {
  const match = String(publishedAt).match(/20\d{2}-\d{2}-\d{2}/);
  if (!match) return true;
  const instant = new Date(`${match[0]}T00:00:00+08:00`);
  return now.getTime() - instant.getTime() <= days * 86_400_000;
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
