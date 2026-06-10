/* AIVA Music API
   GET /api/music?type=trending
   GET /api/music?type=search&q=QUERY
   Deezer (data+cover) + YouTube scraping (3 candidate IDs per track)
*/

const DEEZER = 'https://api.deezer.com';

/* Ambil beberapa YouTube video ID untuk satu query (bukan cuma 1) */
async function getYouTubeIds(query, count = 3) {
  try {
    const q = encodeURIComponent(query + ' official audio');
    const r = await fetch(
      `https://www.youtube.com/results?search_query=${q}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' } }
    );
    const html = await r.text();
    const ids = [];
    const re = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
    let m;
    while ((m = re.exec(html)) !== null && ids.length < count) {
      if (!ids.includes(m[1])) ids.push(m[1]);
    }
    return ids;
  } catch {
    return [];
  }
}

function normTrack(t) {
  return {
    id: t.id,
    title: t.title || 'Unknown',
    artist: t.artist?.name || t.artist || 'Unknown',
    album: t.album?.title || '',
    cover: t.album?.cover_medium || t.album?.cover_big || t.album?.cover || '',
    duration: t.duration || 0,
    ytIds: [],  /* array of candidate IDs */
  };
}

async function enrichTracks(tracks, limit = 20) {
  const slice = tracks.slice(0, limit);
  const results = await Promise.allSettled(
    slice.map(async (t) => {
      const norm = normTrack(t);
      norm.ytIds = await getYouTubeIds(`${norm.artist} ${norm.title}`, 4);
      return norm;
    })
  );
  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : normTrack(slice[i])
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const { type, q } = req.query;

  try {
    if (type === 'trending') {
      const r = await fetch(`${DEEZER}/chart/0/tracks?limit=30`);
      const d = await r.json();
      const tracks = await enrichTracks(d.data || [], 20);
      return res.json({ tracks });
    }

    if (type === 'search' && q) {
      const r = await fetch(`${DEEZER}/search?q=${encodeURIComponent(q)}&limit=30`);
      const d = await r.json();
      const tracks = await enrichTracks(d.data || [], 20);
      return res.json({ tracks });
    }

    res.status(400).json({ error: 'Invalid request' });
  } catch (e) {
    res.status(500).json({ tracks: [], error: String(e) });
  }
}
