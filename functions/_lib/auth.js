var schemaPromise = null;

export var SESSION_COOKIE = 'mm_session';
export var SESSION_MS = 24 * 60 * 60 * 1000;
export var INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;
export var OTP_MS = 10 * 60 * 1000;
// Cloudflare Workers Web Crypto caps PBKDF2 at 100,000 iterations.
export var PASSWORD_ITERATIONS = 100000;

export function authDb(env) {
    var db = env.AUTH_DB || env.COMMENTS_DB;
    if (!db) throw httpError(503, 'Account service is not connected yet.');
    return db;
}

export function authSecret(env) {
    var secret = env.AUTH_SECRET || env.COMMENTS_IDENTITY_SECRET;
    if (!secret) throw httpError(503, 'Account security is not configured yet.');
    return secret;
}

export async function ensureAuthSchema(env) {
    var db = authDb(env);
    authSecret(env);
    if (!schemaPromise) {
        schemaPromise = db.exec(
            'CREATE TABLE IF NOT EXISTS auth_users (' +
                'id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, ' +
                'username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, ' +
                'password_salt TEXT NOT NULL, password_iterations INTEGER NOT NULL, ' +
                'created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ' +
                'last_seen_at INTEGER NOT NULL, email_verified_at INTEGER NOT NULL' +
            ');' +
            'CREATE TABLE IF NOT EXISTS auth_sessions (' +
                'id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, ' +
                'created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL' +
            ');' +
            'CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);' +
            'CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);' +
            'CREATE TABLE IF NOT EXISTS auth_otp_challenges (' +
                'id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, user_id TEXT, ' +
                'purpose TEXT NOT NULL, code_hash TEXT NOT NULL, created_at INTEGER NOT NULL, ' +
                'expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, ' +
                'verified_at INTEGER, used_at INTEGER' +
            ');' +
            'CREATE INDEX IF NOT EXISTS idx_auth_otp_email ON auth_otp_challenges(email, purpose, created_at);' +
            'CREATE TABLE IF NOT EXISTS auth_signup_claims (' +
                'challenge_id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL' +
            ');' +
            'CREATE TABLE IF NOT EXISTS auth_rate_limits (' +
                'key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_started_at INTEGER NOT NULL, ' +
                'blocked_until INTEGER NOT NULL DEFAULT 0' +
            ');'
        ).catch(function (error) {
            schemaPromise = null;
            throw error;
        });
    }
    await schemaPromise;
    return db;
}

export function assertSameOrigin(request) {
    var origin = request.headers.get('Origin');
    if (!origin) return;
    if (origin !== new URL(request.url).origin) {
        throw httpError(403, 'Cross-site requests are not allowed.');
    }
}

export function cleanEmail(value) {
    var email = String(value || '').trim().toLowerCase();
    if (email.length > 254 || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(email)) {
        throw httpError(400, 'Enter a valid email address.');
    }
    return email;
}

export function cleanUsername(value) {
    var username = String(value || '').trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._]{2,23}$/.test(username)) {
        throw httpError(400, 'Choose a username using 3–24 letters, numbers, dots, or underscores.');
    }
    if (/^(admin|administrator|moderator|milk\.?mondays?|support|staff|editor)$/i.test(username)) {
        throw httpError(400, 'That username is reserved.');
    }
    return username;
}

export function cleanPassword(value) {
    var password = String(value || '');
    if (password.length < 10 || password.length > 128) {
        throw httpError(400, 'Choose a password between 10 and 128 characters.');
    }
    if (/^(password|password123|1234567890|qwerty12345|milkmondays)$/i.test(password)) {
        throw httpError(400, 'Choose a less common password.');
    }
    return password;
}

export async function hashPassword(password, salt, iterations) {
    var enc = new TextEncoder();
    var key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: fromBase64Url(salt),
        iterations: iterations
    }, key, 256);
    return toBase64Url(new Uint8Array(bits));
}

export async function makePasswordRecord(password) {
    var clean = cleanPassword(password);
    var salt = randomToken(16);
    return {
        salt: salt,
        iterations: PASSWORD_ITERATIONS,
        hash: await hashPassword(clean, salt, PASSWORD_ITERATIONS)
    };
}

