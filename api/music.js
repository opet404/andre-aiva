/* AIVA Music API v3
   Proxy ke Jamendo — full track, bukan preview
   GET /api/music?type=trending
   GET /api/music?type=search&q=QUERY
*/

const JAMENDO   = 'https://api.jamendo.com/v3.0';
const CLIENT_ID = '9dd55976';

function normTrack(t) {
  return {
    id:       String(t.id),
    title:    t.name         || 'Unknown',
    artist:   t.artist_name  || 'Unknown',
    album:    t.album_name   || '',
    cover:    t.image        || '',
    duration: t.duration     || 0,
    audioUrl: t.audiodownload || t.audio || '',
  };
}

function buildParams(extra) {
  return [
    `client_id=${CLIENT_ID}`,
    'format=json',
    'limit=30',
    'audioformat=mp31',
    'audiodownload=true',
    'include=musicinfo',
    'imagesize=300',
    'sharemode=creativecommons',
    extra,
  ].filter(Boolean).join('&');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { type, q } = req.query;

  try {
    let params;
    if (type === 'trending') {
      params = buildParams('order=popularity_total');
    } else if (type === 'search' && q) {
      params = buildParams(`search=${encodeURIComponent(q)}`);
    } else {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const r = await fetch(`${JAMENDO}/tracks/?${params}`);
    const d = await r.json();
    const tracks = (d.results || []).map(normTrack).filter(t => t.audioUrl);
    return res.json({ tracks });
  } catch (e) {
    res.status(500).json({ tracks: [], error: String(e) });
  }
}
