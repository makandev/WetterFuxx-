// worldweather.js — "Welt-Wetter": real natural events happening around the
// globe right now, from two trustworthy, free, key-less, cookie-less sources:
//   • NASA EONET  — wildfires, volcanoes, storms, floods, sea/lake ice …
//   • USGS        — earthquakes (magnitude 4.5+, last 24 h)
// No videos, no third-party players, no tracking. Data is fetched only when the
// user opens the view — never in the background.

import { t, getLang } from './i18n.js';

const EONET = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=20&limit=40';
const USGS = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
const SWPC_KP = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
const AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// Each event kind carries its own emoji, accent colour and bilingual label.
const KINDS = {
  wildfire: { emoji: '🔥', color: '#ff6b3d', de: 'Waldbrand', en: 'Wildfire' },
  volcano: { emoji: '🌋', color: '#e0443e', de: 'Vulkan', en: 'Volcano' },
  storm: { emoji: '🌀', color: '#4aa8ff', de: 'Sturm', en: 'Storm' },
  flood: { emoji: '🌊', color: '#3d7bff', de: 'Überschwemmung', en: 'Flood' },
  ice: { emoji: '🧊', color: '#7fd8ff', de: 'Eis', en: 'Ice' },
  quake: { emoji: '🫨', color: '#c07bff', de: 'Erdbeben', en: 'Earthquake' },
  other: { emoji: '⚠️', color: '#ffd479', de: 'Ereignis', en: 'Event' },
};
const CAT2KIND = {
  wildfires: 'wildfire', volcanoes: 'volcano', severeStorms: 'storm',
  floods: 'flood', seaLakeIce: 'ice', earthquakes: 'quake',
};
const kindLabel = (k) => (getLang() === 'en' ? KINDS[k].en : KINDS[k].de);

// ---- Data --------------------------------------------------------------------
const TTL = 15 * 60 * 1000; // refresh world / space / air data at most every 15 min
let cache = null; let cacheAt = 0; // last successful merged event list
let activeFilter = 'all';
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '#');

function fromEonet(json) {
  return (json.events || []).map((ev) => {
    const g = ev.geometry && ev.geometry[ev.geometry.length - 1];
    if (!g || !g.coordinates) return null;
    let lon, lat;
    if (g.type === 'Point') { [lon, lat] = g.coordinates; }
    else { const flat = g.coordinates.flat(Infinity); lon = flat[0]; lat = flat[1]; }
    const cat = ev.categories && ev.categories[0] && ev.categories[0].id;
    const kind = CAT2KIND[cat] || 'other';
    const src = ev.sources && ev.sources[0];
    const mag = g.magnitudeValue != null ? `${g.magnitudeValue} ${g.magnitudeUnit || ''}`.trim() : null;
    return {
      id: 'eonet:' + ev.id, kind, title: ev.title,
      lat, lon, time: Date.parse(g.date) || 0, mag,
      url: (src && src.url) || 'https://eonet.gsfc.nasa.gov/', source: 'NASA EONET',
    };
  }).filter(Boolean);
}

function fromUsgs(json) {
  return (json.features || []).map((f) => {
    const p = f.properties || {}; const c = f.geometry && f.geometry.coordinates;
    if (!c) return null;
    return {
      id: 'usgs:' + f.id, kind: 'quake', title: p.place || p.title || 'Earthquake',
      lat: c[1], lon: c[0], time: p.time || 0,
      mag: 'M ' + (p.mag != null ? Number(p.mag).toFixed(1) : '?'),
      // Only ever surface the OFFICIAL USGS tsunami flag — never guess from magnitude.
      tsunami: p.tsunami === 1,
      url: p.url || 'https://earthquake.usgs.gov/', source: 'USGS',
    };
  }).filter(Boolean);
}

async function loadEvents() {
  const [a, b] = await Promise.allSettled([
    fetch(EONET).then((r) => r.json()).then(fromEonet),
    fetch(USGS).then((r) => r.json()).then(fromUsgs),
  ]);
  const list = [];
  if (a.status === 'fulfilled') list.push(...a.value);
  if (b.status === 'fulfilled') list.push(...b.value);
  if (!list.length && a.status === 'rejected' && b.status === 'rejected') throw new Error('all sources failed');
  list.sort((x, y) => y.time - x.time); // newest first
  return list;
}