export async function verifyPassword(password, user) {
    if (typeof password !== 'string' || password.length > 128) return false;
    var actual = await hashPassword(password, user.password_salt, Number(user.password_iterations));
    return constantTimeEqual(actual, user.password_hash);
}

export async function createOtpChallenge(env, options) {
    var db = await ensureAuthSchema(env);
    var email = cleanEmail(options.email);
    var purpose = String(options.purpose || '');
    if (!/^(signup|inactive|recovery|email_change)$/.test(purpose)) {
        throw httpError(400, 'Invalid verification request.');
    }

    var ip = options.request.headers.get('CF-Connecting-IP') || 'local';
    var secret = authSecret(env);
    var emailKey = await sha256('otp:' + purpose + ':' + email);
    var ipKey = await hmacHex(secret, 'otp-ip:' + purpose + ':' + ip);
    if (env.AUTH_TEST_DISABLE_RATE_LIMITS !== '1') {
        await enforceRateLimit(db, emailKey, 5, 60 * 60 * 1000, 60 * 60 * 1000);
        await enforceRateLimit(db, ipKey, 20, 60 * 60 * 1000, 60 * 60 * 1000);
    }

    var id = crypto.randomUUID();
    var code = env.AUTH_TEST_OTP && /^\d{6}$/.test(env.AUTH_TEST_OTP)
        ? env.AUTH_TEST_OTP
        : String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
    var now = Date.now();
    var codeHash = await hmacHex(secret, 'otp:' + id + ':' + code);

    await db.batch([
        db.prepare(
            'UPDATE auth_otp_challenges SET used_at = ?1 ' +
            'WHERE email = ?2 AND purpose = ?3 AND used_at IS NULL'
        ).bind(now, email, purpose),
        db.prepare(
            'INSERT INTO auth_otp_challenges ' +
            '(id, email, user_id, purpose, code_hash, created_at, expires_at, attempts) ' +
            'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)'
        ).bind(id, email, options.userId || null, purpose, codeHash, now, now + OTP_MS)
    ]);

    await sendOtpEmail(env, email, options.name || 'there', code);
    return { id: id, email: email, expiresAt: now + OTP_MS };
}

export async function verifyOtpChallenge(env, challengeId, code, expectedPurpose) {
    var db = await ensureAuthSchema(env);
    var id = String(challengeId || '').trim();
    var entered = String(code || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{6}$/.test(entered)) {
        throw httpError(400, 'Enter the complete 6-digit code.');
    }

    var row = await db.prepare(
        'SELECT id, email, user_id, purpose, code_hash, expires_at, attempts, verified_at, used_at ' +
        'FROM auth_otp_challenges WHERE id = ?1 LIMIT 1'
    ).bind(id).first();
    if (!row || row.purpose !== expectedPurpose || row.used_at || row.verified_at) {
        throw httpError(400, 'That code is no longer available.');
    }
    if (Number(row.expires_at) < Date.now()) {
        throw httpError(400, 'That code has expired. Request a new one.');
    }
    if (Number(row.attempts) >= 5) {
        throw httpError(429, 'Too many attempts. Request a new code.');
    }

    var actual = await hmacHex(authSecret(env), 'otp:' + id + ':' + entered);
    if (!constantTimeEqual(actual, row.code_hash)) {
        await db.prepare('UPDATE auth_otp_challenges SET attempts = attempts + 1 WHERE id = ?1').bind(id).run();
        throw httpError(400, 'That code is not correct.');
    }

    var now = Date.now();
    await db.prepare(
        'UPDATE auth_otp_challenges SET verified_at = ?1, attempts = attempts + 1 WHERE id = ?2'
    ).bind(now, id).run();
    row.verified_at = now;
    return row;
}

export async function consumeVerifiedChallenge(env, challengeId, expectedPurpose) {
    var db = await ensureAuthSchema(env);
    var row = await getVerifiedChallenge(env, challengeId, expectedPurpose);
    var result = await db.prepare(
        'UPDATE auth_otp_challenges SET used_at = ?1 WHERE id = ?2 AND used_at IS NULL'
    ).bind(Date.now(), row.id).run();
    if (!result.meta || !result.meta.changes) throw httpError(409, 'That verification was already used.');
    return row;
}

