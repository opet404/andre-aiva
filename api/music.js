/* AIVA Music API v2
   GET /api/music?type=trending
   GET /api/music?type=search&q=QUERY
   Source: Jamendo API — direct MP3 audio URLs, no YouTube needed
*/

const JAMENDO   = 'https://api.jamendo.com/v3.0';
const CLIENT_ID = '9dd55976'; /* Jamendo public demo client_id */

function normTrack(t) {
  return {
    id:       String(t.id),
    title:    t.name   || 'Unknown',
    artist:   t.artist_name || 'Unknown',
    album:    t.album_name  || '',
    cover:    t.image       || t.album_image || '',
    duration: t.duration    || 0,
    audioUrl: t.audio       || '',   /* direct MP3 stream URL */
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const { type, q } = req.query;

  try {
    if (type === 'trending') {
      const r = await fetch(
        `${JAMENDO}/tracks/?client_id=${CLIENT_ID}` +
        `&format=json&limit=30&order=popularity_total` +
        `&include=musicinfo&audioformat=mp31&imagesize=300`
      );
      const d = await r.json();
      const tracks = (d.results || []).map(normTrack).filter(t => t.audioUrl);
      return res.json({ tracks });
    }

    if (type === 'search' && q) {
      const r = await fetch(
        `${JAMENDO}/tracks/?client_id=${CLIENT_ID}` +
        `&format=json&limit=30&search=${encodeURIComponent(q)}` +
        `&include=musicinfo&audioformat=mp31&imagesize=300`
      );
      const d = await r.json();
      const tracks = (d.results || []).map(normTrack).filter(t => t.audioUrl);
      return res.json({ tracks });
    }

    res.status(400).json({ error: 'Invalid request' });
  } catch (e) {
    res.status(500).json({ tracks: [], error: String(e) });
  }
}
