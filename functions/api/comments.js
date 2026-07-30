/**
 * Milk Mondays â€” persistent live comments API
 *
 * Cloudflare Pages Function + D1.
 * Binding required: COMMENTS_DB
 * Secret required: COMMENTS_IDENTITY_SECRET
 *
 * Optional:
 *   COMMENTS_ADMIN_TOKEN
 *   TURNSTILE_SITE_KEY
 *   TURNSTILE_SECRET
 */

var DISPLAY_NAME_MIN = 2;
var DISPLAY_NAME_MAX = 30;
var COMMENT_MAX = 1200;
var COMMENT_COOLDOWN_SECONDS = 10;
var ARTICLE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;

export async function onRequestGet(context) {
    try {
        assertConfigured(context.env);

        var url = new URL(context.request.url);
        var articleId = cleanArticleId(url.searchParams.get('articleId'));
        var order = url.searchParams.get('order') === 'oldest' ? 'ASC' : 'DESC';

        var rows = await context.env.COMMENTS_DB.prepare(
            'SELECT c.id, c.article_id, c.body, c.created_at, p.display_name ' +
            'FROM comments c ' +
            'JOIN comment_profiles p ON p.user_id = c.user_id ' +
            'WHERE c.article_id = ?1 AND c.status = ?2 ' +
            'ORDER BY c.created_at ' + order + ' LIMIT 300'
        ).bind(articleId, 'visible').all();

        return json({
            ok: true,
            comments: (rows.results || []).map(publicComment),
            count: (rows.results || []).length,
            turnstileSiteKey: context.env.TURNSTILE_SITE_KEY || ''
        });
    } catch (error) {
        return apiError(error);
    }
}

export async function onRequestPost(context) {
    try {
        assertConfigured(context.env);
        assertSameOrigin(context.request);

        var body = await readJson(context.request);
        var action = String(body.action || '');

        if (action === 'get_profile') {
            return await getProfile(context.env, body);
        }

        if (action === 'set_profile') {
            return await setProfile(context.env, body);
        }

        if (action === 'post_comment') {
            return await postComment(context.request, context.env, body);
        }

        if (action === 'report_comment') {
            return await reportComment(context.env, body);
        }

        if (action === 'hide_comment') {
            assertAdmin(context.request, context.env);
            return await hideComment(context.env, body);
        }

        throw httpError(400, 'Unknown comment action.');
    } catch (error) {
        return apiError(error);
    }
}

export async function onRequestDelete(context) {
    try {
        assertConfigured(context.env);
        assertSameOrigin(context.request);
        assertAdmin(context.request, context.env);

        var url = new URL(context.request.url);
        return await hideComment(context.env, { commentId: url.searchParams.get('commentId') });
    } catch (error) {
        return apiError(error);
    }
}

async function getProfile(env, body) {
    var userId = await userIdFromEmail(body.email, env.COMMENTS_IDENTITY_SECRET);
    var row = await env.COMMENTS_DB.prepare(
        'SELECT display_name, created_at FROM comment_profiles WHERE user_id = ?1 LIMIT 1'
    ).bind(userId).first();

    return json({
        ok: true,
        profile: row ? {
            displayName: row.display_name,
            createdAt: row.created_at
        } : null
    });
}

async function setProfile(env, body) {
    var userId = await userIdFromEmail(body.email, env.COMMENTS_IDENTITY_SECRET);
    var displayName = cleanDisplayName(body.displayName);
    var now = Date.now();

    /*
     * ON CONFLICT deliberately does nothing. Once an email identity has chosen
     * a public comment name, this endpoint has no code path that can edit it.
     */
    await env.COMMENTS_DB.prepare(
        'INSERT INTO comment_profiles (user_id, display_name, created_at) ' +
        'VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO NOTHING'
    ).bind(userId, displayName, now).run();

    var saved = await env.COMMENTS_DB.prepare(
        'SELECT display_name, created_at FROM comment_profiles WHERE user_id = ?1 LIMIT 1'
    ).bind(userId).first();

    return json({
        ok: true,
        profile: {
            displayName: saved.display_name,
            createdAt: saved.created_at
        },
        locked: true
    }, 201);
}

async function postComment(request, env, body) {
    var articleId = cleanArticleId(body.articleId);
    var commentBody = cleanCommentBody(body.body);
    var userId = await userIdFromEmail(body.email, env.COMMENTS_IDENTITY_SECRET);

    var profile = await env.COMMENTS_DB.prepare(
        'SELECT display_name FROM comment_profiles WHERE user_id = ?1 LIMIT 1'
    ).bind(userId).first();

    if (!profile) {
        throw httpError(409, 'Choose your comment name before posting.');
    }

    await verifyTurnstileIfConfigured(request, env, body.turnstileToken);

    var latest = await env.COMMENTS_DB.prepare(
        'SELECT created_at FROM comments WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 1'
    ).bind(userId).first();

    var now = Date.now();
    if (latest && now - Number(latest.created_at) < COMMENT_COOLDOWN_SECONDS * 1000) {
        throw httpError(429, 'Give it a few seconds before posting another thought.');
    }

    var id = crypto.randomUUID();
    await env.COMMENTS_DB.prepare(
        'INSERT INTO comments (id, article_id, user_id, body, status, created_at) ' +
        'VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
    ).bind(id, articleId, userId, commentBody, 'visible', now).run();

    return json({
        ok: true,
        comment: {
            id: id,
            articleId: articleId,
            displayName: profile.display_name,
            body: commentBody,
            createdAt: now
        }
    }, 201);
}

