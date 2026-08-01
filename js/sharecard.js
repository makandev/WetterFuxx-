// sharecard.js — shareable weather images (Canvas → PNG blob)
// One small canvas toolkit + one builder per view (current, rain 2h, next 6h,
// 14-day, clothing, family). Every card uses the live weather sky-gradient with
// white text + a gold accent, so a shared image always reads as "Wetterfux"
// and stays legible in every theme (light themes keep the same dark sky).

import { describe, iconKey } from './weathercodes.js';
import {
  placeLabel, tempStr, formatHour, formatTime, parseLocal, placeNowMs, setPlaceTz,
  shortDate, dayLabel, isWeekend, num, windUnitLabel, moonPhase, daylightStr,
} from './format.js';
import { t, getLang } from './i18n.js';
import { buildClothingAdvice } from './advice.js';
import { qrModules } from './qr.js';
import { shareURL, familyURL } from './store.js';

// ---- Canvas toolkit ---------------------------------------------------------
const W = 1080, PAD = 72;
const ACCENT = '#ffd479';
const EMOJI = {
  sun: '☀️', 'sun-cloud': '⛅', cloud: '☁️', fog: '🌫️',
  drizzle: '🌦️', rain: '🌧️', sleet: '🌨️', snow: '❄️', thunder: '⛈️',
};
const ico = (code, isDay = true) => {
  const k = iconKey(code);
  if (k === 'sun' && !isDay) return '🌙';
  if (k === 'sun-cloud' && !isDay) return '☁️';
  return EMOJI[k] || '🌡️';
};

const FONT = (w, px) => `${w} ${px}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
const EMOJI_FONT = (px) => `${px}px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', system-ui, sans-serif`;

function createCard(H = 1350) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  return { cv, ctx, H };
}

// Live sky palette — read the same CSS vars the app paints with.
function palette() {
  const cs = getComputedStyle(document.body);
  const v = (n, d) => (cs.getPropertyValue(n).trim() || d);
  return { a: v('--sky-a', '#4a83c4'), b: v('--sky-b', '#2a5a94'), c: v('--sky-c', '#16324f') };
}

function paintBg(ctx, pal, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.a); g.addColorStop(0.45, pal.b); g.addColorStop(1, pal.c);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W / 2, H * 0.30, 60, W / 2, H * 0.30, W);
  rg.addColorStop(0, 'rgba(255,255,255,0.10)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function glass(ctx, x, y, w, h, r = 34) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();
}
function shadowOn(ctx) { ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2; }
function shadowOff(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}
function emoji(ctx, ch, x, y, px, align = 'center') {
  ctx.save(); ctx.font = EMOJI_FONT(px); ctx.textAlign = align;
  ctx.fillText(ch, x, y); ctx.restore();
}
// Wrap centered text into up to 2 lines, return the y after the block.
function wrapCentered(ctx, text, cx, y, maxW, lh) {
  const words = text.split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  const use = lines.slice(0, 2);
  if (lines.length > 2) use[1] = fit(ctx, use[1], maxW);
  use.forEach((ln, i) => ctx.fillText(ln, cx, y + i * lh));
  return y + (use.length - 1) * lh;
}

