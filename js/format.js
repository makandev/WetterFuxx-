// format.js — formatting & meteorological helpers

import { t, getLang } from './i18n.js';

// ---- Timezone handling -------------------------------------------------------
// Open-Meteo returns wall-clock ISO strings without offset (timezone:auto).
// To compare against "now" we work in a "wall-clock-as-UTC" space:
//   parseLocal(iso)  -> epoch where the place's wall time is read as UTC
//   placeNowMs()     -> the place's current wall time in the same space
// Digits for display stay correct via the normal Date parsing elsewhere.
let placeOffsetSec = null;
export function setPlaceTz(seconds) {
  placeOffsetSec = (typeof seconds === 'number') ? seconds : null;
}
export function parseLocal(iso) {
  if (!iso) return null;
  const hasTz = /[zZ]|[+-]\d\d:?\d\d$/.test(iso);
  // Append "Z" only to date+time strings ("2026-07-30T14:00"). A bare date
  // ("2026-07-30") already parses as UTC midnight everywhere — appending "Z"
  // makes "2026-07-30Z", which Safari rejects as Invalid Date (Chrome tolerates
  // it). That mismatch hid the hourly temperature row on iPhone.
  const needsZ = !hasTz && iso.includes('T');
  const d = new Date(needsZ ? `${iso}Z` : iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
export function placeNowMs() {
  if (placeOffsetSec == null) return Date.now();
  return Date.now() + placeOffsetSec * 1000;
}

export function tempStr(v, unit = 'C') {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return `${Math.round(v)}°`;
}
export function tempUnitLabel(unit = 'C') { return unit === 'F' ? '°F' : '°C'; }

export function windUnitLabel(unit = 'kmh') {
  return unit === 'mph' ? 'mph' : unit === 'ms' ? 'm/s' : 'km/h';
}

export function num(v, digits = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return v.toFixed(digits);
}

// Compass direction from degrees
export function windDir(deg, lang = getLang()) {
  const dirsDe = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  const dirsEn = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const dirs = lang === 'en' ? dirsEn : dirsDe;
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}

export function formatHour(iso, tz) {
  const d = new Date(iso);
  return d.toLocaleTimeString(getLang() === 'en' ? 'en-GB' : 'de-DE',
    { hour: '2-digit', minute: '2-digit', timeZone: tz && tz !== 'auto' ? tz : undefined });
}
export function formatHourShort(iso) {
  const d = new Date(iso);
  const h = d.getHours();
  return getLang() === 'en'
    ? `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`
    : `${String(h).padStart(2, '0')}`;
}
export function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString(getLang() === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit' });
}
// Time if it's today, otherwise "Mo 12.8. 14:00" — used for warning validity windows.
export function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const loc = getLang() === 'en' ? 'en-GB' : 'de-DE';
  const time = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  const day = d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'numeric' });
  return `${day} ${time}`;
}
// Shift a naive Open-Meteo wall-clock string by dMin minutes and return it
// still as a naive wall-clock string (no "Z"), ready for formatTime(). Keeping
// everything in the parseLocal space avoids the viewer-offset double-shift.
export function shiftWall(iso, dMin) {
  const base = parseLocal(iso);
  if (!base) return null;
  return new Date(base.getTime() + dMin * 60000).toISOString().slice(0, 16);
}
// Golden/blue-hour durations scale with latitude: near the poles the sun sets
// at a shallow angle so the light lingers much longer than the mid-latitude
// "40 min" rule of thumb. cos(lat) captures most of that dependence.
export function goldenBlueMinutes(latDeg) {
  const c = Math.max(0.33, Math.cos((latDeg || 0) * Math.PI / 180));
  const golden = Math.min(75, Math.max(22, Math.round(28 / c)));
  const blue = Math.min(45, Math.max(15, Math.round(golden * 0.6)));
  return { golden, blue };
}
export function dayLabel(iso, i) {
  const d = new Date(iso);
  if (i === 0) return t('today');
  if (i === 1) return t('tomorrow');
  return t('days')[d.getDay()];
}
export function fullDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'de-DE',
    { weekday: 'long', day: 'numeric', month: 'long' });
}
// Short date like "30.7." (de) or "Jul 30" (en)
export function shortDate(iso) {
  const d = new Date(iso);
  if (getLang() === 'en') {
    return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  }
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}
export function isWeekend(iso) {
  const g = new Date(iso).getDay();
  return g === 0 || g === 6;
}

