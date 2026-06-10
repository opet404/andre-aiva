/* AIVA Music API v9
   Trending  : artis Indo top hardcoded → Deezer search
   Search    : Deezer search
   Resolve   : YouTube Innertube → audio URL
   Stream    : 302 redirect ke YouTube CDN (browser fetch langsung, no CORS on <audio>)
*/

const DEEZER    = 'https://api.deezer.com';
const INNERTUBE = 'https://www.youtube.com/youtubei/v1';
const YT_KEY    = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

const INDO_ARTISTS = [
  'Hindia','The Panturas','Feast','Barasuara','Efek Rumah Kaca',
  'Pamungkas','Weird Genius','Raisa','Tulus','Isyana Sarasvati',
  'Afgan','Fourtwnty','Mocca','Reality Club','Elephant Kind',
  'The SIGIT','Padi Reborn','Noah','Sheila on 7','Maliq D Essentials',
];

function norm(t) {
  return {
    id:      String(t.id),
    title:   t.title        || 'Unknown',
    artist:  t.artist?.name || 'Unknown',
    album:   t.album?.title || '',
    cover:   t.album?.cover_medium || t.album?.cover_big || t.album?.cover || '',
    duration:t.duration || 0,
    audioUrl:'',
    ytQuery: `${t.title} ${t.artist?.name || ''} audio`,
  };
}

async function deezerSearch(q, limit = 3) {
  try {
    const r = await fetch(`${DEEZER}/search?q=${encodeURIComponent(q)}&limit=${limit}&order=RANKING`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data || []).map(norm);
  } catch { return []; }
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
    });
    if (!r.ok) return null;
    const txt = await r.text();
    const m = txt.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    return m ? m[1] : null;
  } catch { return null; }
}

async function ytAudioUrl(videoId) {
  const clients = [
    {
      name: 'ANDROID_MUSIC', version: '6.42.52', sdk: 30,
      ua: 'com.google.android.apps.youtube.music/6.42.52 (Linux; U; Android 11)',
      cn: '21',
    },
    {
      name: 'ANDROID', version: '17.31.35', sdk: 30,
      ua: 'com.google.android.youtube/17.31.35 (Linux; U; Android 11)',
      cn: '3',
    },
    {
      name: 'IOS', version: '19.09.3', sdk: 0,
      ua: 'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)',
      cn: '5',
    },
  ];

  for (const c of clients) {
    try {
      const body = {
        context: {
          client: {
            clientName: c.name,
            clientVersion: c.version,
            ...(c.sdk ? { androidSdkVersion: c.sdk } : {}),
            hl: 'id', gl: 'ID',
          },
        },
        videoId,
        params: '2AMBCgIQBg',
        playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
      };
      const r = await fetch(`${INNERTUBE}/player?key=${YT_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': c.ua,
          'X-YouTube-Client-Name': c.cn,
          'X-YouTube-Client-Version': c.version,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.playabilityStatus?.status === 'ERROR') continue;
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

  /* ── Trending ── */
  if (type === 'trending') {
    try {
      const results = await Promise.allSettled(INDO_ARTISTS.map(a => deezerSearch(a, 3)));
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

  /* ── Resolve: dapat audio URL dari YouTube ── */
  if (type === 'resolve' && q) {
    try {
      const videoId = await ytSearch(q);
      if (!videoId) return res.status(404).json({ error: 'Not found' });
      const audioUrl = await ytAudioUrl(videoId);
      if (!audioUrl) return res.status(404).json({ error: 'No audio' });
      /* Return stream URL via /api/music?type=stream supaya browser tidak kena CORS */
      const streamUrl = `/api/music?type=stream&url=${encodeURIComponent(audioUrl)}`;
      return res.json({ audioUrl: streamUrl, videoId });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }

  /* ── Stream: 302 redirect ke YouTube CDN ── */
  /* <audio> tag tidak enforce CORS, jadi redirect langsung jalan */
  if (type === 'stream' && url) {
    try {
      const src = decodeURIComponent(url);
      if (!src.includes('googlevideo.com')) {
        return res.status(403).end('Forbidden');
      }
      /* Redirect — tidak perlu proxy, jauh lebih cepat & tidak timeout */
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, src);
    } catch (e) {
      return res.status(500).end(String(e));
    }
  }

  res.status(400).json({ error: 'Invalid' });
}
