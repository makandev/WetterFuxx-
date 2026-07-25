// weathercodes.js — WMO weather interpretation codes → description, icon, sky-group

// group is used for dynamic backgrounds & effects:
// 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder'
const CODES = {
  0:  { de: 'Klarer Himmel',        en: 'Clear sky',            icon: 'sun',       group: 'clear' },
  1:  { de: 'Überwiegend klar',     en: 'Mainly clear',         icon: 'sun-cloud', group: 'partly' },
  2:  { de: 'Teils bewölkt',        en: 'Partly cloudy',        icon: 'sun-cloud', group: 'partly' },
  3:  { de: 'Bedeckt',              en: 'Overcast',             icon: 'cloud',     group: 'cloudy' },
  45: { de: 'Nebel',                en: 'Fog',                  icon: 'fog',       group: 'fog' },
  48: { de: 'Reifnebel',            en: 'Rime fog',             icon: 'fog',       group: 'fog' },
  51: { de: 'Leichter Nieselregen', en: 'Light drizzle',        icon: 'drizzle',   group: 'drizzle' },
  53: { de: 'Nieselregen',          en: 'Drizzle',              icon: 'drizzle',   group: 'drizzle' },
  55: { de: 'Starker Nieselregen',  en: 'Dense drizzle',        icon: 'drizzle',   group: 'drizzle' },
  56: { de: 'Leichter Eisregen',    en: 'Light freezing drizzle', icon: 'sleet',   group: 'drizzle' },
  57: { de: 'Eisregen',             en: 'Freezing drizzle',     icon: 'sleet',     group: 'drizzle' },
  61: { de: 'Leichter Regen',       en: 'Light rain',           icon: 'rain',      group: 'rain' },
  63: { de: 'Regen',                en: 'Rain',                 icon: 'rain',      group: 'rain' },
  65: { de: 'Starker Regen',        en: 'Heavy rain',           icon: 'rain',      group: 'rain' },
  66: { de: 'Leichter Eisregen',    en: 'Light freezing rain',  icon: 'sleet',     group: 'rain' },
  67: { de: 'Eisregen',             en: 'Freezing rain',        icon: 'sleet',     group: 'rain' },
  71: { de: 'Leichter Schneefall',  en: 'Light snow',           icon: 'snow',      group: 'snow' },
  73: { de: 'Schneefall',           en: 'Snow',                 icon: 'snow',      group: 'snow' },
  75: { de: 'Starker Schneefall',   en: 'Heavy snow',           icon: 'snow',      group: 'snow' },
  77: { de: 'Schneegriesel',        en: 'Snow grains',          icon: 'snow',      group: 'snow' },
  80: { de: 'Leichte Regenschauer', en: 'Light showers',        icon: 'rain',      group: 'rain' },
  81: { de: 'Regenschauer',         en: 'Showers',              icon: 'rain',      group: 'rain' },
  82: { de: 'Heftige Regenschauer', en: 'Violent showers',      icon: 'rain',      group: 'rain' },
  85: { de: 'Leichte Schneeschauer',en: 'Light snow showers',   icon: 'snow',      group: 'snow' },
  86: { de: 'Schneeschauer',        en: 'Snow showers',         icon: 'snow',      group: 'snow' },
  95: { de: 'Gewitter',             en: 'Thunderstorm',         icon: 'thunder',   group: 'thunder' },
  96: { de: 'Gewitter mit Hagel',   en: 'Thunderstorm w/ hail', icon: 'thunder',   group: 'thunder' },
  99: { de: 'Schweres Gewitter',    en: 'Severe thunderstorm',  icon: 'thunder',   group: 'thunder' },
};

const FALLBACK = { de: 'Unbekannt', en: 'Unknown', icon: 'cloud', group: 'cloudy' };

export function describe(code, lang) {
  const c = CODES[code] || FALLBACK;
  return c[lang] || c.de;
}
export function iconKey(code) {
  return (CODES[code] || FALLBACK).icon;
}
export function skyGroup(code) {
  return (CODES[code] || FALLBACK).group;
}

// ---- Animated inline SVG weather icons ---------------------------------------
// `night` swaps sun for moon variants. Returned string is an <svg>.
export function weatherSVG(code, isDay = true) {
  const key = iconKey(code);
  const sun = isDay;
  switch (key) {
    case 'sun':       return sun ? svgSun() : svgMoon();
    case 'sun-cloud': return sun ? svgSunCloud() : svgMoonCloud();
    case 'cloud':     return svgCloud();
    case 'fog':       return svgFog();
    case 'drizzle':   return svgRain(2);
    case 'rain':      return svgRain(3);
    case 'sleet':     return svgSleet();
    case 'snow':      return svgSnow();
    case 'thunder':   return svgThunder();
    default:          return svgCloud();
  }
}

