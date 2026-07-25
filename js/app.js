// app.js — application controller

import { t, setLang, getLang, LANGS } from './i18n.js';
import { searchPlaces, reversePlace, getWeather, getAlerts, getCurrentBrief } from './api.js';
import { skyGroup } from './weathercodes.js';
import { placeLabel } from './format.js';
import { initEffects, setScene } from './effects.js';
import { renderAll, renderFamily, escapeHtml } from './ui.js';
import {
  loadSettings, saveSettings, loadPlaces, addPlace, removePlace, isSaved,
  placeFromParams, shareURL, samePlace, familyURL, familyFromParams, importPlaces,
} from './store.js';
import { buildShareBlob } from './sharecard.js';

const $ = (s) => document.querySelector(s);
let settings = loadSettings();
let currentPlace = null;
let currentData = null;
let searchTimer = null;

async function boot() {
  setLang(settings.lang);
  applyTheme(settings.theme);
  applyStaticText();
  initEffects($('#bg-canvas'));
  wireEvents();
  renderSavedChips();

  // 0) shared family set  1) shared single place  2) last used  3) geolocation  4) default
  const fam = familyFromParams(location.search);
  if (fam && fam.length) {
    importPlaces(fam);
    renderSavedChips();
    return selectPlace(fam[0], false);
  }
  const shared = placeFromParams(location.search);
  if (shared) return selectPlace(shared, false);

  const saved = loadPlaces();
  const last = saved.find((p) => p.id === settings.lastPlaceId) || saved[0];
  if (last) return selectPlace(last, false);

  // First visit, nothing saved → friendly welcome (permission priming)
  showWelcome();
}

function showWelcome() { $('#welcome').classList.add('open'); }
function hideWelcome() { $('#welcome').classList.remove('open'); }

function applyStaticText() {
  document.documentElement.lang = getLang();
  $('#tagline').textContent = t('tagline');
  $('#searchInput').placeholder = t('search');
  $('#btnLocate').title = t('myLocation');
  $('#btnSearch').title = t('search');
  $('#btnSettings').title = t('settings');
  $('#btnShare').title = t('share');
  $('#savedTitle').textContent = t('saved');
  $('#welcomeTitle').textContent = t('welcomeTitle');
  $('#welcomeText').textContent = t('welcomeText');
  $('#welcomeLocate').textContent = t('useLocation');
  $('#welcomeSearch').textContent = t('searchPlaceBtn');
  $('#updateBanner').textContent = t('updateAvail');
  $('#offlineBanner').textContent = t('offlineNote');
  $('#btnInstall').textContent = t('installApp');
  document.title = `${t('appName')} · ${t('tagline')}`;
}

// ---- Place selection & data loading -----------------------------------------
let selReqId = 0;
async function selectPlace(place, updateHistory = true) {
  const my = ++selReqId;
  hideWelcome();
  currentPlace = place;
  settings.lastPlaceId = place.id;
  saveSettings(settings);
  showLoading();
  $('#placeName').textContent = placeLabel(place);
  $('#placeSub').textContent = '';
  updateStar();
  if (updateHistory) {
    const url = new URL(location.href);
    url.search = '';
    history.replaceState({}, '', url);
  }
  try {
    const [data, officialAlerts] = await Promise.all([
      getWeather(place, settings.units),
      getAlerts(place.lat, place.lon),
    ]);
    if (my !== selReqId) return; // a newer selection superseded this one
    data.officialAlerts = officialAlerts;
    currentData = data;
    const c = data.forecast.current;
    setScene(skyGroup(c.weather_code), c.is_day === 1);
    renderAll(data, settings);
    updateThemeColor();
    hideLoading();
    refreshFamily();
  } catch (e) {
    console.error(e);
    if (my !== selReqId) return;
    showError(navigator.onLine ? t('errGeneric') : t('errOffline'));
  }
}

