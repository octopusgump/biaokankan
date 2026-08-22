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
  {
    id: 5,
    key: "pingdingshan",
    name: "平顶山市公共资源交易中心",
    entry: "http://ggzy.pds.gov.cn/",
    listEntry: "http://ggzy.pds.gov.cn/gjsgc/index.jhtml",
    region: "河南省 · 平顶山市",
    type: "公共资源交易中心",
    adapter: "generic-html",
    detailPattern: /\/jszbpdss\/\d+\.jhtml$/i,
  },
  {
    id: 9,
    key: "anyang",
    name: "安阳市公共资源交易中心",
    entry: "https://ggzy.anyang.gov.cn/",
    listEntry: "https://ggzy.anyang.gov.cn/ayggzy/jyxx/001001/001001002/tradelist.html",
    scanEntry: "https://ggzy.anyang.gov.cn/",
    region: "河南省 · 安阳市",
    type: "公共资源交易中心",
    adapter: "generic-html",
    detailPattern: /\/ayggzy\/jyxx\/001001\/001001002\/20\d{6}\//i,
  },
  {
    id: 10,
    key: "hebi",
    name: "鹤壁市公共资源交易中心",
    entry: "https://ggzy.hebi.gov.cn/",
    listEntry: "https://ggzy.hebi.gov.cn/jyxx/006001/006001001/transaction_infos.html?cnum=006001001",
    scanEntry: "https://ggzy.hebi.gov.cn/",
    region: "河南省 · 鹤壁市",
    type: "公共资源交易中心",
    adapter: "generic-html",
    detailPattern: /\/engineering\.html\?.*categorynum=006001001/i,
    transport: "system-curl",
    detailResolver: "hebi-visiturl",
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
    id: 11,
    key: "jiaozuo",
    name: "焦作市公共资源交易中心",
    entry: "https://ggzy.jiaozuo.gov.cn/",
    listEntry: "https://ggzy.jiaozuo.gov.cn/jyxx/006001/006001001/project.html",
    scanEntry: "https://ggzy.jiaozuo.gov.cn/",
    region: "河南省 · 焦作市",
    type: "公共资源交易中心",
    adapter: "generic-html",
    detailPattern: /\/jyxx\/006001\/006001001\/20\d{6}\//i,
  },
  {
    id: 12,
    key: "xuchang",
    name: "许昌市公共资源交易中心",
    entry: "https://ggzy.xuchang.gov.cn/",
    listEntry: "https://ggzy.xuchang.gov.cn/jyxx/jyxx.html",
    scanEntry: "https://ggzy.xuchang.gov.cn/",
    region: "河南省 · 许昌市",
    type: "公共资源交易中心",
    adapter: "generic-html",
    detailPattern: /\/jyxx\/002001\/002001002\/20\d{6}\//i,
  },
  {
    id: 13,
    key: "luohe",
    name: "漯河市公共资源交易中心",
    entry: "https://ggzy.luohe.gov.cn/",
    listEntry: "https://ggzy.luohe.gov.cn/front/bidcontent/9005001001",
    region: "河南省 · 漯河市",
    type: "公共资源交易中心",
    adapter: "luohe-api",
  },
  {
    id: 14,
    key: "sanmenxia",
    name: "三门峡市公共资源交易中心",
    entry: "http://gzjy.smx.gov.cn/",
    listEntry: "http://gzjy.smx.gov.cn/jyxx/001001/moreinfojy.html",
    scanEntry: "http://gzjy.smx.gov.cn/jyxx/001001/moreinfojy.html",
    region: "河南省 · 三门峡市",
    type: "公共资源交易中心",
    adapter: "generic-html",
    detailPattern: /\/jyxx\/001001\/001001001\/20\d{6}\//i,
    sourceNote: "截图中的旧域名 ggzy.smx.gov.cn 已失效，已改用当前官方域名 gzjy.smx.gov.cn",
  },
  {
    id: 15,
    key: "nanyang",
    name: "南阳市公共资源交易中心",
    entry: "https://ggzyjy.nanyang.gov.cn/",
    listEntry: "https://ggzyjy.nanyang.gov.cn/jyxx/002001/002001002/transaction.html",
    region: "河南省 · 南阳市",
    type: "公共资源交易中心",
    adapter: "generic-html",
    detailPattern: /\/jyxx\/002001\/002001002\/20\d{6}\//i,
  },
  {
    id: 7,
    key: "shangqiu",
    name: "商丘市公共资源交易中心",
    entry: "https://ggzyjy.shangqiu.gov.cn/",
    listEntry: "https://ggzyjy.shangqiu.gov.cn/HNSQ/TradeCenter/tradeList.do?Deal_Type=Deal_Type1&Notice_Type=1",
    region: "河南省 · 商丘市",
    type: "公共资源交易中心",
    adapter: "shangqiu-html",
  },
  {
    id: 16,
    key: "xinyang",
    name: "信阳市公共资源交易中心",
    entry: "https://ggzyjy.xinyang.gov.cn/",
    listEntry: "https://ggzyjy.xinyang.gov.cn/jyxx/002001/002001001/moreinfo.html",
    region: "河南省 · 信阳市",
    type: "公共资源交易中心",
    adapter: "generic-html",
    detailPattern: /\/jyxx\/002001\/002001001\/20\d{6}\//i,
  },
  {
    id: 17,
    key: "zhumadian",
    name: "驻马店市公共资源交易中心",
    entry: "https://ggzy.zhumadian.gov.cn/TPFront/",
    listEntry: "https://ggzy.zhumadian.gov.cn/TPFront/jyxx/003001/003001001/",
    region: "河南省 · 驻马店市",
    type: "公共资源交易中心",
    adapter: "generic-html",
    detailPattern: /\/TPFront\/InfoDetail\/\?.*CategoryNum=003001001/i,
    transport: "system-curl",
  },
  {
    id: 8,
    key: "zhengzhou-airport",
    name: "郑州航空港经济综合实验区公共资源交易中心",
    entry: "http://www.zzhkgggzy.cn:18082/",
    listEntry: "http://www.zzhkgggzy.cn:18082/jyxx/001001/transaction.html",
    region: "河南省 · 郑州航空港区",
    type: "公共资源交易中心",
    adapter: "epoint-search",
    category: "001001003",
    cnum: "001",
    wd: "监理",
    fields: "title",
    noParticiple: "0",
  },
  {
    id: 18,
    key: "jiyuan",
    name: "济源市公共资源交易中心",
    entry: "https://ggzyjy.jiyuan.gov.cn/",
    listEntry: "https://ggzyjy.jiyuan.gov.cn/jyxx/008001/008001003/list2.html",
    region: "河南省 · 济源市",
    type: "公共资源交易中心",
    adapter: "generic-html",
    detailPattern: /\/jyxx\/008001\/008001003\/20\d{6}\//i,
  },
];