const wrap = (inner) =>
  `<svg viewBox="0 0 64 64" class="wx" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

function svgSun() {
  let rays = '';
  for (let i = 0; i < 12; i++) {
    const a = (i * 30) * Math.PI / 180;
    const x1 = 32 + Math.cos(a) * 20, y1 = 32 + Math.sin(a) * 20;
    const x2 = 32 + Math.cos(a) * 27, y2 = 32 + Math.sin(a) * 27;
    rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="ray"/>`;
  }
  return wrap(`<g class="spin-slow" style="transform-origin:32px 32px">${rays}</g>
    <circle cx="32" cy="32" r="13" class="sun-core"/>`);
}
function svgMoon() {
  return wrap(`<path class="moon" d="M40 12a20 20 0 1 0 12 36 22 22 0 0 1-12-36z"/>
    <circle cx="46" cy="18" r="1.6" class="star"/><circle cx="52" cy="28" r="1.1" class="star"/>
    <circle cx="42" cy="26" r="0.9" class="star"/>`);
}
function svgSunCloud() {
  return wrap(`<circle cx="24" cy="24" r="9" class="sun-core"/>
    <g class="spin-slow" style="transform-origin:24px 24px">
    <line x1="24" y1="6" x2="24" y2="11" class="ray"/><line x1="24" y1="37" x2="24" y2="42" class="ray"/>
    <line x1="6" y1="24" x2="11" y2="24" class="ray"/><line x1="37" y1="24" x2="42" y2="24" class="ray"/>
    <line x1="11" y1="11" x2="14.5" y2="14.5" class="ray"/><line x1="33.5" y1="33.5" x2="37" y2="37" class="ray"/></g>
    ${cloudPath(30, 34, 'cloud-main')}`);
}
function svgMoonCloud() {
  return wrap(`<path class="moon" d="M26 14a12 12 0 1 0 8 22 13 13 0 0 1-8-22z"/>
    ${cloudPath(30, 34, 'cloud-main')}`);
}
function svgCloud() {
  return wrap(`${cloudPath(28, 30, 'cloud-back', 0.85)}${cloudPath(32, 34, 'cloud-main')}`);
}
function cloudPath(cx, cy, cls, s = 1) {
  const p = `M${cx-16} ${cy+8} a10 10 0 0 1 3-19 13 13 0 0 1 24-3 9 9 0 0 1 5 22z`;
  return `<path d="${p}" class="${cls} drift" transform="scale(${s})" style="transform-origin:${cx}px ${cy}px"/>`;
}
function svgFog() {
  return wrap(`${cloudPath(30, 26, 'cloud-main')}
    <line x1="12" y1="44" x2="52" y2="44" class="fog-line f1"/>
    <line x1="16" y1="50" x2="48" y2="50" class="fog-line f2"/>
    <line x1="12" y1="56" x2="52" y2="56" class="fog-line f3"/>`);
}
function svgRain(n) {
  let drops = '';
  const xs = n === 2 ? [24, 40] : [20, 32, 44];
  xs.forEach((x, i) => {
    drops += `<line x1="${x}" y1="44" x2="${x-3}" y2="54" class="drop" style="animation-delay:${i*0.25}s"/>`;
  });
  return wrap(`${cloudPath(30, 28, 'cloud-main')}${drops}`);
}
function svgSleet() {
  return wrap(`${cloudPath(30, 28, 'cloud-main')}
    <line x1="22" y1="44" x2="19" y2="54" class="drop"/>
    <circle cx="34" cy="50" r="2" class="flake" style="animation-delay:.2s"/>
    <line x1="44" y1="44" x2="41" y2="54" class="drop" style="animation-delay:.4s"/>`);
}
function svgSnow() {
  let flakes = '';
  [20, 32, 44].forEach((x, i) => {
    flakes += `<circle cx="${x}" cy="48" r="2.4" class="flake" style="animation-delay:${i*0.3}s"/>`;
  });
  return wrap(`${cloudPath(30, 28, 'cloud-main')}${flakes}`);
}
function svgThunder() {
  return wrap(`${cloudPath(30, 26, 'cloud-dark')}
    <polygon points="30,40 24,52 30,52 26,62 40,46 33,46 37,40" class="bolt"/>`);
}