function header(ctx, { place, sub }) {
  ctx.save(); ctx.textAlign = 'center'; shadowOn(ctx);
  ctx.fillStyle = '#fff'; ctx.font = FONT(600, 58);
  ctx.fillText(fit(ctx, place, W - 2 * PAD), W / 2, 132);
  if (sub) {
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = FONT(500, 34);
    ctx.fillText(sub, W / 2, 182);
  }
  ctx.restore();
}
// Render a scannable QR of `url` on a white rounded tile (with quiet zone).
function drawQR(ctx, url, x, y, box) {
  let qr;
  try { qr = qrModules(url); } catch { qr = null; }
  if (!qr) return;
  const quiet = 4, total = qr.size + quiet * 2, mp = box / total;
  ctx.save(); shadowOff(ctx);
  roundRect(ctx, x, y, box, box, 14); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.fillStyle = '#0b1428';
  for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) {
    if (qr.modules[r][c]) ctx.fillRect(x + (quiet + c) * mp, y + (quiet + r) * mp, mp + 0.6, mp + 0.6);
  }
  ctx.restore();
}
function footer(ctx, H, url) {
  const en = getLang() === 'en';
  const qrBox = 188, qx = W - PAD - qrBox, qy = H - qrBox - 20;
  if (url) {
    drawQR(ctx, url, qx, qy, qrBox);
    ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = FONT(600, 26);
    ctx.fillText(en ? 'scan → open' : 'scannen → öffnen', qx + qrBox / 2, qy - 14);
    ctx.restore();
  }
  // Branding, nudged left when a QR sits in the corner so nothing collides.
  const cx = url ? 430 : W / 2;
  ctx.save(); ctx.textAlign = 'left'; shadowOn(ctx);
  emoji(ctx, '🦊', cx - 150, H - 96, 50);
  ctx.fillStyle = '#fff'; ctx.font = FONT(600, 48);
  ctx.fillText('Wetterfux', cx - 92, H - 96);
  ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = FONT(400, 29);
  ctx.fillText(en ? 'free weather for the family' : 'kostenloses Wetter für die Familie', cx - 150, H - 52);
  ctx.restore();
}
function toBlob(cv) { return new Promise((res) => cv.toBlob(res, 'image/png')); }

// Mirror ui.js so shared "now" lines up with the app.
function currentHourIndex(h) {
  const now = placeNowMs();
  let idx = h.time.findIndex((iso) => { const d = parseLocal(iso); return d && d.getTime() >= now - 3600000; });
  if (idx < 0) idx = h.time.length - 1;
  return Math.max(0, Math.min(idx, h.time.length - 1));
}
function prep(data) { setPlaceTz(data.forecast.utc_offset_seconds); return palette(); }
function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return '📍';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

// ---- Builders ---------------------------------------------------------------

// Current conditions (kept as the default share; export alias below).
export async function buildCurrentBlob(data) {
  const pal = prep(data);
  const c = data.forecast.current;
  const d = data.forecast.daily;
  const H = 1350;
  const { cv, ctx } = createCard(H);
  paintBg(ctx, pal, H);
  ctx.textAlign = 'center';
  header(ctx, { place: placeLabel(data.place), sub: describe(c.weather_code, getLang()) });

  emoji(ctx, ico(c.weather_code, c.is_day === 1), W / 2, 470, 220);
  ctx.save(); shadowOn(ctx); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = FONT(200, 300); ctx.fillText(tempStr(c.temperature_2m), W / 2, 780);
  ctx.font = FONT(500, 46); ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const en = getLang() === 'en';
  ctx.fillText(`${en ? 'High' : 'Höchst'} ${tempStr(d.temperature_2m_max[0])}   ·   ${en ? 'Low' : 'Tiefst'} ${tempStr(d.temperature_2m_min[0])}`, W / 2, 880);
  ctx.font = FONT(400, 42); ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText(`${en ? 'Feels like' : 'Gefühlt'} ${tempStr(c.apparent_temperature)}`, W / 2, 948);
  ctx.restore();

  footer(ctx, H, shareURL(data.place));
  return toBlob(cv);
}

