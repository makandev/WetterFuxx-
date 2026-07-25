// ui.js — renders all weather cards into the DOM

import { t, getLang } from './i18n.js';
import { describe, weatherSVG } from './weathercodes.js';
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
  renderNowcast(data);
  renderDetails(data, settings);
  renderHourly(data, settings);
  renderAir(data);
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

// ---- Derived advisories (a "premium" touch, computed locally) ---------------
function renderAlerts(data, s) {
  const box = $('#alerts');
  const c = data.forecast.current;
  const d = data.forecast.daily;
  const alerts = [];
  const gust = c.wind_gusts_10m;
  const uv = d.uv_index_max[0];
  const code = c.weather_code;

  const gustKmh = s.units.wind === 'kmh' ? gust : gust; // already in chosen unit; thresholds tuned for kmh
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
