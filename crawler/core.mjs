import { createHash } from "node:crypto";
import { bidDeadlinePresentation } from "../shared/project-time.mjs";

const DEFAULT_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "accept-language": "zh-CN,zh;q=0.9",
  "user-agent": "Mozilla/5.0 TenderRadar/0.1 (+public tender monitoring)",
};

const BLOCK_TAGS = /<\/(?:p|div|li|tr|h[1-6]|section|article|br)>|<br\s*\/?>/gi;
const TAGS = /<[^>]+>/g;
const DEADLINE_LABELS = [
  "投标文件的上传/递交截止时间",
  "投标文件上传/递交截止时间",
  "投标文件递交的截止及开标时间",
  "投标文件递交的截止时间",
  "投标文件上传的截止时间",
  "递交投标文件的截止时间",
  "投标文件递交截止时间",
  "投标文件提交截止时间",
  "投标文件上传截止时间",
  "投标截止时间及开标时间",
  "投标截止时间和开标时间",
  "投标截止时间",
  "响应文件提交截止时间",
  "响应文件递交截止时间",
];

export function decodeHtml(input = "") {
  return String(input)
    .replace(/<!--[\s\S]*?-->/g, " ")
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

const SECTION_LABEL = "(?:第[一二三四五六七八九十\\d]+标段|[一二三四五六七八九十\\d]+标段|标段[一二三四五六七八九十\\d]+)";
const SUPERVISION_SCOPE = /监理|全过程工程咨询|全过程咨询/;
const OTHER_SCOPE = /EPC|工程总承包|设计施工总承包|施工总承包|总承包|施工|土建|安装|勘察|设计|检测|试验|造价|监测|设备采购|货物采购/;
const SCOPE_LABELS = ["本标段招标范围", "本标段的招标范围", "本次招标范围", "本标段招标内容", "招标范围", "招标内容"];

function scopeFromTitle(title) {
  const labelled = new RegExp(`${SECTION_LABEL}\\s*[：:]\\s*([^）)】\\]，,。；;]{1,30})`).exec(title);
  if (labelled) {
    const scope = labelled[1];
    if (SUPERVISION_SCOPE.test(scope)) return { included: true, confidence: "explicit", evidence: labelled[0] };
    if (OTHER_SCOPE.test(scope)) return { included: false, confidence: "explicit", evidence: labelled[0] };
  }
  const direct = /监理标段|标段\s*[：:（(]\s*监理|[（(]\s*监理\s*[）)]/.exec(title);
  if (direct) return { included: true, confidence: "explicit", evidence: direct[0] };
  return null;
}

// 正文只用来做"正向"确认。招标范围段落里没写监理，不代表这一条不是监理公告——
// 监理公告的招标范围常常在描述被监理的施工内容，据此排除会误杀真实项目。
// 排除只发生在标题已明确写出本标段范围时（见 scopeFromTitle）。
function scopeFromBody(text) {
  for (const label of SCOPE_LABELS) {
    let index = text.indexOf(label);
    while (index >= 0) {
      const separator = text.slice(index + label.length, index + label.length + 3);
      const precededByHeading = /概况[与和]$/.test(text.slice(Math.max(0, index - 4), index));
      if (/[：:]/.test(separator) && !precededByHeading) {
        const window = text.slice(index, index + 220);
        if (SUPERVISION_SCOPE.test(window)) return { included: true, confidence: "scoped", evidence: window.slice(0, 140) };
      }
      index = text.indexOf(label, index + label.length);
    }
  }
  return null;
}

// 判断"这一条公告对应的标段"是不是监理标段，而不是整篇公告里有没有出现"监理"。
// 同一项目的 EPC、施工、检测标段各自单独发公告，正文却都会写到监理标段的存在。
export function supervisionScope(title = "", text = "") {
  const flatTitle = flattenText(title);
  const flatText = flattenText(text);
  return scopeFromTitle(flatTitle)
    || scopeFromBody(flatText)
    || { included: isSupervisionText(`${flatTitle} ${flatText}`), confidence: "loose", evidence: null };
}

export function extractTenderNumber(text) {
  const value = flattenText(text)
    .match(/(?:招标|项目|采购|询价|磋商)编号\s*[：:]\s*([A-Za-z0-9\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5\-_/（）()]{4,40})/)?.[1];
  return value ? value.replace(/[，,。；;]$/, "").trim() : null;
}

function normalizeIdentityText(value = "") {
  return String(value).replace(/[^\p{Script=Han}a-zA-Z0-9]/gu, "").toLowerCase();
}

// 去重键：优先"项目编号 + 标段"，没有编号时退回"项目名称 + 标段"。
export function projectIdentity(project) {
  const section = normalizeIdentityText(project.section) || "未标注标段";
  const number = project.tenderNumber ? normalizeIdentityText(project.tenderNumber) : "";
  return number ? `${number}|${section}` : `${normalizeIdentityText(project.name)}|${section}`;
}

// 公告正文里字段之间常常只靠"（2）""3、""某某："分隔。捕获到下一个字段的开头就必须截断，
// 否则项目名会把招标编号、建设地点一起吃进来。
function truncateAtNextLabel(value) {
  const boundary = value.search(/(?:联\s*系\s*人|联\s*系\s*电\s*话|电\s*话|传\s*真|电子?\s*邮\s*箱|邮\s*箱|项目\s*负责人)\s*[：:]|[（(]\s*\d+\s*[）)]|\s\d+\s*[、.．]|\s*[一二三四五六七八九十]\s*、|[^：:\s]{2,10}\s*[：:]/);
  return boundary > 0 ? value.slice(0, boundary) : value;
}

function captureLabel(text, labels, maxLength = 100) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}(?:名称)?(?:\\s*[：:]|\\s*为\\s*[：:]?)\\s*([^\\n，；;。]{2,${maxLength + 60}})`);
    const value = text.match(pattern)?.[1]?.trim();
    if (!value) continue;
    const cleaned = truncateAtNextLabel(value)
      .replace(/\s*(?:投资总额|总投资|资金来源|建设资金|项目概况|招标范围|招标代理机构|采购代理机构|代理机构|地址|地 址|项目负责人|联系人|联系电话|电\s*话|传真|电子?邮箱|邮箱|开户行|监督单位|监管部门)\s*[：:]?.*$/, "")
      .replace(/\s*(?:2\.|二、|三、).*$/, "")
      .trim();
    // 超长说明没有找到字段边界，宁可交给"待核验"，也不返回半截值。
    if (cleaned.length >= 2 && cleaned.length <= maxLength) return cleaned;
  }
  return "";
}

function normalizeInstitution(value) {
  const normalized = String(value || "").trim();
  if (!normalized || /^(?:详见招标文件|见招标文件|待定|无|-|\/)$/i.test(normalized)) return "";
  const institutionSuffix = /(?:公司|分行|支行|银行|局|管理处|处|中心|站|厂|库|队|政府|办事处|管委会|委员会|集团|大学|学院|学校|院|所|指挥部|办公室|医院|协会|合作社|项目部)\s*(?:[（(][^）)]*[）)])?$/;
  return institutionSuffix.test(normalized) ? normalized : "";
}

function normalizeDateTextWithOffsets(value = "") {
  const canonical = String(value)
    .replaceAll("/", "-")
    .replaceAll("：", ":")
    .replaceAll("．", ".");
  let text = "";
  const offsets = [];
  for (let index = 0; index < canonical.length; index += 1) {
    const character = canonical[index];
    const nextCharacter = canonical.slice(index + 1).match(/\S/)?.[0];
    if (/\s/.test(character) && /\d/.test(canonical[index - 1] || "") && /\d/.test(nextCharacter || "")) continue;
    text += character;
    offsets.push(index);
  }
  return { text, offsets };
}

function parseChineseDateMatches(value) {
  const { text: normalized, offsets } = normalizeDateTextWithOffsets(value);
  const pattern = /(20\d{2})\s*[年.-]\s*(\d{1,2})\s*[月.-]\s*(\d{1,2})\s*日?\s*(上午|下午)?\s*(\d{1,2})?\s*(?:时|点|:)?\s*(\d{1,2})?\s*分?/g;
  const dates = [];
  for (const match of normalized.matchAll(pattern)) {
    let hour = Number(match[5] || 0);
    if (match[4] === "下午" && hour < 12) hour += 12;
    const minute = Number(match[6] || 0);
    const normalizedEnd = match.index + match[0].length - 1;
    dates.push({
      date: `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      offset: offsets[match.index],
      end: offsets[normalizedEnd] + 1,
    });
  }
  return dates;
}

