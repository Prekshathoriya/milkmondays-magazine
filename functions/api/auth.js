import {
    INACTIVITY_MS,
    apiError,
    assertSameOrigin,
    authDb,
    cleanEmail,
    cleanPassword,
    cleanUsername,
    cleanupAuthRows,
    clearSessionCookie,
    consumeVerifiedChallenge,
    createOtpChallenge,
    enforceLoginRateLimit,
    ensureAuthSchema,
    getSessionUser,
    httpError,
    issueSession,
    json,
    makePasswordRecord,
    requireSession,
    revokeAllSessions,
    revokeSession,
    verifyOtpChallenge,
    verifyPassword
} from '../_lib/auth.js';

export async function onRequestGet(context) {
    try {
        await ensureAuthSchema(context.env);
        var user = await getSessionUser(context.request, context.env, true);
        if (!user) {
            return json({ ok: true, authenticated: false }, 200, { 'Set-Cookie': clearSessionCookie() });
        }
        return json({ ok: true, authenticated: true, user: publicUser(user) });
    } catch (error) {
        return apiError(error);
    }
}

export async function onRequestPost(context) {
    try {
        assertSameOrigin(context.request);
        var db = await ensureAuthSchema(context.env);
        var body = await readJson(context.request);
        var action = String(body.action || '');

        if (Math.random() < 0.02) context.waitUntil(cleanupAuthRows(context.env));

        if (action === 'request_signup_otp') {
            var signupEmail = cleanEmail(body.email);
            var existing = await db.prepare('SELECT id FROM auth_users WHERE email = ?1 LIMIT 1').bind(signupEmail).first();
            if (existing) throw httpError(409, 'An account already uses that email. Log in instead.');
            var signupChallenge = await createOtpChallenge(context.env, {
                request: context.request,
                email: signupEmail,
                name: body.name || 'there',
                purpose: 'signup'
            });
            return json({ ok: true, challengeId: signupChallenge.id, maskedEmail: maskEmail(signupEmail) });
        }

        if (action === 'verify_signup_otp') {
            var verifiedSignup = await verifyOtpChallenge(context.env, body.challengeId, body.code, 'signup');
            return json({ ok: true, challengeId: verifiedSignup.id });
        }

        if (action === 'create_account') {
            var username = cleanUsername(body.username);
            var usernameOwner = await db.prepare('SELECT id FROM auth_users WHERE username = ?1 COLLATE NOCASE LIMIT 1').bind(username).first();
            if (usernameOwner) throw httpError(409, 'That username is already in use.');
            var signup = await consumeVerifiedChallenge(context.env, body.challengeId, 'signup');
            var passwordRecord = await makePasswordRecord(body.password);
            var now = Date.now();
            var userId = crypto.randomUUID();
            try {
                await db.prepare(
                    'INSERT INTO auth_users ' +
                    '(id, email, username, password_hash, password_salt, password_iterations, created_at, updated_at, last_seen_at, email_verified_at) ' +
                    'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?7, ?7)'
                ).bind(userId, signup.email, username, passwordRecord.hash, passwordRecord.salt, passwordRecord.iterations, now).run();
            } catch (error) {
                if (/UNIQUE|constraint/i.test(String(error && error.message))) throw httpError(409, 'That username or email is already in use.');
                throw error;
            }
            var signupSession = await issueSession(context.env, userId);
            return json({ ok: true, authenticated: true, user: { id: userId, email: signup.email, username: username } }, 201, { 'Set-Cookie': signupSession.cookie });
        }

        if (action === 'login') {
            var identifier = String(body.identifier || '').trim();
            await enforceLoginRateLimit(context.request, context.env, identifier);
            var loginUser = await db.prepare(
                'SELECT * FROM auth_users WHERE username = ?1 COLLATE NOCASE LIMIT 1'
            ).bind(identifier).first();
            if (!loginUser || !(await verifyPassword(String(body.password || ''), loginUser))) {
                throw httpError(401, 'Username or password is not correct.');
            }
            if (Date.now() - Number(loginUser.last_seen_at) >= INACTIVITY_MS) {
                var inactiveChallenge = await createOtpChallenge(context.env, {
                    request: context.request,
                    email: loginUser.email,
                    name: loginUser.username,
                    userId: loginUser.id,
                    purpose: 'inactive'
                });
                return json({ ok: true, otpRequired: true, challengeId: inactiveChallenge.id, maskedEmail: maskEmail(loginUser.email) });
            }
            var loginSession = await issueSession(context.env, loginUser.id);
            return json({ ok: true, authenticated: true, user: publicUser(loginUser) }, 200, { 'Set-Cookie': loginSession.cookie });
        }

        if (action === 'verify_inactive_otp') {
            var inactive = await verifyOtpChallenge(context.env, body.challengeId, body.code, 'inactive');
            if (!inactive.user_id) throw httpError(400, 'Invalid verification request.');
            var inactiveUse = await db.prepare('UPDATE auth_otp_challenges SET used_at = ?1 WHERE id = ?2 AND used_at IS NULL').bind(Date.now(), inactive.id).run();
            if (!inactiveUse.meta || !inactiveUse.meta.changes) throw httpError(409, 'That verification was already used.');
            var inactiveSession = await issueSession(context.env, inactive.user_id);
            var inactiveUser = await db.prepare('SELECT * FROM auth_users WHERE id = ?1 LIMIT 1').bind(inactive.user_id).first();
            return json({ ok: true, authenticated: true, user: publicUser(inactiveUser) }, 200, { 'Set-Cookie': inactiveSession.cookie });
        }

        if (action === 'request_recovery_otp') {
            var recoveryIdentifier = String(body.identifier || '').trim();
            await enforceLoginRateLimit(context.request, context.env, 'recovery:' + recoveryIdentifier);
            var recoveryUser = await db.prepare(
                'SELECT * FROM auth_users WHERE username = ?1 COLLATE NOCASE OR email = ?1 COLLATE NOCASE LIMIT 1'
            ).bind(recoveryIdentifier).first();
            if (!recoveryUser) {
                return json({
                    ok: true,
                    sent: true,
                    challengeId: crypto.randomUUID(),
                    maskedEmail: 'your email'
                });
            }
            var recoveryChallenge = await createOtpChallenge(context.env, {
                request: context.request,
                email: recoveryUser.email,
                name: recoveryUser.username,
                userId: recoveryUser.id,
                purpose: 'recovery'
            });
            return json({ ok: true, sent: true, challengeId: recoveryChallenge.id, maskedEmail: maskEmail(recoveryUser.email) });
        }

        if (action === 'verify_recovery_otp') {
            var verifiedRecovery = await verifyOtpChallenge(context.env, body.challengeId, body.code, 'recovery');
            return json({ ok: true, challengeId: verifiedRecovery.id });
        }

        if (action === 'reset_password') {
            var recovery = await consumeVerifiedChallenge(context.env, body.challengeId, 'recovery');
            if (!recovery.user_id) throw httpError(400, 'Invalid recovery request.');
            var recoveredPassword = await makePasswordRecord(body.password);
            await revokeAllSessions(context.env, recovery.user_id);
            await db.prepare(
                'UPDATE auth_users SET password_hash = ?1, password_salt = ?2, password_iterations = ?3, updated_at = ?4, last_seen_at = ?4 WHERE id = ?5'
            ).bind(recoveredPassword.hash, recoveredPassword.salt, recoveredPassword.iterations, Date.now(), recovery.user_id).run();
            var recoverySession = await issueSession(context.env, recovery.user_id);
            var recoveredUser = await db.prepare('SELECT * FROM auth_users WHERE id = ?1 LIMIT 1').bind(recovery.user_id).first();
            return json({ ok: true, authenticated: true, user: publicUser(recoveredUser) }, 200, { 'Set-Cookie': recoverySession.cookie });
        }

        if (action === 'change_username') {
            var usernameUser = await requireSession(context.request, context.env);
            if (!(await verifyPassword(String(body.password || ''), usernameUser))) throw httpError(401, 'Password is not correct.');
            var newUsername = cleanUsername(body.username);
            try {
                await db.prepare('UPDATE auth_users SET username = ?1, updated_at = ?2 WHERE id = ?3')
                    .bind(newUsername, Date.now(), usernameUser.id).run();
            } catch (error) {
                if (/UNIQUE|constraint/i.test(String(error && error.message))) throw httpError(409, 'That username is already in use.');
                throw error;
            }
            return json({ ok: true, username: newUsername });
        }

        if (action === 'change_password') {
            var passwordUser = await requireSession(context.request, context.env);
            if (!(await verifyPassword(String(body.currentPassword || ''), passwordUser))) throw httpError(401, 'Current password is not correct.');
            var newPassword = await makePasswordRecord(body.newPassword);
            await revokeAllSessions(context.env, passwordUser.id);
            await db.prepare(
                'UPDATE auth_users SET password_hash = ?1, password_salt = ?2, password_iterations = ?3, updated_at = ?4 WHERE id = ?5'
            ).bind(newPassword.hash, newPassword.salt, newPassword.iterations, Date.now(), passwordUser.id).run();
            var newPasswordSession = await issueSession(context.env, passwordUser.id);
            return json({ ok: true }, 200, { 'Set-Cookie': newPasswordSession.cookie });
        }

        if (action === 'request_email_change') {
            var emailUser = await requireSession(context.request, context.env);
            if (!(await verifyPassword(String(body.password || ''), emailUser))) throw httpError(401, 'Password is not correct.');
            var newEmail = cleanEmail(body.email);
            var emailOwner = await db.prepare('SELECT id FROM auth_users WHERE email = ?1 LIMIT 1').bind(newEmail).first();
            if (emailOwner) throw httpError(409, 'That email is already in use.');
            var emailChallenge = await createOtpChallenge(context.env, {
                request: context.request,
                email: newEmail,
                name: emailUser.username,
                userId: emailUser.id,
                purpose: 'email_change'
            });
            return json({ ok: true, challengeId: emailChallenge.id, maskedEmail: maskEmail(newEmail) });
        }

        if (action === 'confirm_email_change') {
            var currentUser = await requireSession(context.request, context.env);
            var emailChange = await verifyOtpChallenge(context.env, body.challengeId, body.code, 'email_change');
            if (emailChange.user_id !== currentUser.id) throw httpError(403, 'That verification does not belong to this account.');
            var emailUse = await db.prepare('UPDATE auth_otp_challenges SET used_at = ?1 WHERE id = ?2 AND used_at IS NULL').bind(Date.now(), emailChange.id).run();
            if (!emailUse.meta || !emailUse.meta.changes) throw httpError(409, 'That verification was already used.');
            try {
                await db.prepare('UPDATE auth_users SET email = ?1, email_verified_at = ?2, updated_at = ?2 WHERE id = ?3')
                    .bind(emailChange.email, Date.now(), currentUser.id).run();
            } catch (error) {
                if (/UNIQUE|constraint/i.test(String(error && error.message))) throw httpError(409, 'That email is already in use.');
                throw error;
            }
            return json({ ok: true, email: emailChange.email });
        }

        if (action === 'logout') {
            await revokeSession(context.request, context.env);
            return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
        }

        if (action === 'logout_all') {
            var logoutUser = await requireSession(context.request, context.env);
            await revokeAllSessions(context.env, logoutUser.id);
            return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
        }

        throw httpError(400, 'Unknown account action.');
    } catch (error) {
        return apiError(error);
    }
}

function publicUser(user) {
    return { id: user.id, email: user.email, username: user.username };
}

function maskEmail(email) {
    var parts = String(email || '').split('@');
    if (parts.length !== 2) return '';
    var local = parts[0];
    return local.slice(0, 2) + '•'.repeat(Math.max(1, Math.min(5, local.length - 2))) + '@' + parts[1];
}

async function readJson(request) {
    try { return await request.json(); }
    catch (error) { throw httpError(400, 'Invalid request.'); }
}
