// sharecard.js — render a shareable weather image (Canvas → PNG blob)

import { describe, iconKey } from './weathercodes.js';
import { placeLabel, tempStr } from './format.js';
import { getLang } from './i18n.js';

const EMOJI = {
  sun: '☀️', 'sun-cloud': '⛅', cloud: '☁️', fog: '🌫️',
  drizzle: '🌦️', rain: '🌧️', sleet: '🌨️', snow: '❄️', thunder: '⛈️',
};

export async function buildShareBlob(data, settings) {
  const c = data.forecast.current;
  const d = data.forecast.daily;
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // Background gradient from the current sky palette
  const cs = getComputedStyle(document.body);
  const a = (cs.getPropertyValue('--sky-a').trim()) || '#3d7fd6';
  const b = (cs.getPropertyValue('--sky-c').trim()) || '#16324f';
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, a); g.addColorStop(1, b);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // subtle vignette
  const rg = ctx.createRadialGradient(W / 2, H * 0.32, 60, W / 2, H * 0.32, W);
  rg.addColorStop(0, 'rgba(255,255,255,0.10)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';

  // place
  ctx.font = '600 62px system-ui, sans-serif';
  ctx.fillText(truncate(placeLabel(data.place), 24), W / 2, 170);

  // weather emoji
  ctx.font = '220px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.fillText(EMOJI[iconKey(c.weather_code)] || '🌡️', W / 2, 470);

  // big temperature
  ctx.font = '200 300px system-ui, sans-serif';
  ctx.fillText(tempStr(c.temperature_2m), W / 2, 760);

  // condition
  ctx.font = '500 60px system-ui, sans-serif';
  ctx.fillText(describe(c.weather_code, getLang()), W / 2, 850);

  // hi / lo
  ctx.font = '46px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const hilo = `${getLang() === 'en' ? 'High' : 'Höchst'} ${tempStr(d.temperature_2m_max[0])}   ·   ${getLang() === 'en' ? 'Low' : 'Tiefst'} ${tempStr(d.temperature_2m_min[0])}`;
  ctx.fillText(hilo, W / 2, 930);

  // feels like
  ctx.font = '42px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(`${getLang() === 'en' ? 'Feels like' : 'Gefühlt'} ${tempStr(c.apparent_temperature)}`, W / 2, 1000);

  // branding footer
  ctx.font = '600 52px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('🦊 Wetterfux', W / 2, 1230);
  ctx.font = '34px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(getLang() === 'en' ? 'free weather for the whole family' : 'kostenloses Wetter für die ganze Familie', W / 2, 1285);

  return new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
}

function truncate(s, n) { return s.length > n ? `${s.slice(0, n - 1)}…` : s; }
