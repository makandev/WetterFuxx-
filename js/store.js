// store.js — settings + saved places (localStorage) + shareable URLs

const KEY_SETTINGS = 'wf.settings.v1';
const KEY_PLACES = 'wf.places.v1';

const DEFAULT_SETTINGS = {
  lang: 'de',
  theme: 'auto', // design id or 'auto'
  units: { temp: 'C', wind: 'kmh' }, // temp: C|F ; wind: kmh|mph|ms
  person: { cold: 'normal', profile: 'adult' }, // cold: cold|normal|warm ; profile: adult|kid|bike
  layout: { order: [], hidden: [] }, // customizable card order + hidden ids
  lastPlaceId: null,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* private mode */ }
}

export function loadSettings() {
  const s = read(KEY_SETTINGS, null);
  if (!s) return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS, ...s,
    units: { ...DEFAULT_SETTINGS.units, ...(s.units || {}) },
    person: { ...DEFAULT_SETTINGS.person, ...(s.person || {}) },
    layout: { ...DEFAULT_SETTINGS.layout, ...(s.layout || {}) },
  };
}
export function saveSettings(s) { write(KEY_SETTINGS, s); }

export function loadPlaces() {
  const p = read(KEY_PLACES, []);
  return Array.isArray(p) ? p : [];
}
export function savePlaces(list) { write(KEY_PLACES, list); }

export function addPlace(place) {
  const list = loadPlaces();
  if (!list.some((p) => samePlace(p, place))) {
    list.push(minimalPlace(place));
    savePlaces(list);
  }
  return loadPlaces();
}
export function removePlace(place) {
  const list = loadPlaces().filter((p) => !samePlace(p, place));
  savePlaces(list);
  return list;
}
export function isSaved(place) {
  return loadPlaces().some((p) => samePlace(p, place));
}
export function samePlace(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  return Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;
}
function minimalPlace(p) {
  return { id: p.id, name: p.name, admin1: p.admin1 || '', country: p.country || '',
    country_code: p.country_code || '', lat: p.lat, lon: p.lon };
}

// ---- Shareable links ---------------------------------------------------------
// Encodes a place into a query string so family members open the same location.
export function placeToParams(place) {
  const params = new URLSearchParams();
  params.set('lat', place.lat.toFixed(4));
  params.set('lon', place.lon.toFixed(4));
  params.set('name', place.name);
  if (place.country_code) params.set('cc', place.country_code);
  if (place.admin1) params.set('a', place.admin1);
  return params.toString();
}
export function placeFromParams(search) {
  const p = new URLSearchParams(search);
  const lat = parseFloat(p.get('lat'));
  const lon = parseFloat(p.get('lon'));
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return {
    id: `share:${lat.toFixed(3)},${lon.toFixed(3)}`,
    name: p.get('name') || 'Standort',
    admin1: p.get('a') || '',
    country: '',
    country_code: p.get('cc') || '',
    lat, lon, tz: 'auto',
  };
}
export function shareURL(place) {
  const base = location.origin + location.pathname;
  return `${base}?${placeToParams(place)}`;
}

// ---- Family set sharing (all saved places in one link) ----------------------
export function familyURL(list) {
  const base = location.origin + location.pathname;
  const compact = list.map((p) => ({
    n: p.name, o: +Number(p.lat).toFixed(4), a: +Number(p.lon).toFixed(4),
    c: p.country_code || '', r: p.admin1 || '',
  }));
  return `${base}?fam=${encodeURIComponent(JSON.stringify(compact))}`;
}
export function familyFromParams(search) {
  const p = new URLSearchParams(search);
  const raw = p.get('fam');
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.map((x) => ({
      id: `share:${(+x.o).toFixed(3)},${(+x.a).toFixed(3)}`,
      name: String(x.n || 'Ort').slice(0, 60),
      admin1: String(x.r || ''), country: '', country_code: String(x.c || '').slice(0, 2),
      lat: +x.o, lon: +x.a,
    })).filter((x) => !Number.isNaN(x.lat) && !Number.isNaN(x.lon));
  } catch { return null; }
}
export function importPlaces(list) {
  (list || []).forEach((p) => addPlace(p));
  return loadPlaces();
}

// ---- Daily open streak -------------------------------------------------------
const KEY_STREAK = 'wf.streak.v1';
function ymd(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
export function bumpStreak() {
  const now = new Date();
  const today = ymd(now);
  const s = read(KEY_STREAK, { last: null, count: 0, best: 0 });
  if (s.last === today) return s;
  const yesterday = ymd(new Date(now.getTime() - 86400000));
  s.count = s.last === yesterday ? (s.count || 0) + 1 : 1;
  s.last = today;
  s.best = Math.max(s.best || 0, s.count);
  write(KEY_STREAK, s);
  return s;
}
export function getStreak() { return read(KEY_STREAK, { last: null, count: 0, best: 0 }); }
