/* AIVA Music API v7
   Trending  : Deezer chart Indonesia (region 158) + global
   Search    : Deezer search  
   Stream    : scrape YouTube innertube API → direct audio stream (full track)
*/

const DEEZER   = 'https://api.deezer.com';
const INNERTUBE= 'https://www.youtube.com/youtubei/v1';
const YT_KEY   = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'; /* public web key */

/* ── Deezer helpers ── */
function norm(t) {
  return {
    id:       String(t.id),
    title:    t.title        || 'Unknown',
    artist:   t.artist?.name || 'Unknown',
    album:    t.album?.title || '',
    cover:    t.album?.cover_medium || t.album?.cover_big || t.album?.cover || '',
    duration: t.duration     || 0,
    audioUrl: '',   /* diisi oleh frontend saat play */
    ytQuery:  `${t.title} ${t.artist?.name} official audio`,
  };
}

async function deezerTracks(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Deezer ' + r.status);
  const d = await r.json();
  return (d.data || d.tracks?.data || []).map(norm);
}

/* ── YouTube Innertube: search → videoId ── */
async function ytSearch(query) {
  const body = {
    context: { client: { clientName: 'WEB', clientVersion: '2.20231121.08.00' } },
    query,
    params: 'EgIQAQ%3D%3D', /* filter: musik */
  };
  const r = await fetch(`${INNERTUBE}/search?key=${YT_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  const d = await r.json();
  /* walk response untuk cari videoId pertama */
  const json = JSON.stringify(d);
  const m = json.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
  return m ? m[1] : null;
}

/* ── YouTube Innertube: videoId → audio stream URL ── */
async function ytAudioUrl(videoId) {
  const body = {
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '17.31.35',
        androidSdkVersion: 30,
        userAgent: 'com.google.android.youtube/17.31.35',
        hl: 'en', gl: 'US',
      }
    },
    videoId,
    params: '2AMBCgIQBg',
  };
  const r = await fetch(`${INNERTUBE}/player?key=${YT_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/17.31.35 (Linux; U; Android 11)',
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': '17.31.35',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  const d = await r.json();
  /* Ambil audio-only format terbaik (mp4a atau opus) */
  const formats = [
    ...(d.streamingData?.adaptiveFormats || []),
    ...(d.streamingData?.formats || []),
  ].filter(f => f.mimeType?.startsWith('audio/'));
  /* Sort: pilih bitrate tertinggi */
  formats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  const best = formats[0];
  return best?.url || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { type, q, videoId, url } = req.query;

  /* ── Trending Indonesia ── */
  if (type === 'trending') {
    try {
      const [indo, global] = await Promise.allSettled([
        deezerTracks(`${DEEZER}/chart/158/tracks?limit=50`),
        deezerTracks(`${DEEZER}/chart/0/tracks?limit=50`),
      ]);
      const indoT   = indo.status   === 'fulfilled' ? indo.value   : [];
      const globalT = global.status === 'fulfilled' ? global.value : [];
      const seen = new Set();
      const tracks = [...indoT, ...globalT].filter(t => {
        if (seen.has(t.id)) return false;
        seen.add(t.id); return true;
      }).slice(0, 40);
      return res.json({ tracks });
    } catch (e) {
      return res.status(500).json({ tracks: [], error: String(e) });
    }
  }

  /* ── Search ── */
  if (type === 'search' && q) {
    try {
      const tracks = await deezerTracks(
        `${DEEZER}/search?q=${encodeURIComponent(q)}&limit=40&order=RANKING`
      );
      return res.json({ tracks });
    } catch (e) {
      return res.status(500).json({ tracks: [], error: String(e) });
    }
  }

  /* ── Resolve audio URL dari YouTube (dipanggil saat user tap play) ── */
  if (type === 'resolve' && q) {
    try {
      const vid = await ytSearch(q);
      if (!vid) return res.status(404).json({ error: 'Not found' });
      const audioUrl = await ytAudioUrl(vid);
      if (!audioUrl) return res.status(404).json({ error: 'No audio' });
      return res.json({ audioUrl, videoId: vid });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }

  /* ── Stream proxy (forward YouTube audio ke browser) ── */
  if (type === 'stream' && url) {
    try {
      const src = decodeURIComponent(url);
      /* Whitelist: hanya YouTube CDN */
      if (!src.includes('googlevideo.com') && !src.includes('youtube.com')) {
        return res.status(403).end('Forbidden');
      }
      const range    = req.headers['range'] || '';
      const upstream = await fetch(src, {
        headers: {
          'User-Agent': 'com.google.android.youtube/17.31.35',
          ...(range ? { Range: range } : {}),
        }
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
