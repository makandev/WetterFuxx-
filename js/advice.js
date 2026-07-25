// advice.js — "Kleidungstipp für heute" / "What to wear today"
// Leitet aus den Tageswerten eine konkrete, freundliche Empfehlung ab.

import { getLang } from './i18n.js';

function L(de, en) { return getLang() === 'en' ? en : de; }

// Convert helpers (logic runs in metric regardless of display units)
function toC(v, unit) { return unit === 'F' ? (v - 32) * 5 / 9 : v; }
function toKmh(v, unit) { return unit === 'mph' ? v * 1.60934 : unit === 'ms' ? v * 3.6 : v; }
function toMm(v, unit) { return unit === 'F' ? v * 25.4 : v; } // precip unit follows temp unit

const SNOW_CODES = [71, 73, 75, 77, 85, 86];
const ICE_CODES = [56, 57, 66, 67];
const THUNDER_CODES = [95, 96, 99];
const RAIN_CODES = [51, 53, 55, 61, 63, 65, 80, 81, 82];

export function buildClothingAdvice(data, settings) {
  const u = settings.units;
  const cur = data.forecast.current;
  const d = data.forecast.daily;
  const h = data.forecast.hourly;

  const feels = toC(cur.apparent_temperature, u.temp);
  const tmax = toC(d.temperature_2m_max[0], u.temp);
  const tmin = toC(d.temperature_2m_min[0], u.temp);
  const pop = d.precipitation_probability_max ? d.precipitation_probability_max[0] : 0;
  const psum = toMm(d.precipitation_sum ? d.precipitation_sum[0] : 0, u.temp);
  const uv = d.uv_index_max ? d.uv_index_max[0] : 0;
  const gust = toKmh(d.wind_gusts_10m_max ? d.wind_gusts_10m_max[0] : 0, u.wind);
  const codeToday = d.weather_code[0];
  const curCode = cur.weather_code;

  // --- Temperature band → base outfit + mood emoji ---
  const band = tempBand(feels);
  const items = [];
  const seen = new Set();
  const add = (emoji, text) => { const k = emoji + text; if (!seen.has(k)) { seen.add(k); items.push({ emoji, text }); } };

  band.items.forEach((it) => add(it.emoji, it.text));

  // --- Rain / umbrella ---
  const rainy = pop >= 40 || psum >= 1 || RAIN_CODES.includes(curCode) || RAIN_CODES.includes(codeToday);
  if (pop >= 70 || psum >= 5) add('☔', L('Regenschirm & Regenjacke – heute wird’s nass', 'Umbrella & rain jacket – it will be wet'));
  else if (rainy) add('🌂', L('Nimm einen Regenschirm mit', 'Take an umbrella just in case'));

  // --- Wind ---
  if (gust >= 60) add('💨', L('Winddichte Jacke – kräftige Böen', 'Windproof jacket – strong gusts'));
  else if (gust >= 40) add('🧥', L('Es ist windig – etwas Winddichtes anziehen', 'It’s windy – wear something windproof'));

  // --- Snow / ice ---
  if (SNOW_CODES.includes(curCode) || SNOW_CODES.includes(codeToday)) add('🥾', L('Warme, feste Schuhe – es schneit', 'Warm, sturdy boots – it’s snowing'));
  if (ICE_CODES.includes(curCode) || ICE_CODES.includes(codeToday) || (tmin <= 0 && rainy)) add('🧊', L('Vorsicht Glätte – rutschfeste Schuhe', 'Watch for ice – non-slip shoes'));

  // --- Sun / UV ---
  if (uv >= 8) { add('🧴', L('Sonnencreme nicht vergessen', 'Don’t forget sunscreen')); add('🕶️', L('Sonnenbrille & Kopfbedeckung', 'Sunglasses & a hat')); }
  else if (uv >= 6) add('🧴', L('Sonnencreme empfohlen', 'Sunscreen recommended'));

  // --- Thunder ---
  if (THUNDER_CODES.includes(curCode) || THUNDER_CODES.includes(codeToday))
    add('⛈️', L('Gewittergefahr – plane Aktivitäten drinnen', 'Thunderstorm risk – plan indoor activities'));

  // --- Layering hint on big swings ---
  if (tmax - tmin >= 10) add('🧅', L('Zwiebellook: Schichten zum An- und Ausziehen', 'Layer up – easy to add or remove'));

  // --- Note: evening cooler? look at late-day hours ---
  let note = '';
  const eveTemp = eveningTemp(h, u.temp);
  if (eveTemp != null && feels - eveTemp >= 5) {
    note = L(`Heute Abend wird’s kühler (${Math.round(eveTemp)}°) – nimm eine Jacke mit.`,
             `Cooler this evening (${Math.round(eveTemp)}°) – bring a jacket.`);
  } else if (band.note) {
    note = band.note;
  }

  return { emoji: band.emoji, title: band.title, items, note };
}