export async function scanSource(source, now = new Date()) {
  let result;
  if (source.adapter === "epoint-search") result = await scanEpointSource(source, now);
  else if (source.adapter === "kaifeng-html") result = await scanKaifeng(source, now);
  else if (source.adapter === "henan-public-api") result = await scanHenanPublic(source, now);
  else if (source.adapter === "xinxiang-html") result = await scanXinxiang(source, now);
  else if (source.adapter === "shangqiu-html") result = await scanShangqiu(source, now);
  else if (source.adapter === "generic-html") result = await scanGenericHtml(source, now);
  else if (source.adapter === "luohe-api") result = await scanLuohe(source, now);
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
    pages.flatMap((html, index) => extractAnchors(html, listUrls[index]))
      .filter((item) => /\/jzb[^/]*\/\d+\.jhtml$/i.test(new URL(item.url).pathname))
      .map(withPublishedDate),
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

async function scanShangqiu(source, now) {
  const endpoint = new URL("/HNSQ/TradeCenter/ColTableInfo.do?", source.entry).toString();
  const html = await fetchText(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      referer: source.listEntry,
      "x-requested-with": "XMLHttpRequest",
    },
    body: new URLSearchParams({
      projectName: "监理",
      date: "1month",
      begin_time: "",
      end_time: "",
      begin_time2: "",
      end_time2: "",
      begin_price: "",
      end_price: "",
      dealType: "Deal_Type1",
      noticType: "1",
      area: "",
      huanJie: "NOTICE",
      pageIndex: "1",
    }).toString(),
  });
  let entries = dedupeBy(
    extractAnchors(html, source.entry)
      .filter((item) => isSupervisionText(item.title || item.text || ""))
      .filter((item) => !/(?:招标计划|中标|结果|候选人|合同|终止|废标)/.test(item.title || ""))
      .map(withPublishedDate)
      .filter((item) => withinDays(item.publishedAt, LOOKBACK_DAYS, now)),
    (item) => item.url,
  );
  if (!entries.length) {
    const fallbackHtml = await fetchText(new URL("/HNSQ/Home/noticeInfo_FJSZ.do", source.entry), {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        referer: source.listEntry,
        "x-requested-with": "XMLHttpRequest",
      },
      body: new URLSearchParams({ ggmc: "监理" }).toString(),
    });
    entries = dedupeBy(
      extractAnchors(fallbackHtml, source.entry)
        .filter((item) => /\/HNSQ\/ContentController\/content\.do/i.test(new URL(item.url).pathname))
        .filter((item) => /(?:huanjie=NOTICE|noticeType=1)(?:&|$)/i.test(new URL(item.url).search.slice(1)))
        .filter((item) => !/(?:中标|结果|候选人|暂停|延期|终止|废标|变更)/.test(item.title || ""))
        .map(withPublishedDate)
        .filter((item) => withinDays(item.publishedAt, LOOKBACK_DAYS, now)),
      (item) => item.url,
    );
  }
  return scanHtmlEntries(source, entries, now);
}

