/* AIVA Music API v11 */

const DEEZER    = 'https://api.deezer.com';
const INNERTUBE = 'https://www.youtube.com/youtubei/v1';

const INDO_TOP = [
  'Hindia Secukupnya','Hindia Besok Mungkin Kita Sampai',
  'The Panturas Mabuk Laut','The Panturas Terlalu Tinggi',
  'Feast Berita Kehilangan','Feast Membasuh',
  'Barasuara Taifun','Barasuara Api dan Lentera',
  'Efek Rumah Kaca Cinta Melulu',
  'Pamungkas To The Bone','Pamungkas I Love You But I Love Me More',
  'Reality Club In Your Arms Instead',
  'Fourtwnty Zona Nyaman','Fourtwnty Aku Bukan Untukmu',
  'Elephant Kind Someday','Mocca I Love You Anyway',
  'Tulus Gajah','Tulus Sepatu',
  'Raisa Teduh Bersama',
  'Weird Genius Lathi','Isyana Sarasvati Tetap Dalam Jiwa',
  'Sheila on 7 Dan','Noah Separuh Aku',
  'Yura Yunita Cinta Dan Rahasia',
  'Maliq D Essentials Terdiam Sepi',
];

function norm(t) {
  return {
    id:       String(t.id),
    title:    t.title        || 'Unknown',
    artist:   t.artist?.name || 'Unknown',
    album:    t.album?.title || '',
    cover:    t.album?.cover_medium || t.album?.cover_big || t.album?.cover || '',
    duration: t.duration     || 0,
    audioUrl: '',
    ytQuery:  `${t.title} ${t.artist?.name || ''}`,
  };
}

async function deezerSearch(q, limit = 1) {
  try {
    const r = await fetch(
      `${DEEZER}/search?q=${encodeURIComponent(q)}&limit=${limit}&order=RANKING`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data || []).map(norm);
  } catch { return []; }
}

/* Coba beberapa YouTube client sampai ada yang berhasil */
async function ytGetAudio(videoId) {
  const clients = [
    /* TV client — paling tidak kena restriction */
    {
      clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
      clientVersion: '2.0',
      clientScreen: 'EMBED',
      cn: '85',
    },
    /* iOS client */
    {
      clientName: 'IOS',
      clientVersion: '19.29.1',
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '17.5.1.21F90',
      cn: '5',
    },
    /* Web embedded */
    {
      clientName: 'WEB_EMBEDDED_PLAYER',
      clientVersion: '1.20231215.01.00',
      clientScreen: 'EMBED',
      cn: '56',
    },
  ];

  for (const c of clients) {
    try {
      const ctx = {
        clientName:    c.clientName,
        clientVersion: c.clientVersion,
        hl: 'id', gl: 'ID',
      };
      if (c.clientScreen) ctx.clientScreen = c.clientScreen;
      if (c.deviceMake)   ctx.deviceMake   = c.deviceMake;
      if (c.deviceModel)  ctx.deviceModel  = c.deviceModel;
      if (c.osName)       ctx.osName       = c.osName;
      if (c.osVersion)    ctx.osVersion    = c.osVersion;

      const r = await fetch(`${INNERTUBE}/player`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'X-YouTube-Client-Name': c.cn,
          'X-YouTube-Client-Version': c.clientVersion,
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
        },
        body: JSON.stringify({
          context: { client: ctx },
          videoId,
          params: 'CgIQBg==',
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (!r.ok) continue;
      const d = await r.json();
      if (d.playabilityStatus?.status !== 'OK') continue;

      const formats = [
        ...(d.streamingData?.adaptiveFormats || []),
        ...(d.streamingData?.formats         || []),
      ].filter(f => f.url && f.mimeType?.startsWith('audio/'));

      if (!formats.length) continue;

      /* Pilih opus atau mp4a, bitrate tertinggi */
      const opus  = formats.filter(f => f.mimeType.includes('opus'));
      const best  = (opus.length ? opus : formats)
                    .sort((a,b) => (b.bitrate||0)-(a.bitrate||0))[0];
      return best.url;
    } catch { continue; }
  }
  return null;
}

async function ytSearch(query) {
  try {
    const r = await fetch(`${INNERTUBE}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20240101', hl: 'id', gl: 'ID' } },
        query,
        params: 'EgIQAQ==',
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const txt = await r.text();
    const m = txt.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    return m ? m[1] : null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { type, q, url } = req.query;

  /* ── Trending ── */
  if (type === 'trending') {
    try {
      const results = await Promise.allSettled(INDO_TOP.map(q => deezerSearch(q, 1)));
      const seen = new Set();
      const tracks = results
        .flatMap(r => r.status === 'fulfilled' ? r.value : [])
        .filter(t => { if (!t.id || seen.has(t.id)) return false; seen.add(t.id); return true; })
        .slice(0, 30);
      return res.json({ tracks });
    } catch (e) {
      return res.status(500).json({ tracks: [], error: String(e) });
    }
  }

  /* ── Search ── */
  if (type === 'search' && q) {
    try {
      const tracks = await deezerSearch(q, 40);
      return res.json({ tracks });
    } catch (e) {
      return res.status(500).json({ tracks: [], error: String(e) });
    }
  }

  /* ── Resolve ── */
  if (type === 'resolve' && q) {
    try {
      const videoId = await ytSearch(q);
      if (!videoId) return res.status(404).json({ error: 'Video not found' });
      const audioUrl = await ytGetAudio(videoId);
      if (!audioUrl) return res.status(404).json({ error: 'No audio stream' });
      /* Kembalikan sebagai stream URL via proxy */
      const streamUrl = `/api/music?type=stream&url=${encodeURIComponent(audioUrl)}`;
      return res.json({ audioUrl: streamUrl, videoId });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }

  /* ── Stream proxy — pipe YouTube audio ke browser ── */
  if (type === 'stream' && url) {
    try {
      const src = decodeURIComponent(url);
      if (!src.includes('googlevideo.com')) return res.status(403).end('Forbidden');

      const range    = req.headers['range'] || '';
      const upstream = await fetch(src, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 11)',
          'Accept':     '*/*',
          ...(range ? { Range: range } : {}),
        },
        signal: AbortSignal.timeout(30000),
      });

      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/webm');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-store');
      const cl = upstream.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);
      const cr = upstream.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);

      res.status(upstream.status);

      /* Pipe stream */
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const ok = res.write(Buffer.from(value));
        /* Backpressure */
        if (!ok) await new Promise(r => res.once('drain', r));
      }
      return res.end();
    } catch (e) {
      if (!res.headersSent) res.status(500).end(String(e));
      else res.end();
    }
  }

  res.status(400).json({ error: 'Invalid' });
}