function parseChineseDates(value) {
  return parseChineseDateMatches(value).map((match) => match.date);
}

function evidenceWindow(text, index, maxLength = 360) {
  const before = text.slice(Math.max(0, index - maxLength), index);
  const previousBoundary = Math.max(before.lastIndexOf("。"), before.lastIndexOf("；"), before.lastIndexOf(";"));
  const start = Math.max(0, index - before.length + previousBoundary + 1);
  const after = text.slice(index, index + maxLength);
  const nextBoundary = after.search(/[。；;]/);
  const end = nextBoundary >= 0 ? index + nextBoundary + 1 : Math.min(text.length, index + maxLength);
  const raw = text.slice(start, end);
  return { raw, start, evidence: raw.replace(/\s+/g, " ").trim() };
}

function evidenceNear(text, index, maxLength = 360) {
  return evidenceWindow(text, index, maxLength).evidence;
}

function dateCandidatesNear(text, index, labelLength) {
  const window = evidenceWindow(text, index);
  const matches = parseChineseDateMatches(window.raw);
  const candidates = matches.map((match) => {
    const dateStart = window.start + match.offset;
    const dateEnd = window.start + match.end;
    const labelEnd = index + labelLength;
    const distance = dateStart >= labelEnd
      ? dateStart - labelEnd
      : index >= dateEnd
        ? index - dateEnd
        : 0;
    return {
      date: match.date,
      evidence: window.evidence,
      index,
      dateOffset: match.offset,
      distance,
      ambiguous: false,
      rangeEnd: null,
    };
  });
  for (let matchIndex = 1; matchIndex < matches.length; matchIndex += 1) {
    const between = window.raw.slice(matches[matchIndex - 1].end, matches[matchIndex].offset);
    if (/^\s*(?:起)?\s*(?:至|到)\s*$/.test(between)) {
      candidates[matchIndex - 1].rangeEnd = candidates[matchIndex];
    } else if (/(?:或|或者)/.test(between)) {
      candidates[matchIndex - 1].ambiguous = true;
      candidates[matchIndex].ambiguous = true;
    }
  }
  return candidates;
}