// Rain nowcast — next 2 hours (minutely_15). Falls back to current if absent.
export async function buildRainBlob(data) {
  const pal = prep(data);
  const m = data.forecast.minutely_15;
  if (!m || !m.time || !m.precipitation) return buildCurrentBlob(data);
  const now = placeNowMs();
  let start = m.time.findIndex((iso) => { const d = parseLocal(iso); return d && d.getTime() >= now; });
  if (start < 0) start = 0;
  const times = m.time.slice(start, start + 8);
  const precip = m.precipitation.slice(start, start + 8);
  if (times.length < 2) return buildCurrentBlob(data);

  const raining = precip[0] > 0.05;
  const firstRain = precip.findIndex((p) => p > 0.05);
  const firstDry = precip.findIndex((p) => p <= 0.05);
  const anyRain = precip.some((p) => p > 0.02);
  const msg = raining
    ? (firstDry > 0 ? t('nowcastStopSoon', { min: firstDry * 15 }) : t('nowcastRainNow'))
    : (firstRain > 0 ? t('nowcastRainSoon', { min: firstRain * 15 }) : t('nowcastDryNow'));
  const en = getLang() === 'en';

  const H = 1350;
  const { cv, ctx } = createCard(H);
  paintBg(ctx, pal, H);
  header(ctx, { place: placeLabel(data.place), sub: en ? 'Rain · next 2 hours' : 'Regen · nächste 2 Stunden' });

  // Big action line
  ctx.save(); ctx.textAlign = 'center'; shadowOn(ctx);
  ctx.font = FONT(700, 54); ctx.fillStyle = anyRain ? '#bcd6ff' : '#fff';
  wrapCentered(ctx, msg, W / 2, 300, W - 2 * PAD, 64);
  ctx.restore();

  // Chart panel
  const box = { x: PAD, y: 470, w: W - 2 * PAD, h: 520 };
  glass(ctx, box.x - 24, box.y - 40, box.w + 48, box.h + 150, 40);
  const max = Math.max(0.5, ...precip);

  // gridlines + mm labels
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
  ctx.textAlign = 'right'; ctx.font = FONT(400, 26); ctx.fillStyle = 'rgba(255,255,255,0.6)';
  [0, max].forEach((mm) => {
    const gy = box.y + box.h - (mm / max) * box.h;
    ctx.beginPath(); ctx.moveTo(box.x, gy); ctx.lineTo(box.x + box.w, gy); ctx.stroke();
    ctx.fillText(`${mm.toFixed(1)} mm`, box.x + box.w, gy - 8);
  });

  // bars
  const n = precip.length, gap = 14, bw = (box.w - gap * (n - 1)) / n;
  precip.forEach((p, i) => {
    const bh = Math.max(4, (p / max) * box.h);
    const bx = box.x + i * (bw + gap), by = box.y + box.h - bh;
    roundRect(ctx, bx, by, bw, bh, Math.min(10, bw / 2));
    if (p > 0.05) {
      const g = ctx.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, '#8fb8ff'); g.addColorStop(1, '#4a7fd8');
      ctx.fillStyle = g;
    } else ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
  });

  // x labels every 2nd column
  ctx.textAlign = 'center'; ctx.font = FONT(500, 28); ctx.fillStyle = 'rgba(255,255,255,0.82)';
  times.forEach((iso, i) => {
    if (i % 2) return;
    ctx.fillText(formatHour(iso), box.x + i * (bw + gap) + bw / 2, box.y + box.h + 50);
  });

  footer(ctx, H, shareURL(data.place));
  return toBlob(cv);
}

