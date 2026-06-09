// api/sw.js — Serve Service Worker untuk background audio playback
const fs   = require('fs');
const path = require('path');

let _swCache = null;

module.exports = function handler(req, res) {
  try {
    if (!_swCache) {
      _swCache = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf-8');
    }
    /* Service Worker harus di-serve dengan Content-Type yang benar
       dan tanpa cache agar update langsung aktif */
    res.setHeader('Content-Type',  'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Service-Worker-Allowed', '/');
    return res.status(200).send(_swCache);
  } catch(e) {
    console.error('[sw]', e.message);
    return res.status(404).send('Not found');
  }
};
