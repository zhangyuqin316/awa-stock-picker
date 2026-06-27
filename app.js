const topCards = document.querySelector("#topCards");
const stockRows = document.querySelector("#stockRows");
const nearRows = document.querySelector("#nearRows");
const summary = document.querySelector("#summary");
const clock = document.querySelector("#clock");
const refreshButton = document.querySelector("#refreshButton");
const autoRefresh = document.querySelector("#autoRefresh");
const detailModal = document.querySelector("#detailModal");
const backDetail = document.querySelector("#backDetail");
const closeDetail = document.querySelector("#closeDetail");
const detailTitle = document.querySelector("#detailTitle");
const detailSub = document.querySelector("#detailSub");
const detailMetrics = document.querySelector("#detailMetrics");
const companyInfo = document.querySelector("#companyInfo");
const newsLinks = document.querySelector("#newsLinks");
const chartCanvas = document.querySelector("#stockChart");
const chartStatus = document.querySelector("#chartStatus");

let timer = null;
let countdownTimer = null;
let secondsToRefresh = 30;
let summaryText = "正在获取实时行情...";
let refreshCount = 0;
let lastRefreshLabel = "--";
let isRefreshing = false;
let currentStock = null;
let currentChart = "minute";
const REFRESH_SECONDS = 30;

const LIST_URL =
  "https://82.push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5000&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2&fields=f12,f14,f2,f3,f6,f8,f10,f20,f21,f100";

const TENCENT_QUOTE_HOST = "https://qt.gtimg.cn/q=";
let directQuoteCache = null;
let directQuoteCacheTime = 0;

function updateSummary() {
  const refreshState = isRefreshing ? "正在刷新" : `已刷新 ${refreshCount} 次`;
  const countdownText = autoRefresh.checked ? `下次 ${secondsToRefresh} 秒` : "自动刷新已关闭";
  summary.textContent = `${summaryText}｜${refreshState}｜上次 ${lastRefreshLabel}｜${countdownText}`;
}

function setSummary(text) {
  summaryText = text;
  updateSummary();
}

function resetCountdown() {
  secondsToRefresh = REFRESH_SECONDS;
  updateSummary();
}

const SECTOR_RULES = [
  { macro: "科技", sector: "PCB/覆铜板", keywords: ["PCB", "印制电路", "电路板", "覆铜板", "载板", "沪电", "胜宏", "深南", "生益", "景旺", "崇达", "依顿", "奥士康", "明阳电路", "世运"] },
  { macro: "科技", sector: "CPO/光通信", keywords: ["CPO", "光模块", "光通信", "光电", "光器件", "光芯片", "新易盛", "中际旭创", "天孚", "剑桥科技", "太辰光", "联特", "博创", "光迅", "铭普"] },
  { macro: "科技", sector: "AI/算力", keywords: ["AI", "人工智能", "算力", "大模型", "服务器", "数据中心", "云计算", "软件", "信息", "数据", "智能", "网络", "传媒", "数字"] },
  { macro: "科技", sector: "半导体/芯片", keywords: ["半导体", "芯片", "集成电路", "封测", "晶圆", "光刻", "存储", "电子", "微电", "硅", "华虹", "中芯", "兆易", "韦尔", "北方华创"] },
  { macro: "科技", sector: "消费电子/显示面板", keywords: ["消费电子", "面板", "显示", "模组", "触控", "OLED", "MiniLED", "MicroLED", "翰博", "京东方", "TCL", "蓝思", "立讯", "歌尔", "东山精密"] },
  { macro: "高端制造", sector: "机器人/自动化", keywords: ["机器人", "自动化", "减速器", "伺服", "数控", "智能制造", "机床", "精密", "机械"] },
  { macro: "新能源", sector: "新能源汽车/汽配", keywords: ["新能源车", "汽车", "汽配", "车业", "电机", "电控", "热管理", "一体化压铸", "充电桩", "涛涛"] },
  { macro: "新能源", sector: "光伏/储能", keywords: ["光伏", "储能", "锂电", "电池", "逆变器", "硅片", "组件", "固态电池", "钠电"] },
  { macro: "周期", sector: "化工/新材料", keywords: ["化工", "新材", "材料", "树脂", "助剂", "PVC", "橡胶", "塑料", "日科", "钛白粉", "氟化工"] },
  { macro: "周期", sector: "有色/稀土/黄金", keywords: ["有色", "稀土", "黄金", "铜", "铝", "锂", "钴", "镍", "钨", "钼", "矿业"] },
  { macro: "医药", sector: "医药/创新药", keywords: ["医药", "制药", "生物", "医疗", "创新药", "CRO", "疫苗", "中药", "药业"] },
  { macro: "消费", sector: "食品饮料/零售", keywords: ["食品", "饮料", "酒", "乳业", "零售", "旅游", "酒店", "餐饮", "家居", "服饰"] },
];

function yi(value) {
  return `${(value / 100000000).toFixed(2)} 亿`;
}

