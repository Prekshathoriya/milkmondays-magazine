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

const FALLBACK_IMAGE = '/android-chrome-512x512.png';
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
  let postsLoaded = false;
  try {
    const postsRes = await env.ASSETS.fetch(new URL('/content/posts.json', url.origin));
    if (postsRes.ok) {
      postsLoaded = true;
      const data = await postsRes.json();
      const posts = (data && data.posts) || [];
      post = posts.find(function (p) { return p && p.id === articleId; }) || null;
    }
  } catch (err) {
    /* A transient content-source failure is handled below with a retryable
       503 so crawlers do not permanently drop a valid article URL. */
    post = null;
  }

  if (!postsLoaded) {
    return serviceUnavailableResponse(request.method);
  }

  /* Unknown article paths must be real 404s. Returning the generic magazine
     shell with a 200 status makes search engines treat arbitrary URLs as
     valid pages and can create large numbers of soft-404s. */
  if (!post) {
    return notFoundResponse(request.method);
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
  const pageTitle = post.title + ' — ' + SITE_NAME;
  const pageDescription = post.subtitle || DEFAULT_DESCRIPTION;
  const pageImage = absoluteUrl(post.coverImage || FALLBACK_IMAGE, url.origin);
  const publishedTime = post.date || '';
  const articleSection = post.category || '';

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: canonicalUrl,
    headline: post.title,
    description: pageDescription,
    image: [pageImage],
    datePublished: publishedTime,
    articleSection: articleSection,
    isAccessibleForFree: false,
    hasPart: {
      '@type': 'WebPageElement',
      isAccessibleForFree: false,
      cssSelector: '.reader-body',
    },
    author: {
      '@type': 'Person',
      name: 'Preksha Thoriya',
      url: url.origin + '/',
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: url.origin + '/',
      logo: {
        '@type': 'ImageObject',
        url: url.origin + '/android-chrome-512x512.png',
      },
    },
  };

  const extraHeadTags =
    (publishedTime ? '<meta property="article:published_time" content="' + escAttr(publishedTime) + '">' : '') +
    (articleSection ? '<meta property="article:section" content="' + escAttr(articleSection) + '">' : '') +
    '<script type="application/ld+json">' + safeJson(articleSchema) + '</script>' +
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
    .on('link[rel="canonical"]', setAttribute('href', canonicalUrl))
    .on('meta[property="og:type"]', setAttribute('content', 'article'))
    .on('meta[property="og:site_name"]', setAttribute('content', SITE_NAME))
    .on('meta[property="og:title"]', setAttribute('content', pageTitle))
    .on('meta[property="og:description"]', setAttribute('content', pageDescription))
    .on('meta[property="og:image"]', setAttribute('content', pageImage))
    .on('meta[property="og:image:secure_url"]', setAttribute('content', pageImage))
    .on('meta[property="og:url"]', setAttribute('content', canonicalUrl))
    .on('meta[name="twitter:card"]', setAttribute('content', 'summary_large_image'))
    .on('meta[name="twitter:title"]', setAttribute('content', pageTitle))
    .on('meta[name="twitter:description"]', setAttribute('content', pageDescription))
    .on('meta[name="twitter:image"]', setAttribute('content', pageImage))
    .on('head', {
      element: function (el) {
        el.append(extraHeadTags, { html: true });
      },
    });

  const rewritten = rewriter.transform(shellRes);

  return new Response(request.method === 'HEAD' ? null : rewritten.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

function setAttribute(name, value) {
  return {
    element: function (el) {
      el.setAttribute(name, value);
    },
  };
}

function absoluteUrl(value, origin) {
  try {
    return new URL(value, origin).href;
  } catch (error) {
    return origin + FALLBACK_IMAGE;
  }
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function notFoundResponse(method) {
  const body = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="robots" content="noindex, nofollow"><title>Article not found — ' + SITE_NAME + '</title>' +
    '</head><body><h1>Article not found</h1><p><a href="/magazine">Return to the magazine</a></p></body></html>';

  return new Response(method === 'HEAD' ? null : body, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'public, max-age=60',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function serviceUnavailableResponse(method) {
  const body = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="robots" content="noindex, nofollow"><title>Temporarily unavailable — ' + SITE_NAME + '</title>' +
    '</head><body><h1>Temporarily unavailable</h1><p>Please try again shortly.</p></body></html>';

  return new Response(method === 'HEAD' ? null : body, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'no-store',
      'Retry-After': '300',
      'X-Robots-Tag': 'noindex, nofollow',
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
