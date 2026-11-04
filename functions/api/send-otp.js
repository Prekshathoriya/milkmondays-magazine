/**
 * Legacy endpoint kept only so cached clients fail safely.
 * OTP generation and Brevo delivery now happen server-side in /api/auth.
 */
export async function onRequestPost() {
  return new Response(JSON.stringify({
    error: 'Please refresh the page and try again.'
  }), {
    status: 410,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
