// ui.js — renders all weather cards into the DOM

import { t, getLang } from './i18n.js';
import { describe, weatherSVG } from './weathercodes.js';
import { buildClothingAdvice } from './advice.js';
import { buildMoment } from './moment.js';
import { foxSVG } from './mascot.js';
import { mountRadar } from './radar.js';
import {
  loadJournal, addJournalEntry, removeJournalEntry, clearJournal, exportJournal,
  loadProfiles, addProfile, removeProfile, getActiveProfile, setActiveProfile,
} from './store.js';
import { SYMPTOMS, symptomLabel, symptomEmoji, buildInsights, extraInsights, personalRisk } from './journal.js';
import {
  tempStr, num, windDir, windUnitLabel, formatHour, formatTime, formatWhen, dayLabel,
  uvLevel, aqiLevel, pollenLevel, moonPhase, daylightStr, placeLabel, placeSub,
  setPlaceTz, parseLocal, placeNowMs, shortDate, isWeekend, tempUnitLabel,
} from './format.js';
import { sunsetOutlook } from './skyshow.js';

const $ = (sel) => document.querySelector(sel);

// Small share button (↗) for a card title — shares that view as an image.
function shareBtn(kind) {
  return `<button class="card-share" data-share="${kind}" title="${t('share')}" aria-label="${t('share')}">↗</button>`;
}

export function renderAll(data, settings) {
  const c = data.forecast.current;
  setPlaceTz(data.forecast.utc_offset_seconds);
  renderHeader(data.place);
  renderAlerts(data, settings);
  renderHero(data, settings);
  renderAsk(data, settings);
  renderMoment(data, settings);
  renderClothing(data, settings);
  renderRadar(data);
  renderNowcast(data);
  renderActivity(data, settings);
  renderActivities(data, settings);
  renderDetails(data, settings);
  renderSixHour(data, settings);
  renderHourly(data, settings);
  renderAir(data);
  renderBiowetter(data, settings);
  renderJournal(data, settings);
  renderSunMoon(data);
  renderDaily(data, settings);
  $('#updated').textContent = `${t('updated')} ${formatTime(new Date(data.fetchedAt).toISOString())}`;
  document.querySelector('.app').classList.add('has-data');
}

function renderHeader(place) {
  $('#placeName').textContent = placeLabel(place);
  $('#placeSub').textContent = placeSub(place);
}

// ---- Current conditions ------------------------------------------------------
function renderHero(data, s) {
  const c = data.forecast.current;
  const day = data.forecast.daily;
  const isDay = c.is_day === 1;
  const hi = day.temperature_2m_max[0];
  const lo = day.temperature_2m_min[0];
  $('#heroIcon').innerHTML = weatherSVG(c.weather_code, isDay);
  $('#heroTemp').textContent = tempStr(c.temperature_2m);
  $('#heroDesc').textContent = describe(c.weather_code, getLang());
  $('#heroFeels').textContent = `${t('feelsLike')} ${tempStr(c.apparent_temperature)}`;
  $('#heroHiLo').innerHTML =
    `<span class="hi">↑ ${tempStr(hi)}</span><span class="lo">↓ ${tempStr(lo)}</span>`;
}

// ---- Quick answers ("Frag Wetterfux") ---------------------------------------
function renderAsk(data, s) {
  const box = $('#ask');
  const en = getLang() === 'en';
  const u = s.units;
  const c = data.forecast.current;
  const d = data.forecast.daily;
  const precipUnit = u.temp === 'F' ? 'inch' : 'mm';
  const pop = d.precipitation_probability_max ? (d.precipitation_probability_max[0] || 0) : 0;
  const psum = toMmU(d.precipitation_sum ? (d.precipitation_sum[0] || 0) : 0, precipUnit);
  const RAIN = [51, 53, 55, 61, 63, 65, 80, 81, 82];
  const umbrella = (pop >= 50 && psum >= 0.5) || psum >= 2 || RAIN.includes(c.weather_code) || RAIN.includes(d.weather_code[0]);
  const jacket = toC(c.apparent_temperature, u.temp) < 14;
  const uv = d.uv_index_max ? (d.uv_index_max[0] || 0) : 0;
  const cream = uv >= 3;
  const tmax = toC(d.temperature_2m_max[0], u.temp);
  // frost potential for tomorrow morning (5–8h) → only then is "scrape" relevant
  const tomAm = dayHoursOf(data.forecast.hourly, u, 1, false).filter((x) => x.hour >= 5 && x.hour <= 8);
  const tomAmMin = tomAm.length ? Math.min(...tomAm.map((x) => x.feels)) : null;
  const frostRelevant = tomAmMin != null && tomAmMin <= 3; // cold season only
  const warm = tmax >= 24;

  // Always: umbrella + jacket. Then fill with seasonal/contextual answers.
  const pills = [
    { e: '☂️', q: en ? 'Umbrella?' : 'Schirm?', a: umbrella },
    { e: '🧥', q: en ? 'Jacket?' : 'Jacke?', a: jacket },
  ];
  if (frostRelevant) pills.push({ e: '❄️', q: en ? 'Scrape (early)?' : 'Kratzen früh?', a: tomAmMin <= 0 });
  if (warm) pills.push({ e: '🏊', q: en ? 'Swim?' : 'Baden?', a: tmax >= 27 && pop < 40 });
  if (cream) pills.push({ e: '🧴', q: en ? 'Sunscreen?' : 'Creme?', a: true });
  if (warm && pills.length < 4) pills.push({ e: '🍦', q: en ? 'Ice cream?' : 'Eiswetter?', a: tmax >= 25 });
  if (!frostRelevant && !warm && pills.length < 4) pills.push({ e: '😎', q: en ? 'Sunglasses?' : 'Sonnenbrille?', a: uv >= 3 });
  const shown = pills.slice(0, 4);
  box.hidden = false;
  box.innerHTML = `<div class="card-title">🦊 ${en ? 'Ask Wetterfux' : 'Frag Wetterfux'}</div>
    <div class="ask-row">${shown.map((p) => `<div class="ask-pill ${p.a ? 'yes' : 'no'}">
      <span class="ask-e" aria-hidden="true">${p.e}</span><span class="ask-q">${p.q}</span>
      <b>${p.a ? (en ? 'Yes' : 'Ja') : (en ? 'No' : 'Nein')}</b></div>`).join('')}</div>`;
}

