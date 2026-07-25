// ui.js — renders all weather cards into the DOM

import { t, getLang } from './i18n.js';
import { describe, weatherSVG } from './weathercodes.js';
import { buildClothingAdvice } from './advice.js';
import { mountRadar } from './radar.js';
import {
  tempStr, num, windDir, windUnitLabel, formatHour, formatTime, dayLabel,
  uvLevel, aqiLevel, pollenLevel, moonPhase, daylightStr, placeLabel, placeSub,
} from './format.js';

const $ = (sel) => document.querySelector(sel);

export function renderAll(data, settings) {
  const c = data.forecast.current;
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
  box.innerHTML = `
    <div class="card-title">🧥 ${t('clothing')}</div>
    <div class="cloth-head">
      <span class="cloth-big">${a.emoji}</span>
      <span class="cloth-title">${a.title}</span>
    </div>
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
  const hours = todayHours(data.forecast.hourly, s.units);
  if (hours.length < 2) { box.hidden = true; return; }

  const acts = [
    { icon: '🌳', label: t('actOutdoor'), score: outdoorScore },
    { icon: '🏃', label: t('actSport'), score: sportScore },
    { icon: '🧺', label: t('actLaundry'), score: laundryScore },
  ];
  const rows = acts.map((a) => {
    const win = bestWindow(hours, a.score);
    const val = win ? (win.allDay ? t('actAllDay') : `${win.from}–${win.to} ${getLang() === 'en' ? '' : 'Uhr'}`.trim()) : t('actNone');
    return `<div class="act-row">
      <span class="act-ic">${a.icon}</span>
      <span class="act-label">${a.label}</span>
      <span class="act-win ${win ? 'ok' : 'no'}">${val}</span>
    </div>`;
  }).join('');
  box.hidden = false;
  box.innerHTML = `<div class="card-title">🕒 ${t('activityTitle')}</div><div class="acts">${rows}</div>`;
}

function todayHours(h, units) {
  const out = [];
  if (!h || !h.time) return out;
  const now = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < h.time.length; i++) {
    const dt = new Date(h.time[i]);
    if (dt.getTime() < now - 1800000) continue;
    if (dt.getDate() !== today.getDate() || dt.getMonth() !== today.getMonth()) break;
    out.push({
      hour: dt.getHours(),
      feels: toC(h.apparent_temperature ? h.apparent_temperature[i] : h.temperature_2m[i], units.temp),
      prob: h.precipitation_probability ? h.precipitation_probability[i] : 0,
      precip: h.precipitation ? h.precipitation[i] : 0,
      wind: toKmhU(h.wind_speed_10m ? h.wind_speed_10m[i] : 0, units.wind),
      hum: h.relative_humidity_2m ? h.relative_humidity_2m[i] : 60,
      uv: h.uv_index ? h.uv_index[i] : 0,
      isDay: h.is_day ? h.is_day[i] === 1 : true,
    });
  }
  return out;
}
function outdoorScore(x) {
  if (!x.isDay) return 0;
  let s = 100;
  s -= Math.abs(x.feels - 20) * 3.5;
  s -= x.prob * 0.9;
  s -= Math.max(0, x.wind - 20) * 1.2;
  if (x.uv >= 8) s -= 15;
  return s;
}
function sportScore(x) {
  if (!x.isDay) return 0;
  let s = 100;
  s -= Math.abs(x.feels - 14) * 3.5;
  s -= x.prob * 1.1;
  s -= Math.max(0, x.wind - 25) * 1.2;
  if (x.precip > 0.1) s -= 30;
  return s;
}
function laundryScore(x) {
  if (!x.isDay) return 0;
  let s = 100;
  if (x.precip > 0.05 || x.prob > 25) return 0;
  s -= Math.max(0, x.hum - 55) * 1.4;
  s += Math.min(20, x.wind);
  s -= Math.max(0, 12 - x.feels) * 2;
  return s;
}
function bestWindow(hours, scoreFn, threshold = 55) {
  const good = hours.map((h) => scoreFn(h) >= threshold);
  if (good.every((g) => g)) return { allDay: true };
  let best = null, start = -1;
  for (let i = 0; i <= hours.length; i++) {
    if (i < hours.length && good[i]) { if (start < 0) start = i; }
    else if (start >= 0) {
      const len = i - start;
      if (!best || len > best.len) best = { start, end: i - 1, len };
      start = -1;
    }
  }
  if (!best) return null;
  const from = hours[best.start].hour;
  const to = (hours[best.end].hour + 1) % 24;
  return { from: pad2(from), to: pad2(to) };
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
  const uv = d.uv_index_max[0];
  const code = c.weather_code;
  if (s.units.wind === 'kmh' && gust >= 60) alerts.push({ icon: '💨', txt: getLang() === 'en' ? `Strong gusts up to ${Math.round(gust)} km/h` : `Sturmböen bis ${Math.round(gust)} km/h` });
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
    return `<div class="fam-row${p.id === activeId ? ' active' : ''}" data-i="${i}">
      <span class="fam-flag">${flagEmoji(p.country_code)}</span>
      <span class="fam-name">${escapeHtml(p.name)}</span>
      <span class="fam-ic">${ic}</span>
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
function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Unit helpers reused by activity/bio calculations
function toC(v, unit) { return unit === 'F' ? (v - 32) * 5 / 9 : v; }
function toKmhU(v, unit) { return unit === 'mph' ? v * 1.60934 : unit === 'ms' ? v * 3.6 : v; }

// ---- Rain nowcast (minutely_15) ---------------------------------------------
function renderNowcast(data) {
  const box = $('#nowcast');
  const m = data.forecast.minutely_15;
  if (!m || !m.time) { box.hidden = true; return; }
  const now = Date.now();
  // next 8 slots = 2 hours
  let start = m.time.findIndex((iso) => new Date(iso).getTime() >= now);
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
  const uv = d.uv_index_max[0];
  const uvL = uvLevel(uv || 0);
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

// ---- Hourly (48h) ------------------------------------------------------------
function renderHourly(data, s) {
  const h = data.forecast.hourly;
  const start = currentHourIndex(h);
  const N = 48;
  const idxs = [];
  for (let i = start; i < Math.min(start + N, h.time.length); i++) idxs.push(i);
  const temps = idxs.map((i) => h.temperature_2m[i]);
  const min = Math.min(...temps), max = Math.max(...temps);
  const range = Math.max(1, max - min);

  // temperature curve as svg polyline overlaid — build points relative to columns
  const colW = 62, chartH = 46;
  const points = temps.map((tp, i) => {
    const x = i * colW + colW / 2;
    const y = 8 + (1 - (tp - min) / range) * chartH;
    return `${x},${y.toFixed(1)}`;
  }).join(' ');

  const cols = idxs.map((i, k) => {
    const isDay = h.is_day ? h.is_day[i] === 1 : true;
    const pp = h.precipitation_probability ? h.precipitation_probability[i] : null;
    const label = k === 0 ? t('now') : formatHour(h.time[i]);
    return `<div class="hr-col" style="width:${colW}px">
      <span class="hr-time">${label}</span>
      <span class="hr-ic">${weatherSVG(h.weather_code[i], isDay)}</span>
      <span class="hr-temp">${tempStr(h.temperature_2m[i])}</span>
      <span class="hr-pp ${pp >= 30 ? 'on' : ''}">${pp != null && pp > 0 ? `💧${pp}%` : ''}</span>
    </div>`;
  }).join('');

  const width = idxs.length * colW;
  $('#hourly').innerHTML = `
    <div class="card-title">${t('hourly')}</div>
    <div class="hr-scroll">
      <div class="hr-inner" style="width:${width}px">
        <svg class="hr-curve" viewBox="0 0 ${width} 62" preserveAspectRatio="none" style="width:${width}px">
          <polyline points="${points}" class="curve-line"/>
        </svg>
        <div class="hr-cols">${cols}</div>
      </div>
    </div>`;
}

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

  box.innerHTML = `
    <div class="card-title">🍃 ${t('airQuality')}</div>
    <div class="aqi-main">
      <div class="aqi-ring ${lvl.cls}">
        <span class="aqi-val">${Math.round(a.european_aqi)}</span>
        <span class="aqi-lbl">AQI</span>
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
  const now = Date.now();
  const srT = new Date(sr).getTime(), ssT = new Date(ss).getTime();
  const prog = Math.max(0, Math.min(1, (now - srT) / (ssT - srT)));
  const moon = moonPhase(new Date());

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
    return `<div class="day-row">
      <span class="day-name">${dayLabel(iso, i)}</span>
      <span class="day-ic">${weatherSVG(d.weather_code[i], true)}</span>
      <span class="day-pp">${pp ? `💧${pp}%` : ''}</span>
      <span class="day-lo">${tempStr(lo)}</span>
      <span class="day-bar"><span class="day-fill" style="left:${left}%;width:${Math.max(6, width)}%"></span></span>
      <span class="day-hi">${tempStr(hi)}</span>
    </div>`;
  }).join('');

  $('#daily').innerHTML = `<div class="card-title">${t('daily')}</div><div class="days">${rows}</div>`;
}

// ---- helpers -----------------------------------------------------------------
function currentHourIndex(h) {
  const now = Date.now();
  let idx = h.time.findIndex((iso) => new Date(iso).getTime() >= now - 3600000);
  return idx < 0 ? 0 : idx;
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
