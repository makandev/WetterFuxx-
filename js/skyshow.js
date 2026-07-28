// skyshow.js — sunset outlook: golden/blue hour, a "how good will the sunset
// look" score, and honestly-labelled rare sky phenomena. All derived from the
// free Open-Meteo fields we already fetch — no backend, no key.

import { getLang } from './i18n.js';
import { parseLocal, placeNowMs, shiftWall, goldenBlueMinutes } from './format.js';

const L = (de, en) => (getLang() === 'en' ? en : de);
const SHOWERS = [80, 81, 82];
const FOGCODE = [45, 48];

// Nearest hourly index to sunset.
function sunsetHourIdx(h, ssIso) {
  const target = parseLocal(ssIso);
  if (!target || !h.time) return -1;
  let best = -1, bd = Infinity;
  h.time.forEach((iso, i) => {
    const d = parseLocal(iso);
    if (!d) return;
    const dd = Math.abs(d.getTime() - target.getTime());
    if (dd < bd) { bd = dd; best = i; }
  });
  return best;
}

// 0–100 "spectacular sunset" score, or null if cloud layers are unavailable.
function sunsetScore(h, i) {
  const at = (a) => (a && a[i] != null ? a[i] : null);
  const hi = at(h.cloud_cover_high);
  const mid = at(h.cloud_cover_mid);
  let low = at(h.cloud_cover_low);
  if (low == null) low = at(h.cloud_cover);
  const vis = at(h.visibility);
  const rh = at(h.relative_humidity_2m);
  if (hi == null || low == null) return null;

  let s = 30;
  if (hi >= 20 && hi <= 80) s += 30 * (1 - Math.abs(hi - 50) / 30);
  else if (hi > 80) s += 5;
  if (mid != null) { if (mid <= 60) s += 10 * (1 - Math.abs(mid - 25) / 60); if (mid > 85) s -= 15; }
  if (low < 15) s += 25; else if (low < 40) s += 10; else if (low < 60) s -= 5; else s -= 30;
  if (vis != null) { if (vis > 20000) s += 10; else if (vis < 8000) s -= 12; }
  if (rh != null) { if (rh < 55) s += 5; else if (rh > 88) s -= 8; }
  return Math.max(0, Math.min(100, Math.round(s)));
}

function classify(score) {
  if (score >= 70) return { key: 'fire', label: L('Brennender Himmel wahrscheinlich', 'Burning sky likely'), emoji: '🔥' };
  if (score >= 50) return { key: 'color', label: L('Farbiger Sonnenuntergang möglich', 'Colourful sunset possible'), emoji: '🌇' };
  if (score >= 30) return { key: 'pale', label: L('Eher blasser Sonnenuntergang', 'Rather pale sunset'), emoji: '🌫️' };
  return { key: 'dull', label: L('Unspektakulärer Sonnenuntergang', 'Unspectacular sunset'), emoji: '☁️' };
}