async function reportComment(env, body) {
    var articleId = cleanArticleId(body.articleId);
    var commentId = cleanId(body.commentId, 'comment');
    var userId = await userIdFromEmail(body.email, env.COMMENTS_IDENTITY_SECRET);
    var reason = cleanReason(body.reason);

    var comment = await env.COMMENTS_DB.prepare(
        'SELECT id FROM comments WHERE id = ?1 AND article_id = ?2 AND status = ?3 LIMIT 1'
    ).bind(commentId, articleId, 'visible').first();

    if (!comment) {
        throw httpError(404, 'That comment is no longer available.');
    }

    await env.COMMENTS_DB.prepare(
        'INSERT INTO comment_reports (id, comment_id, reporter_user_id, reason, created_at) ' +
        'VALUES (?1, ?2, ?3, ?4, ?5) ' +
        'ON CONFLICT(comment_id, reporter_user_id) DO NOTHING'
    ).bind(crypto.randomUUID(), commentId, userId, reason, Date.now()).run();

    return json({ ok: true, reported: true });
}

async function hideComment(env, body) {
    var commentId = cleanId(body.commentId, 'comment');
    var result = await env.COMMENTS_DB.prepare(
        'UPDATE comments SET status = ?1 WHERE id = ?2'
    ).bind('hidden', commentId).run();

    return json({
        ok: true,
        hidden: Boolean(result.meta && result.meta.changes)
    });
}

function assertConfigured(env) {
    if (!env.COMMENTS_DB) {
        throw httpError(503, 'Comments database is not connected yet.');
    }

    if (!env.COMMENTS_IDENTITY_SECRET) {
        throw httpError(503, 'Comments identity secret is missing.');
    }
}

function assertSameOrigin(request) {
    var origin = request.headers.get('Origin');
    if (!origin) return;

    var requestUrl = new URL(request.url);
    if (origin !== requestUrl.origin) {
        throw httpError(403, 'Cross-site comment requests are not allowed.');
    }
}

function assertAdmin(request, env) {
    if (!env.COMMENTS_ADMIN_TOKEN) {
        throw httpError(503, 'Comment moderation is not configured.');
    }

    var auth = request.headers.get('Authorization') || '';
    if (auth !== 'Bearer ' + env.COMMENTS_ADMIN_TOKEN) {
        throw httpError(401, 'Not authorised.');
    }
}

async function userIdFromEmail(value, secret) {
    var email = String(value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        throw httpError(400, 'A valid gate email is required.');
    }

    var encoder = new TextEncoder();
    var key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    var signature = await crypto.subtle.sign('HMAC', key, encoder.encode(email));
    return Array.from(new Uint8Array(signature)).map(function (byte) {
        return byte.toString(16).padStart(2, '0');
    }).join('');
}

function cleanArticleId(value) {
    var articleId = String(value || '').trim();
    if (!ARTICLE_ID_RE.test(articleId)) {
        throw httpError(400, 'Invalid article.');
    }
    return articleId;
}

function cleanDisplayName(value) {
    var name = String(value || '').replace(/\s+/g, ' ').trim();
    if (name.length < DISPLAY_NAME_MIN || name.length > DISPLAY_NAME_MAX) {
        throw httpError(400, 'Choose a name between 2 and 30 characters.');
    }
    if (/[\u0000-\u001F\u007F<>]/.test(name)) {
        throw httpError(400, 'That name contains unsupported characters.');
    }
    if (/^(milk\s*mondays?|admin|moderator|staff|editor)$/i.test(name)) {
        throw httpError(400, 'That name is reserved. Please choose another.');
    }
    return name;
}

function cleanCommentBody(value) {
    var text = String(value || '').replace(/\r\n?/g, '\n').trim();
    if (!text) {
        throw httpError(400, 'Write something before posting.');
    }
    if (text.length > COMMENT_MAX) {
        throw httpError(400, 'Keep your comment under ' + COMMENT_MAX + ' characters.');
    }
    return text;
}

function cleanReason(value) {
    var reason = String(value || 'reader_report').trim().slice(0, 80);
    return reason || 'reader_report';
}

function cleanId(value, label) {
    var id = String(value || '').trim();
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) {
        throw httpError(400, 'Invalid ' + label + '.');
    }
    return id;
}

async function verifyTurnstileIfConfigured(request, env, token) {
    if (!env.TURNSTILE_SECRET) return;
    if (!token) {
        throw httpError(400, 'Please complete the quick human check.');
    }

    var form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET);
    form.append('response', String(token));
    form.append('remoteip', request.headers.get('CF-Connecting-IP') || '');

    var response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form
    });
    var result = await response.json();

    if (!result.success) {
        throw httpError(400, 'The human check expired. Please try once more.');
    }
}

async function readJson(request) {
    try {
        return await request.json();
    } catch (error) {
        throw httpError(400, 'Invalid request.');
    }
}

function publicComment(row) {
    return {
        id: row.id,
        articleId: row.article_id,
        displayName: row.display_name,
        body: row.body,
        createdAt: row.created_at
    };
}

function httpError(status, message) {
    var error = new Error(message);
    error.status = status;
    return error;
}

function apiError(error) {
    var status = Number(error && error.status) || 500;
    var safeMessage = error && error.status
        ? error.message
        : 'Comments are taking a tiny break.';

    if (status >= 500) {
        console.error('[Milk Mondays comments]', error);
    }

    return json({ ok: false, error: safeMessage }, status);
}

function json(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}