function pct(value) {
  return `${value.toFixed(2)}%`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function marketPrefix(code) {
  return code.startsWith("6") ? "SH" : "SZ";
}

function secid(code) {
  return `${code.startsWith("6") ? "1" : "0"}.${code}`;
}

function metric(label, value, className = "") {
  return `<div class="metric"><b class="${className}">${value}</b><span>${label}</span></div>`;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalize(raw) {
  if (raw.code) return raw;
  return {
    code: raw.f12,
    name: raw.f14,
    price: raw.f2,
    changePct: raw.f3,
    amount: raw.f6,
    turnoverRate: raw.f8,
    volumeRatio: raw.f10,
    marketCap: raw.f20,
    freeMarketCap: raw.f21,
    industry: raw.f100 || "-",
  };
}

function scoreStock(stock) {
  const pctScore = Math.max(0, 25 - Math.abs(stock.changePct - 5) * 8);
  const turnoverScore = Math.max(0, 25 - Math.abs(stock.turnoverRate - 6.5) * 10);
  const volumeRatioScore = Math.max(0, 20 - Math.abs(stock.volumeRatio - 1.45) * 12);
  const amountScore = Math.min(15, stock.amount / 100000000);
  const capScore = Math.max(0, 15 - Math.abs(stock.marketCap / 100000000 - 65) * 0.35);
  return Math.round((pctScore + turnoverScore + volumeRatioScore + amountScore + capScore) * 10) / 10;
}

function distancePenalty(stock) {
  let penalty = 0;
  if (stock.changePct < 3) penalty += (3 - stock.changePct) * 14;
  if (stock.changePct > 7) penalty += (stock.changePct - 7) * 14;
  if (stock.volumeRatio >= 2) penalty += (stock.volumeRatio - 2) * 18;
  if (stock.turnoverRate < 5) penalty += (5 - stock.turnoverRate) * 12;
  if (stock.turnoverRate > 8) penalty += (stock.turnoverRate - 8) * 12;
  if (stock.amount <= 100000000) penalty += (1 - stock.amount / 100000000) * 12;
  if (stock.marketCap < 3000000000) penalty += (30 - stock.marketCap / 100000000) * 0.6;
  if (stock.marketCap > 10000000000) penalty += (stock.marketCap / 100000000 - 100) * 0.35;
  return Math.max(0, penalty);
}

function passesBase(stock) {
  if (!stock.code || !stock.name) return false;
  if (stock.code.startsWith("688") || stock.code.startsWith("689")) return false;
  if (stock.name.includes("ST") || stock.name.includes("*ST")) return false;
  return isNumber(stock.changePct) && isNumber(stock.volumeRatio) && isNumber(stock.turnoverRate) && isNumber(stock.amount) && isNumber(stock.marketCap);
}

function passesRules(stock) {
  return (
    passesBase(stock) &&
    stock.changePct >= 3 &&
    stock.changePct <= 7 &&
    stock.volumeRatio < 2 &&
    stock.turnoverRate >= 5 &&
    stock.turnoverRate <= 8 &&
    stock.amount > 100000000 &&
    stock.marketCap >= 3000000000 &&
    stock.marketCap <= 10000000000
  );
}

function reasonFor(stock, near = false) {
  const text = `涨幅 ${pct(stock.changePct)}，量比 ${stock.volumeRatio.toFixed(2)}，换手 ${pct(stock.turnoverRate)}，成交额 ${yi(stock.amount)}，总市值 ${yi(stock.marketCap)}`;
  return near ? `${text}，接近条件但未完全命中` : text;
}

function getSectorProfile(stock) {
  const text = `${stock.name || ""} ${stock.industry || ""}`.toLowerCase();
  const matched = SECTOR_RULES.map((rule) => {
    const hits = rule.keywords.filter((keyword) => text.includes(String(keyword).toLowerCase()));
    return { ...rule, hits };
  })
    .filter((rule) => rule.hits.length)
    .sort((a, b) => b.hits.length - a.hits.length)[0];

  if (matched) {
    return {
      macro: matched.macro,
      sector: matched.sector,
      keywords: matched.hits.slice(0, 5),
      queryTerms: [matched.sector, matched.macro, ...matched.hits].slice(0, 5),
      confidence: matched.hits.length >= 2 ? "较高" : "中等",
    };
  }

  const rawIndustry = stock.industry && !stock.industry.startsWith("GP-") ? stock.industry : "待确认";
  return {
    macro: rawIndustry === "待确认" ? "其他" : rawIndustry,
    sector: rawIndustry === "待确认" ? "未识别细分板块" : rawIndustry,
    keywords: rawIndustry === "待确认" ? [] : [rawIndustry],
    queryTerms: rawIndustry === "待确认" ? [stock.name] : [rawIndustry, stock.name],
    confidence: "较低",
  };
}

function getPositionView(stock) {
  const amountYi = stock.amount / 100000000;
  const capYi = stock.marketCap / 100000000;
  const rank = stock.sectorRank || 99;
  const heat = stock.changePct >= 5.8 ? "偏热" : stock.changePct >= 4.2 ? "温和走强" : "刚启动";
  const volumeState = stock.volumeRatio < 1 ? "缩量/低量推进" : stock.volumeRatio < 1.45 ? "温和放量" : "放量明显";
  const turnoverState = stock.turnoverRate >= 7.2 ? "换手较充分" : stock.turnoverRate >= 6 ? "换手健康" : "换手刚达标";
  const moneyState = amountYi >= 5 ? "资金参与度强" : amountYi >= 2.5 ? "资金参与度中上" : "资金参与度一般";

  let power = 0;
  if (stock.matched) power += 1.5;
  if (stock.score >= 78) power += 2;
  else if (stock.score >= 70) power += 1;
  if (rank === 1) power += 2.5;
  else if (rank === 2) power += 1.3;
  else if (rank <= 4) power += 0.5;
  if (amountYi >= 5) power += 1.4;
  else if (amountYi >= 2.5) power += 0.8;
  if (stock.changePct >= 4.2 && stock.changePct <= 6.5) power += 1;
  if (stock.volumeRatio >= 1 && stock.volumeRatio <= 1.7) power += 0.8;
  if (stock.turnoverRate >= 6 && stock.turnoverRate <= 7.8) power += 0.8;
  if (capYi < 35 || capYi > 95) power -= 0.5;

  let level = "边缘补涨/谨慎观察";
  if (rank === 1 && power >= 7.2) level = "板块前排/疑似龙头";
  else if (rank <= 2 && power >= 5.8) level = "板块核心跟风";
  else if (power >= 4.6) level = "板块中排跟随";

  const shortTerm = (() => {
    if (!stock.matched) return `短线：不完整，${volumeState}、${turnoverState}，更适合等下一次放量确认。`;
    if (level.includes("龙头")) return `短线：强观察，${heat}、${volumeState}、${turnoverState}，次日重点看高开后是否继续放量承接。`;
    if (level.includes("核心")) return `短线：可观察，属于前排跟风，${moneyState}，适合盯板块龙头脸色和分时承接。`;
    if (level.includes("中排")) return `短线：只适合轻关注，位置不算最强，冲高后容易受板块情绪影响。`;
    return `短线：谨慎，更多是补涨或边缘异动，除非板块继续扩散，否则不宜追高。`;
  })();

  const midTerm = (() => {
    if (stock.sector?.confidence === "较低") return "中线：板块归属不清，不适合仅凭当前异动纳入中线。";
    if (amountYi >= 3 && capYi >= 40 && capYi <= 90 && rank <= 3) return "中线：可以进入板块观察池，重点看后续是否维持量能和沿均线上行。";
    if (amountYi >= 1.5 && capYi >= 30 && capYi <= 100) return "中线：可弱跟踪，但需要板块持续有新闻和资金反复活跃。";
    return "中线：暂不占优，成交额或市值结构不够理想，先当短线异动看。";
  })();

  const longTerm = (() => {
    if (stock.sector?.confidence === "较低") return "长线：暂不判断，题材和主营匹配度不够明确。";
    if (level.includes("龙头") && amountYi >= 5) return "长线：只能作为行业线索，若后续业绩和行业景气兑现，再考虑长线逻辑。";
    return "长线：本工具主要看短中线量价，长线仍要回到业绩、订单、估值和行业周期。";
  })();

  const outlook = (() => {
    if (level.includes("龙头")) return "后续发展：若板块新闻继续发酵并且同板块个股跟涨，它有机会继续走成阶段前排；若放量滞涨，要防高位分歧。";
    if (level.includes("核心")) return "后续发展：更依赖板块龙头继续打开高度；如果龙头降温，它可能先回落，若板块扩散则有补涨空间。";
    if (level.includes("中排")) return "后续发展：需要等板块二次确认，单独走强概率弱于前排，适合看承接不适合盲追。";
    return "后续发展：当前更像边缘异动，除非新闻催化增强或成交额继续放大，否则容易一日游。";
  })();

  return { level, shortTerm, midTerm, longTerm, outlook, power: Math.round(power * 10) / 10, heat, volumeState, turnoverState };
}

function enrichStock(stock) {
  const sector = getSectorProfile(stock);
  return {
    ...stock,
    sector,
    sectorLabel: `${sector.macro} / ${sector.sector}`,
  };
}

function attachSectorRanks(stocks) {
  const groups = new Map();
  stocks.forEach((stock) => {
    const key = stock.sector?.sector || "未识别细分板块";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(stock);
  });

  groups.forEach((items) => {
    items
      .sort((a, b) => (b.score + b.changePct + b.amount / 100000000) - (a.score + a.changePct + a.amount / 100000000))
      .forEach((stock, index) => {
        stock.sectorRank = index + 1;
        stock.position = getPositionView(stock);
      });
  });
}

function buildPayload(rawRows) {
  const all = rawRows.map(normalize).filter(passesBase);
  const strictCandidates = all
    .filter(passesRules)
    .map((stock) => ({
      ...enrichStock(stock),
      matched: true,
      score: scoreStock(stock),
      reason: reasonFor(stock),
    }))
    .sort((a, b) => b.score - a.score);
  const strictCodes = new Set(strictCandidates.map((stock) => stock.code));
  const nearCandidates = all
    .filter((stock) => !strictCodes.has(stock.code))
    .map((stock) => ({
      ...enrichStock(stock),
      matched: false,
      score: Math.max(0, Math.round((scoreStock(stock) - distancePenalty(stock)) * 10) / 10),
      reason: reasonFor(stock, true),
    }))
    .sort((a, b) => b.score - a.score);
  attachSectorRanks(strictCandidates.concat(nearCandidates));

  return {
    source: "东方财富公开行情",
    fetchedAt: new Date().toISOString(),
    top3: strictCandidates.concat(nearCandidates).slice(0, 3),
    candidates: strictCandidates.slice(0, 50),
    nearCandidates: nearCandidates.slice(0, 20),
    marketCount: all.length,
    candidateCount: strictCandidates.length,
  };
}

function fallbackPayload(message = "实时行情源暂时不可用") {
  return {
    source: `离线兜底：${message}`,
    fetchedAt: new Date().toISOString(),
    top3: [],
    candidates: [],
    nearCandidates: [],
    marketCount: 0,
    candidateCount: 0,
    stale: true,
  };
}

function tencentSymbol(code) {
  return `${code.startsWith("6") ? "sh" : "sz"}${code}`;
}

function buildScanCodes() {
  const ranges = [
    [1, 3999],
    [300001, 301999],
    [600000, 605999],
  ];
  const codes = [];
  ranges.forEach(([start, end]) => {
    for (let value = start; value <= end; value += 1) {
      const code = String(value).padStart(6, "0");
      if (!code.startsWith("688") && !code.startsWith("689")) codes.push(code);
    }
  });
  return codes;
}

function loadTencentBatch(symbols) {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.charset = "gbk";
    script.onload = () => {
      const rows = symbols.map((symbol) => window[`v_${symbol}`]).filter(Boolean);
      script.remove();
      resolve(rows);
    };
    script.onerror = () => {
      script.remove();
      resolve([]);
    };
    script.src = `${TENCENT_QUOTE_HOST}${symbols.join(",")}&_=${Date.now()}`;
    document.body.appendChild(script);
  });
}