// ---- Space weather: aurora over northern Germany (NOAA SWPC, free/no-key) -----
// Aurora reaches N-Germany only in real geomagnetic storms. Honest thresholds:
//   Kp < 5 → quiet;  Kp 5 (G1) → fringe/far north;  Kp ≥ 6 (G2+) → possible.
let spaceCache = null;
async function loadSpace() {
  if (spaceCache && Date.now() - spaceCache.at < TTL) return spaceCache.val;
  const rows = await fetch(SWPC_KP).then((r) => r.json());
  let kp = null;
  for (let i = rows.length - 1; i >= 1; i--) {
    const v = parseFloat(rows[i][1]);
    if (Number.isFinite(v)) { kp = v; break; }
  }
  // Gate the wording on the SAME rounded value we display, so text and Kp agree.
  const k = kp == null ? null : Math.round(kp);
  const val = k == null ? null : { kp, k, aurora: k >= 5, strong: k >= 6 };
  spaceCache = { at: Date.now(), val };
  return val;
}
// Only surface space weather when aurora can actually matter — a "calm" bar every
// time is just noise (and steals room from the event list). Kp 5 = far north only,
// Kp ≥ 6 = a chance further south. We never promise "tonight" from a nowcast.
function spaceText(s) {
  if (!s || !s.aurora) return null;
  return { tone: 'alert', text: t(s.strong ? 'spaceStorm' : 'spaceG1').replace('{n}', s.k) };
}

// ---- Local air relevance: "does a far-away event reach OUR air?" -------------
// Uses the same Open-Meteo family already in the app. Reports what is measured/
// modelled at home — never claims a specific fire's smoke "will arrive".
let airCache = {};
// European AQI bands (EEA cutoffs 0-20-40-60-80-100). Computed at RENDER time so
// the label always matches the current UI language (never cached localized).
function aqiBand(aqi) {
  if (!Number.isFinite(aqi)) return null;
  const en = getLang() === 'en';
  if (aqi < 20) return en ? 'good' : 'gut';
  if (aqi < 40) return en ? 'fair' : 'mäßig';
  if (aqi < 60) return en ? 'moderate' : 'mittelmäßig';
  if (aqi < 80) return en ? 'poor' : 'schlecht';
  if (aqi < 100) return en ? 'very poor' : 'sehr schlecht';
  return en ? 'extremely poor' : 'extrem schlecht';
}
async function loadAir(place) {
  const key = place.lat.toFixed(2) + ',' + place.lon.toFixed(2);
  const hit = airCache[key];
  if (hit && Date.now() - hit.at < TTL) return hit.val;
  const url = `${AQ}?latitude=${place.lat}&longitude=${place.lon}`
    + '&current=pm2_5,pm10,dust,aerosol_optical_depth,european_aqi&timezone=auto';
  const d = await fetch(url).then((r) => r.json());
  const c = (d && d.current) || {};
  const aqi = c.european_aqi;
  const dust = c.dust;             // surface dust µg/m³
  const aod = c.aerosol_optical_depth; // column haze — the honest predictor of visible sky effects
  const val = {
    hasData: Number.isFinite(aqi) || Number.isFinite(dust),
    aqi, dust, aod, pm25: c.pm2_5,
    dustPresent: Number.isFinite(dust) && dust >= 15,
    // Only claim a VISIBLE effect when the column is genuinely loaded.
    dustVisible: (Number.isFinite(aod) && aod >= 0.4) || (Number.isFinite(dust) && dust >= 30),
    hazy: Number.isFinite(aqi) && aqi >= 60,
  };
  val.affected = val.dustPresent || val.hazy;
  airCache[key] = { at: Date.now(), val };
  return val;
}

// ---- Small helpers -----------------------------------------------------------
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function ago(ms) {
  const diff = Date.now() - ms;
  if (!ms || diff < 0) return '';
  const h = Math.floor(diff / 3600000);
  if (h < 1) return t('agoNow');
  if (h < 24) return t('agoHours').replace('{n}', h);
  return t('agoDays').replace('{n}', Math.round(h / 24));
}

function counts(events) {
  const c = {};
  events.forEach((e) => { c[e.kind] = (c[e.kind] || 0) + 1; });
  return c;
}

