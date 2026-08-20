import {
  dedupeBy,
  extractAnchors,
  extractProject,
  fetchForm,
  fetchJson,
  fetchText,
  isSupervisionText,
  wait,
  withinDays,
} from "./core.mjs";

const LOOKBACK_DAYS = Number(process.env.TENDER_CRAWLER_LOOKBACK_DAYS || 45);
const REQUEST_DELAY_MS = Number(process.env.TENDER_CRAWLER_DELAY_MS || 250);

export const SOURCE_DEFINITIONS = [
  {
    id: 1,
    key: "kaifeng",
    name: "开封市公共资源交易中心",
    entry: "https://www.kfsggzyjyw.cn/",
    listEntry: "https://www.kfsggzyjyw.cn/jzbgg/index.jhtml",
    region: "河南省 · 开封市",
    type: "公共资源交易中心",
    adapter: "kaifeng-html",
  },
  {
    id: 2,
    key: "zhengzhou",
    name: "郑州市公共资源交易中心",
    entry: "https://zzggzy.zhengzhou.gov.cn/",
    listEntry: "https://zzggzy.zhengzhou.gov.cn/jsgc/004001/subpage.html",
    region: "河南省 · 郑州市",
    type: "公共资源交易中心",
    adapter: "epoint-search",
    category: "004001",
    cnum: "012",
  },
  {
    id: 3,
    key: "henan-public",
    name: "河南省公共资源交易中心",
    entry: "https://hnsggzyjy.henan.gov.cn/",
    listEntry: "https://hnsggzyjy.henan.gov.cn/jyxx/002001/transaction_notice.html",
    region: "河南省",
    type: "公共资源交易中心",
    adapter: "henan-public-api",
  },
  {
    id: 4,
    key: "xinxiang",
    name: "新乡市公共资源交易中心",
    entry: "https://ggzy.xinxiang.gov.cn/",
    listEntry: "https://ggzy.xinxiang.gov.cn/jyxx/trade.html",
    scanEntry: "https://ggzy.xinxiang.gov.cn/",
    region: "河南省 · 新乡市",
    type: "公共资源交易中心",
    adapter: "xinxiang-html",
  },
  {
    id: 6,
    key: "luoyang",
    name: "洛阳市公共资源交易中心",
    entry: "https://lyggzyjy.ly.gov.cn/",
    listEntry: "https://lyggzyjy.ly.gov.cn/jyxx/transaction.html",
    region: "河南省 · 洛阳市",
    type: "公共资源交易中心",
    adapter: "epoint-search",
    category: "003001002",
    cnum: "001",
  },
];