function collectLabeledDates(text, labels) {
  const candidates = [];
  for (const label of labels) {
    let index = text.indexOf(label);
    while (index >= 0) {
      candidates.push(...dateCandidatesNear(text, index, label.length));
      index = text.indexOf(label, index + label.length);
    }
  }
  return candidates;
}

function selectDeadlineCandidate(candidates, publishedDate) {
  const eligible = candidates.filter((candidate) => !publishedDate || candidate.date.slice(0, 10) >= publishedDate);
  if (!eligible.length) return { candidate: null, evidence: null };
  const nearestDistance = Math.min(...eligible.map((candidate) => candidate.distance));
  const nearest = eligible.filter((candidate) => candidate.distance === nearestDistance);
  const distinctDates = new Set(nearest.map((candidate) => candidate.date));
  if (distinctDates.size !== 1) return { candidate: null, evidence: nearest[0].evidence };

  let candidate = nearest[0];
  if (candidate.ambiguous) return { candidate: null, evidence: candidate.evidence };
  if (candidate.rangeEnd) candidate = candidate.rangeEnd;
  if (publishedDate && candidate.date.slice(0, 10) < publishedDate) {
    return { candidate: null, evidence: candidate.evidence };
  }
  return { candidate, evidence: candidate.evidence };
}