// Next 6 hours — temp curve + hourly icon/time/rain% row.
export async function buildSixHourBlob(data) {
  const pal = prep(data);
  const h = data.forecast.hourly;
  const start = currentHourIndex(h);
  const idx = [];
  for (let i = start; i < Math.min(start + 6, h.time.length); i++) idx.push(i);
  if (idx.length < 2) return buildCurrentBlob(data);
  const en = getLang() === 'en';

  const H = 1350;
  const { cv, ctx } = createCard(H);
  paintBg(ctx, pal, H);
  header(ctx, { place: placeLabel(data.place), sub: en ? 'Next 6 hours' : 'Nächste 6 Stunden' });

  const temps = idx.map((i) => h.temperature_2m[i]);
  const tmin = Math.min(...temps), tmax = Math.max(...temps), range = Math.max(1, tmax - tmin);
  const colW = (W - 2 * PAD) / idx.length;
  const colX = (k) => PAD + k * colW + colW / 2;

  const curveTop = 300, curveH = 320, baseY = curveTop + curveH;
  const pts = temps.map((tp, k) => [colX(k), baseY - ((tp - tmin) / range) * (curveH - 110) - 55]);

  // area fill
  ctx.beginPath(); ctx.moveTo(pts[0][0], baseY);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(pts[pts.length - 1][0], baseY); ctx.closePath();
  const fill = ctx.createLinearGradient(0, curveTop, 0, baseY);
  fill.addColorStop(0, 'rgba(255,212,121,0.34)'); fill.addColorStop(1, 'rgba(255,212,121,0.02)');
  ctx.fillStyle = fill; ctx.fill();
  // line
  ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineWidth = 5; ctx.strokeStyle = ACCENT; ctx.lineJoin = 'round'; ctx.stroke();
  // temp labels
  ctx.save(); shadowOn(ctx); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = FONT(700, 42);
  pts.forEach(([x, y], k) => ctx.fillText(tempStr(temps[k]), x, y - 26));
  ctx.restore();

  // divider
  const rowY = 810;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, rowY - 52); ctx.lineTo(W - PAD, rowY - 52); ctx.stroke();

  // hour row: time · icon · rain%
  idx.forEach((i, k) => {
    const cx = colX(k);
    const label = k === 0 ? t('now') : formatHour(h.time[i]);
    const prob = h.precipitation_probability ? (h.precipitation_probability[i] || 0) : 0;
    const isDay = h.is_day ? h.is_day[i] === 1 : true;
    ctx.save(); ctx.textAlign = 'center'; shadowOn(ctx);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = FONT(600, 30);
    ctx.fillText(label, cx, rowY);
    ctx.restore();
    emoji(ctx, ico(h.weather_code[i], isDay), cx, rowY + 96, 74);
    if (prob >= 5) {
      ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#9fc0ff'; ctx.font = FONT(600, 30);
      ctx.fillText(`💧 ${prob}%`, cx, rowY + 170);
      ctx.restore();
    }
  });

  footer(ctx, H, shareURL(data.place));
  return toBlob(cv);
}