// ---- Teaser card (on the home screen) ---------------------------------------
export async function renderWorldTeaser() {
  const card = document.getElementById('worldwx');
  if (!card) return;
  card.hidden = false;
  card.innerHTML = `
    <div class="card-title">🌍 <span>${esc(t('worldTitle'))}</span></div>
    <div class="world-teaser-body"><div class="world-skeleton">${esc(t('worldLoading'))}</div></div>`;
  try {
    const [events, space] = await Promise.all([
      loadEvents(),
      loadSpace().catch(() => null),
    ]);
    cache = events; cacheAt = Date.now();
    const top = events.slice(0, 3);
    const rows = top.map((e) => {
      const k = KINDS[e.kind];
      return `<div class="wt-row"><span class="wt-ic" style="--wp:${k.color}">${k.emoji}</span>
        <span class="wt-txt"><b>${esc(shortTitle(e))}</b><small>${esc(kindLabel(e.kind))}${e.mag ? ' · ' + esc(e.mag) : ''}</small></span></div>`;
    }).join('');
    // Aurora is the rare, magical highlight — only show it when it can matter.
    const aurora = space && space.aurora
      ? `<div class="wt-highlight">🌌 ${esc(t('auroraTonight').replace('{n}', space.k))}</div>` : '';
    card.innerHTML = `
      <div class="card-title">🌍 <span>${esc(t('worldTitle'))}</span></div>
      ${aurora}
      <div class="world-teaser-body">
        <div class="wt-count">${events.length}</div>
        <div class="wt-sub">${esc(t('worldCount'))}</div>
      </div>
      <div class="wt-list">${rows}</div>
      <button class="btn btn-ghost btn-block wt-open" type="button">🗺️ ${esc(t('worldOpen'))}</button>`;
  } catch {
    card.innerHTML = `
      <div class="card-title">🌍 <span>${esc(t('worldTitle'))}</span></div>
      <div class="world-teaser-body"><div class="world-error">${esc(t('worldError'))}</div></div>`;
  }
}

// A tidy short title: drop overly long region tails so rows stay one line.
function shortTitle(e) {
  let s = e.title || '';
  if (e.kind === 'quake') { const i = s.indexOf(' of '); if (i > -1) s = s.slice(i + 4); }
  return s;
}

// ---- Full view (overlay: world map + list) ----------------------------------
let map = null; let markers = []; let inited = false;

function initMap() {
  if (inited || typeof window.L === 'undefined') return;
  inited = true;
  const L = window.L;
  map = L.map('world-map', {
    zoomControl: true, attributionControl: true, scrollWheelZoom: false,
    worldCopyJump: true, minZoom: 1, maxZoom: 8,
  }).setView([25, 5], 1);
  L.tileLayer(OSM, { maxZoom: 8, minZoom: 1, attribution: '&copy; OpenStreetMap' }).addTo(map);
}

function pinIcon(ev) {
  const k = KINDS[ev.kind] || KINDS.other;
  return window.L.divIcon({
    className: 'world-pin',
    html: `<span class="wp" style="--wp:${k.color}">${k.emoji}</span>`,
    iconSize: [28, 28], iconAnchor: [14, 14],
  });
}

function drawMarkers(events) {
  if (!map) return;
  markers.forEach((m) => map.removeLayer(m));
  markers = [];
  events.forEach((e) => {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) return;
    const m = window.L.marker([e.lat, e.lon], { icon: pinIcon(e) }).addTo(map);
    const tsu = e.tsunami ? `<br>⚠️ ${esc(t('tsunamiFlag'))}` : '';
    m.bindPopup(`<b>${esc(shortTitle(e))}</b><br>${esc(kindLabel(e.kind))}${e.mag ? ' · ' + esc(e.mag) : ''}${tsu}` +
      `<br><a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener">${esc(e.source)} ↗</a>`);
    markers.push(m);
  });
}

function renderFilters(events) {
  const box = document.getElementById('worldFilters');
  if (!box) return;
  const c = counts(events);
  const kinds = Object.keys(KINDS).filter((k) => c[k]);
  const chip = (key, emoji, label, n, on) =>
    `<button class="wfilter${on ? ' on' : ''}" data-f="${key}">${emoji} ${esc(label)} <span class="wf-n">${n}</span></button>`;
  box.innerHTML = chip('all', '🌍', t('worldAll'), events.length, activeFilter === 'all')
    + kinds.map((k) => chip(k, KINDS[k].emoji, kindLabel(k), c[k], activeFilter === k)).join('');
  box.querySelectorAll('.wfilter').forEach((b) => b.addEventListener('click', () => {
    activeFilter = b.dataset.f;
    paint(events);
  }));
}

function renderList(events) {
  const box = document.getElementById('worldList');
  if (!box) return;
  const shown = activeFilter === 'all' ? events : events.filter((e) => e.kind === activeFilter);
  if (!shown.length) { box.innerHTML = `<div class="world-empty">${esc(t('worldEmpty'))}</div>`; return; }
  box.innerHTML = shown.map((e) => {
    const k = KINDS[e.kind];
    const when = ago(e.time);
    return `<a class="wl-row" href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener">
      <span class="wl-ic" style="--wp:${k.color}">${k.emoji}</span>
      <span class="wl-txt">
        <b>${esc(shortTitle(e))}${e.tsunami ? ' <span class="wl-tsu">⚠️ ' + esc(t('tsunamiFlag')) + '</span>' : ''}</b>
        <small>${esc(kindLabel(e.kind))}${e.mag ? ' · ' + esc(e.mag) : ''}${when ? ' · ' + esc(when) : ''}</small>
      </span>
      <span class="wl-src">${esc(e.source)} ↗</span>
    </a>`;
  }).join('');
}

