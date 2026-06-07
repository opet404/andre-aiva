// api/chat.js
const { callAPI } = require("./_lib");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, api = "groq", history = [], userName = "" } = req.body || {};
    if (!message) return res.status(400).json({ reply: "Pesan kosong!" });

    const hist  = Array.isArray(history) ? history.slice(-8) : [];
    const reply = await callAPI(api, message, hist, userName);
    return res.status(200).json({ reply });

  } catch (err) {
    console.error("[chat] error:", err.message);
    const m = err.message || "";
    let reply;
    if (m.includes("429") || m.includes("rate") || m.includes("limit"))
      reply = "⚠️ Model sedang sibuk. Coba lagi dalam beberapa detik.";
    else if (m.includes("503") || m.includes("502"))
      reply = "⚠️ Server model sedang down. Coba lagi sebentar.";
    else
      reply = "❌ " + m;
    return res.status(200).json({ reply });
  }
};
