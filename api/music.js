/* AIVA Music API v13
   trending/search : Deezer (metadata + cover)
   resolve         : YouTube Innertube → signed audio URL (full track)
   Audio diplay ke browser langsung via redirect — <audio> tidak enforce CORS
*/

const DEEZER    = 'https://api.deezer.com';
const INNERTUBE = 'https://www.youtube.com/youtubei/v1';

const INDO_TOP = [
  'Hindia Secukupnya','Hindia Besok Mungkin Kita Sampai','Hindia Evakuasi',
  'The Panturas Mabuk Laut','The Panturas Terlalu Tinggi','The Panturas Riuk',
  'Feast Berita Kehilangan','Feast Membasuh','Feast Peradaban',
  'Barasuara Taifun','Barasuara Api dan Lentera','Barasuara Hagia',
  'Efek Rumah Kaca Cinta Melulu','Efek Rumah Kaca Jatuh Cinta Itu Biasa Saja',
  'Pamungkas To The Bone','Pamungkas I Love You But I Love Me More',
  'Reality Club In Your Arms Instead','Reality Club Closer',
  'Fourtwnty Zona Nyaman','Fourtwnty Aku Bukan Untukmu',
  'Tulus Gajah','Tulus Sepatu','Tulus Manusia Kuat',
  'Raisa Teduh Bersama','Raisa Jatuh Hati',
  'Weird Genius Lathi','Isyana Sarasvati Tetap Dalam Jiwa',
  'Sheila on 7 Dan','Noah Separuh Aku',
  'Mocca I Love You Anyway','Elephant Kind Someday',
];

function norm(t) {
  return {
    id:       String(t.id),
    title:    t.title        || 'Unknown',
    artist:   t.artist?.name || 'Unknown',
    album:    t.album?.title || '',
    cover:    t.album?.cover_medium || t.album?.cover_big || t.album?.cover || '',
    duration: t.duration || 0,
    audioUrl: '',  /* diisi saat resolve */
    ytQuery:  `${t.title} ${t.artist?.name || ''} audio`,
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

/* YouTube: search → videoId */
async function ytSearch(query) {
  try {
    const r = await fetch(`${INNERTUBE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: {
          clientName: 'WEB', clientVersion: '2.20240101',
          hl: 'id', gl: 'ID',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }},
        query,
        params: 'EgIQAQ==', /* filter: hanya video musik */
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const txt = await r.text();
    const m = txt.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    return m ? m[1] : null;
  } catch { return null; }
}

/* YouTube: videoId → direct audio URL (full track, no cipher needed) */
async function ytAudio(videoId) {
  /* iOS client — paling reliable, return URL langsung tanpa signature */
  const body = {
    context: { client: {
      clientName:    'IOS',
      clientVersion: '19.29.1',
      deviceMake:    'Apple',
      deviceModel:   'iPhone16,2',
      osName:        'iPhone',
      osVersion:     '17.5.1.21F90',
      hl: 'id', gl: 'ID',
    }},
    videoId,
    params: 'CgIQBg==',
    playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
  };

  try {
    const r = await fetch(`${INNERTUBE}/player`, {
      method: 'POST',
      headers: {
        'Content-Type':              'application/json',
        'User-Agent':                'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)',
        'X-YouTube-Client-Name':     '5',
        'X-YouTube-Client-Version':  '19.29.1',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.playabilityStatus?.status !== 'OK') return null;

    const formats = [
      ...(d.streamingData?.adaptiveFormats || []),
      ...(d.streamingData?.formats         || []),
    ].filter(f => f.url && f.mimeType?.startsWith('audio/'));

    if (!formats.length) return null;

    /* Pilih mp4a (lebih kompatibel di iOS/Android) atau opus */
    const mp4a = formats.filter(f => f.mimeType.includes('mp4a'));
    const pool = mp4a.length ? mp4a : formats;
    pool.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    return pool[0].url;
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

  /* ── Resolve: cari audio URL full track ── */
  if (type === 'resolve' && q) {
    try {
      const videoId = await ytSearch(q);
      if (!videoId) return res.status(404).json({ error: 'not found' });
      const audioUrl = await ytAudio(videoId);
      if (!audioUrl) return res.status(404).json({ error: 'no audio' });
      /* Kirim ke frontend sebagai redirect URL */
      return res.json({ audioUrl: `/api/music?type=stream&url=${encodeURIComponent(audioUrl)}` });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }

  /* ── Stream: 302 redirect ke YouTube CDN ──
     <audio> tag tidak enforce CORS — redirect work tanpa proxy */
  if (type === 'stream' && url) {
    const src = decodeURIComponent(url);
    if (!src.includes('googlevideo.com')) return res.status(403).end();
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, src);
  }

  res.status(400).json({ error: 'invalid' });
}
