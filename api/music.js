/* AIVA Music API v4 — Internet Archive proxy
   GET /api/music?type=trending
   GET /api/music?type=search&q=QUERY
   Source: archive.org — public domain, full tracks, no API key
*/

const IA_SEARCH  = 'https://archive.org/advancedsearch.php';
const IA_DETAILS = 'https://archive.org/metadata/';
const IA_STREAM  = 'https://archive.org/download/';

async function getFiles(identifier) {
  try {
    const r = await fetch(IA_DETAILS + identifier);
    if (!r.ok) return null;
    const d = await r.json();
    const files = (d.files || []).filter(f =>
      f.format && (f.format.toLowerCase().includes('mp3') || f.name.endsWith('.mp3'))
      && !f.name.includes('64kb')
    );
    files.sort((a, b) => (parseFloat(a.length) || 999) - (parseFloat(b.length) || 999));
    return { meta: d.metadata || { identifier }, file: files[0] || null };
  } catch { return null; }
}

function normTrack(meta, file) {
  const id = meta.identifier || '';
  const fname = file ? file.name : '';
  return {
    id:       id + '/' + fname,
    title:    file?.title || meta.title || fname.replace(/\.[^.]+$/, '') || 'Unknown',
    artist:   file?.creator || meta.creator || meta.artist || 'Unknown',
    album:    meta.album || meta.title || '',
    cover:    id ? `https://archive.org/services/img/${id}` : '',
    duration: file?.length ? parseInt(file.length) : 0,
    audioUrl: id && fname ? `${IA_STREAM}${id}/${encodeURIComponent(fname)}` : '',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { type, q } = req.query;

  let query;
  if (type === 'trending') {
    query = 'mediatype:audio AND subject:(music OR song OR jazz OR pop OR rock) AND format:MP3';
  } else if (type === 'search' && q) {
    query = `mediatype:audio AND (title:(${q}) OR creator:(${q})) AND format:MP3`;
  } else {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const params = new URLSearchParams({
      q, fl: 'identifier,title,creator,artist,album',
      sort: type === 'trending' ? 'downloads desc' : '',
      rows: '40', page: '1', output: 'json',
    });
    params.set('q', query);

    const r = await fetch(`${IA_SEARCH}?${params}`);
    const d = await r.json();
    const docs = d.response?.docs || [];

    const results = await Promise.allSettled(
      docs.slice(0, 20).map(async doc => {
        const res = await getFiles(doc.identifier);
        if (!res || !res.file) return null;
        return normTrack({ ...doc, ...res.meta }, res.file);
      })
    );

    const tracks = results
      .filter(r => r.status === 'fulfilled' && r.value?.audioUrl)
      .map(r => r.value);

    return res.json({ tracks });
  } catch (e) {
    res.status(500).json({ tracks: [], error: String(e) });
  }
}
