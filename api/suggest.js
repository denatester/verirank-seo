function cleanSuggestions(rawList) {
  if (!Array.isArray(rawList)) return [];
  const noiseRe = /\b(?:login|sign in|reddit|youtube|wikipedia|lyrics|meme|pdf download)\b/i;
  return rawList
    .map((s) => String(s || "").trim())
    .filter((s) => s.length >= 3 && s.length <= 75 && !/^https?:\/\//i.test(s) && !noiseRe.test(s));
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: controller.signal
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) && Array.isArray(data[1]) ? cleanSuggestions(data[1]) : [];
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
      fetchJsonWithTimeout(`https://suggestqueries.google.com/complete/search?client=firefox&q=${enc}`, 3500)
        .then((list) => ({ engine: "Google", list }))
    );
    jobs.push(
      fetchJsonWithTimeout(`https://api.bing.com/osjson.aspx?query=${enc}`, 3500)
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
