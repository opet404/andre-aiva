/* AIVA Music API v10
   Trending : lagu Indo Gen Z top — hardcoded queries spesifik per lagu
   Search   : Deezer
   Resolve  : YouTube Innertube ANDROID_TESTSUITE (paling reliable, no cipher)
   Stream   : 302 redirect ke YouTube CDN
*/

const DEEZER    = 'https://api.deezer.com';
const INNERTUBE = 'https://www.youtube.com/youtubei/v1';
const YT_KEY    = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

/* Lagu Indo Gen Z yang top — query spesifik supaya Deezer return hasil tepat */
const INDO_TOP = [
  'Hindia Secukupnya',
  'Hindia Besok Mungkin Kita Sampai',
  'The Panturas Mabuk Laut',
  'The Panturas Terlalu Tinggi',
  'Feast Berita Kehilangan',
  'Feast Membasuh',
  'Barasuara Taifun',
  'Barasuara Api dan Lentera',
  'Efek Rumah Kaca Cinta Melulu',
  'Efek Rumah Kaca Jatuh Cinta Itu Biasa Saja',
  'Pamungkas To The Bone',
  'Pamungkas I Love You But I Love Me More',
  'Reality Club In Your Arms Instead',
  'Reality Club Closer',
  'Fourtwnty Zona Nyaman',
  'Fourtwnty Aku Bukan Untukmu',
  'Elephant Kind Someday',
  'Mocca I Love You Anyway',
  'Tulus Gajah',
  'Tulus Sepatu',
  'Raisa Teduh Bersama',
  'Weird Genius ft Sara Fajira Lathi',
  'Isyana Sarasvati Tetap Dalam Jiwa',
  'Sheila on 7 Dan',
  'Sheila on 7 Melompat Lebih Tinggi',
  'Noah Separuh Aku',
  'Padi Reborn Semua Tak Sama',
  'Maliq D Essentials Terdiam Sepi',
  'Afgan Jodoh Pasti Bertemu',
  'Yura Yunita Cinta Dan Rahasia',
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

/* YouTube Innertube: ANDROID_TESTSUITE — tidak butuh signature decoding */
async function ytGetAudio(videoId) {
  const body = {
    context: {
      client: {
        clientName: 'ANDROID_TESTSUITE',
        clientVersion: '1.9',
        androidSdkVersion: 30,
        hl: 'id', gl: 'ID',
      },
    },
    videoId,
  };
  try {
    const r = await fetch(`${INNERTUBE}/player?key=${YT_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/17.31.35 (Linux; U; Android 11)',
        'X-YouTube-Client-Name': '30',
        'X-YouTube-Client-Version': '1.9',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.playabilityStatus?.status !== 'OK') return null;
    const formats = [
      ...(d.streamingData?.adaptiveFormats || []),
      ...(d.streamingData?.formats || []),
    ].filter(f => f.mimeType?.startsWith('audio/') && f.url);
    if (!formats.length) return null;
    formats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    return formats[0].url;
  } catch { return null; }
}

async function ytSearch(query) {
  try {
    const r = await fetch(`${INNERTUBE}/search?key=${YT_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20231121.08.00', hl: 'id', gl: 'ID' } },
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

  /* ── Trending: lagu Indo Gen Z top ── */
  if (type === 'trending') {
    try {
      const results = await Promise.allSettled(INDO_TOP.map(q => deezerSearch(q, 1)));
      const seen = new Set();
      const tracks = results
        .flatMap(r => r.status === 'fulfilled' ? r.value : [])
        .filter(t => {
          if (!t.id || seen.has(t.id)) return false;
          seen.add(t.id); return true;
        })
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

  /* ── Resolve: YouTube search + audio URL ── */
  if (type === 'resolve' && q) {
    try {
      const videoId = await ytSearch(q);
      if (!videoId) return res.status(404).json({ error: 'Video not found' });
      const audioUrl = await ytGetAudio(videoId);
      if (!audioUrl) return res.status(404).json({ error: 'No audio stream' });
      /* Return via stream endpoint supaya CORS aman */
      const streamUrl = `/api/music?type=stream&url=${encodeURIComponent(audioUrl)}`;
      return res.json({ audioUrl: streamUrl, videoId });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }

  /* ── Stream: 302 redirect ke YouTube CDN ── */
  /* <audio> tag tidak enforce CORS — redirect langsung work */
  if (type === 'stream' && url) {
    try {
      const src = decodeURIComponent(url);
      if (!src.includes('googlevideo.com')) {
        return res.status(403).end('Forbidden');
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.redirect(302, src);
    } catch (e) {
      return res.status(500).end(String(e));
    }
  }

  res.status(400).json({ error: 'Invalid request' });
}
