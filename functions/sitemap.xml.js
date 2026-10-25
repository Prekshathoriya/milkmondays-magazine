/**
 * Cloudflare Pages Function
 *
 * Generates /sitemap.xml from content/posts.json so newly published entries
 * cannot silently fall out of Google discovery when the content file changes.
 */

export async function onRequestGet(context) {
  return buildSitemap(context);
}

export async function onRequestHead(context) {
  return buildSitemap(context);
}

async function buildSitemap(context) {
  const requestUrl = new URL(context.request.url);
  const origin = requestUrl.origin;
  const postsResponse = await context.env.ASSETS.fetch(
    new URL('/content/posts.json', origin),
  );

  if (!postsResponse.ok) {
    return new Response(null, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const data = await postsResponse.json();
  const posts = Array.isArray(data && data.posts) ? data.posts : [];
  const seen = new Set();
  const articleEntries = [];
  let newestLastmod = '';

  posts.forEach(function (post) {
    if (!post || typeof post.id !== 'string' || !post.id.trim()) return;

    const id = post.id.trim();
    if (seen.has(id)) return;
    seen.add(id);

    const lastmod = toW3cDate(post.date);
    if (lastmod && lastmod > newestLastmod) newestLastmod = lastmod;

    articleEntries.push({
      loc: origin + '/magazine/' + encodeURIComponent(id),
      lastmod: lastmod,
    });
  });

  const entries = [
    { loc: origin + '/', lastmod: newestLastmod },
    { loc: origin + '/magazine', lastmod: newestLastmod },
  ].concat(articleEntries);

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map(function (entry) {
      return '  <url>\n' +
        '    <loc>' + escapeXml(entry.loc) + '</loc>\n' +
        (entry.lastmod ? '    <lastmod>' + escapeXml(entry.lastmod) + '</lastmod>\n' : '') +
        '  </url>';
    }).join('\n') +
    '\n</urlset>\n';

  return new Response(context.request.method === 'HEAD' ? null : xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function toW3cDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