async function scanGenericHtml(source, now) {
  const scanEntry = source.scanEntry || source.listEntry;
  const html = await fetchSourceText(source, scanEntry);
  const entries = dedupeBy(
    extractAnchors(html, scanEntry)
      .filter((item) => source.detailPattern.test(item.url))
      .filter((item) => isSupervisionText(`${item.title} ${item.text}`))
      .filter((item) => !/(?:招标计划|中标|结果|候选人|合同|终止|废标|文件公示|预公示|变更)/.test(item.title || item.text || ""))
      .map(withPublishedDate)
      .filter((item) => withinDays(item.publishedAt, LOOKBACK_DAYS, now)),
    (item) => item.url,
  );
  return scanHtmlEntries(source, entries, now);
}

async function scanLuohe(source, now) {
  const payload = await fetchJson(source.listEntry, {
    filter: { luoheTradeProjectType: "" },
    page: 1,
    rows: 100,
  }, source.entry);
  if (!Array.isArray(payload?.rows)) throw new Error(`${source.name} 列表接口缺少 rows`);
  const entries = payload.rows
    .filter((record) => isSupervisionText(record.title || ""))
    .filter((record) => !/(?:招标计划|中标|结果|候选人|合同|终止|废标|文件公示|预公示|变更)/.test(record.title || ""))
    .map((record) => ({
      url: new URL(`/front/bidcontent/${record.fullCategoryCode || "9005001001"}/${record.id}`, source.entry).toString(),
      title: String(record.title || "").trim(),
      publishedAt: record.publishTime || record.createTime || "",
      text: "",
    }))
    .filter((item) => withinDays(item.publishedAt, LOOKBACK_DAYS, now));
  const projects = [];
  const issues = [];
  for (const entry of dedupeBy(entries, (item) => item.url)) {
    try {
      const response = await fetchText(entry.url, {
        method: "POST",
        headers: {
          "content-type": "application/json;charset=UTF-8",
          referer: source.listEntry,
        },
      });
      const payload = JSON.parse(response);
      const records = Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [];
      const html = records.map((record) => record?.content || "").filter(Boolean).join("\n");
      if (!html) throw new Error("详情接口未返回公告正文");
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

async function scanHtmlEntries(source, entries, now) {
  const projects = [];
  const issues = [];
  for (const entry of entries) {
    try {
      const html = await fetchProjectDetailHtml(source, entry);
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

async function fetchProjectDetailHtml(source, entry) {
  if (source.detailResolver !== "hebi-visiturl") {
    return fetchSourceText(source, entry.fetchUrl || entry.url, { headers: { referer: source.listEntry } });
  }

  const wrapperUrl = new URL(entry.url);
  const infoid = wrapperUrl.searchParams.get("infoid");
  const categorynum = wrapperUrl.searchParams.get("categorynum");
  if (!infoid || !categorynum) throw new Error("鹤壁项目链接缺少 infoid 或 categorynum");

  const endpoint = new URL("/EWB-FRONT/rest/GgSearchAction/getDetails", source.entry).toString();
  const response = await fetchSourceText(source, endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      referer: entry.url,
    },
    body: new URLSearchParams({
      params: JSON.stringify({ siteGuid: "", infoid, categorynum }),
    }).toString(),
  });
  const records = JSON.parse(response);
  const visiturl = Array.isArray(records)
    ? records.find((record) => record?.infoid === infoid)?.visiturl || records[0]?.visiturl
    : null;
  if (!visiturl) throw new Error("鹤壁详情接口未返回实际公告地址");

  return fetchSourceText(source, new URL(visiturl, source.entry).toString(), {
    headers: { referer: entry.url },
  });
}

async function fetchSourceText(source, url, options = {}) {
  if (source.transport !== "system-curl") return fetchText(url, options);
  const moduleName = `node:${"child_process"}`;
  const { execFile } = await import(moduleName);
  const args = [
    "--fail",
    "--silent",
    "--show-error",
    "--location",
    "--compressed",
    "--max-time",
    String(Math.ceil(Number(process.env.TENDER_CRAWLER_TIMEOUT_MS || 25_000) / 1000)),
    "--user-agent",
    "Mozilla/5.0 TenderRadar/0.1 (+public tender monitoring)",
  ];
  const referer = options.headers?.referer;
  if (referer) args.push("--referer", referer);
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET") args.push("--request", method);
  const contentType = options.headers?.["content-type"];
  if (contentType) args.push("--header", `Content-Type: ${contentType}`);
  if (options.body !== undefined) args.push("--data-raw", String(options.body));
  args.push(url);
  return new Promise((resolve, reject) => {
    execFile("curl", args, { encoding: "buffer", maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const detail = Buffer.isBuffer(stderr) ? stderr.toString("utf8").trim() : String(stderr || error.message).trim();
        reject(new Error(`${url} 抓取失败：${detail || error.message}`));
        return;
      }
      resolve(new TextDecoder("utf-8").decode(stdout));
    });
  });
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
    wd: source.wd ?? (source.key === "zhengzhou" ? "%20" : ""),
    inc_wd: "",
    exc_wd: "",
    fields: source.fields ?? (source.key === "zhengzhou" ? "title" : ""),
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
    noParticiple: source.noParticiple || "1",
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
  const pathDate = new URL(item.url).pathname.match(/\/(20\d{2})(\d{2})(\d{2})\//);
  const date = item.text.match(/20\d{2}-\d{1,2}-\d{1,2}/)?.[0]
    || (pathDate ? `${pathDate[1]}-${pathDate[2]}-${pathDate[3]}` : "");
  return { ...item, publishedAt: date };
}
