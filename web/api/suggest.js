const UNRELATED_GEO_AND_NOISE = new Set([
  "florida", "texas", "california", "ohio", "michigan", "arizona", "georgia", "illinois",
  "pennsylvania", "virginia", "maryland", "colorado", "washington", "oregon", "nevada",
  "tennessee", "indiana", "missouri", "wisconsin", "minnesota", "alabama", "louisiana",
  "kentucky", "oklahoma", "connecticut", "utah", "iowa", "arkansas", "kansas",
  "nyc", "chicago", "houston", "dallas", "austin", "phoenix", "miami", "orlando",
  "tampa", "atlanta", "seattle", "denver", "boston", "portland", "vegas", "angeles",
  "diego", "antonio", "charlotte", "jacksonville", "columbus", "indianapolis",
  "philadelphia", "detroit", "memphis", "nashville", "baltimore", "toronto", "london",
  "sydney", "melbourne", "dubai", "uk", "canada", "australia", "india", "ireland", "nz",
  "reddit", "youtube", "quora", "wikipedia", "yelp", "angi", "thumbtack", "craigslist",
  "lowes", "walmart", "amazon", "tiktok", "meme", "lyrics", "pdf", "login", "salary", "hiring"
]);

const MULTIWORD_NOISE = [
  "home depot", "las vegas", "los angeles", "san diego", "san antonio", "sign in", "pdf download"
];

function cleanSuggestions(rawList, contextLower) {
  if (!Array.isArray(rawList)) return [];
  const ctx = String(contextLower || "").toLowerCase();
  const out = [];
  for (const item of rawList) {
    let s = String(item || "").replace(/\s+/g, " ").trim();
    if (s.length < 3 || s.length > 75 || /^https?:\/\//i.test(s)) continue;
    if (/^(?:near|around)\s+me$/i.test(s)) continue;
    if (/\s+(?:near|around)\s+me$/i.test(s)) {
      const stripped = s.replace(/\s+(?:near|around)\s+me$/i, "").trim();
      if (!stripped) continue;
      s = /\blocal\b/i.test(stripped) ? stripped : `local ${stripped}`;
    }

    const low = s.toLowerCase();
    let blocked = false;
    for (const mw of MULTIWORD_NOISE) {
      if (low.includes(mw) && !ctx.includes(mw)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const toks = low.match(/[a-z0-9]+/g) || [];
    for (const tok of toks) {
      if (UNRELATED_GEO_AND_NOISE.has(tok) && !(new RegExp(`\\b${tok}\\b`, "i").test(ctx))) {
        blocked = true;
        break;
      }
    }
    if (!blocked) out.push(s);
  }
  return out;
}

async function fetchJsonWithTimeout(url, timeoutMs, contextLower) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: controller.signal
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) && Array.isArray(data[1]) ? cleanSuggestions(data[1], contextLower) : [];
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const body = req.body || {};
  const rawQuery = String(body.query || (req.query && req.query.query) || "").trim();
  const contextLower = String(body.contextText || "").slice(0, 2000).toLowerCase();
  const rawSeeds = Array.isArray(body.seeds) ? body.seeds : [];
  const seedSet = new Set();
  if (rawQuery) seedSet.add(rawQuery);
  for (const s of rawSeeds) {
    const clean = String(s || "").trim();
    if (clean) seedSet.add(clean);
    if (seedSet.size >= 4) break;
  }

  const seeds = Array.from(seedSet);
  if (seeds.length === 0) {
    return res.status(200).json({ ok: true, google: [], bing: [], items: [] });
  }

  const jobs = [];
  for (const seed of seeds) {
    const enc = encodeURIComponent(seed);
    jobs.push(
      fetchJsonWithTimeout(`https://suggestqueries.google.com/complete/search?client=firefox&q=${enc}`, 3500, contextLower)
        .then((list) => ({ engine: "Google", list }))
    );
    jobs.push(
      fetchJsonWithTimeout(`https://api.bing.com/osjson.aspx?query=${enc}`, 3500, contextLower)
        .then((list) => ({ engine: "Bing", list }))
    );
  }

  const settled = await Promise.allSettled(jobs);
  const googleSet = new Set();
  const bingSet = new Set();
  const mergedMap = new Map();

  for (const entry of settled) {
    if (entry.status !== "fulfilled") continue;
    const { engine, list } = entry.value;
    for (const phrase of list) {
      const low = phrase.toLowerCase();
      if (engine === "Google") googleSet.add(phrase);
      if (engine === "Bing") bingSet.add(phrase);
      if (!mergedMap.has(low)) {
        mergedMap.set(low, { phrase, engines: [engine] });
      } else {
        const rec = mergedMap.get(low);
        if (!rec.engines.includes(engine)) rec.engines.push(engine);
      }
    }
  }

  const googleSuggestions = Array.from(googleSet).slice(0, 18);
  const bingSuggestions = Array.from(bingSet).slice(0, 18);
  const items = Array.from(mergedMap.values()).slice(0, 24);

  return res.status(200).json({
    ok: true,
    offline: items.length === 0,
    seeds,
    google: googleSuggestions,
    bing: bingSuggestions,
    items
  });
};
