/**
 * Cloudflare Pages Function
 * -------------------------------------------------------------------------
 * Endpoint: POST /api/send-otp
 *
 * This runs SERVER-SIDE on Cloudflare's network — never in the browser —
 * so your Brevo API key is never exposed in page source, unlike the old
 * EmailJS public key which anyone could view.
 *
 * The frontend (gate-form.html) calls this endpoint instead of talking to
 * Brevo directly. This function validates the request, then forwards a
 * transactional email request to Brevo's REST API using the secret key.
 *
 * Setup required (see SETUP.md for full walkthrough):
 *   1. Create a Brevo account and verify a sender email/domain.
 *   2. Generate an API key in Brevo (SMTP & API > API Keys).
 *   3. Add it as a secret environment variable in Cloudflare Pages named
 *      BREVO_API_KEY (Settings > Environment variables > Production/Preview).
 *   4. Set BREVO_SENDER_EMAIL and BREVO_SENDER_NAME as env vars too
 *      (or hardcode them below if you prefer).
 * -------------------------------------------------------------------------
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  // ---- CORS / method guard --------------------------------------------
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // tighten to your domain in production if you like
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    // ---- Parse & validate incoming JSON ---------------------------------
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400, corsHeaders);
    }

    const { to_name, to_email, otp_code } = body || {};

    if (!to_name || typeof to_name !== 'string' || to_name.trim().length < 2) {
      return jsonResponse({ error: 'Missing or invalid to_name.' }, 400, corsHeaders);
    }
    if (!to_email || typeof to_email !== 'string' || !isValidEmail(to_email)) {
      return jsonResponse({ error: 'Missing or invalid to_email.' }, 400, corsHeaders);
    }
    if (!otp_code || typeof otp_code !== 'string' || !/^\d{6}$/.test(otp_code)) {
      return jsonResponse({ error: 'Missing or invalid otp_code.' }, 400, corsHeaders);
    }

    // ---- Read secrets / config from environment --------------------------
    const BREVO_API_KEY     = env.BREVO_API_KEY;
    const BREVO_SENDER_EMAIL = env.BREVO_SENDER_EMAIL || 'milkmondaysbiz@gmail.com';
    const BREVO_SENDER_NAME  = env.BREVO_SENDER_NAME  || 'Milk Mondays';

    if (!BREVO_API_KEY) {
      console.error('[send-otp] BREVO_API_KEY is not set in environment variables.');
      return jsonResponse(
        { error: 'Email service is not configured yet. Please contact the site owner.' },
        500,
        corsHeaders
      );
    }

    // ---- Basic rate limiting note -----------------------------------------
    // Cloudflare Pages Functions are stateless per-request. For real abuse
    // protection, put this behind Cloudflare's built-in Rate Limiting rules
    // (Security > WAF > Rate limiting rules) pointed at /api/send-otp.

    // ---- Build the Brevo transactional email request ----------------------
    const emailPayload = {
      sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
      to: [{ email: to_email, name: to_name }],
      subject: `Your Milk Mondays code: ${otp_code}`,
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <p>Hi ${escapeHtml(to_name)},</p>
          <p>Your one-time access code for Milk Mondays:</p>
          <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; text-align: center; padding: 16px; background: #FAF9F6; border: 1px solid #121212;">
            ${otp_code}
          </p>
          <p>This code expires in 10 minutes.</p>
          <p style="color: #8E8E8E; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
          <p>— Milk Mondays</p>
        </div>
      `,
    };

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify(emailPayload),
    });

    if (!brevoResponse.ok) {
      const errText = await brevoResponse.text();
      console.error('[send-otp] Brevo API error:', brevoResponse.status, errText);
      return jsonResponse(
        { error: 'Failed to send verification email. Please try again shortly.' },
        502,
        corsHeaders
      );
    }

    const brevoData = await brevoResponse.json();
    return jsonResponse({ success: true, messageId: brevoData.messageId || null }, 200, corsHeaders);

  } catch (err) {
    console.error('[send-otp] Unexpected error:', err);
    return jsonResponse({ error: 'Unexpected server error.' }, 500, corsHeaders);
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ---- helpers --------------------------------------------------------------

function isValidEmail(email) {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonResponse(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    },
  });
}