/* Fonction serverless Vercel : revue de presse corporate finance à Lyon.
   Lit plusieurs flux RSS Bing Actualités côté serveur (gratuit, sans clé) et
   renvoie du JSON, avec un vrai extrait d'article pour chaque titre. */

const QUERIES = [
  'cession entreprise Lyon',
  'transmission entreprise Lyon',
  'fusion acquisition Lyon',
  'levée de fonds Lyon',
  'reprise entreprise Lyon',
  'capital investissement Lyon'
];

const MAX_ITEMS = 5;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; /* 30 jours */
const EXCLUDE = /\b(OL|Olympique Lyonnais|rugby|LOU|football|mercato|match|stage|CDI|CDD|alternance|recrute|offre d'emploi)\b/i;
const RELEVANT = /\b(Lyon|lyonnais|lyonnaise|Rh[oô]ne|Auvergne-Rh[oô]ne-Alpes|Villeurbanne)\b/i;

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function textBetween(block, tag) {
  const match = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  if (!match) return '';
  return decodeEntities(
    match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function realLink(bingLink) {
  const match = bingLink.match(/[?&]url=([^&]+)/);
  if (!match) return bingLink;
  try {
    return decodeURIComponent(match[1]);
  } catch (e) {
    return bingLink;
  }
}

async function fetchQuery(query) {
  const url = 'https://www.bing.com/news/search?q=' + encodeURIComponent(query) + '&format=rss';
  const upstream = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (lyon.finance news widget)' } });
  if (!upstream.ok) return [];
  const xml = await upstream.text();
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  return blocks.map((block) => {
    const title = textBetween(block, 'title');
    const description = textBetween(block, 'description');
    const source = textBetween(block, 'News:Source') || 'Presse';
    const link = realLink(textBetween(block, 'link'));
    const d = new Date(textBetween(block, 'pubDate'));
    return {
      title,
      excerpt: description,
      link,
      source,
      ts: isNaN(d) ? 0 : d.getTime(),
      date: isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    };
  });
}

module.exports = async function handler(req, res) {
  try {
    const results = await Promise.allSettled(QUERIES.map(fetchQuery));
    const seen = new Set();
    const items = [];

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value) {
        if (!item.title || !item.link) continue;
        if (seen.has(item.link)) continue;
        if (EXCLUDE.test(item.title)) continue;
        if (!RELEVANT.test(item.title + ' ' + item.excerpt)) continue;
        if (!item.ts || Date.now() - item.ts > MAX_AGE_MS) continue;
        seen.add(item.link);
        items.push(item);
      }
    }

    items.sort((a, b) => b.ts - a.ts);
    const top = items.slice(0, MAX_ITEMS).map(({ ts, ...item }) => item);

    if (!top.length) throw new Error('no items');

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ items: top });
  } catch (err) {
    res.status(502).json({ items: [], error: 'feed unavailable' });
  }
};
