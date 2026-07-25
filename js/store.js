// store.js — settings + saved places (localStorage) + shareable URLs

const KEY_SETTINGS = 'wf.settings.v1';
const KEY_PLACES = 'wf.places.v1';

const DEFAULT_SETTINGS = {
  lang: 'de',
  theme: 'auto', // design id or 'auto'
  units: { temp: 'C', wind: 'kmh' }, // temp: C|F ; wind: kmh|mph|ms
  person: { cold: 'normal', profile: 'adult' }, // cold: cold|normal|warm ; profile: adult|kid|bike
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
