// api/_lib.js

const KEYS = [
  process.env.OR_KEY_1 || "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",
  process.env.OR_KEY_2 || "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",
  process.env.OR_KEY_3 || "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",
  process.env.OR_KEY_4 || "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",
  process.env.OR_KEY_5 || "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",
  process.env.OR_KEY_6 || "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",
  process.env.OR_KEY_7 || "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",
].filter(Boolean);

const FREE_ROUTER = "openrouter/auto";
const SITE_URL    = process.env.SITE_URL || "https://aiva.vercel.app";
const TIMEOUT_MS  = 9000;

// ── Model chains (persis sesuai permintaan) ────────────────
const GROQ_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

const QWEN_MODELS = [
  "deepseek/deepseek-r1-0528:free",
  "deepseek/deepseek-v3-base:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "mistralai/devstral-small:free",
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  FREE_ROUTER,
];

const GPT_MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  FREE_ROUTER,
];

const GLM_MODELS = [
  "z-ai/glm-4.5-air:free",
  "z-ai/glm-4.5:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  FREE_ROUTER,
];

const EMERGENCY_FALLBACK = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "openai/gpt-oss-20b:free",
  "z-ai/glm-4.5-air:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  FREE_ROUTER,
];

const SYSTEM_PROMPT = `
Kamu adalah Vortex Ai, Ai assistant cerdas, ramah, santai, dan helpful.
Vortex Ai dibuat oleh Andre (TikTok: @urz3nn).
Jika ditanya siapa pembuatmu, jawab: Andre
jika ditanya media sosial pembuat kamu, jawab: tiktok:urz3nn

ATURAN UTAMA:
- Jawab TUNTAS & LENGKAP, jangan dipotong di tengah.
- Jangan gunakan "..." atau placeholder. Full jawaban selalu.
- Pahami typo user secara otomatis.
- Gaya santai seperti teman, tapi tetap informatif dan detail.

FORMAT (WAJIB):
- **teks tebal** untuk poin penting.
- *italic* untuk istilah.
- ## Judul dan ### Sub-judul untuk struktur.
- - list dan 1. 2. 3. untuk langkah berurutan.
- > untuk catatan penting.
- \`\`\`bahasa untuk KODE SAJA, bukan penjelasan biasa.
- Paragraf mengalir, pisah topik dengan baris kosong.

CODING:
- Selalu full code yang bisa langsung dipakai.
- Jelaskan singkat → kode lengkap → cara pakai → cara kerja.

KEAMANAN:
- Tolak: hacking, malware, scam, phishing, aktivitas ilegal.
- Jika user toxic: tetap tenang, minta bicara baik-baik.
`;

// ── Satu request ke OpenRouter dengan satu key ──────────────
async function tryKey(key, model, messages) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method : "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type" : "application/json",
        "HTTP-Referer"  : SITE_URL,
        "X-Title"       : "AIVA",
      },
      body  : JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const raw = await res.text();
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = JSON.parse(raw);
    if (data.error) throw new Error(data.error.message || "model error");

    let text = data?.choices?.[0]?.message?.content || "";
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!text) throw new Error("empty response");

    return text;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ── Coba satu model dengan SEMUA key secara paralel ─────────
async function tryModel(model, messages) {
  return Promise.any(KEYS.map(k => tryKey(k, model, messages)));
}

// ── Coba chain sampai ada yang berhasil ─────────────────────
async function tryChain(chain, messages) {
  const tried = new Set();
  for (const model of chain) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      console.log(`[AIVA] trying ${model}`);
      const result = await tryModel(model, messages);
      console.log(`[AIVA] OK ${model}`);
      return result;
    } catch (e) {
      console.log(`[AIVA] ${model} failed: ${e.message}`);
    }
  }
  throw new Error("Semua model di chain gagal");
}

// ── callAPI — entry point ────────────────────────────────────
async function callAPI(api, message, history = [], userName = "") {
  if (api === "gemma") api = "groq";

  const messages = [
    {
      role   : "system",
      content: SYSTEM_PROMPT +
        (userName ? `\n\nNama pengguna: "${userName}". Panggil dengan namanya jika relevan.` : ""),
    },
    ...history,
    { role: "user", content: message },
  ];

  // Pilih chain utama
  let primaryChain;
  if      (api === "groq") primaryChain = GROQ_MODELS;
  else if (api === "qwen") primaryChain = QWEN_MODELS;
  else if (api === "gpt")  primaryChain = GPT_MODELS;
  else if (api === "glm")  primaryChain = GLM_MODELS;
  else throw new Error("API tidak dikenal: " + api);

  // Coba chain utama
  try {
    return await tryChain(primaryChain, messages);
  } catch {
    console.log(`[AIVA] chain utama ${api} habis, emergency fallback`);
  }

  // Emergency fallback — model yang belum dicoba
  const tried   = new Set(primaryChain);
  const fallback = EMERGENCY_FALLBACK.filter(m => !tried.has(m));
  return tryChain(fallback, messages);
}

module.exports = { callAPI };
