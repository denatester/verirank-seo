module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = req.body || {};
  const provider = String(body.provider || "").toLowerCase();
  const endpoint = String(body.endpoint || "").trim();
  const apiKey = String(body.apiKey || "").trim();
  const model = String(body.model || "").trim();
  const systemPrompt = String(body.systemPrompt || "");
  const userPrompt = String(body.userPrompt || "");

  if (provider === "ollama") {
    return res.status(200).json({
      ok: false,
      error: "Local Ollama (127.0.0.1) runs inside VeriRankSEO.exe Desktop Edition. On the Cloud Web Edition, choose OpenAI, Gemini, or Anthropic with your API key."
    });
  }
  if (!apiKey) {
    return res.status(200).json({ ok: false, error: "API key is required." });
  }

  try {
    let text = "";
    if (provider === "openai") {
      const url = endpoint || "https://api.openai.com/v1/chat/completions";
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          temperature: 0.1,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        })
      });
      if (!r.ok) return res.status(200).json({ ok: false, error: `OpenAI HTTP ${r.status}` });
      const data = await r.json();
      text = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
    } else if (provider === "gemini") {
      const mdl = model || "gemini-2.0-flash";
      const baseEp = (endpoint || "https://generativelanguage.googleapis.com/v1beta/models").replace(/\/+$/, "");
      const url = `${baseEp}/${encodeURIComponent(mdl)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }]
        })
      });
      if (!r.ok) return res.status(200).json({ ok: false, error: `Gemini HTTP ${r.status}` });
      const data = await r.json();
      text = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
        ? data.candidates[0].content.parts[0].text
        : "";
    } else if (provider === "anthropic") {
      const url = endpoint || "https://api.anthropic.com/v1/messages";
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: model || "claude-3-5-sonnet-latest",
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }]
        })
      });
      if (!r.ok) return res.status(200).json({ ok: false, error: `Anthropic HTTP ${r.status}` });
      const data = await r.json();
      text = data && data.content && data.content[0] ? data.content[0].text : "";
    } else {
      return res.status(200).json({ ok: false, error: `Unsupported provider: ${provider}` });
    }

    return res.status(200).json({
      ok: !!text,
      text: text || "",
      error: text ? undefined : "AI returned an empty response."
    });
  } catch (err) {
    return res.status(200).json({ ok: false, error: `AI request failed: ${err.message}` });
  }
};
