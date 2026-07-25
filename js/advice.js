// advice.js — "Kleidungstipp für heute": lebendig, familientauglich, tagesabschnittsweise

import { getLang } from './i18n.js';
import { parseLocal, placeNowMs } from './format.js';

function L(de, en) { return getLang() === 'en' ? en : de; }

function toC(v, unit) { return unit === 'F' ? (v - 32) * 5 / 9 : v; }
function toKmh(v, unit) { return unit === 'mph' ? v * 1.60934 : unit === 'ms' ? v * 3.6 : v; }
function toMm(v, unit) { return unit === 'inch' ? v * 25.4 : v; }

const SNOW_CODES = [71, 73, 75, 77, 85, 86];
const ICE_CODES = [56, 57, 66, 67];
const THUNDER_CODES = [95, 96, 99];
const RAIN_CODES = [51, 53, 55, 61, 63, 65, 80, 81, 82];

// Precip unit tracks a separate flag we pass explicitly
export function buildClothingAdvice(data, settings) {
  const u = settings.units;
  const precipUnit = u.temp === 'F' ? 'inch' : 'mm';
  const cur = data.forecast.current;
  const d = data.forecast.daily;
  const h = data.forecast.hourly;

  const feels = toC(cur.apparent_temperature, u.temp);
  const tmax = toC(d.temperature_2m_max[0], u.temp);
  const tmin = toC(d.temperature_2m_min[0], u.temp);
  const pop = d.precipitation_probability_max ? (d.precipitation_probability_max[0] || 0) : 0;
  const psum = toMm(d.precipitation_sum ? (d.precipitation_sum[0] || 0) : 0, precipUnit);
  const uv = d.uv_index_max ? (d.uv_index_max[0] || 0) : 0;
  const gust = toKmh(d.wind_gusts_10m_max ? (d.wind_gusts_10m_max[0] || 0) : 0, u.wind);
  const codeToday = d.weather_code[0];
  const curCode = cur.weather_code;

  const band = tempBand(feels);
  const items = [];
  const seen = new Set();
  const add = (emoji, text) => { const k = emoji + text; if (!seen.has(k)) { seen.add(k); items.push({ emoji, text }); } };
  band.items.forEach((it) => add(it.emoji, it.text));

  // Umbrella decision: probability AND meaningful amount, or active rain
  const activeRain = RAIN_CODES.includes(curCode) || RAIN_CODES.includes(codeToday);
  const umbrellaNeed = (pop >= 50 && psum >= 0.5) || psum >= 2 || activeRain;
  if (umbrellaNeed) {
    if (pop >= 80 || psum >= 5) add('☔', L('Regenjacke an und Schirm griffbereit', 'Rain jacket on, umbrella at hand'));
    else add('🌂', L('Nimm einen Schirm mit – es kann nass werden', 'Take an umbrella – it may turn wet'));
  }

  // Wind (gusts, DWD-nah)
  if (gust >= 70) add('💨', L('Winddicht anziehen – stürmische Böen', 'Wear windproof gear – stormy gusts'));
  else if (gust >= 45) add('🧥', L('Es ist windig – winddichte Jacke hilft', 'It’s windy – a windproof jacket helps'));

  // Snow / ice
  if (SNOW_CODES.includes(curCode) || SNOW_CODES.includes(codeToday)) add('🥾', L('Warme, feste Schuhe – es schneit', 'Warm, sturdy boots – it’s snowing'));
  if (ICE_CODES.includes(curCode) || ICE_CODES.includes(codeToday) || (tmin <= 0 && (activeRain || pop >= 40)))
    add('🧊', L('Vorsicht Glätte – rutschfeste Sohlen', 'Watch for ice – non-slip soles'));

  // Sun / UV (WHO: protection from UV 3)
  if (uv >= 8) { add('🧴', L('Sonnencreme auftragen', 'Apply sunscreen')); add('🕶️', L('Sonnenbrille & Kopfbedeckung', 'Sunglasses & a hat')); }
  else if (uv >= 6) { add('🧴', L('Sonnencreme & Kappe', 'Sunscreen & a cap')); }
  else if (uv >= 3) add('🧴', L('Etwas Sonnencreme schadet nicht', 'A little sunscreen won’t hurt'));

  // Thunder
  if (THUNDER_CODES.includes(curCode) || THUNDER_CODES.includes(codeToday))
    add('⛈️', L('Gewitter möglich – Aktivitäten nach drinnen', 'Storms possible – move activities indoors'));

  // Layering on big swings
  if (tmax - tmin >= 10) add('🧅', L('Zwiebellook: Schichten zum An- und Ausziehen', 'Layer up – easy to add or shed'));

  // Time-of-day slots (morning / midday / evening) in the place's local time
  const slots = daySlots(h, u.temp);

  // Warm summary sentence, rotates daily (deterministic, no RNG)
  const summary = pickSummary(band.key, umbrellaNeed, gust, uv, feels, tmin);

  // Note: evening cooler?
  let note = '';
  const eve = slots.find((s) => s.key === 'eve');
  if (eve && eve.temp != null && feels - eve.temp >= 5) {
    note = L(`Zum Abend kühlt es auf ${Math.round(eve.temp)}° ab – häng eine Jacke über.`,
             `It cools to ${Math.round(eve.temp)}° by evening – bring a jacket.`);
  } else if (band.note) note = band.note;

  return { emoji: band.emoji, title: band.title, summary, slots, items, umbrella: umbrellaNeed, note };
}

