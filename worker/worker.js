/**
 * Cloudflare Worker — Gemini API Proxy
 * ────────────────────────────────────────────────────────────
 * Proxies two Gemini endpoints used by the AI Assistant:
 *   POST /api/embed     → gemini-embedding-001:embedContent
 *   POST /api/generate  → gemini-2.5-flash:generateContent
 *
 * The API key lives in this Worker as a secret named GEMINI_API_KEY
 * (set with `wrangler secret put GEMINI_API_KEY` or via the dashboard).
 * The frontend never sees the key.
 *
 * CORS: only requests from the configured frontend origin are allowed.
 * Update ALLOWED_ORIGINS below if you change subdomains.
 *
 * Rate limiting: simple per-IP token bucket with KV storage. Caps at
 * 30 requests per minute per IP to protect the free-tier quota from
 * abuse. If you do not want KV-based rate limiting, remove the
 * checkRateLimit() call. Without rate limiting any visitor can drain
 * your daily quota.
 */

const ALLOWED_ORIGINS = [
  'https://cm.electriai.com',
  'https://cm-electriai.pages.dev',
  'http://127.0.0.1:5500',     // VS Code Live Server local testing
  'http://localhost:5500',
  'http://localhost:8000',     // python -m http.server
];

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const RATE_LIMIT_PER_MINUTE = 30;

// ─── CORS helpers ─────────────────────────────────────────────
function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

// ─── Rate limiting (optional, requires KV binding) ────────────
async function checkRateLimit(env, ip) {
  if (!env.RATE_LIMIT_KV) return { ok: true }; // KV not bound → skip
  const key = `rl:${ip}:${Math.floor(Date.now() / 60000)}`; // bucket per minute
  const current = parseInt((await env.RATE_LIMIT_KV.get(key)) || '0', 10);
  if (current >= RATE_LIMIT_PER_MINUTE) {
    return { ok: false, retryAfter: 60 };
  }
  // Increment with 65s TTL so the bucket auto-expires
  await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 65 });
  return { ok: true };
}

// ─── Proxy handler ────────────────────────────────────────────
async function proxyToGemini(request, env, geminiUrl, origin) {
  if (!env.GEMINI_API_KEY) {
    return jsonResponse({ error: 'GEMINI_API_KEY not configured on the Worker' }, 500, origin);
  }
  const body = await request.text();
  const upstream = await fetch(`${geminiUrl}?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  // Pass through Gemini response with CORS headers
  const respBody = await upstream.text();
  return new Response(respBody, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

// ─── Main handler ─────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Reject disallowed origins early to keep this Worker private
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return jsonResponse({ error: 'Origin not allowed' }, 403, origin);
    }

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({ status: 'ok', endpoints: ['/api/embed', '/api/generate'] }, 200, origin);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, origin);
    }

    // Per-IP rate limit
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rl = await checkRateLimit(env, ip);
    if (!rl.ok) {
      return jsonResponse(
        { error: `Rate limit exceeded (${RATE_LIMIT_PER_MINUTE}/min). Try again in a moment.` },
        429,
        origin
      );
    }

    if (url.pathname === '/api/embed') {
      return proxyToGemini(
        request, env,
        `${GEMINI_BASE}/gemini-embedding-001:embedContent`,
        origin
      );
    }

    if (url.pathname === '/api/generate') {
      return proxyToGemini(
        request, env,
        `${GEMINI_BASE}/gemini-2.5-flash:generateContent`,
        origin
      );
    }

    return jsonResponse({ error: 'Not found' }, 404, origin);
  },
};