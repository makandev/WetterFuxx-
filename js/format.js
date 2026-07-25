// format.js — formatting & meteorological helpers

import { t, getLang } from './i18n.js';

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