function paint(events) {
  const shown = activeFilter === 'all' ? events : events.filter((e) => e.kind === activeFilter);
  drawMarkers(shown);
  renderFilters(events);
  renderList(events);
}

async function ensureData() {
  const list = document.getElementById('worldList');
  if (cache && Date.now() - cacheAt < TTL) { paint(cache); return; }
  if (list && !cache) list.innerHTML = `<div class="world-skeleton">${esc(t('worldLoading'))}</div>`;
  try {
    cache = await loadEvents(); cacheAt = Date.now();
    paint(cache);
  } catch {
    if (list && !cache) list.innerHTML = `<div class="world-error">${esc(t('worldError'))}</div>`;
  }
}

// ---- Top banners: space weather + "does it reach us?" -----------------------
async function renderSpaceBanner() {
  const el = document.getElementById('worldSpace');
  if (!el) return;
  try {
    const info = spaceText(await loadSpace());
    if (!info) { el.hidden = true; return; }
    el.hidden = false;
    el.className = 'world-banner banner-' + info.tone;
    el.innerHTML = `<span class="wb-ic">🛰️</span><span class="wb-tx">${esc(info.text)}</span>`;
  } catch { el.hidden = true; }
}

async function renderAffectBanner(place, ctx) {
  const el = document.getElementById('worldAffect');
  if (!el) return;
  const en = getLang() === 'en';
  const banner = (tone, ic, body) => {
    el.hidden = false;
    el.className = 'world-banner banner-' + tone;
    el.innerHTML = `<span class="wb-ic">${ic}</span><span class="wb-tx"><b>${esc(t('affectTitle'))}</b> ${esc(body)}</span>`;
  };
  if (!place || !Number.isFinite(place.lat)) {
    // No saved place yet → a gentle hint instead of a silently missing banner.
    banner('calm', '🏠', en ? 'Save a place to see whether it reaches your air.' : 'Ort speichern, um zu sehen, ob es eure Luft betrifft.');
    return;
  }
  try {
    const air = await loadAir(place);
    if (!air.hasData) { el.hidden = true; return; } // no reading → say nothing, don't show "–"
    const name = place.name || (en ? 'your place' : 'deinem Ort');
    const band = aqiBand(air.aqi);
    const head = `${en ? 'Air over' : 'Luft über'} ${name}: ${band || '–'}`
      + (Number.isFinite(air.aqi) ? ` (${Math.round(air.aqi)} EU-AQI)` : '');
    const extras = [];
    if (air.dustPresent) {
      extras.push(en ? 'Saharan dust aloft' : 'Saharastaub in der Luft');
      // Visible-sky claims only when the column is genuinely loaded — and always hedged.
      if (air.dustVisible) {
        if (ctx && ctx.rainSoon) extras.push(en ? 'rain may wash down reddish dust' : 'Regen kann Staub rötlich abwaschen');
        else if (ctx && ctx.sunsetISO) extras.push((en ? 'sunset may look reddish ~' : 'evtl. rötlicher Sonnenuntergang ~') + ctx.sunsetISO.slice(11, 16) + (en ? ' (if clear)' : ', bei klarem Himmel'));
      }
    } else if (air.hazy) {
      extras.push(en ? 'a bit hazy (fine dust)' : 'etwas diesig durch Feinstaub');
    }
    // Describe what was measured — never assert a causal "all clear" we didn't test.
    const tail = extras.length ? ' · ' + extras.join(' · ')
      : (en ? ' · local air looks normal right now' : ' · Luft bei dir aktuell unauffällig');
    banner(air.affected ? 'alert' : 'calm', air.affected ? '🌫️' : '🏠', head + tail);
  } catch { el.hidden = true; }
}

let lastFocus = null;
export function openWorld(place, ctx) {
  const ov = document.getElementById('worldOverlay');
  if (!ov) return;
  lastFocus = document.activeElement;
  ov.classList.add('open');
  activeFilter = 'all';
  renderSpaceBanner();
  renderAffectBanner(place, ctx);
  const close = document.getElementById('worldClose');
  if (close) setTimeout(() => close.focus(), 40); // move focus into the dialog
  // Leaflet needs the container laid out before it can measure itself.
  setTimeout(() => { initMap(); if (map) map.invalidateSize(); ensureData(); }, 60);
}

export function closeWorld() {
  const ov = document.getElementById('worldOverlay');
  if (ov) ov.classList.remove('open');
  if (lastFocus && lastFocus.focus) { lastFocus.focus(); lastFocus = null; } // restore focus
}