// --- temperature band ---------------------------------------------------------
function tempBand(feels) {
  if (feels >= 28) return { key: 'hot', emoji: '🥵', title: L('Sehr heiß', 'Very hot'),
    items: [{ emoji: '👕', text: L('Luftige, leichte Kleidung', 'Airy, light clothing') }, { emoji: '💧', text: L('Trinkflasche einpacken', 'Pack a water bottle') }],
    note: L('Mittags lieber in den Schatten.', 'Seek the shade around midday.') };
  if (feels >= 23) return { key: 'warm', emoji: '😎', title: L('Warm', 'Warm'),
    items: [{ emoji: '👕', text: L('T-Shirt & kurze Hose', 'T-shirt & shorts') }] };
  if (feels >= 18) return { key: 'mild', emoji: '🙂', title: L('Angenehm mild', 'Pleasantly mild'),
    items: [{ emoji: '👕', text: L('T-Shirt, lange Hose', 'T-shirt, long trousers') }, { emoji: '🧥', text: L('Leichte Jacke für später', 'Light jacket for later') }] };
  if (feels >= 12) return { key: 'cool', emoji: '🍂', title: L('Frisch', 'Cool'),
    items: [{ emoji: '🧶', text: L('Pullover', 'A jumper') }, { emoji: '🧥', text: L('Leichte Jacke', 'A light jacket') }] };
  if (feels >= 6) return { key: 'chilly', emoji: '🧥', title: L('Kühl', 'Chilly'),
    items: [{ emoji: '🧥', text: L('Warme Jacke', 'A warm jacket') }, { emoji: '👖', text: L('Langärmlig & lange Hose', 'Long sleeves & trousers') }] };
  if (feels >= 0) return { key: 'cold', emoji: '🧣', title: L('Kalt', 'Cold'),
    items: [{ emoji: '🧥', text: L('Dicke Jacke', 'A thick coat') }, { emoji: '🧣', text: L('Schal & Mütze', 'Scarf & hat') }] };
  return { key: 'freezing', emoji: '🥶', title: L('Frostig', 'Freezing'),
    items: [{ emoji: '🧥', text: L('Winterjacke', 'Winter coat') }, { emoji: '🧤', text: L('Mütze, Schal & Handschuhe', 'Hat, scarf & gloves') }],
    note: L('Dick einpacken – jede Schicht zählt.', 'Bundle up – every layer counts.') };
}