function parseTencentQuote(row) {
  const fields = String(row || "").split("~");
  const stock = {
    code: fields[2],
    name: fields[1],
    price: Number(fields[3]),
    changePct: Number(fields[32]),
    amount: Number(fields[57] || fields[37]) * 10000,
    turnoverRate: Number(fields[38]),
    volumeRatio: Number(fields[49]),
    marketCap: Number(fields[44]) * 100000000,
    freeMarketCap: Number(fields[45]) * 100000000,
    industry: fields[61] || "A股",
  };
  return passesBase(stock) ? stock : null;
}

async function loadTencentDirectMarket() {
  const now = Date.now();
  if (directQuoteCache && now - directQuoteCacheTime < 60000) return directQuoteCache;

  const codes = buildScanCodes();
  const rows = [];
  for (let index = 0; index < codes.length; index += 180) {
    setSummary(`正在直连腾讯实时行情：${Math.min(index + 180, codes.length)} / ${codes.length}`);
    const symbols = codes.slice(index, index + 180).map(tencentSymbol);
    const batchRows = await loadTencentBatch(symbols);
    rows.push(...batchRows.map(parseTencentQuote).filter(Boolean));
  }

  const payload = buildPayload(rows);
  payload.source = "腾讯真实实时行情（浏览器直连全A扫描）";
  payload.stale = false;
  directQuoteCache = payload;
  directQuoteCacheTime = now;
  return payload;
}

function isDemoPayload(data) {
  return Boolean(data?.stale || data?.source?.includes("演示") || data?.top3?.some((stock) => /^00000[0-2]$/.test(stock.code)));
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `stockPicker_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    window[callbackName] = (data) => {
      resolve(data);
      script.remove();
      delete window[callbackName];
    };
    script.onerror = () => {
      script.remove();
      delete window[callbackName];
      reject(new Error("行情接口加载失败"));
    };
    script.src = `${url}${url.includes("?") ? "&" : "?"}cb=${callbackName}`;
    document.body.appendChild(script);
  });
}

async function loadMarketList() {
  try {
    if (location.protocol === "file:") {
      const json = await jsonp(LIST_URL);
      return buildPayload(json.data?.diff || []);
    }
    const response = await fetch("/api/stocks?force=1", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "获取行情失败");
    if (isDemoPayload(data)) {
      return await loadTencentDirectMarket();
    }
    return data;
  } catch (error) {
    try {
      return await loadTencentDirectMarket();
    } catch (directError) {
      return fallbackPayload(`${error.message}；前端直连也失败：${directError.message}`);
    }
  }
}

function renderTop(stocks) {
  if (!stocks.length) {
    topCards.innerHTML = `<div class="card empty">当前没有可展示的股票。可能是行情源暂时连不上，稍后点“刷新”即可重试。</div>`;
    return;
  }

  topCards.innerHTML = stocks
    .map(
      (stock, index) => `
        <article class="card">
          <div class="cardHead">
            <div>
              <h2>${index + 1}. ${stock.name}</h2>
              <div class="code">${stock.code} · ${stock.sectorLabel || stock.industry}</div>
            </div>
            <div class="score">${stock.score}</div>
          </div>
          <div class="badge ${stock.matched ? "ok" : "near"}">${stock.matched ? "完全命中" : "接近条件"}</div>
          <div class="sectorLine">
            <span>${stock.position?.level || "板块位置待确认"}</span>
            <span>${stock.sectorRank ? `板块内第 ${stock.sectorRank}` : "板块排序待确认"}</span>
          </div>
          <div class="metrics">
            ${metric("现价", stock.price.toFixed(2))}
            ${metric("涨幅", pct(stock.changePct), stock.changePct >= 0 ? "up" : "down")}
            ${metric("量比", stock.volumeRatio.toFixed(2))}
            ${metric("换手", pct(stock.turnoverRate))}
            ${metric("成交额", yi(stock.amount))}
            ${metric("总市值", yi(stock.marketCap))}
          </div>
          <p class="reason">${stock.reason}</p>
          <button class="smallButton detailButton" type="button" data-code="${stock.code}">详情</button>
        </article>
      `
    )
    .join("");
}

function renderRows(target, stocks, emptyText) {
  if (!stocks.length) {
    target.innerHTML = `<tr><td colspan="12" class="empty">${emptyText}</td></tr>`;
    return;
  }

  target.innerHTML = stocks
    .map(
      (stock, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${stock.code}</td>
          <td>${stock.name}</td>
          <td>${stock.price.toFixed(2)}</td>
          <td class="${stock.changePct >= 0 ? "up" : "down"}">${pct(stock.changePct)}</td>
          <td>${stock.volumeRatio.toFixed(2)}</td>
          <td>${pct(stock.turnoverRate)}</td>
          <td>${yi(stock.amount)}</td>
          <td>${yi(stock.marketCap)}</td>
          <td>
            <div class="sectorCell">
              <b>${stock.sector?.macro || "其他"}</b>
              <span>${stock.sector?.sector || stock.sectorLabel || stock.industry}</span>
              <em>${stock.position?.level || "定位待确认"}</em>
            </div>
          </td>
          <td>${stock.score}</td>
          <td><button class="smallButton detailButton" type="button" data-code="${stock.code}">详情</button></td>
        </tr>
      `
    )
    .join("");
}

async function loadStocks() {
  resetCountdown();
  isRefreshing = true;
  updateSummary();
  refreshButton.disabled = true;
  refreshButton.textContent = "刷新中";
  try {
    const data = await loadMarketList();
    window.stockPickerData = data;
    renderTop(data.top3);
    renderRows(stockRows, data.candidates, "暂无完全命中的股票");
    renderRows(nearRows, data.nearCandidates || [], "暂无接近条件的股票");
    setSummary(`扫描 ${data.marketCount} 只，完全命中 ${data.candidateCount} 只。数据源：${data.source}${data.stale ? "（显示缓存）" : ""}`);
    clock.textContent = `更新时间：${formatTime(data.fetchedAt)}`;
    refreshCount += 1;
    lastRefreshLabel = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  } catch (error) {
    setSummary(`获取失败：${error.message}`);
  } finally {
    isRefreshing = false;
    updateSummary();
    refreshButton.disabled = false;
    refreshButton.textContent = "刷新";
  }
}

function findStock(code) {
  const data = window.stockPickerData || {};
  return [...(data.top3 || []), ...(data.candidates || []), ...(data.nearCandidates || [])].find((stock) => stock.code === code);
}

function setDetailMetrics(stock) {
  detailMetrics.innerHTML = `
    ${metric("现价", stock.price.toFixed(2))}
    ${metric("涨幅", pct(stock.changePct), stock.changePct >= 0 ? "up" : "down")}
    ${metric("量比", stock.volumeRatio.toFixed(2))}
    ${metric("换手", pct(stock.turnoverRate))}
    ${metric("成交额", yi(stock.amount))}
    ${metric("总市值", yi(stock.marketCap))}
  `;
}

function renderStockAnalysis(stock) {
  const sector = stock.sector || getSectorProfile(stock);
  const position = stock.position || getPositionView(stock);
  const keywords = sector.keywords.length ? sector.keywords.join("、") : "暂无明确关键词";
  return `
    <div class="analysisBox">
      <h4>板块与定位</h4>
      <div class="analysisGrid">
        <div><b>${sector.macro}</b><span>大板块</span></div>
        <div><b>${sector.sector}</b><span>细分板块</span></div>
        <div><b>${position.level}</b><span>龙头/跟风判断</span></div>
        <div><b>${sector.confidence}</b><span>板块识别置信度</span></div>
      </div>
      <p>命中关键词：${keywords}。${stock.sectorRank ? `在当前候选池同细分板块中排第 ${stock.sectorRank}。` : "同板块排序暂未形成。"} 当前量价：${position.heat}、${position.volumeState}、${position.turnoverState}。</p>
      <h4>周期适配</h4>
      <p>${position.shortTerm}</p>
      <p>${position.midTerm}</p>
      <p>${position.longTerm}</p>
      <h4>后续观察</h4>
      <p>${position.outlook}</p>
      <p class="riskNote">这是基于涨幅、量比、换手、成交额、市值和板块关键词的规则判断，不构成买卖建议；真正是否走强，要继续看板块强度、量能承接和大盘环境。</p>
    </div>
  `;
}