function tempBand(feels) {
  if (feels >= 28) return {
    emoji: '🥵', title: L('Sehr heiß', 'Very hot'),
    items: [{ emoji: '👕', text: L('Leichte, luftige Kleidung', 'Light, airy clothes') }, { emoji: '🩳', text: L('Kurze Hose oder Kleid', 'Shorts or a dress') }],
    note: L('Viel trinken und Schatten suchen.', 'Stay hydrated and seek shade.'),
  };
  if (feels >= 23) return {
    emoji: '😎', title: L('Warm', 'Warm'),
    items: [{ emoji: '👕', text: L('T-Shirt', 'T-shirt') }, { emoji: '🩳', text: L('Kurze Hose', 'Shorts') }],
  };
  if (feels >= 18) return {
    emoji: '🙂', title: L('Mild', 'Mild'),
    items: [{ emoji: '👕', text: L('T-Shirt & lange Hose', 'T-shirt & long trousers') }, { emoji: '🧥', text: L('Leichte Jacke für abends', 'Light jacket for the evening') }],
  };
  if (feels >= 12) return {
    emoji: '🧥', title: L('Frisch', 'Cool'),
    items: [{ emoji: '🧶', text: L('Pullover', 'A jumper') }, { emoji: '🧥', text: L('Leichte Jacke', 'A light jacket') }],
  };
  if (feels >= 6) return {
    emoji: '🧥', title: L('Kühl', 'Chilly'),
    items: [{ emoji: '🧥', text: L('Warme Jacke', 'A warm jacket') }, { emoji: '👖', text: L('Langärmlig & lange Hose', 'Long sleeves & trousers') }],
  };
  if (feels >= 0) return {
    emoji: '🧣', title: L('Kalt', 'Cold'),
    items: [{ emoji: '🧥', text: L('Dicke Jacke', 'A thick coat') }, { emoji: '🧣', text: L('Schal & Mütze', 'Scarf & hat') }],
  };
  return {
    emoji: '🥶', title: L('Sehr kalt', 'Freezing'),
    items: [{ emoji: '🧥', text: L('Winterjacke', 'Winter coat') }, { emoji: '🧤', text: L('Mütze, Schal & Handschuhe', 'Hat, scarf & gloves') }],
    note: L('Dick einpacken – jede Schicht zählt.', 'Bundle up – every layer counts.'),
  };
}

// Average "feels-like" temp for the evening (18:00–22:00) of today, in °C
function eveningTemp(h, unit) {
  if (!h || !h.time) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let sum = 0, n = 0;
  for (let i = 0; i < h.time.length; i++) {
    const dt = new Date(h.time[i]);
    if (dt < today) continue;
    if (dt.getDate() !== today.getDate()) break;
    const hr = dt.getHours();
    if (hr >= 18 && hr <= 22) {
      const v = h.apparent_temperature ? h.apparent_temperature[i] : h.temperature_2m[i];
      sum += toC(v, unit); n++;
    }
  }
  return n ? sum / n : null;
}
