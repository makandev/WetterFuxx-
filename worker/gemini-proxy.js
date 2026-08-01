// gemini-proxy.js — a tiny Cloudflare Worker that proxies Google Gemini so the
// API key stays SECRET on the server. The WetterFuxx web app calls this Worker
// instead of Google directly, so the key never ships in the public JavaScript.
//
// ── Deploy (≈5 minutes, free) ────────────────────────────────────────────────
//  1. Create a free Cloudflare account → Workers & Pages → Create Worker.
//  2. Paste this whole file as the Worker code and deploy.
//  3. Settings → Variables:
//       • Secret  GEMINI_KEY       = your NEW Gemini API key (AIza…)  ← secret!
//       • Text    ALLOWED_ORIGINS  = https://makandev.github.io       ← your app origin(s),
//                                     comma-separated; leave empty to allow any origin.
//  4. Copy the Worker URL (e.g. https://gemini-proxy.dein-name.workers.dev)
//     and paste it into js/ai.js → AI_PROXY.
//  5. (Recommended) add a free Cloudflare "Rate limiting rule" on the Worker
//     route so nobody can drain the shared key.
//
// The key lives ONLY here, as a Worker secret. It is never returned to clients.

const ALLOWED_MODELS = [
  'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash',
];
const MAX_BODY = 60000; // bytes — a normal chat request is far smaller

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allow = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const originOk = allow.length === 0 || allow.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': originOk && origin ? origin : (allow[0] || '*'),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const reply = (body, status) => new Response(body, { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply('{"error":"method"}', 405);
    if (!originOk) return reply('{"error":"origin"}', 403);
    if (!env.GEMINI_KEY) return reply('{"error":"not-configured"}', 500);

    const url = new URL(request.url);
    const model = url.searchParams.get('model') || 'gemini-2.0-flash';
    if (!ALLOWED_MODELS.includes(model)) return reply('{"error":"model"}', 400);

    const body = await request.text();
    if (!body || body.length > MAX_BODY) return reply('{"error":"body"}', 413);

    const target = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_KEY}`;
    let res;
    try {
      res = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    } catch {
      return reply('{"error":"upstream"}', 502);
    }
    // Pass Google's status (e.g. 429) and JSON straight through — the app already
    // knows how to react to those.
    return reply(await res.text(), res.status);
  },
};
