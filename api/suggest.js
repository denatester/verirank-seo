module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = (req.body && req.body.query) || (req.query && req.query.query) || '';
  if (!query) {
    return res.status(200).json({ ok: true, google: [], bing: [] });
  }

  let googleSuggestions = [];
  let bingSuggestions = [];

  try {
    const gUrl = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
    const gRes = await fetch(gUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (gRes.ok) {
      const gData = await gRes.json();
      if (Array.isArray(gData) && Array.isArray(gData[1])) {
        googleSuggestions = gData[1];
      }
    }
  } catch (e) {
    // Graceful fallback
  }

  try {
    const bUrl = `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`;
    const bRes = await fetch(bUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (bRes.ok) {
      const bData = await bRes.json();
      if (Array.isArray(bData) && Array.isArray(bData[1])) {
        bingSuggestions = bData[1];
      }
    }
  } catch (e) {
    // Graceful fallback
  }

  return res.status(200).json({
    ok: true,
    google: googleSuggestions,
    bing: bingSuggestions
  });
};
