/* Fonction serverless Vercel : revue de presse corporate finance à Lyon.
   Lit le flux RSS Google Actualités côté serveur et renvoie du JSON. */

const FEED_URL =
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent(
    '("fusion-acquisition" OR "cession d\'entreprise" OR "levée de fonds" OR ' +
    '"reprise d\'entreprise" OR "capital-investissement" OR "transmission d\'entreprise") ' +
    '(Lyon OR lyonnais OR "Auvergne-Rhône-Alpes") -football -OL -rugby -mercato -match when:30d'
  ) +
  '&hl=fr&gl=FR&ceid=FR:fr';

const MAX_ITEMS = 5;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; /* 30 jours, filet de sécurité en plus de when:30d */

function textBetween(block, tag) {
  const match = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  if (!match) return '';
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

module.exports = async function handler(req, res) {
  try {
    const upstream = await fetch(FEED_URL, {
      headers: { 'user-agent': 'Mozilla/5.0 (lyon.finance news widget)' }
    });
    if (!upstream.ok) throw new Error('upstream HTTP ' + upstream.status);
    const xml = await upstream.text();

    const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const items = blocks
      .map((block) => {
        let title = textBetween(block, 'title');
        const source = textBetween(block, 'source') || 'Presse';
        if (source && title.lastIndexOf(' - ' + source) > 0) {
          title = title.slice(0, title.lastIndexOf(' - ' + source));
        }
        const d = new Date(textBetween(block, 'pubDate'));
        return {
          title,
          link: textBetween(block, 'link'),
          source,
          ts: isNaN(d) ? 0 : d.getTime(),
          date: isNaN(d)
            ? ''
            : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
        };
      })
      .filter((item) => item.title && item.ts && Date.now() - item.ts <= MAX_AGE_MS)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, MAX_ITEMS)
      .map(({ ts, ...item }) => item);

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ items });
  } catch (err) {
    res.status(502).json({ items: [], error: 'feed unavailable' });
  }
};