// ---- Weather moment of the day ----------------------------------------------
function renderMoment(data, s) {
  const box = $('#moment');
  const m = buildMoment(data, s);
  if (!m) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="mom-emoji" aria-hidden="true">${m.emoji}</div>
    <div class="mom-text"><b>${m.title}</b><span>${m.text}</span></div>`;
}

// ---- Clothing tip for today --------------------------------------------------
function renderClothing(data, s) {
  const box = $('#clothing');
  const a = buildClothingAdvice(data, s);
  const chips = a.items.map((it) =>
    `<span class="cloth-item"><span class="cloth-emoji">${it.emoji}</span>${it.text}</span>`).join('');
  const slots = a.slots.length ? `<div class="cloth-slots">${a.slots.map((sl) => `
    <div class="cloth-slot">
      <span class="cs-label">${sl.label}</span>
      <span class="cs-ic">${weatherSVG(sl.code, true)}</span>
      <span class="cs-temp">${tempStr(sl.temp)}</span>
    </div>`).join('')}</div>` : '';
  const umbrella = `<span class="cloth-umb ${a.umbrella ? 'yes' : 'no'}">☂️ ${a.umbrella
    ? (getLang() === 'en' ? 'Umbrella: yes' : 'Schirm: ja')
    : (getLang() === 'en' ? 'Umbrella: no' : 'Schirm: nein')}</span>`;
  const w = a.why;
  const whyText = `${t('feelsLike')} <b>${w.feels}${w.tempUnit}</b> · ${t('windGust')} <b>${w.gust} ${w.windUnit}</b> · ${t('precipProb')} <b>${w.pop}%</b> · UV <b>${w.uv}</b>`;
  box.innerHTML = `
    <div class="card-title has-share">🧥 ${t('clothing')}${shareBtn('clothing')}</div>
    <div class="cloth-head">
      <div class="cloth-fox" aria-hidden="true">${foxSVG(a.mascot)}</div>
      <div class="cloth-headtext">
        <span class="cloth-title">${a.title}</span>
        <span class="cloth-summary">${a.summary}</span>
      </div>
    </div>
    <div class="cloth-meta">${umbrella}<button class="cloth-why-btn" aria-expanded="false">${t('why')}</button></div>
    <div class="cloth-why" hidden>${whyText}</div>
    ${slots}
    <div class="cloth-items">${chips}</div>
    ${a.note ? `<div class="cloth-note">💡 ${a.note}</div>` : ''}`;
  const wb = box.querySelector('.cloth-why-btn');
  if (wb) wb.addEventListener('click', () => {
    const p = box.querySelector('.cloth-why');
    const open = !p.hidden;
    p.hidden = open; wb.setAttribute('aria-expanded', String(!open));
  });
}

// ---- Live rain radar (Leaflet + RainViewer) ---------------------------------
function renderRadar(data) {
  const title = $('#radarTitle'); if (title) title.textContent = t('radar');
  const hint = $('#radarHint'); if (hint) hint.textContent = t('radarHint');
  mountRadar(data.place);
}

// ---- Best time today (activity windows) -------------------------------------
function renderActivity(data, s) {
  const box = $('#activity');
  const { hours, tomorrow } = pickActivityDay(data.forecast.hourly, s.units);
  if (hours.length < 2) { box.hidden = true; return; }
  const pre = tomorrow ? (getLang() === 'en' ? 'tomorrow ' : 'morgen ') : '';

  const acts = [
    { icon: '🌳', label: t('actOutdoor'), fn: outdoorScore },
    { icon: '🏃', label: t('actSport'), fn: sportScore },
    { icon: '🧺', label: t('actLaundry'), fn: laundryScore },
  ];
  const rows = acts.map((a) => {
    const win = bestWindow(hours, a.fn);
    let val, cls;
    if (!win) { val = t('actNone'); cls = 'no'; }
    else if (win.allDay) { val = `${pre}${t('actAllDay')}`; cls = 'ok'; }
    else { val = `${pre}${win.from}–${win.to}${getLang() === 'en' ? '' : ' Uhr'}`; cls = 'ok'; }
    return `<div class="act-row">
      <span class="act-ic" aria-hidden="true">${a.icon}</span>
      <span class="act-main"><span class="act-label">${a.label}</span>${activitySpark(hours, a.fn)}</span>
      <span class="act-win ${cls}">${val}</span>
    </div>`;
  }).join('');
  const title = tomorrow
    ? (getLang() === 'en' ? 'Best time tomorrow' : 'Beste Zeit morgen')
    : t('activityTitle');
  box.hidden = false;
  box.innerHTML = `<div class="card-title">🕒 ${title}</div><div class="acts">${rows}</div>`;
}
function activitySpark(hours, fn) {
  const bars = hours.map((h) => {
    const sc = Math.max(0, Math.min(100, fn(h)));
    const lvl = sc >= 70 ? 'g' : sc >= 45 ? 'm' : 'b';
    return `<i class="sp ${lvl}" style="height:${(4 + sc * 0.16).toFixed(1)}px"></i>`;
  }).join('');
  return `<span class="act-spark" aria-hidden="true">${bars}</span>`;
}

// Build hourly rows for a given day offset (0 = today, 1 = tomorrow).
// fromNow limits today to the hours still ahead.
function dayHoursOf(h, units, dayOffset, fromNow) {
  const out = [];
  if (!h || !h.time) return out;
  const now = placeNowMs();
  const target = new Date(now + dayOffset * 86400000);
  const td = target.getUTCDate(), tm = target.getUTCMonth();
  const precipUnit = units.temp === 'F' ? 'inch' : 'mm';
  for (let i = 0; i < h.time.length; i++) {
    const dt = parseLocal(h.time[i]);
    if (!dt) continue;
    if (dt.getUTCDate() !== td || dt.getUTCMonth() !== tm) continue;
    if (fromNow && dt.getTime() < now - 1800000) continue;
    out.push({
      hour: dt.getUTCHours(),
      feels: toC(h.apparent_temperature ? h.apparent_temperature[i] : h.temperature_2m[i], units.temp),
      prob: h.precipitation_probability ? (h.precipitation_probability[i] || 0) : 0,
      precip: toMmU(h.precipitation ? (h.precipitation[i] || 0) : 0, precipUnit),
      wind: toKmhU(h.wind_speed_10m ? h.wind_speed_10m[i] : 0, units.wind),
      gust: toKmhU(h.wind_gusts_10m ? h.wind_gusts_10m[i] : 0, units.wind),
      hum: h.relative_humidity_2m ? h.relative_humidity_2m[i] : 60,
      cloud: h.cloud_cover ? h.cloud_cover[i] : 50,
      uv: h.uv_index ? (h.uv_index[i] || 0) : 0,
      isDay: h.is_day ? h.is_day[i] === 1 : true,
    });
  }
  return out;
}
// Pick today's remaining hours, or tomorrow if the day is essentially over
function pickActivityDay(h, units) {
  const today = dayHoursOf(h, units, 0, true);
  if (today.filter((x) => x.isDay).length >= 2) return { hours: today, tomorrow: false };
  const tom = dayHoursOf(h, units, 1, false);
  if (tom.filter((x) => x.isDay).length >= 2) return { hours: tom, tomorrow: true };
  return { hours: today, tomorrow: false };
}
// Rain penalty: probability matters only when meaningful amounts are expected
function rainPenalty(x) {
  if (x.prob >= 50 && x.precip > 0.2) return Math.min(45, x.prob * 0.5 + x.precip * 15);
  if (x.precip > 0.5) return 30;
  return 0;
}
function outdoorScore(x) {
  if (!x.isDay) return 0;
  let s = 100;
  s -= Math.abs(x.feels - 20) * 3.2;
  s -= rainPenalty(x);
  s -= Math.max(0, x.gust - 30) * 0.9;   // gusts noticeable above ~30 km/h
  if (x.uv >= 8) s -= 15; else if (x.uv >= 6) s -= 7;
  return s;
}
function sportScore(x) {
  if (!x.isDay) return 0;
  let s = 100;
  s -= Math.abs(x.feels - 14) * 3.2;
  if (x.precip > 0.1 || x.prob >= 60) s -= 35;
  s -= Math.max(0, x.gust - 25) * 1.0;
  if (x.feels >= 26) s -= 15;
  return s;
}
function laundryScore(x) {
  if (!x.isDay) return 0;
  if (x.precip > 0.05 || x.prob > 30) return 0; // must stay dry
  let s = 55;
  s += Math.max(0, 100 - x.cloud) * 0.25;       // sunshine dries best
  s += Math.min(20, x.wind);                     // a breeze helps
  s -= Math.max(0, x.hum - 55) * 1.1;            // humid air dries poorly
  s -= Math.max(0, 12 - x.feels) * 2;            // warmth helps
  return s;
}
// Choose the window with the highest total score (not merely the longest)
function bestWindow(hours, scoreFn) {
  const scores = hours.map(scoreFn);
  const peak = Math.max(...scores);
  if (peak < 45) return null;
  const thr = Math.max(50, peak - 20);
  let best = null, start = -1;
  for (let i = 0; i <= hours.length; i++) {
    const ok = i < hours.length && scores[i] >= thr;
    if (ok) { if (start < 0) start = i; }
    else if (start >= 0) {
      let sum = 0; for (let k = start; k <= i - 1; k++) sum += scores[k];
      const seg = { start, end: i - 1, sum };
      if (!best || seg.sum > best.sum) best = seg;
      start = -1;
    }
  }
  if (!best) return null;
  const daylight = hours.filter((h) => h.isDay).length;
  const allDay = (best.end - best.start + 1) >= Math.max(6, daylight - 1);
  return { from: pad2(hours[best.start].hour), to: pad2((hours[best.end].hour + 1) % 24), allDay };
}
function pad2(n) { return String(n).padStart(2, '0'); }

// ---- Activity / season check ("Heute gut für …") ----------------------------
function renderActivities(data, s) {
  const box = $('#activities');
  const { hours, tomorrow } = pickActivityDay(data.forecast.hourly, s.units);
  if (hours.length < 2) { box.hidden = true; return; }
  const d = data.forecast.daily;
  const u = s.units;
  const en = getLang() === 'en';
  const maxFeels = Math.max(...hours.map((h) => h.feels));
  const SNOW = [71, 73, 75, 77, 85, 86];
  const snowy = [data.forecast.current.weather_code, d.weather_code[0]].some((c) => SNOW.includes(c));
  const tmin = toC(d.temperature_2m_min[0], u.temp);

  const defs = [
    { emoji: '🔥', label: en ? 'Barbecue' : 'Grillen', fn: grillScore, gate: maxFeels >= 16, note: en ? 'too cool' : 'zu kühl' },
    { emoji: '🚴', label: en ? 'Cycling' : 'Radfahren', fn: bikeScore, gate: true },
    { emoji: '🏊', label: en ? 'Swimming' : 'Baden', fn: swimScore, gate: maxFeels >= 22, note: en ? 'too cool' : 'zu kühl' },
    { emoji: '⛷️', label: en ? 'Snow fun' : 'Schnee', fn: skiScore, gate: snowy, note: en ? 'no snow' : 'kein Schnee' },
    { emoji: '🌱', label: en ? 'Gardening' : 'Garten', fn: gardenScore, gate: tmin > -3 },
    { emoji: '📸', label: en ? 'Photos' : 'Fotografieren', fn: photoScore, gate: true },
  ];

  const tiles = defs.map((a) => {
    if (!a.gate) return activityTile(a.emoji, a.label, 'na', a.note || '—', '');
    const peak = Math.max(...hours.map(a.fn));
    const verdict = peak >= 68 ? 'good' : peak >= 45 ? 'ok' : 'bad';
    const vtext = verdict === 'good' ? (en ? 'great' : 'top') : verdict === 'ok' ? 'okay' : (en ? 'nope' : 'eher nicht');
    const win = bestWindow(hours, a.fn);
    const pre = tomorrow ? (en ? 'tmr ' : 'morgen ') : '';
    const wtxt = verdict === 'bad' ? '' : (win ? (win.allDay ? (en ? 'all day' : 'ganztags') : `${pre}${win.from}–${win.to}`) : '');
    return activityTile(a.emoji, a.label, verdict, vtext, wtxt);
  }).join('');

  box.hidden = false;
  box.innerHTML = `<div class="card-title">✅ ${en ? 'Good today for …' : 'Heute gut für …'}</div><div class="act-grid">${tiles}</div>`;
}
function activityTile(emoji, label, verdict, vtext, win) {
  const dot = verdict === 'good' ? '🟢' : verdict === 'ok' ? '🟡' : verdict === 'na' ? '⚪' : '🔴';
  return `<div class="ag-tile v-${verdict}">
    <span class="ag-emoji" aria-hidden="true">${emoji}</span>
    <span class="ag-label">${label}</span>
    <span class="ag-verdict">${dot} ${vtext}</span>
    ${win ? `<span class="ag-win">${win}</span>` : ''}
  </div>`;
}
function grillScore(x) {
  if (x.hour < 11 || x.hour > 22) return 0;
  let s = 100; s -= Math.abs(x.feels - 24) * 2.6;
  if (x.precip > 0.05 || x.prob >= 45) s -= 60;
  s -= Math.max(0, x.gust - 30) * 1.3; return s;
}
function bikeScore(x) {
  if (!x.isDay) return 0;
  let s = 100; s -= Math.abs(x.feels - 16) * 3; s -= rainPenalty(x); s -= Math.max(0, x.gust - 40) * 1.3; return s;
}
function swimScore(x) {
  if (!x.isDay) return 0;
  let s = 100; s -= Math.abs(x.feels - 28) * 3.4;
  if (x.precip > 0.05 || x.prob >= 40) s -= 45;
  s -= x.cloud * 0.15; s -= Math.max(0, x.gust - 25) * 1.2; return s;
}
function skiScore(x) {
  let s = 100; s -= Math.abs(x.feels - (-3)) * 2.2; s -= Math.max(0, x.gust - 45) * 1.2; return s;
}
function gardenScore(x) {
  if (!x.isDay) return 0;
  let s = 100; s -= Math.abs(x.feels - 18) * 2.6;
  if (x.precip > 1) s -= 30; if (x.feels < 2) s -= 40; s -= Math.max(0, x.gust - 45); return s;
}
function photoScore(x) {
  if (!x.isDay) return 0;
  let s = 100 - x.cloud * 0.7; s -= rainPenalty(x); return s;
}

// ---- Bio-weather & health ----------------------------------------------------
const BIO = { NONE: 0, LOW: 1, MOD: 2, HIGH: 3 };
const bioCls = (l) => (l >= 3 ? 'lvl-poor' : l >= 2 ? 'lvl-moderate' : l >= 1 ? 'lvl-good' : 'lvl-none');
const bioLbl = (l) => (l >= 3 ? t('highLvl') : l >= 2 ? t('moderateLvl') : t('lowLvl'));

function renderBiowetter(data, s) {
  const box = $('#biowetter');
  const c = data.forecast.current;
  const h = data.forecast.hourly;
  const d = data.forecast.daily;
  const air = data.air;
  const idx = currentHourIndex(h);
  const en = getLang() === 'en';
  const { LOW, MOD, HIGH } = BIO;

  // thresholds always compared in °C (API values follow the chosen unit)
  const C = (v) => (v == null ? null : toC(v, s.units.temp));
  const feelsC = C(c.apparent_temperature);
  const tmaxC = C(d.temperature_2m_max ? d.temperature_2m_max[0] : null);
  const tminC = C(d.temperature_2m_min ? d.temperature_2m_min[0] : null);
  const dewC = h.dew_point_2m ? C(h.dew_point_2m[idx]) : null;
  const rh = c.relative_humidity_2m;
  const windKmh = toKmhU(c.wind_speed_10m, s.units.wind);
  const gustKmh = toKmhU(c.wind_gusts_10m, s.units.wind);
  const cloud = c.cloud_cover != null ? c.cloud_cover : 100;
  const swing = (tmaxC != null && tminC != null) ? (tmaxC - tminC) : null;
  const d3 = (h.pressure_msl && idx >= 3) ? h.pressure_msl[idx] - h.pressure_msl[idx - 3] : null;
  const d12 = (h.pressure_msl && idx >= 12) ? h.pressure_msl[idx] - h.pressure_msl[idx - 12] : null;

  const factors = [];
  const F = (o) => factors.push(o);

  // 1 pressure tendency — always shown as context, no badge/detail
  let trend = t('trendSteady'), tIcon = '→';
  if (d3 != null) { if (d3 > 1.5) { trend = t('trendRising'); tIcon = '↗'; } else if (d3 < -1.5) { trend = t('trendFalling'); tIcon = '↘'; } }
  F({ key: 'pressure', show: true, level: 0, icon: '🌡️', label: t('pressureTrend'), valueHtml: `${tIcon} ${trend}`, sub: d3 != null ? `${num(d3, 1)} hPa/3h` : '' });

  // 2 headache / migraine stimulus
  {
    const a3 = d3 != null ? Math.abs(d3) : 0, a12 = d12 != null ? Math.abs(d12) : 0;
    let lvl = LOW;
    if (a3 >= 3.5 || a12 >= 7 || (d12 != null && d12 <= -6)) lvl = HIGH;
    else if (a3 >= 2 || a12 >= 4) lvl = MOD;
    F({ key: 'migraine', show: d3 != null, level: lvl, icon: '🤕', label: t('migraine'), badge: lvl, hint: t('bioMig_hint'), tip: t('bioMig_tip') });
  }
  // 3 circulation
  if (feelsC != null) {
    let lvl = LOW;
    if (feelsC >= 32) lvl = HIGH; else if (feelsC >= 28 || feelsC <= -8 || (swing != null && swing >= 13)) lvl = MOD;
    F({ key: 'circulation', show: true, level: lvl, icon: '❤️', label: t('circulation'), badge: lvl, hint: t('bioCirc_hint'), tip: t('bioCirc_tip') });
  }
  // 4 mugginess
  if (dewC != null && dewC >= 13) {
    const lvl = dewC >= 18 ? HIGH : dewC >= 15 ? MOD : LOW;
    F({ key: 'muggy', show: true, level: lvl, icon: '💦', label: t('muggy'), sub: `${t('dewPoint')} ${tempStr(h.dew_point_2m[idx])}`, badge: lvl, hint: t('bioMug_hint'), tip: t('bioMug_tip') });
  }
  // 5 cold stimulus (conditional)
  if (feelsC != null && feelsC >= 1 && feelsC <= 10 && windKmh >= 15 && rh >= 75) {
    const lvl = (feelsC <= 2 && windKmh >= 30) ? HIGH : MOD;
    F({ key: 'cold', show: true, level: lvl, icon: '🤧', label: t('coldRisk'), badge: lvl, hint: t('bioCold_hint'), tip: t('bioCold_tip') });
  }
  // 6 day–night temperature swing (conditional)
  if (swing != null && swing >= 10) {
    F({ key: 'swing', show: true, level: swing >= 14 ? HIGH : MOD, icon: '📈', label: t('bioSwingLbl'), sub: `${Math.round(swing)}°`, badge: swing >= 14 ? HIGH : MOD, hint: t('bioSwing_hint'), tip: t('bioSwing_tip') });
  }
  // 7 wind / foehn (conditional)
  if (gustKmh >= 40) {
    const lvl = gustKmh >= 60 ? HIGH : MOD;
    const foehn = (rh < 40 && feelsC != null && feelsC >= 18 && windKmh >= 25 && cloud < 40);
    F({ key: 'wind', show: true, level: lvl, icon: '💨', label: foehn ? t('bioFoehnLbl') : t('bioWindLbl'), sub: `${Math.round(gustKmh)} ${windUnitLabel(s.units.wind)}`, badge: lvl, hint: t('bioWind_hint'), tip: t('bioWind_tip') });
  }
  // 8 UV
  {
    const uvv = h.uv_index && h.uv_index[idx] != null ? h.uv_index[idx] : (d.uv_index_max ? (d.uv_index_max[0] || 0) : 0);
    if (uvv >= 3) {
      const ul = uvLevel(uvv);
      F({ key: 'uv', show: true, level: uvv >= 8 ? HIGH : uvv >= 6 ? MOD : LOW, icon: '🔆', label: t('uv'), sub: `${num(uvv)}`, valueHtml: `<span class="badge ${ul.cls}">${ul.label}</span>`, hint: t('bioUv_hint'), tip: ul.advice });
    }
  }
  // 9 air quality for sensitive groups (conditional)
  if (air && air.current && air.current.european_aqi != null && air.current.european_aqi > 40) {
    const al = aqiLevel(air.current.european_aqi);
    if (al) F({ key: 'air', show: true, level: air.current.european_aqi > 80 ? HIGH : MOD, icon: '🍃', label: t('airQuality'), sub: `AQI ${Math.round(air.current.european_aqi)}`, valueHtml: `<span class="badge ${al.cls}">${al.label}</span>`, hint: t('bioAir_hint'), tip: t('bioAir_tip') });
  }
  // 10 pollen / allergy (conditional)
  if (air && air.hourly) {
    const ph = air.hourly;
    const arts = [['grass', ph.grass_pollen], ['birch', ph.birch_pollen], ['alder', ph.alder_pollen], ['ragweed', ph.ragweed_pollen], ['mugwort', ph.mugwort_pollen], ['olive', ph.olive_pollen]];
    let best = null;
    for (const [key, arr] of arts) {
      if (!arr) continue; const v = firstNum(arr); if (v == null) continue;
      const pl = pollenLevel(v); const rank = pl.cls === 'lvl-poor' ? 3 : pl.cls === 'lvl-moderate' ? 2 : pl.cls === 'lvl-good' ? 1 : 0;
      if (!best || rank > best.rank) best = { key, pl, rank };
    }
    if (best && best.rank >= 2) F({ key: 'pollen', show: true, level: best.rank >= 3 ? HIGH : MOD, icon: '🌸', label: t('pollen'), sub: t(best.key), valueHtml: `<span class="badge ${best.pl.cls}">${best.pl.label}</span>`, hint: t('bioPollen_hint'), tip: t('bioPollen_tip') });
  }
  // 11 joints / rheumatism (conditional)
  if (rh != null && feelsC != null) {
    let lvl = 0;
    if (rh >= 85 && feelsC <= 10 && ((d3 != null && d3 <= -2) || (d12 != null && d12 <= -5))) lvl = HIGH;
    else if (rh >= 80 && feelsC <= 14 && ((d3 != null && d3 <= -1) || (d12 != null && d12 <= -3))) lvl = MOD;
    if (lvl >= MOD) F({ key: 'joints', show: true, level: lvl, icon: '🦴', label: t('bioJointLbl'), badge: lvl, hint: t('bioJoint_hint'), tip: t('bioJoint_tip') });
  }
  // 12 airways / asthma (conditional)
  {
    const a = (air && air.current) ? air.current : {};
    let lvl = 0;
    if ((a.ozone >= 180) || (a.pm2_5 >= 50) || (a.pm10 >= 100) || (feelsC != null && feelsC <= -5 && rh < 45)) lvl = HIGH;
    else if ((a.ozone >= 120) || (a.pm2_5 >= 25) || (a.pm10 >= 50) || (feelsC != null && feelsC <= 0 && rh < 50)) lvl = MOD;
    if (lvl >= MOD) F({ key: 'lungs', show: true, level: lvl, icon: '🫁', label: t('bioLungLbl'), badge: lvl, hint: t('bioLung_hint'), tip: t('bioLung_tip') });
  }
  // 13 sleep / tropical night (conditional)
  if (tminC != null && tminC >= 18) {
    F({ key: 'sleep', show: true, level: tminC >= 20 ? HIGH : MOD, icon: '🌙', label: t('bioSleepLbl'), sub: `${en ? 'low' : 'Tief'} ${tempStr(d.temperature_2m_min[0])}`, badge: tminC >= 20 ? HIGH : MOD, hint: t('bioSleep_hint'), tip: t('bioSleep_tip') });
  }

  const items = factors.filter((f) => f.show).sort((a, b) => b.level - a.level);
  const active = items.filter((f) => f.level >= MOD && f.key !== 'pressure');
  const hasJournal = loadJournal().length > 0;
  const render = (f) => bioItem({
    icon: f.icon, label: f.label, sub: f.sub,
    badgeCls: f.badge != null ? bioCls(f.badge) : '', badgeLbl: f.badge != null ? bioLbl(f.badge) : '',
    valueHtml: f.valueHtml, hint: f.hint, tip: f.tip,
  });

  box.hidden = false;
  box.innerHTML = `<div class="card-title">🧪 ${t('biowetter')}</div>
    <p class="bio-sub">${t('bioSub')}</p>
    <div class="bio">${active.length
      ? items.map(render).join('')
      : render(factors[0]) + `<div class="bio-quiet">🍃 ${t('bioQuiet')}</div>`}</div>
    ${active.length && hasJournal ? `<p class="bio-journal">📓 ${t('bioJournalPrompt')}</p>` : ''}
    <p class="bio-disc">🔒 ${t('bioDisclaimer')}</p>`;
}

// One bio factor as an expandable row: summary = icon/label/value, detail = hint + tip.
function bioItem({ icon, label, sub, badgeCls, badgeLbl, valueHtml, hint, tip }) {
  const val = valueHtml || (badgeLbl ? `<span class="badge ${badgeCls}">${badgeLbl}</span>` : '');
  const hasDetail = !!(hint || tip);
  const detail = hasDetail ? `<div class="bio-detail">
      ${hint ? `<p class="bio-hint">${hint}</p>` : ''}
      ${tip ? `<p class="bio-tip"><b>${t('bioTipLbl')}:</b> ${tip}</p>` : ''}
    </div>` : '';
  return `<details class="bio-item${hasDetail ? '' : ' bare'}">
    <summary class="bio-sum">
      <span class="bio-ic">${icon}</span>
      <span class="bio-label">${label}${sub ? ` <i>${sub}</i>` : ''}</span>
      <span class="bio-val">${val}</span>
      ${hasDetail ? '<span class="bio-chev" aria-hidden="true">⌄</span>' : ''}
    </summary>${detail}
  </details>`;
}

// ---- Symptom journal (personal bio-weather) ---------------------------------
function journalSnapshot(data, s) {
  const h = data.forecast.hourly;
  const d = data.forecast.daily;
  const idx = currentHourIndex(h);
  const c = data.forecast.current;
  const unit = s ? s.units.temp : 'C';
  const p = h.pressure_msl ? h.pressure_msl[idx] : (c.pressure_msl || null);
  const p12 = (h.pressure_msl && idx >= 12) ? +(h.pressure_msl[idx] - h.pressure_msl[idx - 12]).toFixed(1) : null;
  const p3 = (h.pressure_msl && idx >= 3) ? +(h.pressure_msl[idx] - h.pressure_msl[idx - 3]).toFixed(1) : null;
  const tC = toC(c.temperature_2m, unit);
  const dew = dewC(tC, c.relative_humidity_2m || 60);
  const swing = (d.temperature_2m_max && d.temperature_2m_min)
    ? +(toC(d.temperature_2m_max[0], unit) - toC(d.temperature_2m_min[0], unit)).toFixed(1) : null;
  return {
    pressure: p != null ? Math.round(p) : null, p12, p3,
    temp: Math.round(c.temperature_2m), hum: c.relative_humidity_2m, code: c.weather_code,
    dew: +dew.toFixed(1), muggy: dew >= 16, swing,
  };
}
function dewC(tC, rh) {
  const a = 17.27, b = 237.7;
  const g = (a * tC) / (b + tC) + Math.log(Math.max(1, rh) / 100);
  return (b * g) / (a - g);
}
function journalChart(entries) {
  const es = [...entries].sort((a, b) => a.ts - b.ts).slice(-14);
  if (es.length < 2) return '';
  const cw = 22, h = 64;
  const bars = es.map((e, i) => {
    const bh = 8 + e.intensity * 9;
    const x = i * cw + 5, y = h - bh;
    const p = e.wx && typeof e.wx.p12 === 'number' ? e.wx.p12 : 0;
    const col = p < -2 ? '#6aa8ff' : p > 2 ? '#ff9a4d' : '#9aa6b8';
    return `<rect x="${x}" y="${y}" width="12" height="${bh}" rx="2" fill="${col}"/>`;
  }).join('');
  const w = es.length * cw;
  return `<svg class="jr-chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${bars}</svg>`;
}
function renderJournal(data, s) {
  const box = $('#journal');
  if (!box) return;
  const en = getLang() === 'en';
  const profiles = loadProfiles();
  const active = getActiveProfile();
  const all = loadJournal();
  const entries = all.filter((e) => (e.profileId || 'me') === active);
  const snap = journalSnapshot(data, s);
  const ins = buildInsights(entries, en);
  const extra = extraInsights(entries, en);
  const risk = personalRisk(entries, snap, en);
  const insightLines = [ins ? ins.text : null, ...extra].filter(Boolean);

  const profChips = profiles.map((p) =>
    `<button class="jr-prof${p.id === active ? ' on' : ''}" data-pid="${p.id}">${escapeHtml(p.name)}${p.id !== 'me' && p.id === active ? ` <span class="jr-prof-x" data-del-pid="${p.id}">×</span>` : ''}</button>`).join('')
    + `<button class="jr-prof jr-prof-add" aria-label="${en ? 'add person' : 'Person hinzufügen'}">＋</button>`;

  const symBtns = SYMPTOMS.map((sy) => `<button class="jr-sym" data-key="${sy.key}">${sy.emoji}<span>${en ? sy.en : sy.de}</span></button>`).join('');
  const intBtns = [1, 2, 3, 4, 5].map((n) => `<button class="jr-int" data-int="${n}">${n}</button>`).join('');
  const chart = entries.length >= 2
    ? `<div class="jr-chartwrap">${journalChart(entries)}<div class="jr-chart-legend"><span><i style="background:#6aa8ff"></i>${en ? 'falling' : 'fallend'}</span><span><i style="background:#9aa6b8"></i>${en ? 'steady' : 'gleich'}</span><span><i style="background:#ff9a4d"></i>${en ? 'rising' : 'steigend'}</span></div></div>`
    : '';
  const list = entries.slice(0, 8).map((e) => {
    const d = new Date(e.ts);
    const when = d.toLocaleDateString(en ? 'en-GB' : 'de-DE', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(en ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit' });
    const trend = e.wx && typeof e.wx.p12 === 'number' ? `${e.wx.p12 > 0 ? '↗' : e.wx.p12 < 0 ? '↘' : '→'} ${e.wx.p12} hPa` : '';
    const dots = '●'.repeat(e.intensity) + '○'.repeat(5 - e.intensity);
    return `<div class="jr-entry"><span class="jr-e-ic">${symptomEmoji(e.type)}</span>
      <span class="jr-e-main"><b>${escapeHtml(symptomLabel(e.type, en))}</b><small>${when} · ${dots}${trend ? ` · ${trend}` : ''}${e.note ? ` · ${escapeHtml(e.note)}` : ''}</small></span>
      <button class="jr-del" data-id="${e.id}" aria-label="${en ? 'delete' : 'löschen'}">×</button></div>`;
  }).join('');
  const riskCls = risk ? (risk.level === 'high' ? 'lvl-poor' : risk.level === 'mod' ? 'lvl-moderate' : 'lvl-good') : '';

  box.hidden = false;
  box.innerHTML = `<div class="card-title">🩺 ${en ? 'Symptom diary' : 'Symptom-Tagebuch'}</div>
    <div class="jr-profiles">${profChips}</div>
    ${risk ? `<div class="jr-risk"><span class="badge ${riskCls}">${en ? 'Today for you' : 'Heute für dich'}</span> ${risk.text}</div>` : ''}
    ${insightLines.length ? `<div class="jr-insight">📊 ${insightLines.join('<br>')}</div>` : ''}
    ${chart}
    <button class="jr-add-btn">➕ ${en ? 'New entry' : 'Neuer Eintrag'}</button>
    <div class="jr-form" hidden>
      <div class="jr-syms">${symBtns}</div>
      <div class="jr-ints"><span class="jr-lbl">${en ? 'Intensity' : 'Stärke'}</span>${intBtns}</div>
      <input class="jr-note" type="text" maxlength="80" placeholder="${en ? 'Note (optional)' : 'Notiz (optional)'}" />
      <div class="jr-actions"><button class="jr-cancel">${en ? 'Cancel' : 'Abbrechen'}</button><button class="jr-save" disabled>${en ? 'Save' : 'Speichern'}</button></div>
    </div>
    ${entries.length ? `<div class="jr-list">${list}</div>` : `<p class="jr-empty">${en ? 'No entries yet. Log how you feel and Wetterfux learns how your body reacts to the weather.' : 'Noch keine Einträge. Trag ein, wie du dich fühlst – Wetterfux lernt, wie dein Körper auf Wetter reagiert.'}</p>`}
    <div class="jr-tools">
      <button class="jr-export">⬇️ Export</button>
      ${all.length ? `<button class="jr-clear">🗑️ ${en ? 'Clear all' : 'Alle löschen'}</button>` : ''}
    </div>
    <p class="jr-disc">🔒 ${en ? 'Local & private · not medical advice' : 'Lokal & privat · keine medizinische Diagnose'}</p>`;

  const rerender = () => renderJournal(data, s);

  // profiles
  box.querySelectorAll('.jr-prof').forEach((b) => {
    if (b.classList.contains('jr-prof-add')) {
      b.addEventListener('click', () => {
        const name = prompt(en ? 'Name of the person' : 'Name der Person');
        if (name && name.trim()) { addProfile(name.trim()); rerender(); }
      });
    } else {
      b.addEventListener('click', (ev) => {
        if (ev.target.classList.contains('jr-prof-x')) { removeProfile(ev.target.dataset.delPid); rerender(); return; }
        setActiveProfile(b.dataset.pid); rerender();
      });
    }
  });

  // add-entry form
  let selSym = null, selInt = null;
  const form = box.querySelector('.jr-form');
  const saveBtn = box.querySelector('.jr-save');
  const refreshSave = () => { saveBtn.disabled = !(selSym && selInt); };
  box.querySelector('.jr-add-btn').addEventListener('click', () => { form.hidden = !form.hidden; });
  box.querySelector('.jr-cancel').addEventListener('click', () => { form.hidden = true; });
  box.querySelectorAll('.jr-sym').forEach((b) => b.addEventListener('click', () => {
    selSym = b.dataset.key;
    box.querySelectorAll('.jr-sym').forEach((x) => x.classList.toggle('on', x === b));
    refreshSave();
  }));
  box.querySelectorAll('.jr-int').forEach((b) => b.addEventListener('click', () => {
    selInt = +b.dataset.int;
    box.querySelectorAll('.jr-int').forEach((x) => x.classList.toggle('on', +x.dataset.int <= selInt));
    refreshSave();
  }));
  saveBtn.addEventListener('click', () => {
    if (!selSym || !selInt) return;
    const note = box.querySelector('.jr-note').value.trim().slice(0, 80);
    addJournalEntry({ id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, ts: Date.now(), profileId: active, type: selSym, intensity: selInt, note, wx: snap });
    rerender();
  });
  box.querySelectorAll('.jr-del').forEach((b) => b.addEventListener('click', () => { removeJournalEntry(b.dataset.id); rerender(); }));

  // tools: export + clear
  box.querySelector('.jr-export').addEventListener('click', () => downloadText(exportJournal(), 'wetterfux-tagebuch.json', 'application/json'));
  const clearBtn = box.querySelector('.jr-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (confirm(en ? 'Delete ALL journal entries?' : 'Wirklich ALLE Tagebuch-Einträge löschen?')) { clearJournal(); rerender(); }
  });
}
function downloadText(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Warnings: official DWD (Bright Sky) with local fallback -----------------
function renderAlerts(data, s) {
  const box = $('#alerts');
  const official = data.officialAlerts || [];
  if (official.length) {
    const en = getLang() === 'en';
    // Safety rule: an ACTIVE severe/extreme warning must stay visible (never
    // hidden behind a collapse). Everything else (upcoming, or minor/moderate)
    // may be summarised into a compact, collapsible bar.
    const pinned = official.filter((a) => a.active && ALERT_RANK[a.severity] >= 3);
    const rest = official.filter((a) => !(a.active && ALERT_RANK[a.severity] >= 3));
    const parts = [];
    const cap = areaCaption(data.alertArea, data.place, en);
    if (cap) parts.push(cap);
    pinned.forEach((a, i) => parts.push(alertRow(a, en, i === 0))); // top one opened
    if (rest.length === 1) parts.push(alertRow(rest[0], en, false));
    else if (rest.length >= 2) parts.push(alertBar(rest, en, !!(s.ui && s.ui.alertsExpanded), pinned.length > 0));
    box.hidden = false;
    box.innerHTML = parts.join('');
    return;
  }

  // Fallback: locally derived advisories
  const c = data.forecast.current;
  const d = data.forecast.daily;
  const alerts = [];
  const gust = c.wind_gusts_10m;
  const gustKmh = toKmhU(gust, s.units.wind);
  const uv = d.uv_index_max ? (d.uv_index_max[0] || 0) : 0;
  const code = c.weather_code;
  if (gustKmh >= 60) alerts.push({ icon: '💨', txt: getLang() === 'en' ? `Strong gusts up to ${Math.round(gust)} ${windUnitLabel(s.units.wind)}` : `Kräftige Böen bis ${Math.round(gust)} ${windUnitLabel(s.units.wind)}` });
  if ([95, 96, 99].includes(code)) alerts.push({ icon: '⛈️', txt: getLang() === 'en' ? 'Thunderstorm risk' : 'Gewittergefahr' });
  if ([56, 57, 66, 67].includes(code)) alerts.push({ icon: '🧊', txt: getLang() === 'en' ? 'Freezing rain – risk of ice' : 'Eisregen – Glättegefahr' });
  if ([75, 86].includes(code)) alerts.push({ icon: '❄️', txt: getLang() === 'en' ? 'Heavy snowfall' : 'Starker Schneefall' });
  if (uv >= 8) alerts.push({ icon: '🔆', txt: getLang() === 'en' ? `Very high UV (${Math.round(uv)})` : `Sehr hohe UV-Belastung (${Math.round(uv)})` });

  if (!alerts.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = alerts.map((a) =>
    `<div class="alert"><span class="alert-ic">${a.icon}</span><span>${a.txt}</span></div>`).join('');
}
// Human validity line: upcoming → "ab 14:00", active → "bis 20:00" / "bis Do 18:00".
function alertWindow(a, en) {
  const from = a.onset ? formatWhen(a.onset) : '';
  const to = a.expires ? formatWhen(a.expires) : '';
  if (a.active === false && from) return (en ? 'from ' : 'ab ') + from + (to ? (en ? ` · until ${to}` : ` · bis ${to}`) : '');
  if (to) return (en ? 'until ' : 'bis ') + to;
  return '';
}
function sevInfo(sev) {
  switch (sev) {
    case 'extreme': return { key: 'extreme', icon: '🟣', label: t('sevExtreme') };
    case 'severe': return { key: 'severe', icon: '🔴', label: t('sevSevere') };
    case 'moderate': return { key: 'moderate', icon: '🟠', label: t('sevModerate') };
    default: return { key: 'minor', icon: '🟡', label: t('sevMinor') };
  }
}
const ALERT_RANK = { extreme: 4, severe: 3, moderate: 2, minor: 1 };
// Which DWD area do these warnings cover? Compare the warn-cell name to the
// place: if the cell names the place it's district-exact (🎯), otherwise it's
// a broader area that still includes the place (📍).
function areaCaption(area, place, en) {
  if (!area || !area.name) return '';
  const cell = area.name;
  const pn = place && place.name ? place.name : '';
  const exact = pn && cell.toLowerCase().includes(pn.toLowerCase());
  if (exact) {
    return `<p class="alert-area exact">🎯 ${en ? 'Valid exactly for' : 'Gilt genau für'} <b>${escapeHtml(cell)}</b></p>`;
  }
  const incl = pn ? (en ? ` · includes ${escapeHtml(pn)}` : ` · schließt ${escapeHtml(pn)} ein`) : '';
  return `<p class="alert-area">📍 ${en ? 'Warning area' : 'Warngebiet'}: <b>${escapeHtml(cell)}</b>${incl}</p>`;
}
// Title-case a shouty DWD string: "SCHWERE STURMBÖEN" → "Schwere Sturmböen".
function titleCase(str) {
  return String(str || '').toLowerCase().replace(/(^|[\s\-–/])([\p{L}])/gu, (m, p1, p2) => p1 + p2.toUpperCase());
}
// Short, calm label from the event name (the loud headline lives in the detail).
function alertShort(a, en) {
  const ev = en ? (a.eventEn || a.event) : (a.event || a.eventEn);
  if (ev) return titleCase(ev);
  const head = en ? (a.headlineEn || a.headline) : (a.headline || a.headlineEn);
  return head ? titleCase(head).slice(0, 40) : (en ? 'Weather warning' : 'Wetterwarnung');
}
// One compact, expandable warning row.
function alertRow(a, en, open) {
  const sev = sevInfo(a.severity);
  const short = alertShort(a, en);
  // Compact row: show one primary time (upcoming → start, active → end).
  // The full "ab … bis …" range stays in alertWindow inside the detail.
  const win = a.active === false
    ? (a.onset ? `${en ? 'from ' : 'ab '}${formatWhen(a.onset)}` : '')
    : (a.expires ? `${en ? 'until ' : 'bis '}${formatWhen(a.expires)}` : '');
  const desc = en ? (a.descriptionEn || a.description) : (a.description || a.descriptionEn);
  const instr = en ? (a.instructionEn || a.instruction) : (a.instruction || a.instructionEn);
  const longhead = en ? (a.headlineEn || a.headline) : (a.headline || a.headlineEn);
  const showLong = longhead && titleCase(longhead).toLowerCase() !== short.toLowerCase();
  const hasDetails = !!(desc || instr || showLong);
  const upcoming = a.active === false;
  const badge = upcoming ? `<span class="alert-tag">${en ? 'upcoming' : 'bevorstehend'}</span>` : '';
  const sub = `${sev.label}${badge ? ` ${badge}` : ''}${win ? ` · ${escapeHtml(win)}` : ''}`;
  const fullWin = alertWindow(a, en);
  const detail = hasDetails ? `<div class="alert-detail">
      ${showLong ? `<p class="alert-longhead">${escapeHtml(longhead)}</p>` : ''}
      ${fullWin ? `<p class="alert-fullwin">🕒 ${escapeHtml(fullWin)}</p>` : ''}
      ${desc ? `<p>${escapeHtml(desc)}</p>` : ''}
      ${instr ? `<p class="alert-instr"><b>${en ? 'What to do' : 'Verhalten'}:</b> ${escapeHtml(instr)}</p>` : ''}
    </div>` : '';
  return `<details class="alert alert-mini sev-${sev.key}${upcoming ? ' upcoming' : ''}${hasDetails ? '' : ' bare'}"${open && hasDetails ? ' open' : ''}>
    <summary class="alert-sum">
      <span class="alert-ic">${sev.icon}</span>
      <span class="alert-mini-main"><b class="alert-title">${escapeHtml(short)}</b><small class="alert-win">${sub}</small></span>
      ${hasDetails ? '<span class="alert-chev" aria-hidden="true">⌄</span>' : ''}
    </summary>${detail}
  </details>`;
}
// Collapsible summary bar for several non-critical warnings.
function alertBar(list, en, expanded, hasPinned) {
  const maxRank = list.reduce((m, a) => Math.max(m, ALERT_RANK[a.severity] || 1), 1);
  const sevKey = maxRank >= 4 ? 'extreme' : maxRank >= 3 ? 'severe' : maxRank >= 2 ? 'moderate' : 'minor';
  const chips = list.map((a) => alertShort(a, en)).filter(Boolean).join(' · ');
  const label = hasPinned
    ? (en ? `+${list.length} more` : `+${list.length} weitere`)
    : (en ? `${list.length} official warnings` : `${list.length} amtliche Warnungen`);
  // Window: latest end of active ones, else earliest start of upcoming ones.
  const activeEnds = list.filter((a) => a.active && a.expires).map((a) => a.expires);
  let win = '';
  if (activeEnds.length) {
    const latest = activeEnds.reduce((x, y) => (parseLocal(x).getTime() > parseLocal(y).getTime() ? x : y));
    win = (en ? 'until ' : 'bis ') + formatWhen(latest);
  } else {
    const onsets = list.filter((a) => a.onset).map((a) => a.onset);
    if (onsets.length) {
      const earliest = onsets.reduce((x, y) => (parseLocal(x).getTime() < parseLocal(y).getTime() ? x : y));
      win = (en ? 'from ' : 'ab ') + formatWhen(earliest);
    }
  }
  const rows = list.map((a) => alertRow(a, en, false)).join('');
  return `<div class="alert-group sev-${sevKey}">
    <button class="alert-group-bar" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="alertGroupList" aria-label="${en ? `${list.length} weather warnings, expand` : `${list.length} Wetterwarnungen, aufklappen`}">
      <span class="agb-ic" aria-hidden="true">⚠️</span>
      <span class="agb-txt"><b>${label}</b><small class="agb-chips">${escapeHtml(chips)}</small></span>
      ${win ? `<span class="agb-win">${escapeHtml(win)}</span>` : ''}
      <span class="agb-chev" aria-hidden="true">⌄</span>
    </button>
    <div class="alert-list" id="alertGroupList"${expanded ? '' : ' hidden'}>${rows}</div>
  </div>`;
}

// ---- Family dashboard --------------------------------------------------------
export function renderFamily(places, currents, activeId) {
  const box = $('#family');
  if (!box) return;
  const en = getLang() === 'en';
  // Explain what this tab is (and how to fill it) instead of leaving it blank
  if (!places || places.length < 2) {
    box.hidden = false;
    const n = places ? places.length : 0;
    const hint = n === 0
      ? (en ? 'Save your loved ones’ places (tap the star after searching) and see everyone’s weather here at a glance – plus compare them side by side.'
            : 'Speichere die Orte deiner Liebsten (nach der Suche auf den Stern tippen). Hier siehst du dann alle auf einen Blick – und kannst sie vergleichen.')
      : (en ? 'Add one more place to compare and see the whole family’s weather here.'
            : 'Füge noch einen Ort hinzu, um zu vergleichen und das Wetter der ganzen Familie hier zu sehen.');
    box.innerHTML = `<div class="card-title">👪 ${t('family')}</div>
      <p class="fam-empty">${hint}</p>
      <button class="fam-add-btn">🔍 ${en ? 'Add a place' : 'Ort hinzufügen'}</button>`;
    return;
  }
  box.hidden = false;
  const rows = places.map((p, i) => {
    const w = currents[i];
    const temp = w ? tempStr(w.temp) : '…';
    const ic = w ? weatherSVG(w.code, w.isDay) : '';
    const desc = w ? describe(w.code, getLang()) : '';
    return `<div class="fam-row${p.id === activeId ? ' active' : ''}" data-i="${i}" role="button" tabindex="0" aria-label="${escapeHtml(p.name)}: ${temp} ${desc}">
      <span class="fam-flag" aria-hidden="true">${flagEmoji(p.country_code)}</span>
      <span class="fam-name">${escapeHtml(p.name)}</span>
      <span class="fam-ic" aria-hidden="true">${ic}</span>
      <span class="fam-desc">${desc}</span>
      <span class="fam-temp">${temp}</span>
    </div>`;
  }).join('');
  box.innerHTML = `<div class="card-title fam-title">👪 ${t('family')}
    <button class="fam-share" aria-label="${t('share')}">${getLang() === 'en' ? 'Share ↗' : 'Teilen ↗'}</button></div>
    <div class="fam">${rows}</div>`;
}
function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return '📍';
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

// ---- Place comparison --------------------------------------------------------
export function renderCompare(places, briefs, settings) {
  const box = $('#compare');
  if (!box) return;
  const pairs = places.map((p, i) => ({ p, w: briefs[i] })).filter((x) => x.w);
  if (pairs.length < 2) { box.hidden = true; return; }
  box.hidden = false;
  const en = getLang() === 'en';
  const wu = windUnitLabel(settings.units.wind);

  // find warmest and driest for highlight badges
  let warmest = -Infinity, driest = Infinity;
  pairs.forEach(({ w }) => { if (w.temp > warmest) warmest = w.temp; if (w.pop != null && w.pop < driest) driest = w.pop; });

  const cols = pairs.map(({ p, w }) => {
    const badges = [];
    if (w.temp === warmest) badges.push('🔥');
    if (w.pop != null && w.pop === driest) badges.push('☀️');
    return `<div class="cmp-col">
      <div class="cmp-head"><span class="cmp-flag">${flagEmoji(p.country_code)}</span><span class="cmp-name">${escapeHtml(p.name)}</span></div>
      <div class="cmp-ic">${weatherSVG(w.code, w.isDay)}</div>
      <div class="cmp-temp">${tempStr(w.temp)} ${badges.join('')}</div>
      <div class="cmp-row"><span>${en ? 'Feels' : 'Gefühlt'}</span><b>${tempStr(w.feels)}</b></div>
      <div class="cmp-row"><span>${en ? 'Hi / Lo' : 'Hoch / Tief'}</span><b>${tempStr(w.hi)} / ${tempStr(w.lo)}</b></div>
      <div class="cmp-row"><span>${en ? 'Rain' : 'Regen'}</span><b>${w.pop != null ? `${w.pop}%` : '–'}</b></div>
      <div class="cmp-row"><span>${en ? 'Wind' : 'Wind'}</span><b>${num(w.wind)} ${wu}</b></div>
    </div>`;
  }).join('');

  box.innerHTML = `<div class="card-title">⚖️ ${en ? 'Compare places' : 'Orte vergleichen'}</div>
    <div class="cmp-scroll"><div class="cmp-grid">${cols}</div></div>`;
}
export function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Unit helpers reused by activity/bio calculations
function toC(v, unit) { return unit === 'F' ? (v - 32) * 5 / 9 : v; }
function toKmhU(v, unit) { return unit === 'mph' ? v * 1.60934 : unit === 'ms' ? v * 3.6 : v; }
function toMmU(v, unit) { return unit === 'inch' ? v * 25.4 : v; }

// ---- Rain nowcast (minutely_15) ---------------------------------------------
function renderNowcast(data) {
  const box = $('#nowcast');
  const m = data.forecast.minutely_15;
  if (!m || !m.time || !m.precipitation) { box.hidden = true; return; }
  const now = placeNowMs();
  // next 8 slots = 2 hours
  let start = m.time.findIndex((iso) => { const d = parseLocal(iso); return d && d.getTime() >= now; });
  if (start < 0) start = 0;
  const times = m.time.slice(start, start + 8);
  const precip = m.precipitation.slice(start, start + 8);
  if (!times.length) { box.hidden = true; return; }

  const raining = precip[0] > 0.05;
  const firstRain = precip.findIndex((p) => p > 0.05);
  const firstDry = precip.findIndex((p) => p <= 0.05);
  let msg;
  if (raining) {
    msg = firstDry > 0 ? t('nowcastStopSoon', { min: firstDry * 15 }) : t('nowcastRainNow');
  } else if (firstRain > 0) {
    msg = t('nowcastRainSoon', { min: firstRain * 15 });
  } else {
    msg = t('nowcastDryNow');
  }

  const anyRain = precip.some((p) => p > 0.02);
  box.hidden = false;
  const max = Math.max(0.5, ...precip);
  const bars = precip.map((p, i) => {
    const h = Math.max(3, (p / max) * 42);
    const lbl = i % 2 === 0 ? formatHour(times[i]) : '';
    return `<div class="nc-col"><div class="nc-bar${p > 0.05 ? ' wet' : ''}" style="height:${h}px"></div><span>${lbl}</span></div>`;
  }).join('');

  box.innerHTML = `
    <div class="card-title has-share">🌧️ ${t('nowcast')}${shareBtn('rain')}</div>
    <div class="nc-msg ${anyRain ? 'wet' : 'dry'}">${msg}</div>
    <div class="nc-chart">${bars}</div>`;
}

// ---- Detail tiles ------------------------------------------------------------
function renderDetails(data, s) {
  const c = data.forecast.current;
  const d = data.forecast.daily;
  const h = data.forecast.hourly;
  const idx = currentHourIndex(h);
  const vis = h.visibility ? h.visibility[idx] : null;
  const uv = d.uv_index_max ? (d.uv_index_max[0] || 0) : 0;
  const uvL = uvLevel(uv);
  const dew = dewPoint(c.temperature_2m, c.relative_humidity_2m, s.units.temp);

  const tiles = [
    tile('🧭', t('wind'), `${num(c.wind_speed_10m)} ${windUnitLabel(s.units.wind)}`,
      compass(c.wind_direction_10m), `${windDir(c.wind_direction_10m)} · ${t('windGust')} ${num(c.wind_gusts_10m)}`),
    tile('💧', t('humidity'), `${num(c.relative_humidity_2m)}%`, gauge(c.relative_humidity_2m), `${t('dewPoint')} ${tempStr(dew)}`),
    tile('🔆', t('uv'), `${num(uv)}`, badge(uvL.label, uvL.cls), uvL.advice),
    tile('🌡️', t('pressure'), `${num(c.pressure_msl)}`, '', 'hPa'),
    tile('👁️', t('visibility'), vis != null ? `${num(vis / 1000, 1)} km` : '–', '', ''),
    tile('☁️', t('cloudCover'), `${num(c.cloud_cover)}%`, gauge(c.cloud_cover), ''),
  ];
  $('#details').innerHTML = `<div class="card-title">${t('details')}</div><div class="tiles">${tiles.join('')}</div>`;
}

function tile(icon, label, value, extra = '', sub = '') {
  return `<div class="tile">
    <div class="tile-head"><span class="tile-ic">${icon}</span><span class="tile-label">${label}</span></div>
    <div class="tile-val">${value}</div>
    ${extra ? `<div class="tile-extra">${extra}</div>` : ''}
    ${sub ? `<div class="tile-sub">${sub}</div>` : ''}
  </div>`;
}
function badge(label, cls) { return `<span class="badge ${cls}">${label}</span>`; }
function gauge(pct) {
  return `<div class="mini-gauge"><div class="mini-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>`;
}
function compass(deg) {
  return `<svg viewBox="0 0 48 48" class="compass" aria-hidden="true">
    <circle cx="24" cy="24" r="20" class="compass-ring"/>
    <text x="24" y="9" class="compass-n">N</text>
    <g style="transform:rotate(${deg}deg);transform-origin:24px 24px">
      <polygon points="24,8 20,26 24,22 28,26" class="compass-needle"/>
    </g></svg>`;
}

// ---- Next 6 hours (detailed) ------------------------------------------------
function renderSixHour(data, s) {
  const box = $('#sixhour');
  const h = data.forecast.hourly;
  const start = currentHourIndex(h);
  const idxs = [];
  for (let i = start; i < Math.min(start + 6, h.time.length); i++) idxs.push(i);
  if (idxs.length < 2) { box.hidden = true; return; }
  const en = getLang() === 'en';
  const wu = windUnitLabel(s.units.wind);
  const pu = s.units.temp === 'F' ? 'in' : 'mm';

  const rows = idxs.map((i, k) => {
    const isDay = h.is_day ? h.is_day[i] === 1 : true;
    const label = k === 0 ? t('now') : formatHour(h.time[i]);
    const prob = h.precipitation_probability ? (h.precipitation_probability[i] || 0) : 0;
    const precip = h.precipitation ? (h.precipitation[i] || 0) : 0;
    const wind = h.wind_speed_10m ? h.wind_speed_10m[i] : 0;
    const gust = h.wind_gusts_10m ? h.wind_gusts_10m[i] : 0;
    const hum = h.relative_humidity_2m ? h.relative_humidity_2m[i] : null;
    const uv = h.uv_index ? (h.uv_index[i] || 0) : 0;
    const feels = h.apparent_temperature ? h.apparent_temperature[i] : h.temperature_2m[i];
    return `<div class="sh-row">
      <div class="sh-time">${label}</div>
      <div class="sh-ic" role="img" aria-label="${describe(h.weather_code[i], getLang())}">${weatherSVG(h.weather_code[i], isDay)}</div>
      <div class="sh-temp" style="color:${tempColor(toC(h.temperature_2m[i], s.units.temp))}">${tempStr(h.temperature_2m[i])}</div>
      <div class="sh-metrics">
        <span>🌡️ ${en ? 'feels' : 'gefühlt'} ${tempStr(feels)}</span>
        <span>💧 ${prob}%${precip > 0 ? ` · ${num(precip, 1)} ${pu}` : ''}</span>
        <span>💨 ${num(wind)} ${wu}${gust ? ` (${num(gust)})` : ''}</span>
        ${hum != null ? `<span>💦 ${hum}%</span>` : ''}
        ${uv >= 1 ? `<span>🔆 UV ${num(uv)}</span>` : ''}
      </div>
    </div>`;
  }).join('');
  box.hidden = false;
  box.innerHTML = `<div class="card-title has-share">⏱️ ${en ? 'Next 6 hours' : 'Nächste 6 Stunden'}${shareBtn('six')}</div><div class="sh-list">${rows}</div>`;
}

// ---- Hourly (48h) — combined chart: temp area + precip bars + day/night ------
function renderHourly(data, s) {
  const inner = hourlyChartHTML(data, s, { colW: 58, topPad: 20, chartH: 62, precipH: 20 });
  if (inner == null) { $('#hourly').innerHTML = ''; return; }
  $('#hourly').innerHTML = `
    <div class="card-title has-hr">${t('hourly')} <span class="hr-legend">🌡️ <i class="lg-line"></i> ${getLang() === 'en' ? 'temp' : 'Temp.'} · 💧 <i class="lg-bar"></i> ${t('precipProb')}</span>
      <button class="hr-expand" data-hr-expand title="${t('expand')}" aria-label="${t('expand')}">⤢</button>
    </div>
    ${inner}`;
}

// Larger version rendered into the expand popup (#hourlyBig).
export function renderHourlyBig(data, s) {
  const box = $('#hourlyBig');
  if (!box) return;
  const inner = hourlyChartHTML(data, s, { colW: 78, topPad: 26, chartH: 132, precipH: 34 });
  box.innerHTML = inner == null ? '' : `<div class="hr-big">${inner}</div>`;
}

// Builds the scrollable hourly chart markup at the given pixel dimensions.
// Returns null when there is no hourly data. Shared by the card and the popup.
function hourlyChartHTML(data, s, dim) {
  const h = data.forecast.hourly;
  const start = currentHourIndex(h);
  const N = 48;
  const idxs = [];
  for (let i = start; i < Math.min(start + N, h.time.length); i++) idxs.push(i);
  if (!idxs.length) return null;
  const temps = idxs.map((i) => h.temperature_2m[i]);
  const min = Math.min(...temps), max = Math.max(...temps);
  const range = Math.max(1, max - min);

  const { colW, topPad, chartH, precipH } = dim;
  const baseY = topPad + chartH;
  const totalH = baseY + precipH;
  const width = idxs.length * colW;

  const pts = temps.map((tp, k) => [k * colW + colW / 2, topPad + (1 - (tp - min) / range) * chartH]);
  const linePath = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length - 1][0]} ${baseY} L ${pts[0][0]} ${baseY} Z`;

  // Temperature-coloured gradient along the x-axis (userSpaceOnUse).
  // Keep the id unique per size so the card and the popup don't clash in the DOM.
  const gid = 'hrGrad' + colW;
  const stops = temps.map((tp, k) =>
    `<stop offset="${((k / Math.max(1, temps.length - 1)) * 100).toFixed(2)}%" stop-color="${tempColor(toC(tp, s.units.temp))}"/>`).join('');

  let night = '', bars = '', labels = '', dividers = '';
  idxs.forEach((i, k) => {
    const x = k * colW;
    const isDay = h.is_day ? h.is_day[i] === 1 : true;
    if (!isDay) night += `<rect x="${x}" y="0" width="${colW}" height="${totalH}" class="hr-night"/>`;
    // sunrise/sunset divider when day/night flips
    if (k > 0) {
      const prevDay = h.is_day ? h.is_day[idxs[k - 1]] === 1 : true;
      if (prevDay !== isDay) dividers += `<line x1="${x}" y1="0" x2="${x}" y2="${baseY}" class="hr-div"/><text x="${x + 3}" y="12" class="hr-divlbl">${isDay ? '☀' : '☾'}</text>`;
    }
    const pp = h.precipitation_probability ? (h.precipitation_probability[i] || 0) : 0;
    if (pp > 0) {
      const bh = Math.max(1.5, (pp / 100) * precipH);
      bars += `<rect x="${x + colW * 0.3}" y="${(baseY + precipH - bh).toFixed(1)}" width="${colW * 0.4}" height="${bh.toFixed(1)}" rx="1.5" class="hr-precip"/>`;
    }
    labels += `<text x="${pts[k][0]}" y="${(pts[k][1] - 6).toFixed(1)}" class="hr-tlabel">${Math.round(temps[k])}°</text>`;
  });

  const cols = idxs.map((i, k) => {
    const isDay = h.is_day ? h.is_day[i] === 1 : true;
    const label = k === 0 ? t('now') : formatHour(h.time[i]);
    return `<div class="hr-col" style="width:${colW}px">
      <span class="hr-time">${label}</span>
      <span class="hr-ic">${weatherSVG(h.weather_code[i], isDay)}</span>
    </div>`;
  }).join('');

  return `
    <div class="hr-scroll">
      <div class="hr-inner" style="width:${width}px">
        <div class="hr-cols">${cols}</div>
        <svg class="hr-chart" viewBox="0 0 ${width} ${totalH}" width="${width}" height="${totalH}" preserveAspectRatio="none">
          <defs>
            <linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${width}" y2="0">${stops}</linearGradient>
            <linearGradient id="${gid}Fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35"/>
              <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/>
            </linearGradient>
          </defs>
          ${night}${dividers}
          <line x1="0" y1="${baseY}" x2="${width}" y2="${baseY}" class="hr-base"/>
          <path d="${areaPath}" fill="url(#${gid}Fill)"/>
          <path d="${linePath}" fill="none" stroke="url(#${gid})" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
          ${labels}${bars}
        </svg>
      </div>
    </div>`;
}

// Temperature → colour ramp (°C), shared across charts
function tempColor(c) {
  const stops = [[-12, [74, 127, 216]], [-2, [95, 176, 232]], [8, [87, 199, 133]],
    [16, [255, 210, 80]], [24, [255, 154, 77]], [34, [255, 94, 90]]];
  if (c <= stops[0][0]) return rgb(stops[0][1]);
  if (c >= stops[stops.length - 1][0]) return rgb(stops[stops.length - 1][1]);
  for (let i = 1; i < stops.length; i++) {
    if (c <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i];
      const f = (c - a) / (b - a);
      return rgb(ca.map((v, j) => Math.round(v + (cb[j] - v) * f)));
    }
  }
  return rgb(stops[stops.length - 1][1]);
}
function rgb(a) { return `rgb(${a[0]},${a[1]},${a[2]})`; }

// ---- Air quality + pollen ----------------------------------------------------
function renderAir(data) {
  const box = $('#air');
  if (!data.air || !data.air.current) { box.hidden = true; return; }
  const a = data.air.current;
  const lvl = aqiLevel(a.european_aqi);
  if (!lvl) { box.hidden = true; return; }
  box.hidden = false;

  const pollutants = [
    ['PM2.5', a.pm2_5, 'µg/m³'], ['PM10', a.pm10, 'µg/m³'],
    ['O₃', a.ozone, 'µg/m³'], ['NO₂', a.nitrogen_dioxide, 'µg/m³'],
  ].map(([n, v, u]) => `<div class="pollutant"><span>${n}</span><b>${num(v)}</b><i>${u}</i></div>`).join('');

  // pollen from hourly (first available value)
  let pollenHtml = '';
  const ph = data.air.hourly;
  if (ph) {
    const map = [['grass', ph.grass_pollen], ['birch', ph.birch_pollen], ['alder', ph.alder_pollen],
      ['ragweed', ph.ragweed_pollen], ['mugwort', ph.mugwort_pollen], ['olive', ph.olive_pollen]];
    const rows = map.map(([key, arr]) => {
      if (!arr) return null;
      const v = firstNum(arr);
      if (v == null) return null;
      const pl = pollenLevel(v);
      return `<div class="pollen-row"><span>${t(key)}</span><span class="badge ${pl.cls}">${pl.label}</span></div>`;
    }).filter(Boolean);
    if (rows.length) pollenHtml = `<div class="pollen"><div class="sub-title">🌸 ${t('pollen')}</div>${rows.join('')}</div>`;
  }

  const frac = Math.max(0, Math.min(1, a.european_aqi / 100));
  box.innerHTML = `
    <div class="card-title">🍃 ${t('airQuality')}</div>
    <div class="aqi-main">
      <div class="aqi-gaugewrap">
        <svg class="aqi-gauge" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="aqi-track" cx="50" cy="50" r="42"/>
          <circle class="aqi-arc ${lvl.cls}" cx="50" cy="50" r="42" pathLength="100"
            style="stroke-dasharray:${(frac * 100).toFixed(1)} 100" transform="rotate(-90 50 50)"/>
        </svg>
        <div class="aqi-center"><span class="aqi-val">${Math.round(a.european_aqi)}</span><span class="aqi-lbl">AQI</span></div>
      </div>
      <div class="aqi-info">
        <div class="badge ${lvl.cls}">${lvl.label}</div>
        <p>${lvl.advice}</p>
      </div>
    </div>
    <div class="pollutants">${pollutants}</div>
    ${pollenHtml}`;
}

// ---- Sun & Moon --------------------------------------------------------------
function renderSunMoon(data) {
  const d = data.forecast.daily;
  const sr = d.sunrise[0], ss = d.sunset[0];
  const moon = moonPhase(new Date());
  const srD = parseLocal(sr), ssD = parseLocal(ss);
  // Polar day / night: sunrise or sunset missing
  if (!srD || !ssD) {
    const polar = (d.daylight_duration && d.daylight_duration[0] > 43200)
      ? (getLang() === 'en' ? 'Polar day – the sun stays up' : 'Polartag – die Sonne bleibt oben')
      : (getLang() === 'en' ? 'Polar night – the sun stays down' : 'Polarnacht – die Sonne bleibt unten');
    $('#sunmoon').innerHTML = `<div class="card-title">☀️ ${t('sunMoon')}</div>
      <p class="polar-note">🌍 ${polar}</p>
      <div class="moon-row"><span class="moon-emoji">${moon.emoji}</span>
      <div><b>${moon.name}</b><span class="lbl">${t('moonPhase')} · ${moon.illum}%</span></div></div>`;
    return;
  }
  const now = placeNowMs();
  const srT = srD.getTime(), ssT = ssD.getTime();
  const prog = Math.max(0, Math.min(1, (now - srT) / (ssT - srT)));
  const sky = sunsetOutlook(data, moon.illum);
  const gMin = sky ? sky.golden.min : 40;

  // sun arc
  const arcW = 260, arcH = 90;
  const angle = Math.PI * (1 - prog);
  const sx = arcW / 2 + Math.cos(angle) * (arcW / 2 - 12);
  const sy = arcH - Math.sin(angle) * (arcH - 14) - 6;

  $('#sunmoon').innerHTML = `
    <div class="card-title">☀️ ${t('sunMoon')}</div>
    <div class="sun-arc">
      <svg viewBox="0 0 ${arcW} ${arcH}" class="arc-svg">
        <path d="M12 ${arcH - 6} A ${arcW / 2 - 12} ${arcH - 14} 0 0 1 ${arcW - 12} ${arcH - 6}" class="arc-path"/>
        <path d="M12 ${arcH - 6} A ${arcW / 2 - 12} ${arcH - 14} 0 0 1 ${arcW - 12} ${arcH - 6}" class="arc-progress" pathLength="100" style="stroke-dasharray:${(prog * 100).toFixed(1)} 100"/>
        ${prog > 0 && prog < 1 ? `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="7" class="arc-sun"/>` : ''}
      </svg>
      <div class="sun-times">
        <div><span class="lbl">${t('sunrise')}</span><b>${formatTime(sr)}</b></div>
        <div><span class="lbl">${t('sunset')}</span><b>${formatTime(ss)}</b></div>
      </div>
    </div>
    <div class="moon-row">
      <span class="moon-emoji">${moon.emoji}</span>
      <div><b>${moon.name}</b><span class="lbl">${t('moonPhase')} · ${moon.illum}%</span></div>
      <div class="daylen"><span class="lbl">${t('dayLength')}</span><b>${daylightStr(d.daylight_duration[0])}</b></div>
    </div>
    ${renderSkyShow(sky)}
    <button class="ics-btn" data-start="${floatStamp(new Date(ssT - gMin * 60000))}" data-end="${floatStamp(new Date(ssT))}"
      data-title="${getLang() === 'en' ? 'Golden hour 📸' : 'Goldene Stunde 📸'}">📅 ${getLang() === 'en' ? 'Golden hour to calendar' : 'Goldene Stunde in Kalender'}</button>`;
}

// Sunset sky forecast block: outlook badge, golden/blue hour, rare phenomena.
function renderSkyShow(sky) {
  if (!sky) return '';
  const en = getLang() === 'en';
  const o = sky.outlook;
  if (o.key === 'hidden' || o.key === 'unknown') {
    return `<div class="sky-show"><div class="sky-head"><span class="sky-emoji">${o.emoji}</span><b>${o.label}</b></div>${o.note ? `<p class="sky-note">${o.note}</p>` : ''}</div>`;
  }
  const scoreBadge = o.score != null ? `<span class="sky-score">${o.score}<i>/100</i></span>` : '';
  const times = `<div class="sky-times">
      <span>📸 ${en ? 'Golden' : 'Gold'} ${formatTime(sky.golden.start)}–${formatTime(sky.golden.end)}</span>
      <span>🔵 ${en ? 'Blue' : 'Blau'} ${formatTime(sky.blue.start)}–${formatTime(sky.blue.end)}</span>
    </div>`;
  const phen = sky.phenomena.map((p) => `
    <details class="sky-item${p.solid ? '' : ' maybe'}">
      <summary class="sky-sum"><span class="sky-emoji">${p.emoji}</span>
        <span class="sky-txt">${escapeHtml(p.text)}${p.solid ? '' : ` <i>${en ? 'possible' : 'möglich'}</i>`}</span>
        <span class="sky-chev" aria-hidden="true">⌄</span></summary>
      <p class="sky-detail">${escapeHtml(p.hint)}</p>
    </details>`).join('');
  return `<div class="sky-show">
    <div class="sky-head"><span class="sky-emoji">${o.emoji}</span><b>${o.label}</b>${scoreBadge}</div>
    ${times}${phen}
    <p class="sky-hint">💡 ${escapeHtml(sky.hint)}</p>
  </div>`;
}
function floatStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
}

// ---- 14-day forecast ---------------------------------------------------------
function renderDaily(data, s) {
  const d = data.forecast.daily;
  const days = d.time.length;
  let gMin = Infinity, gMax = -Infinity;
  for (let i = 0; i < days; i++) { gMin = Math.min(gMin, d.temperature_2m_min[i]); gMax = Math.max(gMax, d.temperature_2m_max[i]); }
  const gRange = Math.max(1, gMax - gMin);

  const rows = d.time.map((iso, i) => {
    const lo = d.temperature_2m_min[i], hi = d.temperature_2m_max[i];
    const left = ((lo - gMin) / gRange) * 100;
    const width = ((hi - lo) / gRange) * 100;
    const pp = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;
    const we = isWeekend(iso) ? ' weekend' : '';
    return `<div class="day-group">
      <button class="day-row${we}" data-day="${i}" aria-expanded="false">
        <span class="day-name">${dayLabel(iso, i)}<small class="day-date">${shortDate(iso)}</small></span>
        <span class="day-ic" role="img" aria-label="${describe(d.weather_code[i], getLang())}">${weatherSVG(d.weather_code[i], true)}</span>
        <span class="day-pp">${pp ? `💧${pp}%` : ''}</span>
        <span class="day-lo">${tempStr(lo)}</span>
        <span class="day-bar"><span class="day-fill" style="left:${left}%;width:${Math.max(6, width)}%;background:linear-gradient(90deg, ${tempColor(toC(lo, s.units.temp))}, ${tempColor(toC(hi, s.units.temp))})"></span></span>
        <span class="day-hi">${tempStr(hi)}</span>
        <span class="day-chev" aria-hidden="true">⌄</span>
      </button>
      <div class="day-detail" data-detail="${i}" hidden></div>
    </div>`;
  }).join('');

  const wkLabel = getLang() === 'en' ? 'Weekend' : 'Wochenende';
  $('#daily').innerHTML = `<div class="card-title has-share">${t('daily')}<span class="title-actions"><button class="card-share card-share--text" data-share="weekend" title="${wkLabel}">${wkLabel} ↗</button>${shareBtn('daily')}</span></div><div class="days">${rows}</div>`;

  // Tap a day to expand its hourly detail (built lazily)
  $('#daily').querySelectorAll('.day-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.day;
      const panel = $(`#daily [data-detail="${i}"]`);
      const open = !panel.hidden;
      if (open) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('open'); return; }
      if (!panel.dataset.built) { panel.innerHTML = buildDayDetail(data, i, s); panel.dataset.built = '1'; }
      panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); btn.classList.add('open');
    });
  });
}