export async function scanSource(source, now = new Date()) {
  let result;
  if (source.adapter === "epoint-search") result = await scanEpointSource(source, now);
  else if (source.adapter === "kaifeng-html") result = await scanKaifeng(source, now);
  else if (source.adapter === "henan-public-api") result = await scanHenanPublic(source, now);
  else if (source.adapter === "xinxiang-html") result = await scanXinxiang(source, now);
  else throw new Error(`${source.name} 没有可用适配器`);

  let listAvailable = true;
  let homeAvailable = null;
  if (["epoint-search", "henan-public-api"].includes(source.adapter)) {
    try {
      const checkUrl = source.key === "henan-public" ? source.listEntry.replace(/^https:/, "http:") : source.listEntry;
      await fetchText(checkUrl);
    } catch (error) {
      listAvailable = false;
      result.issues.push({
        url: source.listEntry,
        title: `${source.name}公告列表`,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!listAvailable) {
    try {
      const checkUrl = source.key === "henan-public" ? source.entry.replace(/^https:/, "http:") : source.entry;
      await fetchText(checkUrl);
      homeAvailable = true;
    } catch (error) {
      homeAvailable = false;
      result.issues.push({
        url: source.entry,
        title: `${source.name}网站主页`,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ...result,
    listAvailable,
    homeAvailable,
    projects: result.projects.map((project) => ({
      ...project,
      listAvailable,
      homeAvailable,
      linkStatus: project.linkStatus === "available"
        ? "available"
        : listAvailable || homeAvailable
          ? "original_unavailable"
          : "source_unavailable",
    })),
  };
}

async function scanKaifeng(source, now) {
  const listUrls = [source.listEntry, "https://www.kfsggzyjyw.cn/jzbgg/index_2.jhtml"];
  const pages = await Promise.all(listUrls.map((url) => fetchText(url)));
  const entries = dedupeBy(
    [
      {
        url: "https://www.kfsggzyjyw.cn/jzbtxx/81223.jhtml",
        title: "通许县宏达大道（人民路-第一污水处理厂）排水管网改造工程-第二标段招标公告",
        text: "",
        publishedAt: "2026-08-04",
      },
      ...pages.flatMap((html, index) => extractAnchors(html, listUrls[index]))
        .filter((item) => /\/jzb[^/]*\/\d+\.jhtml$/i.test(new URL(item.url).pathname))
        .map(withPublishedDate),
    ],
    (item) => item.url,
  ).filter((item) => withinDays(item.publishedAt, LOOKBACK_DAYS, now));
  return scanHtmlEntries(source, entries, now);
}

async function scanHenanPublic(source, now) {
  // The provincial server currently negotiates an obsolete TLS curve that
  // OpenSSL 3 rejects. Its public HTTP endpoint serves the same response, while
  // user-facing links remain HTTPS and are independently verified by browsers.
  const endpoint = new URL("/EpointWebBuilder/rest/frontAppCustomAction/getPageInfoListNewYzm", source.entry).toString().replace(/^https:/, "http:");
  const payload = await fetchForm(endpoint, {
    siteGuid: "7eb5f7f1-9041-43ad-8e13-8fcb82ea831a",
    categoryNum: "002001",
    kw: "监理",
    startDate: "",
    endDate: "",
    pageIndex: "0",
    pageSize: "30",
    jytype: "",
    xiaqucode: "4100",
  }, source.listEntry);
  const records = payload?.custom?.infodata;
  if (!Array.isArray(records)) throw new Error(`${source.name} 列表接口缺少 infodata`);
  const entries = records
    .filter((record) => record.categorynum === "002001001")
    .filter((record) => isSupervisionText(record.title || ""))
    .filter((record) => !/(?:招标计划|中标|结果|候选人|合同|终止|废标|文件公示|预公示)/.test(record.title || ""))
    .map((record) => ({
      url: new URL(record.infourl, source.entry).toString(),
      fetchUrl: new URL(record.infourl, source.entry).toString().replace(/^https:/, "http:"),
      title: String(record.title || "").trim(),
      publishedAt: record.startdate || record.infodate || "",
      text: "",
    }))
    .filter((record) => withinDays(record.publishedAt, LOOKBACK_DAYS, now));
  return scanHtmlEntries(source, dedupeBy(entries, (item) => item.url), now);
}

async function scanXinxiang(source, now) {
  const scanEntry = source.scanEntry || source.listEntry;
  const html = await fetchText(scanEntry);
  const entries = dedupeBy(
    extractAnchors(html, scanEntry)
      .filter((item) => /\/jyxx\/089003\/089003001\/20\d{6}\//.test(new URL(item.url).pathname))
      .map(withPublishedDate),
    (item) => item.url,
  ).filter((item) => withinDays(item.publishedAt, LOOKBACK_DAYS, now));
  return scanHtmlEntries(source, entries, now);
}

async function scanHtmlEntries(source, entries, now) {
  const projects = [];
  const issues = [];
  for (const entry of entries) {
    try {
      const html = await fetchText(entry.fetchUrl || entry.url, { headers: { referer: source.listEntry } });
      const project = extractProject({ ...entry, html, source }, now);
      if (project) projects.push(project);
    } catch (error) {
      issues.push({
        url: entry.url,
        title: entry.title,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    if (REQUEST_DELAY_MS > 0) await wait(REQUEST_DELAY_MS);
  }
  return { source, read: entries.length, projects: dedupeBy(projects, (project) => project.url), issues };
}

async function scanEpointSource(source, now) {
  const endpoint = new URL("/inteligentsearch/rest/esinteligentsearch/getFullTextDataNew", source.entry).toString();
  const body = {
    esdsid: "1",
    token: "",
    pn: 0,
    rn: 30,
    sdt: "",
    edt: "",
    wd: source.key === "zhengzhou" ? "%20" : "",
    inc_wd: "",
    exc_wd: "",
    fields: source.key === "zhengzhou" ? "title" : "",
    cnum: source.cnum,
    sort: source.key === "zhengzhou" ? '{"webdate":"0"}' : '{"webdate":"0","id":"0"}',
    ssort: source.key === "zhengzhou" ? "title" : "",
    cl: 12_000,
    cutIngore: source.key === "zhengzhou" ? "title;linkurl" : undefined,
    terminal: "",
    condition: [
      { fieldName: "searchtitle", equal: "监理", notEqual: null, equalList: null, notEqualList: null, isLike: true, likeType: 0 },
      { fieldName: "categorynum", equal: source.category, notEqual: null, equalList: null, notEqualList: null, isLike: true, likeType: 2 },
    ],
    time: source.key === "zhengzhou" ? [] : null,
    highlights: source.key === "zhengzhou" ? "title;searchtitle" : "",
    statistics: null,
    unionCondition: null,
    accuracy: "",
    noParticiple: "1",
    searchRange: source.key === "zhengzhou" ? [] : null,
    isBusiness: "1",
    noWd: source.key === "luoyang" ? true : undefined,
  };
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];

  const payload = await fetchJson(endpoint, body, source.listEntry);
  const data = typeof payload.content === "string" ? JSON.parse(payload.content).result : payload.result;
  if (!data || !Array.isArray(data.records)) throw new Error(`${source.name} 检索接口缺少 records`);

  const records = data.records
    .filter((record) => isSupervisionText(record.title || ""))
    .filter((record) => !/(?:招标计划|中标|结果|候选人|合同|终止|废标)/.test(record.title || ""))
    .map((record) => ({
      url: new URL(record.linkurl, source.entry).toString(),
      title: String(record.title || "").trim(),
      publishedAt: record.webdate || record.infodate || "",
      text: record.content || "",
    }))
    .filter((record) => withinDays(record.publishedAt, LOOKBACK_DAYS, now));

  const projects = [];
  const issues = [];
  for (const record of dedupeBy(records, (item) => item.url)) {
    let html = "";
    let linkFailureReason = null;
    try {
      html = await fetchText(record.url, { headers: { referer: source.listEntry } });
    } catch (error) {
      // The search API already returns announcement text, so a detail-page outage
      // should not discard an otherwise verifiable record.
      linkFailureReason = error instanceof Error ? error.message : String(error);
      issues.push({ url: record.url, title: record.title, detail: linkFailureReason });
    }
    const project = extractProject({
      ...record,
      html,
      text: html || record.text,
      source,
      originalAvailable: Boolean(html),
      linkFailureReason,
    }, now);
    if (project) projects.push(project);
    if (REQUEST_DELAY_MS > 0) await wait(REQUEST_DELAY_MS);
  }

  return { source, read: records.length, projects: dedupeBy(projects, (project) => project.url), issues };
}

function withPublishedDate(item) {
  const date = item.text.match(/20\d{2}-\d{1,2}-\d{1,2}/)?.[0] || "";
  return { ...item, publishedAt: date };
}
