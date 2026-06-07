// api/serve.js — Multi-signal browser gate: blocks ALL terminal scrapers
const fs   = require('fs');
const path = require('path');

// ── Daftar tool terminal / scraper yang diblokir ─────────────
const BLOCK_UA = /curl|wget|python|scrapy|go-http|java\/|okhttp|axios|node-fetch|libwww|perl|ruby|php\/|scraperapi|mechanize|nikto|nmap|sqlmap|masscan|httpclient|lynx|links|elinks|w3m|httpie|insomnia|postman|thunder client|paw|rest-client|jsdom|puppeteer|playwright|headless|phantomjs|selenium|webdriver|htmlunit|jakarta|apache-http|aiohttp|grequests|httpx|fetch-h2|pycurl|urllib|requests\/|winhttp|powershell|invokewebrequest/i;

// ── Harus ada tanda browser asli ─────────────────────────────
const NEED_UA  = /mozilla|chrome|safari|firefox|edge|opera|opr\//i;

// Cache HTML — tidak baca disk tiap request
let _cache = null;

function getIp(req){
  return (req.headers['x-forwarded-for']||'').split(',')[0].trim()
      || req.headers['x-real-ip']
      || req.socket?.remoteAddress
      || 'unknown';
}

module.exports = async function handler(req, res) {
  const ua      = req.headers['user-agent']      || '';
  const accept  = req.headers['accept']           || '';
  const accLang = req.headers['accept-language']  || '';
  const sfDest  = req.headers['sec-fetch-dest']   || '';
  const sfMode  = req.headers['sec-fetch-mode']   || '';

  // ── Pemeriksaan 1: User-Agent wajib ada & harus browser ──
  if (!ua || BLOCK_UA.test(ua) || !NEED_UA.test(ua)) {
    return res.status(403).setHeader('Content-Type','text/plain').send('403 Forbidden');
  }

  // ── Pemeriksaan 2: Accept header harus minta HTML ─────────
  if (accept && !accept.includes('text/html') && !accept.includes('*/*')) {
    return res.status(403).setHeader('Content-Type','text/plain').send('403 Forbidden');
  }

  // ── Pemeriksaan 3: Accept-Language wajib ada ──────────────
  // Browser selalu kirim ini; tool terminal biasanya tidak
  if (!accLang) {
    return res.status(403).setHeader('Content-Type','text/plain').send('403 Forbidden');
  }

  // ── Pemeriksaan 4: Sec-Fetch-Dest (modern browser signal) ─
  // Kalau header ini ada, nilainya harus "document" (navigasi biasa)
  if (sfDest && sfDest !== 'document') {
    return res.status(403).setHeader('Content-Type','text/plain').send('403 Forbidden');
  }

  // ── Semua pemeriksaan lolos → serve HTML ──────────────────
  try {
    if (!_cache) {
      _cache = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
    }
    res.setHeader('Content-Type',           'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options',        'SAMEORIGIN');
    res.setHeader('X-XSS-Protection',       '1; mode=block');
    res.setHeader('Cache-Control',          'no-store, no-cache, must-revalidate');
    res.setHeader('X-Robots-Tag',           'noindex, nofollow');
    return res.status(200).send(_cache);
  } catch(e) {
    console.error('[serve]', e.message);
    return res.status(500).send('Internal Server Error');
  }
};
