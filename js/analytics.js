// analytics.js — privacy-friendly visitor counting via GoatCounter.
//
// GoatCounter counts page views and derives a rough country from the request,
// then throws the IP away. No cookies, no personal data, no cross-site tracking.
// That matches "count how often the site is visited, without collecting data".
//
// SETUP (2 minutes, once):
//   1. Create a free account at https://www.goatcounter.com/ and pick a code,
//      e.g. "wetterfux" → your dashboard is https://wetterfux.goatcounter.com
//   2. Put that code in GC_CODE below and deploy.
// Until GC_CODE is set, NOTHING external loads and no one is counted.
export const GC_CODE = '';

const base = () => `https://${GC_CODE}.goatcounter.com`;
export const dashboardURL = () => (GC_CODE ? base() : null);
export const isConfigured = () => !!GC_CODE;

// Load the tiny counting script. Skips localhost so you don't count yourself.
export function initAnalytics() {
  if (!GC_CODE) return;
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '') return;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.setAttribute('data-goatcounter', `${base()}/count`);
  document.head.appendChild(s);
}

// Best-effort total visit count (public endpoint). Returns a formatted string
// like "1,234", or null if not configured / unavailable. Never throws.
export async function fetchVisitorTotal() {
  if (!GC_CODE) return null;
  try {
    const res = await fetch(`${base()}/counter/TOTAL.json`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const d = await res.json();
    return d && d.count != null ? String(d.count) : null;
  } catch {
    return null;
  }
}
