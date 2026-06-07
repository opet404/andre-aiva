// api/status.js — cek status keys & models
const { GROQ_API_KEY, OPENROUTER_KEYS, QWEN_MODELS, GPT_OSS_MODELS, GLM_MODELS } = require("./_lib");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const keys = OPENROUTER_KEYS.map((k, i) => ({
    nomor: i + 1,
    status: "✅ aktif",
    preview: k.slice(0, 20) + "...",
  }));

  return res.status(200).json({
    groq_key: GROQ_API_KEY ? "✅ aktif" : "❌ belum diset",
    openrouter_keys: keys,
    total_or_keys: keys.length,
    models: {
      qwen: QWEN_MODELS,
      gpt_oss: GPT_OSS_MODELS,
      glm: GLM_MODELS,
    },
    deployment: "Vercel Serverless",
    note: "Key rotation: random shuffle per request. Model fallback: loop semua model sampai berhasil.",
  });
};