// Family dashboard: live current conditions for every saved place
let familyReqId = 0;
async function refreshFamily() {
  const places = loadPlaces();
  const reqId = ++familyReqId;
  if (places.length < 2) { renderFamily(places, [], currentPlace && currentPlace.id); return; }
  renderFamily(places, new Array(places.length).fill(null), currentPlace && currentPlace.id);
  const currents = await Promise.all(places.map((p) => getCurrentBrief(p, settings.units)));
  if (reqId !== familyReqId) return; // superseded
  renderFamily(places, currents, currentPlace && currentPlace.id);
  wireFamilyRows(places);
}
function wireFamilyRows(places) {
  document.querySelectorAll('#family .fam-row').forEach((row) => {
    const go = () => selectPlace(places[+row.dataset.i]);
    row.addEventListener('click', go);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

function refresh() {
  if (currentPlace) selectPlace(currentPlace, false);
}

// ---- Geolocation -------------------------------------------------------------
function tryGeolocation() {
  showLoading();
  if (!navigator.geolocation) return fallbackDefault();
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const place = await reversePlace(latitude, longitude, getLang());
      selectPlace(place, false);
    },
    () => fallbackDefault(),
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
  );
}
function fallbackDefault() {
  const saved = loadPlaces()[0];
  if (saved) return selectPlace(saved, false);
  selectPlace({ id: 'default:berlin', name: 'Berlin', admin1: 'Berlin', country: 'Deutschland',
    country_code: 'DE', lat: 52.52, lon: 13.405, tz: 'Europe/Berlin' }, false);
}

// ---- Search overlay ----------------------------------------------------------
function openSearch() {
  $('#searchOverlay').classList.add('open');
  $('#searchInput').value = '';
  $('#searchResults').innerHTML = '';
  setTimeout(() => $('#searchInput').focus(), 50);
}
function closeSearch() { $('#searchOverlay').classList.remove('open'); }

function onSearchInput(e) {
  const q = e.target.value;
  clearTimeout(searchTimer);
  if (q.trim().length < 2) { $('#searchResults').innerHTML = ''; return; }
  searchTimer = setTimeout(async () => {
    try {
      const results = await searchPlaces(q, getLang());
      renderSearchResults(results);
    } catch { $('#searchResults').innerHTML = `<div class="search-empty">${t('errSearch')}</div>`; }
  }, 250);
}
function renderSearchResults(results) {
  const box = $('#searchResults');
  if (!results.length) { box.innerHTML = `<div class="search-empty">${t('errSearch')}</div>`; return; }
  box.innerHTML = results.map((r, i) => `
    <button class="search-item" data-i="${i}">
      <span class="si-flag" aria-hidden="true">${flagEmoji(r.country_code)}</span>
      <span class="si-main"><b>${escapeHtml(r.name)}</b><small>${escapeHtml([r.admin1, r.country].filter(Boolean).join(', '))}</small></span>
      <span class="si-add" aria-hidden="true">＋</span>
    </button>`).join('');
  box.querySelectorAll('.search-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = results[+btn.dataset.i];
      addPlace(r);
      renderSavedChips();
      closeSearch();
      selectPlace(r);
    });
  });
}

// ---- Saved places chips ------------------------------------------------------
function renderSavedChips() {
  const wrap = $('#savedChips');
  const places = loadPlaces();
  const emptyEl = $('#savedEmpty');
  if (!places.length) { wrap.innerHTML = ''; emptyEl.hidden = false; emptyEl.textContent = t('noSaved'); return; }
  emptyEl.hidden = true;
  wrap.innerHTML = places.map((p, i) => `
    <div class="chip${currentPlace && samePlace(p, currentPlace) ? ' active' : ''}" data-i="${i}" role="button" tabindex="0" aria-label="${escapeHtml(p.name)}">
      <span class="chip-flag" aria-hidden="true">${flagEmoji(p.country_code)}</span>
      <span class="chip-name">${escapeHtml(p.name)}</span>
      <button class="chip-x" data-del="${i}" title="${t('remove')}" aria-label="${t('remove')} ${escapeHtml(p.name)}">×</button>
    </div>`).join('');
  wrap.querySelectorAll('.chip').forEach((chip) => {
    const go = (e) => {
      if (e.target.classList.contains('chip-x')) return;
      selectPlace(places[+chip.dataset.i]);
    };
    chip.addEventListener('click', go);
    chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
  });
  wrap.querySelectorAll('.chip-x').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const removed = places[+btn.dataset.del];
      removePlace(removed);
      renderSavedChips();
      refreshFamily();
    });
  });
}

