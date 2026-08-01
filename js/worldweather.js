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
let cache = null; // last successful merged list
let activeFilter = 'all';

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
  if (spaceCache) return spaceCache;
  const rows = await fetch(SWPC_KP).then((r) => r.json());
  let kp = null;
  for (let i = rows.length - 1; i >= 1; i--) {
    const v = parseFloat(rows[i][1]);
    if (Number.isFinite(v)) { kp = v; break; }
  }
  spaceCache = kp == null ? null : { kp, k: Math.round(kp), aurora: kp >= 5, strong: kp >= 6 };
  return spaceCache;
}
function spaceText(s) {
  if (!s) return null;
  const k = s.k;
  if (!s.aurora) return { tone: 'calm', text: t('spaceQuiet').replace('{n}', k) };
  const key = s.strong ? 'spaceStorm' : 'spaceG1';
  return { tone: 'alert', text: t(key).replace('{n}', k) };
}

// ---- Local air relevance: "does a far-away event reach OUR air?" -------------
// Uses the same Open-Meteo family already in the app. Reports what is measured/
// modelled at home — never claims a specific fire's smoke "will arrive".
let airCache = {};
function aqiBand(aqi) {
  if (!Number.isFinite(aqi)) return null;
  const en = getLang() === 'en';
  if (aqi < 20) return en ? 'good' : 'gut';
  if (aqi < 40) return en ? 'fair' : 'mäßig';
  if (aqi < 60) return en ? 'moderate' : 'ordentlich';
  if (aqi < 80) return en ? 'poor' : 'schlecht';
  if (aqi < 100) return en ? 'very poor' : 'sehr schlecht';
  return en ? 'extreme' : 'extrem';
}
async function loadAir(place) {
  const key = place.lat.toFixed(2) + ',' + place.lon.toFixed(2);
  if (airCache[key]) return airCache[key];
  const url = `${AQ}?latitude=${place.lat}&longitude=${place.lon}`
    + '&current=pm2_5,pm10,dust,aerosol_optical_depth,european_aqi&timezone=auto';
  const d = await fetch(url).then((r) => r.json());
  const c = (d && d.current) || {};
  const aqi = c.european_aqi;
  const dust = c.dust;
  const info = {
    aqi, dust, pm25: c.pm2_5,
    dustHigh: Number.isFinite(dust) && dust >= 15,
    hazy: Number.isFinite(aqi) && aqi >= 60,
    band: aqiBand(aqi),
  };
  info.affected = info.dustHigh || info.hazy;
  airCache[key] = info;
  return info;
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
    cache = events;
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
      `<br><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.source)} ↗</a>`);
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
    return `<a class="wl-row" href="${esc(e.url)}" target="_blank" rel="noopener">
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
  if (cache) { paint(cache); return; }
  if (list) list.innerHTML = `<div class="world-skeleton">${esc(t('worldLoading'))}</div>`;
  try {
    cache = await loadEvents();
    paint(cache);
  } catch {
    if (list) list.innerHTML = `<div class="world-error">${esc(t('worldError'))}</div>`;
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
  if (!place || !Number.isFinite(place.lat)) { el.hidden = true; return; }
  try {
    const air = await loadAir(place);
    const en = getLang() === 'en';
    const name = place.name || (en ? 'your place' : 'deinem Ort');
    let msg = `${en ? 'Air over' : 'Luft über'} ${name}: ${air.band || '–'}`
      + (Number.isFinite(air.aqi) ? ` (${Math.round(air.aqi)} EU-AQI)` : '');
    const extras = [];
    if (air.dustHigh) {
      extras.push(en ? 'Saharan dust aloft' : 'Saharastaub in der Luft');
      if (ctx && ctx.rainSoon) extras.push(en ? 'blood rain possible' : 'Blutregen möglich');
      else if (ctx && ctx.sunsetISO) extras.push((en ? 'reddish sunset ~' : 'rötlicher Sonnenuntergang ~') + ctx.sunsetISO.slice(11, 16));
    } else if (air.hazy) {
      extras.push(en ? 'a bit hazy (fine dust)' : 'etwas diesig durch Feinstaub');
    }
    const tail = extras.length ? ' · ' + extras.join(' · ') : (en ? ' · no far-off effect right now' : ' · keine Fernwirkung spürbar');
    el.hidden = false;
    el.className = 'world-banner banner-' + (air.affected ? 'alert' : 'calm');
    el.innerHTML = `<span class="wb-ic">${air.affected ? '🌫️' : '🏠'}</span>`
      + `<span class="wb-tx"><b>${esc(t('affectTitle'))}</b> ${esc(msg + tail)}</span>`;
  } catch { el.hidden = true; }
}

export function openWorld(place, ctx) {
  const ov = document.getElementById('worldOverlay');
  if (!ov) return;
  ov.classList.add('open');
  activeFilter = 'all';
  renderSpaceBanner();
  renderAffectBanner(place, ctx);
  // Leaflet needs the container laid out before it can measure itself.
  setTimeout(() => { initMap(); if (map) map.invalidateSize(); ensureData(); }, 60);
}

export function closeWorld() {
  const ov = document.getElementById('worldOverlay');
  if (ov) ov.classList.remove('open');
}