// UV index level → {label, class, advice}
export function uvLevel(uv) {
  if (uv < 3) return { label: t('uvLow'), cls: 'lvl-good', advice: t('uvAdviceLow') };
  if (uv < 6) return { label: t('uvModerate'), cls: 'lvl-fair', advice: t('uvAdviceMod') };
  if (uv < 8) return { label: t('uvHigh'), cls: 'lvl-poor', advice: t('uvAdviceHigh') };
  if (uv < 11) return { label: t('uvVeryHigh'), cls: 'lvl-verypoor', advice: t('uvAdviceHigh') };
  return { label: t('uvExtreme'), cls: 'lvl-extreme', advice: t('uvAdviceExtreme') };
}

// European AQI → {label, class, advice, pct}
export function aqiLevel(aqi) {
  if (aqi === null || aqi === undefined) return null;
  let label, cls, advice;
  if (aqi <= 20) { label = t('good'); cls = 'lvl-good'; advice = t('aqiAdviceGood'); }
  else if (aqi <= 40) { label = t('fair'); cls = 'lvl-fair'; advice = t('aqiAdviceGood'); }
  else if (aqi <= 60) { label = t('moderate'); cls = 'lvl-moderate'; advice = t('aqiAdviceModerate'); }
  else if (aqi <= 80) { label = t('poor'); cls = 'lvl-poor'; advice = t('aqiAdvicePoor'); }
  else if (aqi <= 100) { label = t('veryPoor'); cls = 'lvl-verypoor'; advice = t('aqiAdviceVeryPoor'); }
  else { label = t('extremelyPoor'); cls = 'lvl-extreme'; advice = t('aqiAdviceVeryPoor'); }
  return { label, cls, advice, pct: Math.min(100, (aqi / 100) * 100) };
}

// Pollen grains/m³ → level
export function pollenLevel(v) {
  if (v === null || v === undefined) return { label: '–', cls: 'lvl-none' };
  if (v < 1) return { label: t('none'), cls: 'lvl-none' };
  if (v < 20) return { label: t('lowLvl'), cls: 'lvl-good' };
  if (v < 50) return { label: t('moderateLvl'), cls: 'lvl-moderate' };
  if (v < 100) return { label: t('highLvl'), cls: 'lvl-poor' };
  return { label: t('veryHighLvl'), cls: 'lvl-extreme' };
}

// Moon phase (0..1) → {name, emoji, illum}
export function moonPhase(date = new Date()) {
  // Reference new moon 2000-01-06 18:14 UTC
  const synodic = 29.53058867;
  const ref = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
  const now = date.getTime() / 86400000;
  let age = ((now - ref) % synodic + synodic) % synodic;
  const frac = age / synodic;
  const illum = Math.round((1 - Math.cos(frac * 2 * Math.PI)) / 2 * 100);
  const namesDe = ['Neumond', 'Zunehmende Sichel', 'Erstes Viertel', 'Zunehmender Mond',
    'Vollmond', 'Abnehmender Mond', 'Letztes Viertel', 'Abnehmende Sichel'];
  const namesEn = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
    'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const emoji = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  const idx = Math.round(frac * 8) % 8;
  const names = getLang() === 'en' ? namesEn : namesDe;
  return { name: names[idx], emoji: emoji[idx], illum, frac };
}

export function daylightStr(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h} h ${m} min`;
}

export function placeLabel(p) {
  if (!p) return '';
  const parts = [p.name];
  if (p.admin1 && p.admin1 !== p.name) parts.push(p.admin1);
  return parts.join(', ');
}
export function placeSub(p) {
  if (!p) return '';
  return [p.country].filter(Boolean).join(' · ');
}