function summarizeTitle(title, stock) {
  const clean = String(title || "").replace(/\s+/g, " ").trim();
  if (!clean) return "这条新闻暂时没有摘要。";
  const tags = [];
  if (/涨停|涨幅|大涨|拉升|冲高/.test(clean)) tags.push("偏股价异动");
  if (/跌停|下跌|回落|跳水|走低/.test(clean)) tags.push("偏风险提醒");
  if (/公告|披露|减持|增持|质押|回购|业绩|利润|营收/.test(clean)) tags.push("偏公司公告");
  if (/行业|板块|概念|有色|AI|算力|机器人|新能源|半导体/.test(clean)) tags.push("偏题材/行业");
  if (/资金|主力|龙虎榜|北向|融资/.test(clean)) tags.push("偏资金面");
  const prefix = tags.length ? `${tags.join("、")}：` : "";
  return `${prefix}这条消息主要围绕“${clean}”，需要结合 ${stock.name} 当天走势和成交量判断影响。`;
}

function renderNewsItems(items, stock) {
  if (!items.length) {
    newsLinks.innerHTML = `<div class="newsCard">暂时没有抓到 ${stock.name} 的相关新闻摘要。盘中接口偶尔会延迟，可以稍后再点开详情刷新。</div>`;
    return;
  }

  newsLinks.innerHTML = items
    .slice(0, 8)
    .map(
      (item) => `
        <article class="newsCard">
          <div class="newsTitle">${item.title || "未命名新闻"}</div>
          <div class="newsMeta">${item.source || "公开资讯"} · ${item.time || "时间未知"}</div>
          <p>${item.summary || summarizeTitle(item.title, stock)}</p>
        </article>
      `
    )
    .join("");
}

function isDemoStock(stock) {
  return stock?.industry === "演示数据" || /^演示候选/.test(stock?.name || "");
}

function demoNews(stock) {
  return [
    {
      title: `${stock.name} 当前为演示候选`,
      source: "系统提示",
      time: formatTime(new Date().toISOString()),
      summary: "实时行情源暂时不可用，所以这里先展示演示摘要。等行情源恢复后，新闻区会直接显示该股票相关新闻的大意。",
    },
    {
      title: "筛选逻辑说明",
      source: "工具内置",
      time: "当前",
      summary: "这个工具按涨幅 3%-7%、量比小于 2、换手 5%-8%、成交额大于 1 亿、市值 30-100 亿来筛选，并排除 ST。",
    },
  ];
}

function localSectorNews(stock) {
  const sector = stock.sector || getSectorProfile(stock);
  const now = formatTime(new Date().toISOString());
  const focus = [sector.sector, sector.macro, ...(sector.queryTerms || [])]
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 5)
    .join("、");

  return [
    {
      title: `${sector.sector}近期新闻统筹`,
      source: "本地统筹",
      time: now,
      summary: `新闻接口暂时没有返回可读内容，先按板块统筹看：重点关注${focus || "板块热度、政策催化、订单变化和资金异动"}这些方向最近是否反复发酵。`,
    },
    {
      title: `${stock.name}与${sector.sector}的联动`,
      source: "本地统筹",
      time: now,
      summary: `如果同板块多只股票同步走强，说明更像板块行情；如果只有${stock.name}单独异动，就要重点看分时承接、成交额和次日是否继续放量。`,
    },
    {
      title: `${sector.sector}资金与情绪观察`,
      source: "本地统筹",
      time: now,
      summary: "短线更看板块强度和前排股票表现；中线要看新闻催化能否变成业绩、订单或政策落地，单纯概念热度容易来得快去得也快。",
    },
    {
      title: `${sector.sector}风险提示`,
      source: "本地统筹",
      time: now,
      summary: "如果新闻热度很高但量比突然过大、换手过热，容易出现冲高兑现；如果新闻不连续，边缘跟风股更容易回落。",
    },
  ];
}

function demoTrend(stock, count = 120) {
  const start = stock.price * 0.985;
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index / 9) * stock.price * 0.006;
    const drift = (index / Math.max(1, count - 1)) * stock.price * 0.018;
    return {
      time: String(index),
      price: Math.max(0.01, start + wave + drift),
      volume: 0,
      amount: 0,
      avg: stock.price,
    };
  });
}

function demoKlines(stock, count = 80) {
  let close = stock.price * 0.92;
  return Array.from({ length: count }, (_, index) => {
    const change = Math.sin(index / 5) * 0.018 + 0.004;
    const open = close;
    close = Math.max(0.01, close * (1 + change));
    const high = Math.max(open, close) * 1.018;
    const low = Math.min(open, close) * 0.982;
    return {
      date: String(index + 1),
      open,
      close,
      high,
      low,
      volume: 0,
      amount: 0,
    };
  });
}