function toggleStar() {
  if (!currentPlace) return;
  if (isSaved(currentPlace)) removePlace(currentPlace);
  else addPlace(currentPlace);
  updateStar();
  renderSavedChips();
  refreshFamily();
}
function updateStar() {
  const btn = $('#btnStar');
  if (!currentPlace) { btn.hidden = true; return; }
  btn.hidden = false;
  const saved = isSaved(currentPlace);
  btn.classList.toggle('on', saved);
  btn.textContent = saved ? '★' : '☆';
}

// ---- Share -------------------------------------------------------------------
async function share() {
  if (!currentPlace) return;
  const url = shareURL(currentPlace);
  const text = t('shareText', { place: currentPlace.name });
  // Try sharing a rendered weather image (best on mobile)
  try {
    if (currentData && navigator.canShare) {
      const blob = await buildShareBlob(currentData, settings);
      if (blob) {
        const file = new File([blob], 'wetterfux.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: t('appName'), text, url });
          return;
        }
      }
    }
  } catch { /* fall through to link sharing */ }
  if (navigator.share) {
    try { await navigator.share({ title: t('appName'), text, url }); return; } catch { /* cancelled */ }
  }
  try { await navigator.clipboard.writeText(url); toast(t('copied')); }
  catch { prompt(t('share'), url); }
}

async function shareFamily() {
  const places = loadPlaces();
  if (places.length < 2) return;
  const url = familyURL(places);
  const text = getLang() === 'en' ? 'Our family weather – with Wetterfux' : 'Unser Familien-Wetter – mit Wetterfux';
  if (navigator.share) {
    try { await navigator.share({ title: t('appName'), text, url }); return; } catch { /* cancelled */ }
  }
  try { await navigator.clipboard.writeText(url); toast(t('copied')); }
  catch { prompt(t('share'), url); }
}

// ---- Settings panel ----------------------------------------------------------
function openSettings() {
  const panel = $('#settingsPanel');
  panel.classList.add('open');
  panel.querySelector('[data-set="temp"]').value = settings.units.temp;
  panel.querySelector('[data-set="wind"]').value = settings.units.wind;
  panel.querySelector('[data-set="cold"]').value = settings.person.cold;
  panel.querySelector('[data-set="profile"]').value = settings.person.profile;
  panel.querySelector('[data-set="lang"]').value = settings.lang;
  panel.querySelector('[data-set="theme"]').value = settings.theme;
}
function closeSettings() { $('#settingsPanel').classList.remove('open'); }
function onSettingChange(e) {
  const key = e.target.dataset.set;
  const val = e.target.value;
  if (key === 'temp') settings.units.temp = val;
  else if (key === 'wind') settings.units.wind = val;
  else if (key === 'cold') settings.person.cold = val;
  else if (key === 'profile') settings.person.profile = val;
  else if (key === 'lang') { settings.lang = val; setLang(val); applyStaticText(); }
  else if (key === 'theme') { settings.theme = val; applyTheme(val); }
  saveSettings(settings);
  if (key === 'temp' || key === 'wind') refresh();
  else if ((key === 'lang' || key === 'cold' || key === 'profile') && currentData) renderAll(currentData, settings);
}

function applyTheme(design) {
  const d = design === 'auto'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'daylight' : 'aurora')
    : design;
  document.body.dataset.design = d;
  updateThemeColor();
}
function updateThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const c = getComputedStyle(document.body).getPropertyValue('--sky-c').trim();
  if (c) meta.setAttribute('content', c);
}

// ---- UI helpers --------------------------------------------------------------
function showLoading() { $('#loader').hidden = false; $('#errorBox').hidden = true; }
function hideLoading() { $('#loader').hidden = true; }
function showError(msg) {
  hideLoading();
  const box = $('#errorBox');
  box.hidden = false;
  box.querySelector('.err-msg').textContent = msg;
}
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return '📍';
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

