// ui.js — renders all weather cards into the DOM

import { t, getLang } from './i18n.js';
import { describe, weatherSVG } from './weathercodes.js';
import { buildClothingAdvice } from './advice.js';
import { mountRadar } from './radar.js';
import {
  tempStr, num, windDir, windUnitLabel, formatHour, formatTime, dayLabel,
  uvLevel, aqiLevel, pollenLevel, moonPhase, daylightStr, placeLabel, placeSub,
  setPlaceTz, parseLocal, placeNowMs, shortDate, isWeekend,
} from './format.js';

const $ = (sel) => document.querySelector(sel);

export function renderAll(data, settings) {
  const c = data.forecast.current;
  setPlaceTz(data.forecast.utc_offset_seconds);
  renderHeader(data.place);
  renderAlerts(data, settings);
  renderHero(data, settings);
  renderClothing(data, settings);
  renderRadar(data);
  renderNowcast(data);
  renderActivity(data, settings);
  renderDetails(data, settings);
  renderHourly(data, settings);
  renderAir(data);
  renderBiowetter(data, settings);
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
  box.innerHTML = `
    <div class="card-title">🧥 ${t('clothing')}</div>
    <div class="cloth-head">
      <span class="cloth-big" aria-hidden="true">${a.emoji}</span>
      <div class="cloth-headtext">
        <span class="cloth-title">${a.title}</span>
        <span class="cloth-summary">${a.summary}</span>
      </div>
    </div>
    <div class="cloth-meta">${umbrella}</div>
    ${slots}
    <div class="cloth-items">${chips}</div>
    ${a.note ? `<div class="cloth-note">💡 ${a.note}</div>` : ''}`;
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

// ---- Bio-weather & health ----------------------------------------------------
function renderBiowetter(data, s) {
  const box = $('#biowetter');
  const c = data.forecast.current;
  const h = data.forecast.hourly;
  const idx = currentHourIndex(h);

  // pressure trend over the previous ~3h
  let trend = t('trendSteady'), trendIcon = '→', delta = 0;
  if (h.pressure_msl && idx >= 3) {
    delta = h.pressure_msl[idx] - h.pressure_msl[idx - 3];
    if (delta > 1.5) { trend = t('trendRising'); trendIcon = '↗'; }
    else if (delta < -1.5) { trend = t('trendFalling'); trendIcon = '↘'; }
  }
  const migraine = Math.abs(delta) >= 4 ? 'lvl-poor' : Math.abs(delta) >= 2.5 ? 'lvl-moderate' : 'lvl-good';
  const migraineLbl = Math.abs(delta) >= 4 ? t('highLvl') : Math.abs(delta) >= 2.5 ? t('moderateLvl') : t('lowLvl');

  const dew = h.dew_point_2m ? toC(h.dew_point_2m[idx], s.units.temp) : null;
  const muggy = dew == null ? null : dew >= 18 ? t('highLvl') : dew >= 15 ? t('moderateLvl') : t('lowLvl');
  const muggyCls = dew == null ? 'lvl-none' : dew >= 18 ? 'lvl-poor' : dew >= 15 ? 'lvl-moderate' : 'lvl-good';

  const feelsC = toC(c.apparent_temperature, s.units.temp);
  const windKmh = toKmhU(c.wind_speed_10m, s.units.wind);
  const cold = (feelsC >= 1 && feelsC <= 10 && windKmh >= 15 && c.relative_humidity_2m >= 75);
  const circ = feelsC >= 30 ? t('highLvl') : feelsC >= 27 ? t('moderateLvl') : (feelsC <= -5 ? t('moderateLvl') : t('lowLvl'));
  const circCls = feelsC >= 30 ? 'lvl-poor' : feelsC >= 27 ? 'lvl-moderate' : (feelsC <= -5 ? 'lvl-moderate' : 'lvl-good');

  const rows = [
    bioRow('🌡️', t('pressureTrend'), `${trendIcon} ${trend}`, `${num(delta, 1)} hPa/3h`, ''),
    bioRow('🤕', t('migraine'), `<span class="badge ${migraine}">${migraineLbl}</span>`, '', ''),
    bioRow('❤️', t('circulation'), `<span class="badge ${circCls}">${circ}</span>`, '', ''),
  ];
  if (muggy) rows.push(bioRow('💦', t('muggy'), `<span class="badge ${muggyCls}">${muggy}</span>`, '', ''));
  if (cold) rows.push(bioRow('🤧', t('coldRisk'), `<span class="badge lvl-moderate">${t('moderateLvl')}</span>`, '', ''));

  box.hidden = false;
  box.innerHTML = `<div class="card-title">🧪 ${t('biowetter')}</div><div class="bio">${rows.join('')}</div>`;
}
function bioRow(icon, label, value, sub) {
  return `<div class="bio-row"><span class="bio-ic">${icon}</span><span class="bio-label">${label}${sub ? ` <i>${sub}</i>` : ''}</span><span class="bio-val">${value}</span></div>`;
}

// ---- Warnings: official DWD (Bright Sky) with local fallback -----------------
function renderAlerts(data, s) {
  const box = $('#alerts');
  const official = data.officialAlerts || [];
  if (official.length) {
    box.hidden = false;
    box.innerHTML = official.slice(0, 4).map((a) => {
      const sev = sevInfo(a.severity);
      const head = getLang() === 'en' ? (a.headlineEn || a.eventEn) : (a.headline || a.event);
      const until = a.expires ? ` · ${t('until')} ${formatTime(a.expires)}` : '';
      return `<div class="alert sev-${sev.key}">
        <span class="alert-ic">${sev.icon}</span>
        <span class="alert-body"><b>${sev.label}</b> ${escapeHtml(head)}<small>${until}</small></span>
      </div>`;
    }).join('');
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
function sevInfo(sev) {
  switch (sev) {
    case 'extreme': return { key: 'extreme', icon: '🟣', label: t('sevExtreme') };
    case 'severe': return { key: 'severe', icon: '🔴', label: t('sevSevere') };
    case 'moderate': return { key: 'moderate', icon: '🟠', label: t('sevModerate') };
    default: return { key: 'minor', icon: '🟡', label: t('sevMinor') };
  }
}

// ---- Family dashboard --------------------------------------------------------
export function renderFamily(places, currents, activeId) {
  const box = $('#family');
  if (!box) return;
  if (!places || places.length < 2) { box.hidden = true; return; }
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
  box.innerHTML = `<div class="card-title">👪 ${t('family')}</div><div class="fam">${rows}</div>`;
}
function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return '📍';
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
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
    <div class="card-title">🌧️ ${t('nowcast')}</div>
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

// ---- Hourly (48h) — combined chart: temp area + precip bars + day/night ------
function renderHourly(data, s) {
  const h = data.forecast.hourly;
  const start = currentHourIndex(h);
  const N = 48;
  const idxs = [];
  for (let i = start; i < Math.min(start + N, h.time.length); i++) idxs.push(i);
  if (!idxs.length) { $('#hourly').innerHTML = ''; return; }
  const temps = idxs.map((i) => h.temperature_2m[i]);
  const min = Math.min(...temps), max = Math.max(...temps);
  const range = Math.max(1, max - min);

  const colW = 58, topPad = 20, chartH = 62, precipH = 20;
  const baseY = topPad + chartH;
  const totalH = baseY + precipH;
  const width = idxs.length * colW;

  const pts = temps.map((tp, k) => [k * colW + colW / 2, topPad + (1 - (tp - min) / range) * chartH]);
  const linePath = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length - 1][0]} ${baseY} L ${pts[0][0]} ${baseY} Z`;

  // Temperature-coloured gradient along the x-axis (userSpaceOnUse)
  const gid = 'hrGrad';
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

  $('#hourly').innerHTML = `
    <div class="card-title">${t('hourly')} <span class="hr-legend">🌡️ <i class="lg-line"></i> ${getLang() === 'en' ? 'temp' : 'Temp.'} · 💧 <i class="lg-bar"></i> ${t('precipProb')}</span></div>
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
    </div>`;
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

  $('#daily').innerHTML = `<div class="card-title">${t('daily')}</div><div class="days">${rows}</div>`;

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
  const dayIso = d.time[dayIdx];
  const target = parseLocal(dayIso);
  const td = target ? target.getUTCDate() : -1;
  const tm = target ? target.getUTCMonth() : -1;
  const idxs = [];
  for (let i = 0; i < h.time.length; i++) {
    const dt = parseLocal(h.time[i]);
    if (dt && dt.getUTCDate() === td && dt.getUTCMonth() === tm && dt.getUTCHours() % 2 === 0) idxs.push(i);
  }
  const cols = idxs.map((i) => {
    const dt = parseLocal(h.time[i]);
    const isDay = h.is_day ? h.is_day[i] === 1 : true;
    const pp = h.precipitation_probability ? h.precipitation_probability[i] : 0;
    return `<div class="dd-col">
      <span class="dd-time">${String(dt.getUTCHours()).padStart(2, '0')}</span>
      <span class="dd-ic">${weatherSVG(h.weather_code[i], isDay)}</span>
      <span class="dd-temp">${tempStr(h.temperature_2m[i])}</span>
      <span class="dd-pp">${pp ? `💧${pp}%` : ''}</span>
    </div>`;
  }).join('');

  const sr = parseLocal(d.sunrise ? d.sunrise[dayIdx] : null);
  const ss = parseLocal(d.sunset ? d.sunset[dayIdx] : null);
  const uvMax = d.uv_index_max ? d.uv_index_max[dayIdx] : null;
  const gust = d.wind_gusts_10m_max ? d.wind_gusts_10m_max[dayIdx] : null;
  const psum = d.precipitation_sum ? d.precipitation_sum[dayIdx] : null;
  const meta = [
    sr ? `🌅 ${formatTime(d.sunrise[dayIdx])}` : null,
    ss ? `🌇 ${formatTime(d.sunset[dayIdx])}` : null,
    gust != null ? `💨 ${num(gust)} ${windUnitLabel(s.units.wind)}` : null,
    uvMax != null ? `🔆 UV ${num(uvMax)}` : null,
    psum != null ? `🌧️ ${num(psum, 1)} ${s.units.temp === 'F' ? 'in' : 'mm'}` : null,
  ].filter(Boolean).map((m) => `<span>${m}</span>`).join('');

  return `<div class="dd-scroll"><div class="dd-cols">${cols}</div></div><div class="dd-meta">${meta}</div>`;
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
