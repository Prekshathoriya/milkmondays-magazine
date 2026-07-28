/**
 * Cloudflare Pages Function
 * -------------------------------------------------------------------------
 * Route: GET /magazine/:id
 * -------------------------------------------------------------------------
 * WHY THIS EXISTS
 * magazine.html is a client-rendered single-page app: the real article
 * title / description / cover image only get put into the DOM after
 * app.js fetches /content/posts.json and runs. Social crawlers (Facebook,
 * WhatsApp, Instagram, X/Twitter, Telegram, Discord, LinkedIn, iMessage)
 * do not execute JavaScript, so they only ever saw the generic, static
 * <title>/<meta description> in magazine.html and no og:image at all —
 * which is why link previews showed up blank, grey, or identical for
 * every article.
 *
 * WHAT THIS FUNCTION DOES
 * It intercepts requests to an individual article URL (/magazine/<id>),
 * looks that post up in content/posts.json, fetches the *exact same*
 * magazine.html shell that the site already serves, and rewrites just the
 * <head> meta tags (title, description, Open Graph, Twitter Card,
 * canonical link) to match that specific article before responding. Real
 * visitors get back the identical HTML/CSS/JS — same gate, same likes,
 * same modal, same everything — just with correct meta tags already
 * baked into the initial HTML response, which is what crawlers require.
 *
 * NOTE ON ROUTING
 * Cloudflare Pages Functions take precedence over the _redirects file for
 * any route they match, so this Function fully handles /magazine/:id and
 * the old "/magazine/:id -> /magazine?article=:id" redirect rule in
 * _redirects is simply not consulted for these requests. Nothing else in
 * _redirects needed to change.
 */

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1200';
const SITE_NAME = 'Milk Mondays';
const DEFAULT_DESCRIPTION =
  'A collection of everyday things. Skincare, fashion, and pop culture — curated for the modern archive.';

export async function onRequestGet(context) {
  return handleArticleRequest(context);
}

export async function onRequestHead(context) {
  return handleArticleRequest(context);
}

async function handleArticleRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const articleId = params && params.id ? String(params.id) : '';

  /* ── Fetch the shared posts data straight from the deployed static
     asset (same file app.js itself reads from content/posts.json), so
     there's a single source of truth and no separate content to keep
     in sync. ── */
  let post = null;
  try {
    const postsRes = await env.ASSETS.fetch(new URL('/content/posts.json', url.origin));
    if (postsRes.ok) {
      const data = await postsRes.json();
      const posts = (data && data.posts) || [];
      post = posts.find(function (p) { return p && p.id === articleId; }) || null;
    }
  } catch (err) {
    /* If posts.json can't be read for any reason, fall through and
       serve the shell with generic site-wide meta tags below instead
       of failing the whole page load. */
    post = null;
  }

  /* ── Fetch the untouched magazine.html shell. Using the ASSETS
     binding (rather than re-fetching over the network) means this
     always reflects the exact deployed file, including any future
     edits to magazine.html, with no extra latency or DNS hop. ── */
  const shellRes = await env.ASSETS.fetch(new URL('/magazine', url.origin));
  if (!shellRes.ok) {
    return shellRes;
  }

  const canonicalUrl = url.origin + '/magazine/' + encodeURIComponent(articleId);
  const pageTitle = post ? (post.title + ' — ' + SITE_NAME) : SITE_NAME;
  const pageDescription = post && post.subtitle ? post.subtitle : DEFAULT_DESCRIPTION;
  const pageImage = post && post.coverImage ? post.coverImage : FALLBACK_IMAGE;

  const extraHeadTags =
    '<meta property="og:type" content="article">' +
    '<meta property="og:site_name" content="' + escAttr(SITE_NAME) + '">' +
    '<meta property="og:title" content="' + escAttr(pageTitle) + '">' +
    '<meta property="og:description" content="' + escAttr(pageDescription) + '">' +
    '<meta property="og:image" content="' + escAttr(pageImage) + '">' +
    '<meta property="og:image:secure_url" content="' + escAttr(pageImage) + '">' +
    '<meta property="og:url" content="' + escAttr(canonicalUrl) + '">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + escAttr(pageTitle) + '">' +
    '<meta name="twitter:description" content="' + escAttr(pageDescription) + '">' +
    '<meta name="twitter:image" content="' + escAttr(pageImage) + '">' +
    '<link rel="canonical" href="' + escAttr(canonicalUrl) + '">' +
    '<script>window.__mmArticleId = ' + JSON.stringify(articleId) + ';</script>';

  const rewriter = new HTMLRewriter()
    .on('title', {
      element: function (el) {
        el.setInnerContent(pageTitle);
      },
    })
    .on('meta[name="description"]', {
      element: function (el) {
        el.setAttribute('content', pageDescription);
      },
    })
    .on('head', {
      element: function (el) {
        el.append(extraHeadTags, { html: true });
      },
    });

  const rewritten = rewriter.transform(shellRes);

  return new Response(rewritten.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

function escAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}