// ---- Wiring ------------------------------------------------------------------
function wireEvents() {
  $('#btnSearch').addEventListener('click', openSearch);
  $('#searchClose').addEventListener('click', closeSearch);
  $('#searchOverlay').addEventListener('click', (e) => { if (e.target.id === 'searchOverlay') closeSearch(); });
  $('#searchInput').addEventListener('input', onSearchInput);
  $('#btnLocate').addEventListener('click', tryGeolocation);
  $('#btnStar').addEventListener('click', toggleStar);
  $('#btnShare').addEventListener('click', share);
  $('#family').addEventListener('click', (e) => { if (e.target.closest('.fam-share')) shareFamily(); });
  $('#btnSettings').addEventListener('click', openSettings);
  $('#settingsClose').addEventListener('click', closeSettings);
  $('#settingsPanel').addEventListener('click', (e) => { if (e.target.id === 'settingsPanel') closeSettings(); });
  $('#errRetry').addEventListener('click', refresh);
  document.querySelectorAll('[data-set]').forEach((el) => el.addEventListener('change', onSettingChange));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSearch(); closeSettings(); }
    if (e.key === '/' && !isTyping()) { e.preventDefault(); openSearch(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentData && Date.now() - currentData.fetchedAt > 600000) refresh();
  });
}
function isTyping() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
}

// ---- Onboarding wiring -------------------------------------------------------
function wireWelcome() {
  $('#welcomeLocate').addEventListener('click', () => { hideWelcome(); tryGeolocation(); });
  $('#welcomeSearch').addEventListener('click', () => { hideWelcome(); openSearch(); });
  // Empty saved list acts as a call to action
  $('#savedEmpty').addEventListener('click', openSearch);
}

// ---- Install prompt (Android/Desktop) ---------------------------------------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = $('#btnInstall');
  if (btn) btn.hidden = false;
});
function wireInstall() {
  const btn = $('#btnInstall');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch { /* ignore */ }
    deferredPrompt = null;
    btn.hidden = true;
  });
  window.addEventListener('appinstalled', () => { btn.hidden = true; deferredPrompt = null; });
}

// ---- Offline awareness -------------------------------------------------------
function wireOffline() {
  const banner = $('#offlineBanner');
  const update = () => {
    if (navigator.onLine) {
      banner.hidden = true;
      if (currentData && Date.now() - currentData.fetchedAt > 300000) refresh();
    } else {
      banner.hidden = false;
    }
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  if (!navigator.onLine) banner.hidden = false;
}

// ---- Pull to refresh ---------------------------------------------------------
function wirePullToRefresh() {
  const ptr = $('#ptr');
  let startY = 0, pulling = false, dist = 0;
  const THRESH = 70;
  window.addEventListener('touchstart', (e) => {
    if (window.scrollY <= 0 && e.touches.length === 1) { startY = e.touches[0].clientY; pulling = true; }
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    dist = e.touches[0].clientY - startY;
    if (dist > 0 && window.scrollY <= 0) {
      const d = Math.min(dist, 110);
      ptr.style.transform = `translateX(-50%) translateY(${d}px)`;
      ptr.classList.toggle('ready', d >= THRESH);
    }
  }, { passive: true });
  window.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    if (dist >= THRESH) { ptr.classList.add('spin'); refresh(); setTimeout(() => ptr.classList.remove('spin'), 900); }
    ptr.style.transform = 'translateX(-50%) translateY(0)';
    ptr.classList.remove('ready');
    dist = 0;
  });
}

// ---- Service worker with controlled update ----------------------------------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            const banner = $('#updateBanner');
            banner.hidden = false;
            banner.onclick = () => { banner.hidden = true; nw.postMessage('SKIP_WAITING'); };
          }
        });
      });
      let refreshed = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshed) return; refreshed = true; location.reload();
      });
    } catch { /* SW optional */ }
  });
}

wireWelcome();
wireInstall();
wireOffline();
wirePullToRefresh();
registerSW();
boot();