// Rare/notable phenomena. `solid:true` = reliably derivable; false = "could".
function phenomena(h, i, score, moonIllum) {
  const at = (a) => (a && a[i] != null ? a[i] : null);
  const hi = at(h.cloud_cover_high), mid = at(h.cloud_cover_mid);
  let low = at(h.cloud_cover_low); if (low == null) low = at(h.cloud_cover);
  const total = at(h.cloud_cover);
  const vis = at(h.visibility), rh = at(h.relative_humidity_2m);
  const dew = at(h.dew_point_2m), temp = at(h.temperature_2m), wind = at(h.wind_speed_10m);
  const code = at(h.weather_code), isDay = h.is_day ? h.is_day[i] === 1 : true;
  const out = [];
  const add = (emoji, text, hint, solid) => out.push({ emoji, text, hint, solid });

  if (score != null && score >= 70 && hi != null && hi >= 30 && hi <= 70 && low != null && low < 25)
    add('🔥', L('Feuriger Cirrus-Himmel', 'Fiery cirrus sky'),
      L('Hohe Schleierwolken fangen das rote Licht wie eine Leinwand.', 'High wispy cirrus catches the red light like a canvas.'), true);

  if (total != null && total < 8 && vis != null && vis > 30000 && rh != null && rh < 55)
    add('🔭', L('Glasklarer Sonnenuntergang', 'Crystal-clear sunset'),
      L('Sehr klare Luft – seltene Chance auf einen „grünen Blitz" am Horizont.', 'Very clean air – a rare chance of a “green flash” on the horizon.'), false);

  if (SHOWERS.includes(code) && isDay && total != null && total < 85)
    add('🌈', L('Regenbogen-Chance', 'Rainbow chance'),
      L('Tief stehende Sonne plus Schauer gegenüber – schau dem Regen den Rücken zu.', 'Low sun plus showers opposite – keep the rain at your back.'), true);

  if (low != null && low < 20 && vis != null && vis > 15000)
    add('🌒', L('Erdschatten & Venusgürtel', 'Earth shadow & Belt of Venus'),
      L('Der rosa Streifen kurz nach Sonnenuntergang steht gegenüber der Sonne, im Osten.', 'The pink band just after sunset sits opposite the sun, in the east.'), true);

  if (hi != null && hi >= 20 && hi <= 80 && low != null && low < 30 && (mid == null || mid < 40) && isDay)
    add('⭕', L('Halo möglich', 'Halo possible'),
      L('Ringe um die Sonne entstehen an Eiskristallen dünner Cirren – oft ein Wetterzeichen.', 'Rings around the sun form on ice crystals in thin cirrus – often a weather sign.'), false);

  if (rh != null && rh >= 95 && dew != null && temp != null && (temp - dew) < 1 && wind != null && wind < 8
    && (FOGCODE.includes(code) || true))
    add('🌁', L('Nebel-Stimmung', 'Misty mood'),
      L('Wenn Temperatur und Taupunkt zusammenfallen und der Wind schläft, bildet sich Nebel.', 'When temperature meets dew point and the wind drops, fog forms.'), true);

  if (moonIllum != null && moonIllum >= 97)
    add('🌕', L('Vollmond heute', 'Full moon tonight'),
      L('Ein Vollmond geht etwa zum Sonnenuntergang gegenüber der Sonne auf.', 'A full moon rises around sunset, opposite the sun.'), true);

  return out;
}

// Public: the full sunset outlook, or null when there is no real sunset.
export function sunsetOutlook(data, moonIllum) {
  const d = data.forecast.daily, h = data.forecast.hourly;
  const ss = d.sunset && d.sunset[0], sr = d.sunrise && d.sunrise[0];
  if (!ss || !parseLocal(ss)) return null;
  const { golden, blue } = goldenBlueMinutes(data.place && data.place.lat);
  const i = sunsetHourIdx(h, ss);
  const score = i >= 0 ? sunsetScore(h, i) : null;
  const total = i >= 0 && h.cloud_cover ? h.cloud_cover[i] : null;
  let low = i >= 0 && h.cloud_cover_low ? h.cloud_cover_low[i] : null;
  if (low == null && i >= 0 && h.cloud_cover) low = h.cloud_cover[i];
  const overcast = total != null && total > 90 && low != null && low > 75;

  const outlook = overcast
    ? { key: 'hidden', label: L('Sonnenuntergang kaum sichtbar', 'Sunset barely visible'), emoji: '☁️',
        note: L('Dichte Wolken – heute ehrlich gesagt nichts zu sehen.', 'Overcast – honestly nothing to see today.') }
    : score == null
      ? { key: 'unknown', label: L('Himmels-Vorhersage nicht verfügbar', 'Sky forecast unavailable'), emoji: '❔', note: '' }
      : { ...classify(score), score };

  return {
    score,
    outlook,
    golden: { start: shiftWall(ss, -golden), end: ss, min: golden },
    blue: { start: ss, end: shiftWall(ss, blue), min: blue },
    morningGolden: sr ? { start: sr, end: shiftWall(sr, golden) } : null,
    phenomena: overcast ? [] : phenomena(h, i, score, moonIllum),
    hint: L('Der schönste Sonnenuntergang braucht hohe Cirren als Leinwand und einen klaren West-Horizont.',
      'The best sunsets need high cirrus as a canvas and a clear western horizon.'),
    past: parseLocal(ss).getTime() < placeNowMs(),
  };
}