export async function getVerifiedChallenge(env, challengeId, expectedPurpose) {
    var db = await ensureAuthSchema(env);
    var id = String(challengeId || '').trim();
    var row = await db.prepare(
        'SELECT id, email, user_id, purpose, expires_at, verified_at, used_at ' +
        'FROM auth_otp_challenges WHERE id = ?1 LIMIT 1'
    ).bind(id).first();
    if (!row || row.purpose !== expectedPurpose || row.used_at || !row.verified_at || Number(row.expires_at) < Date.now()) {
        throw httpError(403, 'Please verify your email again.');
    }
    return row;
}

export async function issueSession(env, userId) {
    var db = await ensureAuthSchema(env);
    var session = await makeSessionRecord(userId);
    await db.prepare(
        'INSERT INTO auth_sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at) ' +
        'VALUES (?1, ?2, ?3, ?4, ?4, ?5)'
    ).bind(session.id, userId, session.tokenHash, session.createdAt, session.expiresAt).run();
    await db.prepare('UPDATE auth_users SET last_seen_at = ?1, updated_at = ?1 WHERE id = ?2').bind(session.createdAt, userId).run();
    return {
        token: session.token,
        cookie: sessionCookie(session.token)
    };
}

export async function makeSessionRecord(userId) {
    var token = randomToken(32);
    var createdAt = Date.now();
    return {
        id: crypto.randomUUID(),
        userId: userId,
        token: token,
        tokenHash: await sha256(token),
        createdAt: createdAt,
        expiresAt: createdAt + SESSION_MS
    };
}

export function sessionCookie(token) {
    return SESSION_COOKIE + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400';
}

export async function getSessionUser(request, env, touch) {
    var db = await ensureAuthSchema(env);
    var token = readCookie(request, SESSION_COOKIE);
    if (!token || token.length < 30 || token.length > 100) return null;
    var hash = await sha256(token);
    var row = await db.prepare(
        'SELECT s.id AS session_id, s.expires_at, s.last_seen_at AS session_seen_at, ' +
        'u.id, u.email, u.username, u.last_seen_at, u.password_hash, u.password_salt, u.password_iterations ' +
        'FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id ' +
        'WHERE s.token_hash = ?1 LIMIT 1'
    ).bind(hash).first();
    if (!row) return null;
    var now = Date.now();
    if (Number(row.expires_at) <= now) {
        await db.prepare('DELETE FROM auth_sessions WHERE id = ?1').bind(row.session_id).run();
        return null;
    }
    if (touch !== false) {
        await db.batch([
            db.prepare('UPDATE auth_sessions SET last_seen_at = ?1 WHERE id = ?2').bind(now, row.session_id),
            db.prepare('UPDATE auth_users SET last_seen_at = ?1, updated_at = ?1 WHERE id = ?2').bind(now, row.id)
        ]);
        row.last_seen_at = now;
    }
    return row;
}

export async function requireSession(request, env) {
    var user = await getSessionUser(request, env, true);
    if (!user) throw httpError(401, 'Please log in again.');
    return user;
}

export async function revokeSession(request, env) {
    var db = await ensureAuthSchema(env);
    var token = readCookie(request, SESSION_COOKIE);
    if (!token) return;
    await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?1').bind(await sha256(token)).run();
}

export async function revokeAllSessions(env, userId) {
    var db = await ensureAuthSchema(env);
    await db.prepare('DELETE FROM auth_sessions WHERE user_id = ?1').bind(userId).run();
}

