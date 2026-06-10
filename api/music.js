/* AIVA Music API v12
   Strategy: Deezer untuk metadata + preview URL
   Preview Deezer = MP3 30s, tapi CORS-open dan PASTI jalan
   Full track = embed via YouTube iframe (audio only) di background
   
   Untuk /resolve: return Deezer preview URL langsung (no proxy needed)
*/

const DEEZER = 'https://api.deezer.com';

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
  'Tulus Gajah','Tulus Sepatu','Raisa Teduh Bersama',
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
    /* preview langsung dari Deezer CDN — CORS open, tidak perlu proxy */
    audioUrl: t.preview      || '',
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
    return (d.data || []).map(norm).filter(t => t.audioUrl);
  } catch { return []; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { type, q } = req.query;

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

  if (type === 'search' && q) {
    try {
      const tracks = await deezerSearch(q, 40);
      return res.json({ tracks });
    } catch (e) {
      return res.status(500).json({ tracks: [], error: String(e) });
    }
  }

  res.status(400).json({ error: 'Invalid' });
}