async function loadNews(stock) {
  newsLinks.innerHTML = `<div class="newsCard">正在加载 ${stock.name} 的新闻速览...</div>`;
  if (isDemoStock(stock)) {
    renderNewsItems(demoNews(stock), stock);
    return;
  }
  if (location.protocol === "file:") {
    newsLinks.innerHTML = `<div class="newsCard">新闻速览需要通过本地服务加载。请运行“启动智能选股工具.ps1”，再打开 http://localhost:8787，这里会直接显示新闻标题和大意。</div>`;
    return;
  }

  try {
    const sector = stock.sector || getSectorProfile(stock);
    const params = new URLSearchParams({
      code: stock.code,
      name: stock.name,
      sector: sector.sector,
      macro: sector.macro,
      keywords: sector.queryTerms.join(","),
    });
    const response = await fetch(`/api/news?${params.toString()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "新闻加载失败");
    renderNewsItems(data.news || [], stock);
  } catch (error) {
    newsLinks.innerHTML = `<div class="newsCard">新闻加载失败：${error.message}</div>`;
  }
}

loadNews = async function loadNewsV2(stock) {
  newsLinks.innerHTML = `<div class="newsCard">正在加载 ${stock.name} 的新闻统筹...</div>`;
  if (isDemoStock(stock)) {
    renderNewsItems(demoNews(stock), stock);
    return;
  }
  if (location.protocol === "file:") {
    renderNewsItems(localSectorNews(stock), stock);
    return;
  }

  try {
    const sector = stock.sector || getSectorProfile(stock);
    const params = new URLSearchParams({
      code: stock.code,
      name: stock.name,
      sector: sector.sector,
      macro: sector.macro,
      keywords: sector.queryTerms.join(","),
    });
    const response = await fetch(`/api/news?${params.toString()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "新闻加载失败");
    const items = data.news && data.news.length ? data.news : localSectorNews(stock);
    renderNewsItems(items, stock);
  } catch {
    renderNewsItems(localSectorNews(stock), stock);
  }
};

async function loadCompanyInfo(stock) {
  companyInfo.textContent = "正在加载公司内容...";
  const analysisHtml = renderStockAnalysis(stock);
  if (isDemoStock(stock)) {
    companyInfo.innerHTML = `
      <div class="companyMeta">
        <div>类型：演示候选</div>
        <div>行业：${stock.industry}</div>
        <div>状态：实时行情源暂时不可用</div>
      </div>
      ${analysisHtml}
      <p>这不是实盘股票推荐，只是为了在行情接口不可用时保留页面结构和操作体验。等数据源恢复后，这里会显示真实公司简介。</p>
      <p>你可以继续检查手机布局、详情弹窗、分时线、日K、周K、月K和新闻速览区域。</p>
    `;
    return;
  }
  if (location.protocol === "file:") {
    companyInfo.innerHTML = `
      <div class="companyMeta">
        <div>行业：${stock.industry}</div>
        <div>板块：${stock.sectorLabel || "-"}</div>
        <div>市场：${marketPrefix(stock.code) === "SH" ? "上交所" : "深交所"}</div>
      </div>
      ${analysisHtml}
      当前是直接打开网页模式。图表可正常使用；如需自动显示公司简介和新闻速览，请运行“启动智能选股工具.ps1”后从 http://localhost:8787 打开。
    `;
    return;
  }

  try {
    const response = await fetch(`/api/company?code=${stock.code}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "公司内容加载失败");
    const profile = data.profile || {};
    companyInfo.innerHTML = `
      <div class="companyMeta">
        <div>公司：${profile.company || stock.name}</div>
        <div>行业：${profile.industry || stock.industry}</div>
        <div>板块：${stock.sectorLabel || "-"}</div>
        <div>上市日期：${profile.listingDate || "-"}</div>
        <div>地区：${profile.province || "-"}</div>
      </div>
      ${analysisHtml}
      <p>${profile.description || "暂无公司简介。"}</p>
      <p>主营范围：${profile.businessScope || "-"}</p>
    `;
  } catch (error) {
    companyInfo.innerHTML = `${analysisHtml}<p>公司内容加载失败：${error.message}</p>`;
  }
}

getPositionView = function getPositionViewV2(stock) {
  const amountYi = stock.amount / 100000000;
  const capYi = stock.marketCap / 100000000;
  const rank = stock.sectorRank || 99;
  const pctValue = stock.changePct;
  const vr = stock.volumeRatio;
  const tr = stock.turnoverRate;

  const heat = pctValue >= 6.2 ? "偏高潮" : pctValue >= 4.8 ? "主升观察" : "温和启动";
  const volumeState = vr < 1 ? "量能偏弱" : vr < 1.35 ? "温和放量" : vr < 1.75 ? "放量健康" : "放量偏急";
  const turnoverState = tr >= 7.4 ? "换手充分但接近上沿" : tr >= 6 ? "换手较健康" : "换手刚达标";
  const moneyState = amountYi >= 5 ? "成交额强" : amountYi >= 2.5 ? "成交额中等偏强" : "成交额刚过门槛";

  let power = 0;
  if (stock.matched) power += 1.5;
  if (stock.score >= 80) power += 2;
  else if (stock.score >= 72) power += 1.2;
  else if (stock.score >= 65) power += 0.5;
  if (rank === 1) power += 2.6;
  else if (rank === 2) power += 1.5;
  else if (rank <= 4) power += 0.8;
  if (amountYi >= 5) power += 1.3;
  else if (amountYi >= 2.5) power += 0.8;
  if (pctValue >= 4 && pctValue <= 6.2) power += 1;
  if (vr >= 1.05 && vr <= 1.65) power += 1;
  if (tr >= 5.6 && tr <= 7.4) power += 0.8;
  if (capYi >= 45 && capYi <= 85) power += 0.6;
  if (pctValue > 6.6 || vr > 1.8 || tr > 7.7) power -= 0.8;
  if (capYi < 35 || capYi > 95) power -= 0.4;

  let level = "边缘补涨";
  if (rank === 1 && power >= 7.2) level = "板块前排/疑似龙头";
  else if (rank <= 2 && power >= 5.8) level = "板块核心跟风";
  else if (rank <= 5 && power >= 4.8) level = "板块中排跟随";

  let shortTerm = "";
  if (!stock.matched) {
    shortTerm = `短线：条件不完整，${volumeState}、${turnoverState}，先等下一次放量确认，不适合当作强势票处理。`;
  } else if (level.includes("龙头")) {
    shortTerm = `短线：强观察。它在当前候选池里位置靠前，${moneyState}，${volumeState}，次日重点看开盘后 15-30 分钟是否继续放量并站稳均价线。`;
  } else if (level.includes("核心")) {
    shortTerm = `短线：可观察但要盯板块脸色。它更像核心跟风，板块龙头继续强，它有冲高机会；龙头降温，它通常先回落。`;
  } else if (level.includes("中排")) {
    shortTerm = `短线：轻关注。涨幅、换手符合你的模型，但板块内排序不够前，适合看承接，不适合追急拉。`;
  } else {
    shortTerm = `短线：谨慎。更像边缘补涨，只有板块继续扩散、成交额继续放大时，才有二次表现的基础。`;
  }

  let midTerm = "";
  if (stock.sector?.confidence === "较低") {
    midTerm = "中线：暂不纳入。板块归属不清，无法判断它是主线票还是随机异动。";
  } else if (level.includes("龙头") && amountYi >= 3 && capYi >= 40 && capYi <= 90) {
    midTerm = "中线：可放入观察池。后面重点看三件事：板块新闻能否持续、成交额是否维持在较高水平、日K是否沿短均线抬高。";
  } else if ((level.includes("核心") || level.includes("中排")) && amountYi >= 2) {
    midTerm = "中线：弱跟踪。需要板块反复活跃来支撑，如果只有一天放量，容易变成短线脉冲。";
  } else {
    midTerm = "中线：暂不占优。当前更适合按短线异动处理，等量能连续性和板块持续性出来再看。";
  }

  const outlook = (() => {
    if (level.includes("龙头")) {
      return "后续观察：如果板块新闻继续发酵、同板块股票跟涨，它有机会维持前排；如果放量滞涨或开盘冲高回落，要防短线资金兑现。";
    }
    if (level.includes("核心")) {
      return "后续观察：它依赖板块龙头打开高度。板块强时可能补涨，板块弱时弹性也会变成回撤压力。";
    }
    if (level.includes("中排")) {
      return "后续观察：需要二次确认，重点看回踩时有没有资金承接，以及是否能重新回到板块前排。";
    }
    return "后续观察：更像边缘异动，除非新闻催化增强或成交额连续放大，否则容易一日游。";
  })();

  return { level, shortTerm, midTerm, outlook, power: Math.round(power * 10) / 10, heat, volumeState, turnoverState };
};

renderStockAnalysis = function renderStockAnalysisV2(stock) {
  const sector = stock.sector || getSectorProfile(stock);
  const position = stock.position || getPositionView(stock);
  const keywords = sector.keywords?.length ? sector.keywords.join("、") : "暂无明确关键词";
  return `
    <div class="analysisBox">
      <h4>板块与定位</h4>
      <div class="analysisGrid">
        <div><b>${sector.macro}</b><span>大板块</span></div>
        <div><b>${sector.sector}</b><span>细分板块</span></div>
        <div><b>${position.level}</b><span>强弱定位</span></div>
        <div><b>${sector.confidence}</b><span>识别置信度</span></div>
      </div>
      <p>命中关键词：${keywords}。${stock.sectorRank ? `当前候选池同细分板块排第 ${stock.sectorRank}。` : "同板块排序暂未形成。"} 当前量价：${position.heat}、${position.volumeState}、${position.turnoverState}。</p>
      <h4>短线判断</h4>
      <p>${position.shortTerm}</p>
      <h4>中线判断</h4>
      <p>${position.midTerm}</p>
      <h4>后续观察</h4>
      <p>${position.outlook}</p>
      <p class="riskNote">这是按涨幅、量比、换手、成交额、市值、板块排序和题材识别做的规则判断。更长期的判断需要业绩、订单、估值和行业周期支撑，这里只保留短线、中线和后续观察。</p>
    </div>
  `;
};

function hasOnlyBriefingNews(items) {
  return !items?.length || items.every((item) => /系统统筹|本地统筹/.test(item.source || ""));
}

function parseEastmoneyNewsPayload(data, stock, tag) {
  const rows = data?.data || data?.result || data?.items || [];
  const list = Array.isArray(rows) ? rows : rows.list || rows.news || rows.hits || [];
  return list
    .map((item) => {
      const title = String(item.title || item.Title || item.name || item.Name || "").replace(/<[^>]+>/g, "").trim();
      const raw = String(item.content || item.Content || item.digest || item.summary || item.Summary || title).replace(/<[^>]+>/g, "").trim();
      return {
        title,
        source: `${tag} · ${item.source || item.Source || item.mediaName || item.MediaName || "东方财富搜索"}`,
        time: item.time || item.showTime || item.date || item.PublishTime || item.publish_time || "近期",
        summary: summarizeTitle(raw || title, stock),
      };
    })
    .filter((item) => item.title);
}

function newsJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `stockNews_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const timerId = setTimeout(() => {
      script.remove();
      delete window[callbackName];
      reject(new Error("新闻源超时"));
    }, 6000);
    window[callbackName] = (data) => {
      clearTimeout(timerId);
      script.remove();
      delete window[callbackName];
      resolve(data);
    };
    script.onerror = () => {
      clearTimeout(timerId);
      script.remove();
      delete window[callbackName];
      reject(new Error("新闻源加载失败"));
    };
    script.src = `${url}${url.includes("?") ? "&" : "?"}cb=${callbackName}&_=${Date.now()}`;
    document.body.appendChild(script);
  });
}

async function loadBrowserNews(stock) {
  const sector = stock.sector || getSectorProfile(stock);
  const terms = [sector.sector, sector.macro, ...(sector.queryTerms || []), stock.name]
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 4);
  const batches = await Promise.allSettled(
    terms.map((term) => {
      const keyword = encodeURIComponent(term);
      const url = `https://search-api-web.eastmoney.com/search/jsonp?type=8192&pageindex=1&pagesize=8&keyword=${keyword}`;
      const tag = term === stock.name ? "个股新闻" : "板块新闻";
      return newsJsonp(url).then((data) => parseEastmoneyNewsPayload(data, stock, tag));
    })
  );
  const seen = new Set();
  return batches
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((item) => {
      if (!item.title || seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
    })
    .slice(0, 8);
}

localSectorNews = function localSectorNewsV2(stock) {
  const sector = stock.sector || getSectorProfile(stock);
  const now = formatTime(new Date().toISOString());
  const focus = [sector.sector, sector.macro, ...(sector.queryTerms || [])]
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 5)
    .join("、");
  const text = `${sector.sector} ${sector.macro} ${(sector.queryTerms || []).join(" ")}`;
  let hotPoints = "板块热度、政策催化、订单变化和资金异动";
  let eventLine = "重点看板块新闻是否连续、成交额是否继续放大、前排股票是否维持强势。";
  if (/PCB|覆铜|电路/.test(text)) {
    hotPoints = "AI服务器PCB、高多层板、覆铜板价格、订单排产";
    eventLine = "PCB方向重点看AI服务器链条是否继续扩散，前排通常先看成交额和订单预期，后排更容易跟随回落。";
  } else if (/CPO|光通信|光模块|光器件/.test(text)) {
    hotPoints = "CPO、光模块、数据中心、海外AI资本开支";
    eventLine = "CPO方向重点看光模块龙头强度、海外AI算力订单和板块成交额，跟风票要防前排降温后补跌。";
  } else if (/AI|算力|大模型|数据中心/.test(text)) {
    hotPoints = "国产算力、大模型应用、服务器、数据中心";
    eventLine = "AI算力方向重点看大模型应用、国产芯片和服务器链条是否轮动，只有单日冲高不算持续主线。";
  } else if (/半导体|芯片|集成电路/.test(text)) {
    hotPoints = "国产替代、先进封装、存储、设备材料";
    eventLine = "半导体方向重点看国产替代新闻是否连续，设备、材料、封测谁先放量，决定个股弹性。";
  } else if (/消费电子|显示|面板|OLED/.test(text)) {
    hotPoints = "AI手机、折叠屏、OLED/MiniLED、面板价格";
    eventLine = "消费电子方向重点看新品周期、面板价格和AI终端催化，如果只是单只票异动，持续性要打折。";
  } else if (/机器人|自动化/.test(text)) {
    hotPoints = "人形机器人、减速器、伺服、电机、产业订单";
    eventLine = "机器人方向重点看产业订单和核心零部件扩散，前排强时跟风有弹性，前排弱时回撤也快。";
  } else if (/新能源|汽车|汽配/.test(text)) {
    hotPoints = "新能源车、智能驾驶、汽配、热管理、一体化压铸";
    eventLine = "新能源车方向重点看整车销量、智能驾驶催化和零部件订单，纯题材拉升要看成交额能否连续。";
  } else if (/光伏|储能|电池/.test(text)) {
    hotPoints = "储能订单、光伏价格、锂电材料、逆变器";
    eventLine = "光伏储能方向重点看价格拐点和订单改善，没有基本面配合时，反弹更容易走成短线。";
  }

  return [
    {
      title: `${sector.sector}近期统筹`,
      source: "本地统筹",
      time: now,
      summary: `新闻源未返回可读原文时，先按板块线索统筹：${focus || hotPoints}。当前更要盯 ${hotPoints}。`,
    },
    {
      title: `${stock.name}的板块位置`,
      source: "本地统筹",
      time: now,
      summary: `它当前归到${sector.macro}/${sector.sector}。如果同板块多只股票一起放量，说明板块强；如果只有它单独走强，优先按个股脉冲处理。`,
    },
    {
      title: "近期关注点",
      source: "本地统筹",
      time: now,
      summary: eventLine,
    },
  ];
};

