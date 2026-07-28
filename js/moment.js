// moment.js — "Wetter-Moment des Tages": one curated, shareable daily hook

import { getLang } from './i18n.js';
import { parseLocal, formatTime, shiftWall, goldenBlueMinutes } from './format.js';

function L(de, en) { return getLang() === 'en' ? en : de; }
function toC(v, unit) { return unit === 'F' ? (v - 32) * 5 / 9 : v; }
function toKmh(v, unit) { return unit === 'mph' ? v * 1.60934 : unit === 'ms' ? v * 3.6 : v; }

const THUNDER = [95, 96, 99];
const SNOW = [71, 73, 75, 77, 85, 86];
const SHOWERS = [80, 81, 82];
const CLEARISH = [0, 1, 2];

export function buildMoment(data, settings) {
  const u = settings.units;
  const c = data.forecast.current;
  const d = data.forecast.daily;
  const feelsMax = toC(d.apparent_temperature_max ? d.apparent_temperature_max[0] : d.temperature_2m_max[0], u.temp);
  const tmax = toC(d.temperature_2m_max[0], u.temp);
  const tmin = toC(d.temperature_2m_min[0], u.temp);
  const pop = d.precipitation_probability_max ? (d.precipitation_probability_max[0] || 0) : 0;
  const gust = toKmh(d.wind_gusts_10m_max ? (d.wind_gusts_10m_max[0] || 0) : 0, u.wind);
  const code = c.weather_code;
  const codeToday = d.weather_code[0];
  const uv = d.uv_index_max ? (d.uv_index_max[0] || 0) : 0;

  const M = (emoji, title, text) => ({ emoji, title, text });

  if (THUNDER.includes(code) || THUNDER.includes(codeToday))
    return M('⛈️', L('Gewitter-Tag', 'Thunderstorm day'), L('Plane deine Aktivitäten heute lieber drinnen.', 'Better plan your activities indoors today.'));
  if (SNOW.includes(code) || SNOW.includes(codeToday))
    return M('⛄', L('Es schneit!', 'It’s snowing!'), L('Warm einpacken – und vielleicht ist ja Zeit für einen Schneemann.', 'Wrap up warm – maybe time for a snowman.'));
  if (gust >= 70)
    return M('💨', L('Stürmischer Tag', 'Stormy day'), L('Sichere lose Gegenstände und halt draußen den Hut fest.', 'Secure loose objects and hold on to your hat outside.'));
  if (feelsMax >= 30)
    return M('🥵', L('Hitzetag', 'Heat day'), L('Viel trinken, Schatten suchen und mittags langsam machen.', 'Drink plenty, seek shade and take it slow at midday.'));
  if (tmin <= 0)
    return M('❄️', L('Frostige Nacht', 'Frosty night'), L(`Bis ${Math.round(tmin)}° heute Nacht – Pflanzen und Auto vorbereiten.`, `Down to ${Math.round(tmin)}° tonight – prep plants and your car.`));
  // Rainbow: sun + showers around
  if (CLEARISH.includes(code) && (SHOWERS.includes(codeToday) || pop >= 40))
    return M('🌈', L('Regenbogen-Wetter', 'Rainbow weather'), L('Sonne und Schauer zugleich – halt die Augen (und die Kamera) offen.', 'Sun and showers together – keep your eyes (and camera) open.'));
  // Grill / perfect outdoor day
  if (feelsMax >= 19 && feelsMax <= 30 && pop < 30 && gust < 40 && (CLEARISH.includes(code) || CLEARISH.includes(codeToday)))
    return M('🔥', L('Grillwetter!', 'Barbecue weather!'), L('Warm, trocken und windarm – perfekt für draußen.', 'Warm, dry and calm – perfect for the outdoors.'));
  // Golden hour photo tip on clear-ish evenings
  const ss = parseLocal(d.sunset ? d.sunset[0] : null);
  if (ss && (CLEARISH.includes(code) || CLEARISH.includes(codeToday))) {
    // Latitude-aware golden window, kept in the naive wall-clock space so the
    // time never gets double-shifted by the viewer's timezone offset.
    const { golden: gMin } = goldenBlueMinutes(data.place && data.place.lat);
    const golden = shiftWall(d.sunset[0], -gMin);
    return M('📸', L('Goldene Stunde', 'Golden hour'), L(`Bestes Fotolicht ab etwa ${formatTime(golden)} bis Sonnenuntergang ${formatTime(d.sunset[0])}.`, `Best photo light from about ${formatTime(golden)} to sunset ${formatTime(d.sunset[0])}.`));
  }
  if (uv >= 8)
    return M('🔆', L('Starke Sonne', 'Strong sun'), L('Sehr hohe UV-Belastung – guten Sonnenschutz nicht vergessen.', 'Very high UV – don’t forget good sun protection.'));
  if (pop >= 60)
    return M('☔', L('Regentag', 'Rainy day'), L('Nimm Schirm oder Regenjacke mit – heute wird’s nass.', 'Take an umbrella or rain jacket – it’ll be wet today.'));
  return M('🍃', L('Ruhiger Wettertag', 'Calm weather day'), L('Nichts Wildes am Himmel – ein guter Tag, wie er kommt.', 'Nothing wild in the sky – a good day as it comes.'));
}