// --- day slots (morning/midday/evening) --------------------------------------
function daySlots(h, unit) {
  const spec = [
    { key: 'morn', label: L('Morgens', 'Morning'), from: 6, to: 9 },
    { key: 'noon', label: L('Mittags', 'Midday'), from: 12, to: 15 },
    { key: 'eve', label: L('Abends', 'Evening'), from: 18, to: 21 },
  ];
  const nowMs = placeNowMs();
  const today = new Date(nowMs);
  const td = today.getUTCDate(), tm = today.getUTCMonth();
  return spec.map((s) => {
    let sum = 0, n = 0, code = null;
    if (h && h.time) {
      for (let i = 0; i < h.time.length; i++) {
        const dt = parseLocal(h.time[i]);
        if (!dt) continue;
        if (dt.getUTCDate() !== td || dt.getUTCMonth() !== tm) { if (dt.getTime() > nowMs) break; else continue; }
        const hr = dt.getUTCHours();
        if (hr >= s.from && hr <= s.to) {
          const v = h.apparent_temperature ? h.apparent_temperature[i] : h.temperature_2m[i];
          sum += toC(v, unit); n++;
          if (code == null || hr === Math.round((s.from + s.to) / 2)) code = h.weather_code[i];
        }
      }
    }
    return { key: s.key, label: s.label, temp: n ? sum / n : null, code: code == null ? 3 : code };
  }).filter((s) => s.temp != null);
}

// --- summary sentence pools (rotate daily, deterministic) --------------------
function pickSummary(bandKey, umbrella, gust, uv, feels, tmin) {
  const pools = {
    hot: [
      L('Heute wird’s ein Sommertag – luftig anziehen und viel trinken.', 'A proper summer day – dress light and drink plenty.'),
      L('Richtig heiß heute. Leichte Sachen, Schatten und die Trinkflasche.', 'A hot one today. Light clothes, shade and a water bottle.'),
    ],
    warm: [
      L('Angenehm warm – perfektes T-Shirt-Wetter.', 'Nicely warm – perfect T-shirt weather.'),
      L('Ein schöner warmer Tag zum Draußensein.', 'A lovely warm day to be outside.'),
    ],
    mild: [
      L('Mild und freundlich – T-Shirt reicht, abends lieber was drüber.', 'Mild and pleasant – a T-shirt does it, with a layer for the evening.'),
      L('Gutes Wetter für draußen. Eine dünne Jacke im Rucksack schadet nicht.', 'Great weather to be out. A thin jacket won’t hurt.'),
    ],
    cool: [
      L('Frisch heute – ein Pullover hält gemütlich warm.', 'Cool today – a jumper keeps you cosy.'),
      L('Herbstlich frisch. Pullover an, Jacke bereithalten.', 'Autumn-fresh. Jumper on, jacket ready.'),
    ],
    chilly: [
      L('Kühl draußen – zieh dich warm an.', 'Chilly out – wrap up warm.'),
      L('Es ist kühl, eine warme Jacke lohnt sich heute.', 'It’s chilly – a warm jacket pays off today.'),
    ],
    cold: [
      L('Kalt heute – dicke Jacke, Schal und Mütze machen den Unterschied.', 'Cold today – coat, scarf and hat make all the difference.'),
      L('Warm einpacken lohnt sich, gerade morgens beißt die Kälte.', 'Worth bundling up – the cold bites first thing.'),
    ],
    freezing: [
      L('Frostig! Richtig dick einpacken, bevor’s nach draußen geht.', 'Freezing! Bundle up properly before heading out.'),
      L('Eisige Kälte heute – jede Schicht zählt.', 'Icy cold today – every layer counts.'),
    ],
  };
  const pool = pools[bandKey] || pools.mild;
  const idx = new Date(placeNowMs()).getUTCDate() % pool.length;
  let s = pool[idx];
  if (umbrella) s += L(' Und denk an den Regenschutz.', ' And don’t forget rain protection.');
  return s;
}