function evidenceRequiresDocument(evidence) {
  const reference = /(?:详?见|以)[^。；;]{0,40}招标文件/.exec(evidence);
  if (!reference) return false;
  const firstDate = parseChineseDateMatches(evidence)[0];
  return !firstDate || reference.index < firstDate.offset;
}

export function extractTimeFields(text, publishedAt) {
  let documentRequiredEvidence = null;
  for (const label of DEADLINE_LABELS) {
    let index = text.indexOf(label);
    while (index >= 0) {
      const evidence = evidenceNear(text, index);
      if (evidenceRequiresDocument(evidence)) {
        documentRequiredEvidence = evidence;
        break;
      }
      index = text.indexOf(label, index + label.length);
    }
    if (documentRequiredEvidence) break;
  }

  const candidates = collectLabeledDates(text, DEADLINE_LABELS);
  const sectionTimePattern = /投标文件的递交\s+(?:\d+(?:\.\d+)?[、.]?\s*)?时间\s*[：:]/g;
  for (const match of text.matchAll(sectionTimePattern)) {
    const evidence = evidenceNear(text, match.index);
    if (!documentRequiredEvidence && evidenceRequiresDocument(evidence)) documentRequiredEvidence = evidence;
    candidates.push(...dateCandidatesNear(text, match.index, match[0].length));
  }

  let openingIndex = text.indexOf("开标时间");
  while (openingIndex >= 0) {
    const evidence = evidenceNear(text, openingIndex);
    const explicitlyEqual = /开标时间[^。；;]{0,45}(?:即为|等于|同(?:于)?|与)[^。；;]{0,30}投标截止时间/.test(evidence)
      || /投标截止时间[^。；;]{0,45}(?:即为|等于|同(?:于)?|与)[^。；;]{0,30}开标时间/.test(evidence);
    if (explicitlyEqual) {
      candidates.push(...dateCandidatesNear(text, openingIndex, "开标时间".length));
    }
    openingIndex = text.indexOf("开标时间", openingIndex + 4);
  }

  const publishedDate = String(publishedAt).match(/20\d{2}-\d{2}-\d{2}/)?.[0];
  const selection = selectDeadlineCandidate(candidates, publishedDate);
  const confirmed = selection.candidate;

  const acquireLabels = [
    "招标文件的获取时间",
    "招标文件获取时间",
    "获取招标文件时间",
    "招标文件的获取",
    "招标文件获取",
    "招标文件下载时间",
    "招标文件下载",
    "报名时间",
  ];
  let documentAcquireStart = null;
  let documentAcquireDeadline = null;
  for (const label of acquireLabels) {
    let index = text.indexOf(label);
    while (index >= 0) {
      const evidence = evidenceNear(text, index);
      const dates = parseChineseDates(evidence);
      if (dates.length >= 2) {
        [documentAcquireStart, documentAcquireDeadline] = dates;
        break;
      }
      if (dates.length === 1 && /(?:截止|结束)/.test(evidence)) documentAcquireDeadline = dates[0];
      else if (dates.length === 1 && /(?:开始|起)/.test(evidence)) documentAcquireStart = dates[0];
      index = text.indexOf(label, index + label.length);
    }
    if (documentAcquireStart || documentAcquireDeadline) break;
  }

  return {
    bidDeadline: documentRequiredEvidence ? null : confirmed?.date || null,
    bidDeadlineStatus: documentRequiredEvidence ? "document_required" : confirmed ? "confirmed" : "pending",
    bidDeadlineEvidence: documentRequiredEvidence || confirmed?.evidence || selection.evidence,
    documentAcquireStart,
    documentAcquireDeadline,
  };
}

// 真实公告里「总投资」的写法远不止「总投资 X 万元」：标签会写成投资估算 / 工程概算 /
// 建安投资，单位可能是元或亿元，政府站把 PDF 转成 HTML 时还会在数字中间插入空格。
// 标签按可信度从高到低排列，先命中的先返回。
const INVESTMENT_LABELS = [
  "总投资额",
  "总投资",
  "投资总额",
  "投资估算",
  "投资概算",
  "投资预算",
  "投资金额",
  "投资规模",
  "概算总投资",
  "概算投资",
  "工程概算",
  "计划投资",
  "项目投资",
  "工程投资",
  "拟投资",
  "建安投资",
  "建安费估算",
  "建安费",
];

