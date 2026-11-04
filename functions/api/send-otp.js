/**
 * Cloudflare Pages Function
 * -------------------------------------------------------------------------
 * Endpoint: POST /api/send-otp
 * -------------------------------------------------------------------------
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
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