// 14-day trend — taller card, one row per day with a temp range bar.
export async function buildDailyBlob(data, settings) {
  const pal = prep(data);
  const d = data.forecast.daily;
  const days = Math.min(14, d.time.length);
  const en = getLang() === 'en';

  const H = 1620;
  const { cv, ctx } = createCard(H);
  paintBg(ctx, pal, H);
  header(ctx, { place: placeLabel(data.place), sub: en ? '14-day trend' : '14-Tage-Trend' });

  let gMin = Infinity, gMax = -Infinity;
  for (let i = 0; i < days; i++) { gMin = Math.min(gMin, d.temperature_2m_min[i]); gMax = Math.max(gMax, d.temperature_2m_max[i]); }
  const gRange = Math.max(1, gMax - gMin);

  const top = 250, rowH = (H - top - 180) / days;
  const nameX = PAD, barX = PAD + 250, barW = W - barX - PAD - 96;
  for (let i = 0; i < days; i++) {
    const y = top + i * rowH + rowH / 2;
    const lo = d.temperature_2m_min[i], hi = d.temperature_2m_max[i];
    const we = isWeekend(d.time[i]);
    // weekend highlight
    if (we) { ctx.fillStyle = 'rgba(255,212,121,0.10)'; roundRect(ctx, PAD - 20, y - rowH / 2 + 4, W - 2 * PAD + 40, rowH - 8, 16); ctx.fill(); }
    // day name
    ctx.save(); ctx.textAlign = 'left'; shadowOn(ctx);
    ctx.fillStyle = we ? ACCENT : '#fff'; ctx.font = FONT(700, 34);
    ctx.fillText(dayLabel(d.time[i], i), nameX, y + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = FONT(400, 26);
    ctx.fillText(shortDate(d.time[i]), nameX + 4, y + 40);
    ctx.restore();
    // rain icon
    emoji(ctx, ico(d.weather_code[i]), barX - 60, y + 12, 40);
    // range bar track
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; roundRect(ctx, barX, y - 9, barW, 18, 9); ctx.fill();
    const left = ((lo - gMin) / gRange) * barW;
    const wdt = Math.max(14, ((hi - lo) / gRange) * barW);
    const g = ctx.createLinearGradient(barX + left, 0, barX + left + wdt, 0);
    g.addColorStop(0, '#7fb8ff'); g.addColorStop(1, '#ff9d5c');
    ctx.fillStyle = g; roundRect(ctx, barX + left, y - 9, wdt, 18, 9); ctx.fill();
    // lo / hi labels
    ctx.save(); shadowOn(ctx); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = FONT(600, 30);
    ctx.textAlign = 'right'; ctx.fillText(tempStr(lo), barX - 4, y + 10);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(tempStr(hi), barX + barW + 12, y + 10);
    ctx.restore();
  }

  footer(ctx, H, shareURL(data.place));
  return toBlob(cv);
}

// Clothing tip — the fox's recommendation, ready to send to family.
export async function buildClothingBlob(data, settings) {
  const pal = prep(data);
  const a = buildClothingAdvice(data, settings);
  const en = getLang() === 'en';
  const H = 1350;
  const { cv, ctx } = createCard(H);
  paintBg(ctx, pal, H);
  header(ctx, { place: placeLabel(data.place), sub: en ? 'What to wear today' : 'Anziehtipp für heute' });

  emoji(ctx, a.emoji || '🦊', W / 2, 400, 180);
  ctx.save(); ctx.textAlign = 'center'; shadowOn(ctx);
  ctx.fillStyle = '#fff'; ctx.font = FONT(700, 56);
  wrapCentered(ctx, a.title || '', W / 2, 500, W - 2 * PAD, 66);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = FONT(400, 40);
  wrapCentered(ctx, a.summary || '', W / 2, 600, W - 2 * PAD, 52);
  ctx.restore();

  // item chips
  const items = (a.items || []).slice(0, 6);
  let y = 720;
  ctx.font = FONT(500, 36);
  items.forEach((it) => {
    const label = `${it.emoji}  ${it.text}`;
    const tw = ctx.measureText(label).width + 70;
    const cw = Math.min(tw, W - 2 * PAD);
    const x = (W - cw) / 2;
    glass(ctx, x, y, cw, 74, 37);
    ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = FONT(500, 36);
    ctx.fillText(fit(ctx, label, cw - 40), W / 2, y + 49);
    ctx.restore();
    y += 92;
  });

  // umbrella verdict
  const umb = a.umbrella ? (en ? '☂️ Umbrella: yes' : '☂️ Schirm: ja') : (en ? '☂️ Umbrella: no' : '☂️ Schirm: nein');
  ctx.save(); ctx.textAlign = 'center'; shadowOn(ctx);
  ctx.fillStyle = a.umbrella ? '#bcd6ff' : 'rgba(255,255,255,0.8)'; ctx.font = FONT(700, 40);
  ctx.fillText(umb, W / 2, Math.min(y + 40, H - 180));
  ctx.restore();

  footer(ctx, H, shareURL(data.place));
  return toBlob(cv);
}

// Family weather — one row per saved place. Signature differs (no `data`).
export async function buildFamilyBlob(places, currents) {
  const pal = palette();
  const en = getLang() === 'en';
  const rows = places.map((p, i) => ({ p, cur: currents[i] })).filter((r) => r.cur);
  if (!rows.length) return null;
  const H = 1350;
  const { cv, ctx } = createCard(H);
  paintBg(ctx, pal, H);
  header(ctx, { place: en ? 'Our family weather' : 'Unser Familien-Wetter', sub: 'Wetterfux' });

  // warmest / driest markers
  let warm = 0, dry = 0;
  rows.forEach((r, i) => {
    if (r.cur.temp > rows[warm].cur.temp) warm = i;
    if ((r.cur.pop ?? 100) < (rows[dry].cur.pop ?? 100)) dry = i;
  });

  const top = 240, maxRows = Math.min(rows.length, 6); // keep clear of the footer QR
  const rowH = Math.min(150, (H - top - 260) / maxRows);
  for (let i = 0; i < maxRows; i++) {
    const { p, cur } = rows[i];
    const y = top + i * rowH;
    glass(ctx, PAD, y, W - 2 * PAD, rowH - 16, 28);
    const midY = y + (rowH - 16) / 2;
    emoji(ctx, flagEmoji(p.country_code), PAD + 56, midY + 14, 52);
    ctx.save(); shadowOn(ctx); ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = FONT(600, 40);
    ctx.fillText(fit(ctx, p.name, 380), PAD + 110, midY + 4);
    const marks = `${i === warm ? '🔥' : ''}${i === dry ? '☀️' : ''}`;
    if (marks) { ctx.font = FONT(400, 34); ctx.fillText(marks, PAD + 110, midY + 46); }
    ctx.restore();
    emoji(ctx, ico(cur.code, cur.isDay), W - PAD - 230, midY + 18, 60);
    ctx.save(); shadowOn(ctx); ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = FONT(300, 68);
    ctx.fillText(tempStr(cur.temp), W - PAD - 44, midY + 22);
    ctx.restore();
  }

  footer(ctx, H, familyURL(places));
  return toBlob(cv);
}

// Weekend — the upcoming Saturday + Sunday as two big tiles. The most-asked
// WhatsApp weather question ("what's the weekend doing?").
export async function buildWeekendBlob(data) {
  const pal = prep(data);
  const d = data.forecast.daily;
  const en = getLang() === 'en';
  // pick the next up-to-two weekend days within the forecast window
  const wk = [];
  for (let i = 0; i < Math.min(9, d.time.length) && wk.length < 2; i++) {
    if (isWeekend(d.time[i])) wk.push(i);
  }
  if (!wk.length) return buildDailyBlob(data);

  const H = 1350;
  const { cv, ctx } = createCard(H);
  paintBg(ctx, pal, H);
  header(ctx, { place: placeLabel(data.place), sub: en ? 'Your weekend' : 'Dein Wochenende' });

  const n = wk.length;
  const gap = 44, tileW = (W - 2 * PAD - (n - 1) * gap) / n, tileH = 620, top = 300;
  wk.forEach((i, k) => {
    const x = PAD + k * (tileW + gap);
    glass(ctx, x, top, tileW, tileH, 40);
    const cx = x + tileW / 2;
    ctx.save(); ctx.textAlign = 'center'; shadowOn(ctx);
    ctx.fillStyle = ACCENT; ctx.font = FONT(700, 52);
    ctx.fillText(dayLabel(d.time[i], i), cx, top + 90);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = FONT(400, 34);
    ctx.fillText(shortDate(d.time[i]), cx, top + 138);
    ctx.restore();
    emoji(ctx, ico(d.weather_code[i]), cx, top + 320, 150);
    ctx.save(); ctx.textAlign = 'center'; shadowOn(ctx);
    ctx.fillStyle = '#fff'; ctx.font = FONT(300, 92);
    ctx.fillText(`${tempStr(d.temperature_2m_max[i])} / ${tempStr(d.temperature_2m_min[i])}`, cx, top + 430);
    const pp = d.precipitation_probability_max ? (d.precipitation_probability_max[i] || 0) : 0;
    ctx.fillStyle = '#9fc0ff'; ctx.font = FONT(600, 40);
    ctx.fillText(`💧 ${pp}%`, cx, top + 520);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = FONT(400, 34);
    ctx.fillText(fit(ctx, describe(d.weather_code[i], getLang()), tileW - 40), cx, top + 578);
    ctx.restore();
  });

  footer(ctx, H, shareURL(data.place));
  return toBlob(cv);
}

// Sun & Moon — sunrise/sunset arc, day length, moon phase.
export async function buildSunMoonBlob(data) {
  const pal = prep(data);
  const d = data.forecast.daily;
  const en = getLang() === 'en';
  const H = 1350;
  const { cv, ctx } = createCard(H);
  paintBg(ctx, pal, H);
  ctx.textAlign = 'center';
  header(ctx, { place: placeLabel(data.place), sub: en ? 'Sun & Moon' : 'Sonne & Mond' });

  const sr = d.sunrise ? d.sunrise[0] : null, ss = d.sunset ? d.sunset[0] : null;
  const srD = parseLocal(sr), ssD = parseLocal(ss);
  const moon = moonPhase(new Date());

  // Sun arc (upper semicircle from sunrise horizon to sunset horizon)
  const cx = W / 2, cyB = 560, r = 300;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.26)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(cx, cyB, r, Math.PI, 2 * Math.PI); ctx.stroke();
  if (srD && ssD && ssD.getTime() > srD.getTime()) {
    const now = placeNowMs();
    const prog = Math.max(0, Math.min(1, (now - srD.getTime()) / (ssD.getTime() - srD.getTime())));
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(cx, cyB, r, Math.PI, Math.PI + Math.PI * prog); ctx.stroke();
    const ang = Math.PI + Math.PI * prog;
    const sxp = cx + Math.cos(ang) * r, syp = cyB + Math.sin(ang) * r;
    ctx.shadowColor = 'rgba(255,200,110,0.8)'; ctx.shadowBlur = 26;
    emoji(ctx, prog > 0 && prog < 1 ? '☀️' : '🌙', sxp, syp + 22, 64);
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  // Sunrise / sunset under the arc ends
  ctx.save(); shadowOn(ctx); ctx.textAlign = 'center';
  const drawEnd = (x, e, lbl, time) => {
    emoji(ctx, e, x, cyB + 74, 52);
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = FONT(500, 32); ctx.fillText(lbl, x, cyB + 120);
    ctx.fillStyle = '#fff'; ctx.font = FONT(700, 52); ctx.fillText(time, x, cyB + 174);
  };
  drawEnd(cx - r + 20, '🌅', en ? 'Sunrise' : 'Aufgang', srD ? formatTime(sr) : '—');
  drawEnd(cx + r - 20, '🌇', en ? 'Sunset' : 'Untergang', ssD ? formatTime(ss) : '—');
  // Day length in the centre of the arc
  if (d.daylight_duration && d.daylight_duration[0] != null) {
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = FONT(500, 34); ctx.fillText(en ? 'Daylight' : 'Tageslänge', cx, cyB - 150);
    ctx.fillStyle = '#fff'; ctx.font = FONT(700, 60); ctx.fillText(daylightStr(d.daylight_duration[0]), cx, cyB - 88);
  }
  ctx.restore();

  // Moon block
  const my = 900, mw = W - 2 * PAD;
  glass(ctx, PAD, my, mw, 250, 34);
  emoji(ctx, moon.emoji, PAD + 130, my + 160, 130);
  ctx.save(); shadowOn(ctx); ctx.textAlign = 'left';
  ctx.fillStyle = '#fff'; ctx.font = FONT(600, 56); ctx.fillText(fit(ctx, moon.name, mw - 320), PAD + 250, my + 110);
  ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = FONT(400, 40);
  ctx.fillText(`${en ? 'Illumination' : 'Beleuchtung'} ${moon.illum}%`, PAD + 250, my + 172);
  ctx.restore();

  footer(ctx, H, shareURL(data.place));
  return toBlob(cv);
}

// Back-compat: the header share button still imports buildShareBlob.
export const buildShareBlob = buildCurrentBlob;

// Registry for the per-card share dispatcher in app.js.
export const SHARE_BUILDERS = {
  current: buildCurrentBlob,
  rain: buildRainBlob,
  six: buildSixHourBlob,
  daily: buildDailyBlob,
  weekend: buildWeekendBlob,
  clothing: buildClothingBlob,
  sunmoon: buildSunMoonBlob,
};
