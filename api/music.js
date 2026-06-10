/* AIVA Music API v8
   Trending  : hardcoded artis Indo top (Hindia, The Panturas, Feast, dll)
               + Deezer search per artis → tracks real
   Search    : Deezer search
   Resolve   : YouTube Innertube → audio URL full track
   Stream    : proxy audio ke browser
*/

const DEEZER    = 'https://api.deezer.com';
const INNERTUBE = 'https://www.youtube.com/youtubei/v1';
const YT_KEY    = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

/* Artis Indo yang wajib muncul di trending */
const INDO_ARTISTS = [
  'Hindia','The Panturas','Feast','Barasuara','Efek Rumah Kaca',
  'Pamungkas','Weird Genius','Raisa','Tulus','Isyana Sarasvati',
  'Afgan','Fourtwnty','Mocca','Reality Club','Elephant Kind',
  'The SIGIT','Padi Reborn','Noah','Sheila on 7','Maliq & D Essentials',
];

function norm(t) {
  return {
    id:       String(t.id),
    title:    t.title        || 'Unknown',
    artist:   t.artist?.name || 'Unknown',
    album:    t.album?.title || '',
    cover:    t.album?.cover_medium || t.album?.cover_big || t.album?.cover || '',
    duration: t.duration || 0,
    audioUrl: '',
    ytQuery:  `${t.title} ${t.artist?.name || ''} official audio`,
  };
}

async function deezerSearch(q, limit = 5) {
  const r = await fetch(`${DEEZER}/search?q=${encodeURIComponent(q)}&limit=${limit}&order=RANKING`);
  if (!r.ok) return [];
  const d = await r.json();
  return (d.data || []).map(norm);
}

/* YouTube Innertube search → videoId */
async function ytSearch(query) {
  const r = await fetch(`${INNERTUBE}/search?key=${YT_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: '2.20231121.08.00', hl: 'id', gl: 'ID' } },
      query,
      params: 'EgIQAQ==',
    }),
  });
  if (!r.ok) return null;
  const txt = await r.text();
  const m = txt.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
  return m ? m[1] : null;
}

/* YouTube Innertube player → audio stream URL */
async function ytAudioUrl(videoId) {
  /* Coba ANDROID client dulu (tidak perlu signature) */
  const clients = [
    {
      clientName: 'ANDROID_MUSIC', clientVersion: '6.42.52',
      androidSdkVersion: 30,
      userAgent: 'com.google.android.apps.youtube.music/6.42.52 (Linux; U; Android 11)',
      xClientName: '21', xClientVersion: '6.42.52',
    },
    {
      clientName: 'ANDROID', clientVersion: '17.31.35',
      androidSdkVersion: 30,
      userAgent: 'com.google.android.youtube/17.31.35 (Linux; U; Android 11)',
      xClientName: '3', xClientVersion: '17.31.35',
    },
  ];

  for (const c of clients) {
    try {
      const r = await fetch(`${INNERTUBE}/player?key=${YT_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': c.userAgent,
          'X-YouTube-Client-Name': c.xClientName,
          'X-YouTube-Client-Version': c.xClientVersion,
        },
        body: JSON.stringify({
          context: { client: { clientName: c.clientName, clientVersion: c.clientVersion, androidSdkVersion: c.androidSdkVersion, hl: 'id', gl: 'ID' } },
          videoId,
          params: '2AMBCgIQBg',
          playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
        }),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const formats = [
        ...(d.streamingData?.adaptiveFormats || []),
        ...(d.streamingData?.formats || []),
      ].filter(f => f.mimeType?.startsWith('audio/') && f.url);
      if (!formats.length) continue;
      formats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      return formats[0].url;
    } catch { continue; }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { type, q, url } = req.query;

  /* ── Trending: artis Indo top ── */
  if (type === 'trending') {
    try {
      /* Ambil 2 lagu per artis secara paralel */
      const results = await Promise.allSettled(
        INDO_ARTISTS.map(a => deezerSearch(a, 2))
      );
      const seen = new Set();
      const tracks = results
        .flatMap(r => r.status === 'fulfilled' ? r.value : [])
        .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
        .slice(0, 40);
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

  /* ── Resolve: cari YouTube videoId + audio URL ── */
  if (type === 'resolve' && q) {
    try {
      const videoId = await ytSearch(q);
      if (!videoId) return res.status(404).json({ error: 'Video not found' });
      const audioUrl = await ytAudioUrl(videoId);
      if (!audioUrl) return res.status(404).json({ error: 'Audio not found' });
      return res.json({ audioUrl, videoId });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }

  /* ── Stream proxy ── */
  if (type === 'stream' && url) {
    try {
      const src = decodeURIComponent(url);
      if (!src.includes('googlevideo.com') && !src.includes('youtube.com')) {
        return res.status(403).end('Forbidden');
      }
      const range    = req.headers['range'] || '';
      const upstream = await fetch(src, {
        headers: {
          'User-Agent': 'com.google.android.apps.youtube.music/6.42.52',
          ...(range ? { Range: range } : {}),
        },
      });
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      const cl = upstream.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);
      const cr = upstream.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);
      res.status(upstream.status);
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      return res.end();
    } catch (e) {
      return res.status(500).end(String(e));
    }
  }

  res.status(400).json({ error: 'Invalid' });
}