function buildDayDetail(data, dayIdx, s) {
  const d = data.forecast.daily;
  const h = data.forecast.hourly;
  const en = getLang() === 'en';
  const dayIso = d.time[dayIdx];
  const target = parseLocal(dayIso);
  const td = target ? target.getUTCDate() : -1;
  const tm = target ? target.getUTCMonth() : -1;
  const now = placeNowMs();
  const idxs = [];
  for (let i = 0; i < h.time.length; i++) {
    const dt = parseLocal(h.time[i]);
    if (!dt || dt.getUTCDate() !== td || dt.getUTCMonth() !== tm || dt.getUTCHours() % 2 !== 0) continue;
    if (dayIdx === 0 && dt.getTime() < now - 3600000) continue; // today: only hours from now on
    idxs.push(i);
  }
  const cols = idxs.map((i, k) => {
    const dt = parseLocal(h.time[i]);
    const isDay = h.is_day ? h.is_day[i] === 1 : true;
    const pp = h.precipitation_probability ? h.precipitation_probability[i] : 0;
    const label = (dayIdx === 0 && k === 0) ? t('now') : String(dt.getUTCHours()).padStart(2, '0');
    return `<div class="dd-col">
      <span class="dd-time">${label}</span>
      <span class="dd-ic">${weatherSVG(h.weather_code[i], isDay)}</span>
      <span class="dd-temp">${tempStr(h.temperature_2m[i])}</span>
      <span class="dd-pp">${pp ? `💧${pp}%` : ''}</span>
    </div>`;
  }).join('');

  // Summary from daily — always available (works even without hourly data).
  const hi = d.temperature_2m_max ? d.temperature_2m_max[dayIdx] : null;
  const lo = d.temperature_2m_min ? d.temperature_2m_min[dayIdx] : null;
  const fhi = d.apparent_temperature_max ? d.apparent_temperature_max[dayIdx] : null;
  const flo = d.apparent_temperature_min ? d.apparent_temperature_min[dayIdx] : null;
  const dPsum = d.precipitation_sum ? d.precipitation_sum[dayIdx] : null;
  const pmax = d.precipitation_probability_max ? d.precipitation_probability_max[dayIdx] : null;
  const dl = d.daylight_duration ? d.daylight_duration[dayIdx] : null;
  const punit = s.units.temp === 'F' ? 'in' : 'mm';
  const summary = [
    hi != null && lo != null ? `<span class="dd-hilo">↑ ${tempStr(hi)}  ↓ ${tempStr(lo)}</span>` : null,
    fhi != null && flo != null ? `<span>${en ? 'feels' : 'gefühlt'} ${tempStr(fhi)}/${tempStr(flo)}</span>` : null,
    dPsum != null ? `<span>🌧️ ${num(dPsum, 1)} ${punit}${pmax ? ` · ${pmax}%` : ''}</span>` : null,
    dl != null ? `<span>☀️ ${daylightStr(dl)}</span>` : null,
  ].filter(Boolean).join('');

  const sr = parseLocal(d.sunrise ? d.sunrise[dayIdx] : null);
  const ss = parseLocal(d.sunset ? d.sunset[dayIdx] : null);
  const uvMax = d.uv_index_max ? d.uv_index_max[dayIdx] : null;
  const gust = d.wind_gusts_10m_max ? d.wind_gusts_10m_max[dayIdx] : null;
  const meta = [
    sr ? `🌅 ${formatTime(d.sunrise[dayIdx])}` : null,
    ss ? `🌇 ${formatTime(d.sunset[dayIdx])}` : null,
    gust != null ? `💨 ${num(gust)} ${windUnitLabel(s.units.wind)}` : null,
    uvMax != null ? `🔆 UV ${num(uvMax)}` : null,
  ].filter(Boolean).map((m) => `<span>${m}</span>`).join('');

  const hourly = idxs.length >= 2
    ? `<div class="dd-scroll"><div class="dd-cols">${cols}</div></div>`
    : `<p class="dd-nohours">${en ? 'Hourly detail not available for this day yet.' : 'Stundenwerte für diesen Tag noch nicht verfügbar.'}</p>`;

  return `<div class="dd-summary">${summary}</div>${hourly}<div class="dd-meta">${meta}</div>`;
}

// ---- helpers -----------------------------------------------------------------
function currentHourIndex(h) {
  const now = placeNowMs();
  let idx = h.time.findIndex((iso) => { const d = parseLocal(iso); return d && d.getTime() >= now - 3600000; });
  if (idx < 0) idx = h.time.length - 1;
  return Math.max(0, Math.min(idx, h.time.length - 1));
}
function firstNum(arr) {
  for (const v of arr) if (v != null && !Number.isNaN(v)) return v;
  return null;
}
function dewPoint(tC, rh, unit) {
  // if fahrenheit selected, tC is actually in F; convert
  let temp = tC;
  if (unit === 'F') temp = (tC - 32) * 5 / 9;
  const a = 17.27, b = 237.7;
  const g = (a * temp) / (b + temp) + Math.log(Math.max(0.01, rh / 100));
  let dp = (b * g) / (a - g);
  if (unit === 'F') dp = dp * 9 / 5 + 32;
  return dp;
}
