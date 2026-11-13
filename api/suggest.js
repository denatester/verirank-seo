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
    return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
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

  const query = String((req.body && req.body.query) || (req.query && req.query.query) || "").trim();
  if (!query) {
    return res.status(200).json({ ok: true, google: [], bing: [] });
  }

  const enc = encodeURIComponent(query);
  const [gRes, bRes] = await Promise.allSettled([
    fetchJsonWithTimeout(`https://suggestqueries.google.com/complete/search?client=firefox&q=${enc}`, 3500),
    fetchJsonWithTimeout(`https://api.bing.com/osjson.aspx?query=${enc}`, 3500)
  ]);

  const googleSuggestions = gRes.status === "fulfilled" ? gRes.value : [];
  const bingSuggestions = bRes.status === "fulfilled" ? bRes.value : [];

  return res.status(200).json({
    ok: true,
    offline: googleSuggestions.length === 0 && bingSuggestions.length === 0,
    google: googleSuggestions,
    bing: bingSuggestions
  });
};
