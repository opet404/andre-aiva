// api/multi-chat.js
const { callAPI } = require("./_lib");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, models: selected, history = [], userName = "" } = req.body || {};
    if (!message) return res.status(400).json({ error: "Pesan kosong!" });

    const models = Array.isArray(selected) && selected.length >= 2
      ? selected : ["groq", "qwen", "gpt"];
    const hist = Array.isArray(history) ? history.slice(-8) : [];

    const results = await Promise.allSettled(
      models.map(api => callAPI(api, message, hist, userName))
    );

    const replies = {};
    models.forEach((api, i) => {
      replies[api] = results[i].status === "fulfilled"
        ? results[i].value
        : "❌ " + (results[i].reason?.message || "gagal");
    });

    return res.status(200).json({ replies });
  } catch (err) {
    console.error("[multi-chat] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