loadNews = async function loadNewsV3(stock) {
  newsLinks.innerHTML = `<div class="newsCard">正在统筹 ${stock.name} 的近期新闻...</div>`;
  if (isDemoStock(stock)) {
    renderNewsItems(demoNews(stock), stock);
    return;
  }

  let serverItems = [];
  if (location.protocol !== "file:") {
    try {
      const sector = stock.sector || getSectorProfile(stock);
      const params = new URLSearchParams({
        code: stock.code,
        name: stock.name,
        sector: sector.sector,
        macro: sector.macro,
        keywords: sector.queryTerms.join(","),
      });
      const response = await fetch(`/api/news?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      serverItems = response.ok ? data.news || [] : [];
    } catch {
      serverItems = [];
    }
  }

  if (!hasOnlyBriefingNews(serverItems)) {
    renderNewsItems(serverItems, stock);
    return;
  }

  try {
    const browserItems = await loadBrowserNews(stock);
    renderNewsItems(browserItems.length ? browserItems : localSectorNews(stock), stock);
  } catch {
    renderNewsItems(localSectorNews(stock), stock);
  }
};

function renderLocalCompanyInfo(stock, extraProfile = {}) {
  const sector = stock.sector || getSectorProfile(stock);
  const analysisHtml = renderStockAnalysis(stock);
  const market = marketPrefix(stock.code) === "SH" ? "上交所" : "深交所";
  companyInfo.innerHTML = `
    <div class="companyMeta">
      <div>股票：${stock.name}（${stock.code}）</div>
      <div>行业：${extraProfile.industry || stock.industry || "-"}</div>
      <div>板块：${sector.macro} / ${sector.sector}</div>
      <div>市场：${market}</div>
      <div>总市值：${yi(stock.marketCap)}</div>
      <div>成交额：${yi(stock.amount)}</div>
    </div>
    ${analysisHtml}
    ${extraProfile.description ? `<p>${extraProfile.description}</p>` : ""}
    ${extraProfile.businessScope ? `<p>主营范围：${extraProfile.businessScope}</p>` : ""}
  `;
}

loadCompanyInfo = async function loadCompanyInfoV2(stock) {
  companyInfo.textContent = "正在整理公司与板块内容...";
  if (isDemoStock(stock) || location.protocol === "file:") {
    renderLocalCompanyInfo(stock);
    return;
  }

  try {
    const response = await Promise.race([
      fetch(`/api/company?code=${stock.code}`, { cache: "no-store" }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "company failed");
    renderLocalCompanyInfo(stock, data.profile || {});
  } catch {
    renderLocalCompanyInfo(stock);
  }
};

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.floor(rect.width * ratio));
  canvas.height = Math.max(260, Math.floor(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: rect.width, height: rect.height, ctx };
}

function drawGrid(ctx, width, height, padding) {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#e5eaf2";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + ((height - padding.top - padding.bottom) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }
}

function drawLineChart(points, label) {
  const { ctx, width, height } = resizeCanvas(chartCanvas);
  const padding = { left: 48, right: 18, top: 22, bottom: 34 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  drawGrid(ctx, width, height, padding);

  if (!points.length) {
    chartStatus.textContent = "暂无图表数据";
    return;
  }

  const prices = points.map((item) => item.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const color = points[points.length - 1].price >= points[0].price ? "#d8333f" : "#0f8a5f";

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  points.forEach((item, index) => {
    const x = padding.left + (chartWidth * index) / Math.max(1, points.length - 1);
    const y = padding.top + chartHeight - ((item.price - min) / range) * chartHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#687385";
  ctx.font = "12px Microsoft YaHei";
  ctx.fillText(max.toFixed(2), 8, padding.top + 6);
  ctx.fillText(min.toFixed(2), 8, height - padding.bottom);
  ctx.fillText(label, padding.left, height - 12);
  chartStatus.textContent = "";
}

function movingAverage(items, size) {
  return items.map((_, index) => {
    if (index + 1 < size) return null;
    const slice = items.slice(index + 1 - size, index + 1);
    return slice.reduce((sum, item) => sum + item.close, 0) / size;
  });
}

function drawKChart(items, label) {
  const { ctx, width, height } = resizeCanvas(chartCanvas);
  const padding = { left: 48, right: 18, top: 22, bottom: 34 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  drawGrid(ctx, width, height, padding);

  if (!items.length) {
    chartStatus.textContent = "暂无图表数据";
    return;
  }

  const highs = items.map((item) => item.high);
  const lows = items.map((item) => item.low);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const range = max - min || 1;
  const candleWidth = Math.max(3, Math.min(12, chartWidth / items.length - 2));
  const y = (price) => padding.top + chartHeight - ((price - min) / range) * chartHeight;

  items.forEach((item, index) => {
    const x = padding.left + (chartWidth * index) / Math.max(1, items.length - 1);
    const up = item.close >= item.open;
    ctx.strokeStyle = up ? "#d8333f" : "#0f8a5f";
    ctx.fillStyle = up ? "#d8333f" : "#0f8a5f";
    ctx.beginPath();
    ctx.moveTo(x, y(item.high));
    ctx.lineTo(x, y(item.low));
    ctx.stroke();
    const bodyTop = y(Math.max(item.open, item.close));
    const bodyBottom = y(Math.min(item.open, item.close));
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, Math.max(1, bodyBottom - bodyTop));
  });

  const ma5 = movingAverage(items, 5);
  ctx.strokeStyle = "#245cc8";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ma5.forEach((value, index) => {
    if (value === null) return;
    const x = padding.left + (chartWidth * index) / Math.max(1, items.length - 1);
    const yy = y(value);
    if (index === 4) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  });
  ctx.stroke();

  ctx.fillStyle = "#687385";
  ctx.font = "12px Microsoft YaHei";
  ctx.fillText(max.toFixed(2), 8, padding.top + 6);
  ctx.fillText(min.toFixed(2), 8, height - padding.bottom);
  ctx.fillText(`${label} · 蓝线为5周期均线`, padding.left, height - 12);
  chartStatus.textContent = "";
}

function parseTrend(json) {
  return (json.data?.trends || []).map((row) => {
    const [time, , price, , , volume, amount, avg] = row.split(",");
    return { time, price: Number(price), volume: Number(volume), amount: Number(amount), avg: Number(avg) };
  });
}

function parseKlines(json, limit) {
  return (json.data?.klines || [])
    .slice(-limit)
    .map((row) => {
      const [date, open, close, high, low, volume, amount] = row.split(",");
      return {
        date,
        open: Number(open),
        close: Number(close),
        high: Number(high),
        low: Number(low),
        volume: Number(volume),
        amount: Number(amount),
      };
    });
}

async function loadChart(type) {
  if (!currentStock) return;
  chartStatus.textContent = "正在加载图表...";
  if (isDemoStock(currentStock)) {
    if (type === "minute" || type === "five") {
      drawLineChart(demoTrend(currentStock, type === "five" ? 240 : 120), type === "five" ? "五日分时（演示）" : "当日分时（演示）");
      return;
    }
    const limit = { day: 90, week: 80, month: 60 }[type] || 80;
    const label = { day: "日K（演示）", week: "周K（演示）", month: "月K（演示）" }[type] || "K线（演示）";
    drawKChart(demoKlines(currentStock, limit), label);
    return;
  }
  const id = secid(currentStock.code);
  try {
    if (type === "minute" || type === "five") {
      const ndays = type === "five" ? 5 : 1;
      const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${id}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&ndays=${ndays}`;
      const json = await jsonp(url);
      drawLineChart(parseTrend(json), type === "five" ? "五日分时" : "当日分时");
      return;
    }

    const klt = { day: 101, week: 102, month: 103 }[type];
    const limit = { day: 90, week: 120, month: 120 }[type];
    const label = { day: "日K", week: "周K", month: "月K" }[type];
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${id}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${klt}&fqt=1&beg=0&end=20500101`;
    const json = await jsonp(url);
    drawKChart(parseKlines(json, limit), label);
  } catch (error) {
    chartStatus.textContent = `图表加载失败：${error.message}`;
  }
}

async function openDetail(code) {
  const stock = findStock(code);
  if (!stock) return;
  currentStock = stock;
  currentChart = "minute";
  detailTitle.textContent = `${stock.name} ${stock.code}`;
  detailSub.textContent = `${stock.industry} · ${stock.matched ? "完全命中" : "接近条件"} · 分数 ${stock.score}`;
  setDetailMetrics(stock);
  detailModal.classList.add("open");
  detailModal.setAttribute("aria-hidden", "false");
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.chart === "minute"));
  await Promise.all([loadCompanyInfo(stock), loadChart("minute")]);
}

function closeModal() {
  detailModal.classList.remove("open");
  detailModal.setAttribute("aria-hidden", "true");
}

function setupTimer() {
  if (timer) clearInterval(timer);
  if (countdownTimer) clearInterval(countdownTimer);
  if (autoRefresh.checked) {
    resetCountdown();
    countdownTimer = setInterval(() => {
      secondsToRefresh -= 1;
      if (secondsToRefresh <= 0) {
        loadStocks();
        return;
      }
      updateSummary();
    }, 1000);
  }
  updateSummary();
}

document.addEventListener("click", (event) => {
  const button = event.target.closest(".detailButton");
  if (button) {
    openDetail(button.dataset.code);
  }
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", async () => {
    currentChart = tab.dataset.chart;
    document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
    await loadChart(currentChart);
  });
});

refreshButton.addEventListener("click", () => loadStocks());
autoRefresh.addEventListener("change", setupTimer);
closeDetail.addEventListener("click", closeModal);
if (backDetail) backDetail.addEventListener("click", closeModal);
detailModal.addEventListener("click", (event) => {
  if (event.target === detailModal) closeModal();
});
window.addEventListener("resize", () => {
  if (detailModal.classList.contains("open")) loadChart(currentChart);
});

const MARKET_SECTOR_RULES = [
  { macro: "科技", sector: "AI/算力/数据中心", keywords: ["AI", "人工智能", "算力", "大模型", "数据中心", "服务器", "云", "信息", "数据", "智能", "软通", "科大", "高新", "数码"] },
  { macro: "科技", sector: "软件/信创/网络安全", keywords: ["软件", "信创", "操作系统", "数据库", "网络安全", "信息安全", "数字政通", "用友", "浪潮", "卫士通", "启明"] },
  { macro: "科技", sector: "半导体/芯片", keywords: ["半导体", "芯片", "集成电路", "晶圆", "封测", "存储", "光刻", "微电", "硅", "电子材料", "北方华创", "中芯", "兆易", "韦尔"] },
  { macro: "科技", sector: "PCB/电子元件", keywords: ["PCB", "电路", "线路板", "覆铜", "电子", "元件", "胜宏", "生益", "沪电", "景旺", "依顿", "世运"] },
  { macro: "科技", sector: "光通信/CPO", keywords: ["CPO", "光模块", "光通信", "光器件", "光电", "光迅", "新易盛", "中际", "天孚", "太辰"] },
  { macro: "科技", sector: "消费电子/显示面板", keywords: ["消费电子", "面板", "显示", "OLED", "MiniLED", "模组", "触控", "翰博", "京东方", "TCL", "立讯", "歌尔", "蓝思"] },

  { macro: "制造", sector: "机器人/自动化", keywords: ["机器人", "自动化", "伺服", "减速器", "数控", "机床", "埃斯顿", "汇川", "绿的"] },
  { macro: "制造", sector: "通用机械/专用设备", keywords: ["机械", "机电", "装备", "重工", "精工", "设备", "仪器", "电气", "电机", "轴承", "液压", "泵", "阀", "工业"] },
  { macro: "制造", sector: "汽车/汽配/智能驾驶", keywords: ["汽车", "汽配", "车业", "智能驾驶", "无人驾驶", "车载", "热管理", "压铸", "轮胎", "涛涛", "赛轮"] },
  { macro: "制造", sector: "军工/航空航天", keywords: ["军工", "航空", "航天", "导弹", "雷达", "船舶", "兵器", "中航", "航发", "航天", "北斗"] },
  { macro: "制造", sector: "电力设备/电网", keywords: ["电力设备", "电网", "特高压", "变压器", "输配电", "电缆", "许继", "平高", "国电南瑞"] },

  { macro: "新能源", sector: "新能源车/锂电", keywords: ["新能源车", "锂电", "电池", "正极", "负极", "隔膜", "电解液", "宁德", "亿纬", "赣锋", "天齐"] },
  { macro: "新能源", sector: "光伏/储能", keywords: ["光伏", "储能", "逆变器", "组件", "硅片", "多晶硅", "固态电池", "阳光电源", "隆基", "通威"] },
  { macro: "新能源", sector: "风电/氢能", keywords: ["风电", "风能", "叶片", "塔筒", "氢能", "燃料电池", "金风", "明阳"] },

  { macro: "金融", sector: "银行", keywords: ["银行", "农商", "城商", "平安银行", "招商银行", "浦发", "兴业", "宁波银行"] },
  { macro: "金融", sector: "证券/期货", keywords: ["证券", "券商", "期货", "投行", "中信证券", "东方财富", "同花顺", "华泰"] },
  { macro: "金融", sector: "保险/多元金融", keywords: ["保险", "信托", "租赁", "金融", "担保", "中国平安", "中国人寿"] },

  { macro: "化工", sector: "基础化工", keywords: ["化工", "石化", "化学", "PVC", "纯碱", "烧碱", "农药", "化肥", "橡胶", "塑料", "日科"] },
  { macro: "化工", sector: "新材料/精细化工", keywords: ["新材", "材料", "树脂", "助剂", "涂料", "膜", "碳纤维", "玻纤", "钛白粉", "氟化工"] },

  { macro: "资源", sector: "煤炭/油气", keywords: ["煤", "煤炭", "焦煤", "焦炭", "油气", "石油", "天然气", "中石油", "中石化", "陕西煤业"] },
  { macro: "资源", sector: "有色/稀土/黄金", keywords: ["有色", "铜", "铝", "锌", "铅", "镍", "钴", "锂", "钨", "钼", "稀土", "黄金", "矿", "矿业", "紫金", "洛阳钼业"] },
  { macro: "资源", sector: "钢铁/建材", keywords: ["钢", "钢铁", "特钢", "水泥", "玻璃", "建材", "宝钢", "华新", "海螺"] },

  { macro: "消费", sector: "食品饮料/白酒", keywords: ["食品", "饮料", "白酒", "酒", "啤酒", "乳", "调味", "酱油", "茅台", "五粮液", "伊利", "海天"] },
  { macro: "消费", sector: "家电/家居/纺服", keywords: ["家电", "电器", "家居", "家具", "纺织", "服饰", "服装", "美的", "格力", "海尔", "顾家"] },
  { macro: "消费", sector: "商贸零售/免税", keywords: ["零售", "百货", "商贸", "超市", "免税", "电商", "跨境", "王府井", "小商品"] },
  { macro: "消费", sector: "农林牧渔", keywords: ["农业", "种业", "粮", "猪", "养殖", "牧", "饲料", "水产", "渔", "温氏", "牧原", "海大"] },

  { macro: "医药", sector: "医药/创新药", keywords: ["医药", "药业", "制药", "创新药", "中药", "疫苗", "生物", "医疗", "器械", "CRO", "药明", "恒瑞", "迈瑞"] },

  { macro: "服务", sector: "传媒/游戏/教育", keywords: ["传媒", "影视", "游戏", "出版", "广告", "教育", "文化", "中文在线", "三七", "完美"] },
  { macro: "服务", sector: "旅游/酒店/餐饮", keywords: ["旅游", "酒店", "餐饮", "景区", "航空旅游", "宋城", "锦江", "首旅"] },
  { macro: "服务", sector: "物流/港口/交运", keywords: ["物流", "快递", "港口", "航运", "机场", "航空", "铁路", "高速", "公路", "仓储", "顺丰", "圆通", "上港"] },

  { macro: "公用事业", sector: "电力/燃气/水务", keywords: ["电力", "发电", "火电", "水电", "核电", "燃气", "水务", "供水", "环保", "垃圾", "污水", "长江电力", "华能"] },
  { macro: "建筑地产", sector: "地产/建筑/装饰", keywords: ["地产", "置业", "物业", "建筑", "建设", "工程", "装饰", "园林", "设计", "中国建筑", "万科", "保利"] },
];

const COMPANY_SECTOR_OVERRIDES = {
  "000920": { macro: "化工", sector: "膜材料/水处理材料", keywords: ["沃顿科技", "膜材料", "水处理"] },
  "300320": { macro: "制造", sector: "橡胶密封/轨交部件", keywords: ["海达股份", "密封", "轨交"] },
  "301045": { macro: "科技", sector: "光学材料/显示面板", keywords: ["天禄科技", "导光板", "显示"] },
  "003009": { macro: "制造", sector: "军工/航天装备", keywords: ["中天火箭", "火箭", "军工"] },
  "002860": { macro: "制造", sector: "家电零部件/光伏组件", keywords: ["星帅尔", "家电", "光伏"] },
  "301197": { macro: "公用事业", sector: "智慧供热/节能控制", keywords: ["工大科雅", "供热", "节能"] },
  "600382": { macro: "资源", sector: "有色/矿业/贸易", keywords: ["广东明珠", "矿业", "贸易"] },
  "300345": { macro: "新能源", sector: "光伏/新能源材料", keywords: ["华民股份", "光伏", "新能源材料"] },
  "300259": { macro: "公用事业", sector: "智能水表/智慧水务", keywords: ["新天科技", "水表", "水务"] },
  "300440": { macro: "服务", sector: "轨交信息化", keywords: ["运达科技", "轨交", "信息化"] },
  "002427": { macro: "化工", sector: "涤纶工业丝/化纤", keywords: ["尤夫股份", "化纤", "涤纶"] },
  "300745": { macro: "新能源", sector: "车载电源/新能源汽车", keywords: ["欣锐科技", "车载电源", "新能源车"] },
  "600178": { macro: "制造", sector: "汽车发动机/动力总成", keywords: ["东安动力", "发动机", "动力总成"] },
  "001269": { macro: "新能源", sector: "光伏石英坩埚", keywords: ["欧晶科技", "石英", "光伏"] },
  "002937": { macro: "科技", sector: "连接器/汽车电子", keywords: ["兴瑞科技", "连接器", "汽车电子"] },
  "002182": { macro: "资源", sector: "镁合金/轻量化材料", keywords: ["宝武镁业", "镁", "轻量化"] },
  "002983": { macro: "科技", sector: "MiniLED/显示模组", keywords: ["芯瑞达", "MiniLED", "显示"] },
  "002292": { macro: "服务", sector: "IP娱乐/动漫游戏", keywords: ["奥飞娱乐", "动漫", "IP"] },
  "301046": { macro: "新能源", sector: "光伏电站/EPC", keywords: ["能辉科技", "光伏电站", "EPC"] },
  "603867": { macro: "化工", sector: "精细化工/有机胺", keywords: ["新化股份", "精细化工", "有机胺"] },
};

function classifyByCode(stock) {
  if (stock.code?.startsWith("30")) return { macro: "成长股", sector: "创业板成长股/待进一步核实", keyword: "创业板" };
  if (stock.code?.startsWith("00")) return { macro: "主板", sector: "深市主板/待进一步核实", keyword: "深市主板" };
  if (stock.code?.startsWith("60")) return { macro: "主板", sector: "沪市主板/待进一步核实", keyword: "沪市主板" };
  return { macro: "综合", sector: "A股综合/待进一步核实", keyword: "A股" };
}

getSectorProfile = function getSectorProfileV4(stock) {
  const override = COMPANY_SECTOR_OVERRIDES[stock.code];
  if (override) {
    return {
      macro: override.macro,
      sector: override.sector,
      keywords: override.keywords.slice(0, 5),
      queryTerms: [override.sector, override.macro, ...override.keywords].slice(0, 6),
      confidence: "较高",
    };
  }

  const text = `${stock.name || ""} ${stock.industry || ""} ${stock.sectorLabel || ""}`.toLowerCase();
  const matched = MARKET_SECTOR_RULES.map((rule) => {
    const hits = rule.keywords.filter((keyword) => text.includes(String(keyword).toLowerCase()));
    return { ...rule, hits };
  })
    .filter((rule) => rule.hits.length)
    .sort((a, b) => b.hits.length - a.hits.length || b.keywords.length - a.keywords.length)[0];

  if (matched) {
    return {
      macro: matched.macro,
      sector: matched.sector,
      keywords: matched.hits.slice(0, 5),
      queryTerms: [matched.sector, matched.macro, ...matched.hits].slice(0, 6),
      confidence: matched.hits.length >= 2 ? "较高" : "中等",
    };
  }

  const cleanIndustry = stock.industry && !String(stock.industry).startsWith("GP-") ? stock.industry : "";
  if (cleanIndustry && cleanIndustry !== "-") {
    return {
      macro: "行业",
      sector: cleanIndustry,
      keywords: [cleanIndustry],
      queryTerms: [cleanIndustry, stock.name],
      confidence: "中等",
    };
  }

  const fallback = classifyByCode(stock);
  return {
    macro: fallback.macro,
    sector: fallback.sector,
    keywords: [fallback.keyword],
    queryTerms: [fallback.sector, stock.name],
    confidence: "待核实",
  };
};

loadStocks();
setupTimer();