export function clearSessionCookie() {
    return SESSION_COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

export async function enforceLoginRateLimit(request, env, identifier) {
    if (env.AUTH_TEST_DISABLE_RATE_LIMITS === '1') return;
    var db = await ensureAuthSchema(env);
    var ip = request.headers.get('CF-Connecting-IP') || 'local';
    var key = await hmacHex(authSecret(env), 'login:' + ip + ':' + String(identifier || '').toLowerCase());
    await enforceRateLimit(db, key, 10, 15 * 60 * 1000, 30 * 60 * 1000);
}

export async function cleanupAuthRows(env) {
    var db = await ensureAuthSchema(env);
    var now = Date.now();
    await db.batch([
        db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?1').bind(now),
        db.prepare('DELETE FROM auth_otp_challenges WHERE created_at < ?1').bind(now - 24 * 60 * 60 * 1000),
        db.prepare('DELETE FROM auth_rate_limits WHERE window_started_at < ?1 AND blocked_until < ?2').bind(now - 2 * 24 * 60 * 60 * 1000, now)
    ]);
}

async function enforceRateLimit(db, key, limit, windowMs, blockMs) {
    var now = Date.now();
    var row = await db.prepare(
        'SELECT count, window_started_at, blocked_until FROM auth_rate_limits WHERE key = ?1 LIMIT 1'
    ).bind(key).first();
    if (row && Number(row.blocked_until) > now) throw httpError(429, 'Please wait before trying again.');
    if (!row || now - Number(row.window_started_at) >= windowMs) {
        await db.prepare(
            'INSERT INTO auth_rate_limits (key, count, window_started_at, blocked_until) VALUES (?1, 1, ?2, 0) ' +
            'ON CONFLICT(key) DO UPDATE SET count = 1, window_started_at = ?2, blocked_until = 0'
        ).bind(key, now).run();
        return;
    }
    var next = Number(row.count) + 1;
    var blocked = next > limit ? now + blockMs : 0;
    await db.prepare('UPDATE auth_rate_limits SET count = ?1, blocked_until = ?2 WHERE key = ?3')
        .bind(next, blocked, key).run();
    if (blocked) throw httpError(429, 'Please wait before trying again.');
}

async function sendOtpEmail(env, email, name, code) {
    if (env.AUTH_TEST_OTP && /^\d{6}$/.test(env.AUTH_TEST_OTP)) return;
    if (!env.BREVO_API_KEY) throw httpError(503, 'Email service is not configured yet.');
    var payload = {
        sender: {
            name: env.BREVO_SENDER_NAME || 'Milk Mondays',
            email: env.BREVO_SENDER_EMAIL || 'milkmondaysbiz@gmail.com'
        },
        to: [{ email: email, name: String(name || 'there').slice(0, 80) }],
        subject: 'Your Milk Mondays verification code',
        htmlContent: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">' +
            '<p>Hi ' + escapeHtml(name || 'there') + ',</p>' +
            '<p>Your one-time Milk Mondays code is:</p>' +
            '<p style="font-size:28px;font-weight:bold;letter-spacing:4px;text-align:center;padding:16px;background:#FAF9F6;border:1px solid #121212">' + code + '</p>' +
            '<p>This code expires in 10 minutes.</p>' +
            '<p style="color:#8E8E8E;font-size:12px">If you did not request this, you can ignore this email.</p>' +
            '<p>— Milk Mondays</p></div>'
    };
    var response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'api-key': env.BREVO_API_KEY },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        console.error('[Milk Mondays auth] Brevo error', response.status, await response.text());
        throw httpError(502, 'We could not send the code right now. Please try again shortly.');
    }
}

function readCookie(request, name) {
    var cookie = request.headers.get('Cookie') || '';
    var parts = cookie.split(';');
    for (var i = 0; i < parts.length; i++) {
        var pair = parts[i].trim().split('=');
        if (pair.shift() === name) return decodeURIComponent(pair.join('='));
    }
    return '';
}

function randomToken(bytes) {
    var data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return toBase64Url(data);
}

async function sha256(value) {
    var data = new TextEncoder().encode(String(value));
    return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
}

async function hmacHex(secret, value) {
    var enc = new TextEncoder();
    var key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    var sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
    return Array.from(new Uint8Array(sig)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

function constantTimeEqual(a, b) {
    var left = String(a || '');
    var right = String(b || '');
    var length = Math.max(left.length, right.length);
    var diff = left.length ^ right.length;
    for (var i = 0; i < length; i++) diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
    return diff === 0;
}

function toBase64Url(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
    var base64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

export function httpError(status, message) {
    var error = new Error(message);
    error.status = status;
    return error;
}

export function apiError(error) {
    var status = Number(error && error.status) || 500;
    if (status >= 500) console.error('[Milk Mondays auth]', error);
    return json({ ok: false, error: error && error.status ? error.message : 'Account service is taking a short break.' }, status);
}

export function json(data, status, headers) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: Object.assign({
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer'
        }, headers || {})
    });
}