const INVESTMENT_UNITS = new Map([
  ["亿元", 10_000],
  ["万元", 1],
  ["元", 0.0001],
]);

// 标签和金额之间只允许一小段限定语（「约为」「：本项目工程概算为」）。
// 不允许跨逗号、句号、分号和顿号——后面的金额多半属于另一个字段；
// 也不允许出现「标段」——那说明金额被限定到某个标段，不是项目总投资。
const INVESTMENT_GAP = String.raw`(?:(?!标段)[^\d，,。；;、\n]){0,14}`;
// 数字中间可能被插入空格（「5 80 万元」），先整体捕获再清洗校验。
const INVESTMENT_AMOUNT = String.raw`(\d[\d,.\s]*\d|\d)`;
const INVESTMENT_UNIT = String.raw`\s*(亿元|万元|元)`;

const INVESTMENT_PATTERNS = INVESTMENT_LABELS.map(
  (label) => new RegExp(`${label}${INVESTMENT_GAP}${INVESTMENT_AMOUNT}${INVESTMENT_UNIT}`),
);

function extractInvestment(text) {
  for (const pattern of INVESTMENT_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const digits = match[1].replace(/[,\s]/g, "");
    // 清洗后仍不是一个合法数字（例如「1.2.3」）就当作没识别出来。
    if (!/^\d+(?:\.\d+)?$/.test(digits)) continue;
    const amount = Number(digits) * INVESTMENT_UNITS.get(match[2]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    return `${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 万元`;
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
  const normalizedTitle = flattenText(title);
  if (/监理\s*标段/.test(normalizedTitle)) return "监理标段";

  const prefixedNearMonitor = normalizedTitle.match(/(第[一二三四五六七八九十\d]+\s*标段)\s*[-—:：、,，()（）]?\s*(?:施工)?监理|(?:施工)?监理\s*[-—:：、,，()（）]?\s*(第[一二三四五六七八九十\d]+\s*标段)/);
  if (prefixedNearMonitor) return (prefixedNearMonitor[1] || prefixedNearMonitor[2]).replace(/\s+/g, "");

  const prefixedTitleSections = [...normalizedTitle.matchAll(/第[一二三四五六七八九十\d]+\s*标段/g)]
    .map((match) => match[0].replace(/\s+/g, ""));
  if (new Set(prefixedTitleSections).size === 1) return prefixedTitleSections[0];

  const bareSections = [...normalizedTitle.matchAll(/(?:^|[^\d.])((?:[一二三四五六七八九十]+|\d+)\s*标段)/g)]
    .map((match) => match[1].replace(/\s+/g, ""));
  if (new Set(bareSections).size === 1) return bareSections[0];

  const body = decodeHtml(text).slice(0, 2500);
  const prefixedBodySection = body.match(/(?:^|[。；\n])\s*(第[一二三四五六七八九十\d]+\s*标段)\s*[：:]?\s*(?:施工)?监理|(?:^|[。；\n])\s*(?:施工)?监理\s*[：:]?\s*(第[一二三四五六七八九十\d]+\s*标段)/);
  return prefixedBodySection
    ? (prefixedBodySection[1] || prefixedBodySection[2]).replace(/\s+/g, "")
    : "监理标段";
}

function categoryEvidence(title, text) {
  const marker = text.search(/项目概况(?:与招标范围)?\s*[：:]?/);
  if (marker < 0) return title;
  const overview = text.slice(marker, marker + 1200);
  const markerLength = overview.match(/^项目概况(?:与招标范围)?\s*[：:]?/)?.[0].length || 0;
  const following = overview.slice(markerLength);
  const boundary = following.search(/\n\s*(?:(?:\d+(?:\.\d+)*|[一二三四五六七八九十]+)\s*[、.]?\s*)?(?:招标范围|投标人资格|招标文件|投标截止|开标|联系方式|环境保护)/);
  const section = boundary >= 0 ? overview.slice(0, markerLength + boundary) : overview;
  return `${title} ${section}`;
}

function inferCategory(title, text) {
  const evidence = categoryEvidence(title, text);
  const categories = [
    ["水利工程监理", ["水利", "河道", "水库", "灌区", "水土保持"]],
    ["市政工程监理", ["道路", "排水", "污水", "管网", "桥梁", "市政"]],
    ["交通工程监理", ["公路", "高速", "交通"]],
    ["房屋建筑监理", ["厂房", "住宅", "宿舍", "建筑", "楼", "园区"]],
  ];
  const scored = categories.map(([category, keywords]) => ({
    category,
    score: keywords.reduce((total, keyword) => total + evidence.split(keyword).length - 1, 0),
  })).sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].category : "工程监理";
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
    .update([
      project.name,
      project.section,
      project.investment,
      project.bidDeadline ?? project.deadline,
      project.bidDeadlineStatus,
      project.bidDeadlineEvidence,
      project.documentAcquireStart,
      project.documentAcquireDeadline,
      project.client,
      project.agency,
      project.summary,
    ].join("|"))
    .digest("hex");
}

function publishedKey(project) {
  return String(project.publishedAt).match(/20\d{2}-\d{2}-\d{2}( \d{2}:\d{2})?/)?.[0] || "";
}

function pickPrimary(items) {
  return [...items].sort((a, b) => publishedKey(b).localeCompare(publishedKey(a)) || a.url.localeCompare(b.url))[0];
}

function attachRelated(primary, others, type, title, now) {
  if (!others.length) return primary;
  return {
    ...primary,
    related: primary.related || {
      type,
      title,
      date: formatChinaTime(now).slice(0, 16),
    },
    relatedAnnouncements: others.map((item) => ({
      title: item.originalTitle,
      section: item.section,
      publishedAt: item.publishedAt,
      url: item.url,
    })),
  };
}

// 公共资源交易中心按"一标段一公告"发布，同一项目的多个标段 URL 天然不同。
// 只按 URL 去重会让同一项目在列表里重复出现，因此这里补上 PRD 第五步要求的第二级去重。
export function collapseDuplicates(projects, now = new Date()) {
  const byIdentity = new Map();
  for (const project of projects) {
    const key = projectIdentity(project);
    byIdentity.set(key, [...(byIdentity.get(key) || []), project]);
  }

  const deduped = [];
  for (const bucket of byIdentity.values()) {
    if (bucket.length === 1) {
      deduped.push(bucket[0]);
      continue;
    }
    const primary = pickPrimary(bucket);
    const others = bucket.filter((item) => item !== primary);
    const reissue = others.some((item) => publishedKey(item) && publishedKey(item) < publishedKey(primary));
    deduped.push(attachRelated(
      primary,
      others,
      reissue ? "二次招标" : "重复公告",
      reissue
        ? `该标段此前已发布过招标公告，本条为最新一次（另有 ${others.length} 条历史公告）`
        : `同一标段在来源站有 ${others.length} 条重复公告，已合并展示`,
      now,
    ));
  }

  const byTender = new Map();
  for (const project of deduped) {
    if (!project.tenderNumber) continue;
    byTender.set(project.tenderNumber, [...(byTender.get(project.tenderNumber) || []), project]);
  }

  const dropped = new Set();
  const rewritten = new Map();
  for (const bucket of byTender.values()) {
    if (bucket.length < 2) continue;
    const confident = bucket.filter((item) => item.supervisionConfidence !== "loose");
    const ambiguous = bucket.filter((item) => item.ambiguousSection);
    if (confident.length && ambiguous.length) {
      for (const item of ambiguous) dropped.add(item.url);
      rewritten.set(confident[0].url, attachRelated(
        confident[0],
        ambiguous,
        "同项目其他标段",
        `该项目另有 ${ambiguous.length} 个标段公告，本条是已确认的监理标段`,
        now,
      ));
      continue;
    }
    if (ambiguous.length === bucket.length && bucket.length > 1) {
      const primary = pickPrimary(bucket);
      const others = bucket.filter((item) => item !== primary);
      for (const item of others) dropped.add(item.url);
      const merged = attachRelated(
        primary,
        others,
        "同项目多标段",
        `该项目共 ${bucket.length} 条标段公告，尚未确认哪一个是监理标段`,
        now,
      );
      rewritten.set(primary.url, { ...merged, section: "标段待核验" });
    }
  }

  return deduped
    .filter((project) => !dropped.has(project.url))
    .map((project) => rewritten.get(project.url) || project);
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

export function deadlinePresentation(deadline, now = new Date(), status = deadline ? "confirmed" : "pending") {
  return bidDeadlinePresentation(deadline, status, now);
}

export function retainProjectWithLatestLinkState(project, source) {
  if (!source || source.result === "成功") return project;
  const listAvailable = source.listAvailable === true;
  const homeAvailable = source.homeAvailable === true;
  const hasFallback = listAvailable || homeAvailable;
  return {
    ...project,
    listAvailable,
    homeAvailable,
    linkStatus: hasFallback ? "original_unavailable" : "source_unavailable",
    lastVerifiedAt: source.lastVerifiedAt || source.lastScan || project.lastVerifiedAt,
    linkFailureReason: source.result === "失败" && source.lastError
      ? source.lastError
      : "本次扫描未能重新验证该项目的原公告",
  };
}

export function extractProject({ title, html, text: providedText, url, publishedAt, source, originalAvailable = true, linkFailureReason = null }, now = new Date()) {
  const decodedText = decodeHtml(html || providedText);
  const text = decodedText.replace(/\s+/g, " ").trim();
  const scope = supervisionScope(title, text);
  if (!scope.included) return null;
  const ambiguousSection = scope.confidence === "loose" && /第[一二三四五六七八九十\d]+标段/.test(title);
  const timeFields = extractTimeFields(text, normalizePublishedAt(publishedAt));
  const presentation = deadlinePresentation(timeFields.bidDeadline, now, timeFields.bidDeadlineStatus);
  const agencyFromDelegation = text.match(/(?:现)?委托\s*([^，。；;]{2,80}(?:有限公司|事务所))/)?.[1]?.trim();
  const client = normalizeInstitution(captureLabel(text, ["项目业主及招标人", "招标人", "采购人"], 100)) || "待核验";
  const agency = normalizeInstitution(captureLabel(text, ["招标代理机构", "采购代理机构", "代理机构"], 100))
    || normalizeInstitution(agencyFromDelegation)
    || "待核验";
  const project = {
    id: hashNumber(url),
    name: cleanProjectName(title, text),
    section: extractSection(title, text),
    category: inferCategory(title, decodedText),
    tenderNumber: extractTenderNumber(text),
    supervisionConfidence: scope.confidence,
    supervisionEvidence: scope.evidence,
    ambiguousSection,
    investment: extractInvestment(text),
    ...timeFields,
    bidDeadlineVerifiedAt: timeFields.bidDeadlineStatus === "confirmed" ? formatChinaTime(now).slice(0, 16) : null,
    deadline: timeFields.bidDeadline,
    ...presentation,
    client,
    agency,
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
  if (project.publishedAt === "待核验") project.pendingFields.push("公告发布时间");
  if (ambiguousSection) project.pendingFields.push("监理标段范围");
  if (timeFields.bidDeadlineStatus !== "confirmed") project.pendingFields.push("投标截止时间");
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

// 列表页阶段无法解析发布日期时只能放行，否则会漏掉真实项目；
// 但项目一旦进入快照，就必须有一个可计算的年龄，避免"永不过期"的条目常驻列表。
export function withinRetention(project, days, now = new Date()) {
  const stamp = String(project.publishedAt).match(/20\d{2}-\d{2}-\d{2}/)?.[0]
    || String(project.discoveredAt).match(/20\d{2}-\d{2}-\d{2}/)?.[0];
  if (!stamp) return false;
  return now.getTime() - new Date(`${stamp}T00:00:00+08:00`).getTime() <= days * 86_400_000;
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
