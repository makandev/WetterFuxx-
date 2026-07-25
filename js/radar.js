// radar.js — animated precipitation radar (Leaflet + RainViewer, both free)
// Leaflet is loaded as a global `L` via <script> in index.html.

import { t, getLang } from './i18n.js';
import { formatTime } from './format.js';

const RAINVIEWER = 'https://api.rainviewer.com/public/weather-maps.json';
const OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

let map = null;
let baseLayer = null;
let marker = null;
let frames = [];
let host = '';
let layerCache = {};
let activeIdx = -1;
let playing = false;
let timer = null;
let inited = false;
let pending = null;

// Public: ensure the radar is initialised for a place (lazy — waits for visibility)
export function mountRadar(place) {
  pending = place;
  const box = document.getElementById('radar');
  if (!box) return;
  if (inited) { recenter(place); return; }

  // Lazy-init when the card scrolls into view (saves tile bandwidth)
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      init(place);
    }
  }, { rootMargin: '200px' });
  io.observe(box);
}

function init(place) {
  if (inited || typeof window.L === 'undefined') return;
  inited = true;
  const L = window.L;
  const mapEl = document.getElementById('radar-map');

  map = L.map(mapEl, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: false,
  }).setView([place.lat, place.lon], 7);

  baseLayer = L.tileLayer(OSM, {
    maxZoom: 12, minZoom: 3,
    attribution: '&copy; OpenStreetMap · Radar: RainViewer',
  }).addTo(map);

  marker = L.marker([place.lat, place.lon], { icon: pinIcon(L) }).addTo(map);

  wireControls();
  loadFrames();
  // refresh radar data every 5 minutes while the page is open
  setInterval(loadFrames, 5 * 60 * 1000);
}

function pinIcon(L) {
  return L.divIcon({
    className: 'radar-pin',
    html: '<div class="radar-pin-dot"></div>',
    iconSize: [22, 22], iconAnchor: [11, 11],
  });
}

function recenter(place) {
  if (!map) return;
  map.setView([place.lat, place.lon], map.getZoom() || 7, { animate: true });
  if (marker) marker.setLatLng([place.lat, place.lon]);
}

async function loadFrames() {
  try {
    const res = await fetch(RAINVIEWER, { cache: 'no-store' });
    const data = await res.json();
    host = data.host;
    const past = (data.radar && data.radar.past) || [];
    const now = (data.radar && data.radar.nowcast) || [];
    const newFrames = [...past, ...now];
    if (!newFrames.length) return;
    // clear old cached layers
    Object.values(layerCache).forEach((l) => { if (map) map.removeLayer(l); });
    layerCache = {};
    frames = newFrames;
    // default to the most recent observed frame (end of past)
    activeIdx = Math.max(0, past.length - 1);
    const slider = document.getElementById('radar-slider');
    if (slider) { slider.max = String(frames.length - 1); slider.value = String(activeIdx); }
    showFrame(activeIdx);
    updateStatus();
    if (!playing) startPlay(); // auto-play the loop
  } catch (e) {
    const status = document.getElementById('radar-status');
    if (status) status.textContent = getLang() === 'en' ? 'Radar unavailable' : 'Radar nicht verfügbar';
  }
}

function frameLayer(i) {
  if (layerCache[i]) return layerCache[i];
  const f = frames[i];
  const url = `${host}${f.path}/256/{z}/{x}/{y}/4/1_1.png`;
  const layer = window.L.tileLayer(url, { opacity: 0, maxZoom: 12, minZoom: 3, tileSize: 256 });
  layer.addTo(map);
  layerCache[i] = layer;
  return layer;
}

function showFrame(i) {
  if (!frames.length) return;
  const prev = layerCache[activeIdx];
  const layer = frameLayer(i);
  layer.setOpacity(0.7);
  if (prev && prev !== layer) prev.setOpacity(0);
  activeIdx = i;
  const slider = document.getElementById('radar-slider');
  if (slider) slider.value = String(i);
  updateStatus();
}

function updateStatus() {
  const status = document.getElementById('radar-status');
  if (!status || !frames[activeIdx]) return;
  const f = frames[activeIdx];
  const time = new Date(f.time * 1000);
  const diffMin = Math.round((f.time * 1000 - Date.now()) / 60000);
  let label;
  if (diffMin > 1) label = getLang() === 'en' ? `Forecast +${diffMin} min` : `Vorhersage +${diffMin} Min.`;
  else if (diffMin >= -1) label = getLang() === 'en' ? 'Now' : 'Jetzt';
  else label = `${formatTime(time.toISOString())}`;
  status.textContent = label;
  status.classList.toggle('forecast', diffMin > 1);
}

function startPlay() {
  playing = true;
  const btn = document.getElementById('radar-play');
  if (btn) btn.textContent = '⏸';
  clearInterval(timer);
  timer = setInterval(() => {
    let next = activeIdx + 1;
    if (next >= frames.length) next = 0;
    showFrame(next);
  }, 700);
}
function stopPlay() {
  playing = false;
  const btn = document.getElementById('radar-play');
  if (btn) btn.textContent = '▶';
  clearInterval(timer);
}
function togglePlay() { playing ? stopPlay() : startPlay(); }

function wireControls() {
  const btn = document.getElementById('radar-play');
  const slider = document.getElementById('radar-slider');
  if (btn) btn.addEventListener('click', togglePlay);
  if (slider) slider.addEventListener('input', (e) => {
    stopPlay();
    showFrame(parseInt(e.target.value, 10));
  });
}
