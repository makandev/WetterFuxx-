// app.js — application controller

import { t, setLang, getLang, LANGS } from './i18n.js';
import { searchPlaces, reversePlace, getWeather, getAlerts, getCurrentBrief } from './api.js';
import { skyGroup } from './weathercodes.js';
import { placeLabel } from './format.js';
import { initEffects, setScene } from './effects.js';
import { invalidateRadar } from './radar.js';
import { renderAll, renderFamily, renderCompare, escapeHtml } from './ui.js';
import {
  loadSettings, saveSettings, loadPlaces, addPlace, removePlace, isSaved,
  placeFromParams, shareURL, samePlace, familyURL, familyFromParams, importPlaces,
  bumpStreak, getStreak, openedOn,
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
  wireTabs();
  wireThemePicker();
  renderSavedChips();
  renderStreak();
  applyLayout();
  maybeShowThemePicker(); // first visit → let people pick a look right away

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

// ---- Swipeable tabs ----------------------------------------------------------
let activeTab = 0;
function wireTabs() {
  const pager = $('#pager');
  if (!pager) return;
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const i = +tab.dataset.tab;
      pager.scrollTo({ left: i * pager.clientWidth, behavior: 'smooth' });
      setActiveTab(i);
    });
  });
  let raf = 0;
  pager.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      setActiveTab(Math.round(pager.scrollLeft / pager.clientWidth));
    });
  }, { passive: true });
  window.addEventListener('resize', () => { pager.scrollLeft = activeTab * pager.clientWidth; scheduleMasonry(); });
}
function setActiveTab(i) {
  if (i < 0 || i > 3 || i === activeTab) return;
  activeTab = i;
  document.querySelectorAll('.tab').forEach((tab) => {
    const on = +tab.dataset.tab === i;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', String(on));
  });
  // On desktop only the active page is shown; on mobile the class is harmless
  document.querySelectorAll('.page').forEach((p, idx) => p.classList.toggle('active-page', idx === i));
  if (i === 1) setTimeout(invalidateRadar, 250); // Verlauf → recompute map size
  if (i === 0) scheduleMasonry();
}

// ---- Desktop masonry: pack Heute's cards tightly into columns (no gaps) ------
const MASONRY_IDS = ['streakCard', 'ask', 'moment', 'clothing', 'nowcast', 'hourly',
  'daily', 'details', 'activity', 'activities', 'airbio', 'sunmoon'];
let masonryRAF = 0;
function applyMasonry() {
  const page = document.getElementById('page-today');
  if (!page) return;
  const footer = page.querySelector('.foot');
  const items = MASONRY_IDS.map((id) => document.getElementById(id)).filter(Boolean);
  let wrap = page.querySelector('.masonry');
  const desktop = window.matchMedia('(min-width: 900px)').matches;
  if (!desktop) { // mobile → single column, unwrap
    if (wrap) { items.forEach((el) => page.insertBefore(el, footer)); wrap.remove(); }
    return;
  }
  const cols = window.matchMedia('(min-width: 1500px)').matches ? 3 : 2;
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'masonry'; page.insertBefore(wrap, footer); }
  wrap.textContent = ''; // detaches mcols; item refs in `items` stay valid
  const colEls = [];
  for (let i = 0; i < cols; i++) { const c = document.createElement('div'); c.className = 'mcol'; wrap.appendChild(c); colEls.push(c); }
  items.forEach((el) => {
    let min = 0;
    for (let i = 1; i < colEls.length; i++) if (colEls[i].offsetHeight < colEls[min].offsetHeight) min = i;
    colEls[min].appendChild(el);
  });
}
function scheduleMasonry() {
  if (masonryRAF) cancelAnimationFrame(masonryRAF);
  masonryRAF = requestAnimationFrame(() => { masonryRAF = 0; applyMasonry(); });
}

function applyStaticText() {
  document.documentElement.lang = getLang();
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
  $('#layoutTitle').textContent = getLang() === 'en' ? '🧩 Customize cards' : '🧩 Karten anpassen';
  const enL = getLang() === 'en';
  $('#themeTitle').textContent = enL ? '🎨 Choose your look' : '🎨 Wähle dein Design';
  $('#themeSub').textContent = enL ? 'Tap to preview – you can change it anytime.' : 'Tippe zum Vorschauen – du kannst es jederzeit ändern.';
  $('#themeDone').textContent = enL ? 'Let’s go' : 'Los geht’s';
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
    scheduleMasonry();
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
  if (places.length < 2) {
    renderFamily(places, [], currentPlace && currentPlace.id);
    renderCompare(places, [], settings);
    return;
  }
  renderFamily(places, new Array(places.length).fill(null), currentPlace && currentPlace.id);
  const currents = await Promise.all(places.map((p) => getCurrentBrief(p, settings.units)));
  if (reqId !== familyReqId) return; // superseded
  renderFamily(places, currents, currentPlace && currentPlace.id);
  renderCompare(places, currents, settings);
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
  buildLayoutList();
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
  else if ((key === 'lang' || key === 'cold' || key === 'profile') && currentData) { renderAll(currentData, settings); scheduleMasonry(); }
}

function applyTheme(design) {
  // "auto" maps to the balanced Aurora (dark) — light themes looked too bright
  // on many desktop screens; users can still pick a light theme explicitly.
  const d = (!design || design === 'auto') ? 'aurora' : design;
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
  $('#family').addEventListener('click', (e) => {
    if (e.target.closest('.fam-share')) shareFamily();
    else if (e.target.closest('.fam-add-btn')) openSearch();
  });
  $('#sunmoon').addEventListener('click', (e) => {
    const b = e.target.closest('.ics-btn');
    if (b) downloadICS(b.dataset.start, b.dataset.end, b.dataset.title);
  });
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

// ---- Daily streak (a proper little widget) -----------------------------------
function renderStreak() {
  const s = bumpStreak();
  const en = getLang() === 'en';
  // keep the tiny header pill for at-a-glance, hide it on day 1
  const pill = $('#streakPill');
  if (pill) {
    if (s.count >= 2) { pill.hidden = false; pill.textContent = `🔥 ${s.count}`; pill.title = en ? `Best: ${s.best}` : `Bestwert: ${s.best}`; }
    else pill.hidden = true;
  }
  const box = $('#streakCard');
  if (!box) return;
  box.hidden = false;

  // 7-day tracker (Mon..today), filled if the app was opened that day
  const now = new Date();
  const dots = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86400000);
    const opened = openedOn(day) || i === 0; // today counts (just bumped)
    const wd = (en ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['S', 'M', 'D', 'M', 'D', 'F', 'S'])[day.getDay()];
    dots.push(`<div class="sk-day"><span class="sk-dot ${opened ? 'on' : ''}">${opened ? '🔥' : ''}</span><span class="sk-wd">${wd}</span></div>`);
  }
  let motiv;
  if (s.count >= 2 && s.count === s.best) motiv = en ? `🎉 New record — ${s.count} days!` : `🎉 Neuer Rekord — ${s.count} Tage!`;
  else if (s.best > s.count) motiv = en ? `${s.best - s.count + 1} more to beat your record of ${s.best}.` : `Noch ${s.best - s.count + 1} bis zu deinem Rekord von ${s.best}.`;
  else if (s.count === 1) motiv = en ? 'Day 1 — come back tomorrow to build your streak!' : 'Tag 1 — komm morgen wieder für deine Serie!';
  else motiv = en ? 'Keep it going!' : 'Bleib dran!';

  box.innerHTML = `
    <div class="sk-head">
      <div class="sk-flame">🔥<span class="sk-count">${s.count}</span></div>
      <div class="sk-txt">
        <b>${en ? 'Day streak' : 'Tage-Serie'}</b>
        <span class="sk-best">${en ? 'Best' : 'Rekord'}: ${s.best} 🏆</span>
      </div>
    </div>
    <div class="sk-week">${dots.join('')}</div>
    <div class="sk-motiv">${motiv}</div>`;
}

// ---- Calendar (.ics) for golden hour ----------------------------------------
async function downloadICS(startStamp, endStamp, title) {
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const uid = `wetterfux-${startStamp}-${Math.floor(Math.random() * 1e6)}@wetterfux`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wetterfux//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dtstamp}`, `DTSTART:${startStamp}`, `DTEND:${endStamp}`,
    `SUMMARY:${title}`, 'DESCRIPTION:Wetterfux', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY',
    `DESCRIPTION:${title}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  const file = new File([ics], 'goldene-stunde.ics', { type: 'text/calendar' });
  // On phones, sharing the file lets the OS offer "Add to calendar"
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
  } catch { /* fall back to download */ }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = 'goldene-stunde.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Dashboard layout (order + hidden) --------------------------------------
const CARD_IDS = ['ask', 'moment', 'clothing', 'nowcast', 'hourly', 'daily', 'details',
  'activity', 'activities', 'family', 'compare', 'airbio', 'radar', 'sunmoon'];
function cardLabel(id) {
  const de = { ask: 'Frag Wetterfux', moment: 'Wetter-Moment', clothing: 'Kleidungstipp', nowcast: 'Regen-Nowcast', hourly: 'Stündlich', daily: '14-Tage', details: 'Details', activity: 'Beste Zeit', activities: 'Aktivitäten', family: 'Familien-Wetter', compare: 'Orte vergleichen', airbio: 'Luft & Biowetter', radar: 'RegenRadar', sunmoon: 'Sonne & Mond' };
  const en = { ask: 'Ask Wetterfux', moment: 'Weather moment', clothing: 'Clothing tip', nowcast: 'Rain nowcast', hourly: 'Hourly', daily: '14-day', details: 'Details', activity: 'Best time', activities: 'Activities', family: 'Family weather', compare: 'Compare places', airbio: 'Air & bio', radar: 'Rain radar', sunmoon: 'Sun & moon' };
  return (getLang() === 'en' ? en : de)[id] || id;
}
function currentOrder() {
  const saved = (settings.layout && settings.layout.order) || [];
  const valid = saved.filter((id) => CARD_IDS.includes(id));
  const missing = CARD_IDS.filter((id) => !valid.includes(id));
  return [...valid, ...missing];
}
function applyLayout() {
  if ($('#pager')) return; // multi-page mode manages placement itself
  const app = document.querySelector('.app');
  const footer = document.querySelector('.foot');
  const hidden = (settings.layout && settings.layout.hidden) || [];
  currentOrder().forEach((id) => {
    const el = document.getElementById(id);
    if (el && footer) app.insertBefore(el, footer);
  });
  CARD_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.toggleAttribute('data-huser', hidden.includes(id));
  });
}
function buildLayoutList() {
  const list = $('#layoutList');
  if (!list) return;
  if ($('#pager')) { // card manager is disabled in multi-page mode for now
    list.hidden = true;
    const head = document.querySelector('.set-layout-head');
    if (head) head.hidden = true;
    return;
  }
  const hidden = (settings.layout && settings.layout.hidden) || [];
  const order = currentOrder();
  list.innerHTML = order.map((id, i) => `
    <div class="layout-row" data-id="${id}">
      <button class="lay-move" data-dir="up" ${i === 0 ? 'disabled' : ''} aria-label="hoch">↑</button>
      <button class="lay-move" data-dir="down" ${i === order.length - 1 ? 'disabled' : ''} aria-label="runter">↓</button>
      <span class="lay-name">${cardLabel(id)}</span>
      <label class="lay-toggle"><input type="checkbox" ${hidden.includes(id) ? '' : 'checked'} /></label>
    </div>`).join('');
  list.querySelectorAll('.lay-move').forEach((btn) => btn.addEventListener('click', () => {
    const row = btn.closest('.layout-row');
    const id = row.dataset.id;
    const ord = currentOrder();
    const idx = ord.indexOf(id);
    const to = btn.dataset.dir === 'up' ? idx - 1 : idx + 1;
    if (to < 0 || to >= ord.length) return;
    ord.splice(to, 0, ord.splice(idx, 1)[0]);
    settings.layout.order = ord;
    saveSettings(settings); applyLayout(); buildLayoutList();
  }));
  list.querySelectorAll('.lay-toggle input').forEach((cb) => cb.addEventListener('change', () => {
    const id = cb.closest('.layout-row').dataset.id;
    let h = (settings.layout.hidden || []).filter((x) => x !== id);
    if (!cb.checked) h.push(id);
    settings.layout.hidden = h;
    saveSettings(settings); applyLayout();
  }));
}

// ---- First-visit theme picker ------------------------------------------------
const THEME_SWATCHES = [
  { id: 'aurora', name: 'Aurora', c: ['#6db3ff', '#16324f'], dot: '#ffd479' },
  { id: 'midnight', name: 'Midnight', c: ['#26406e', '#080f22'], dot: '#7cc4ff' },
  { id: 'nebula', name: 'Nebula', c: ['#7a2a9a', '#2a0f3a'], dot: '#f5a8e0' },
  { id: 'forest', name: 'Forest', c: ['#1e5a3a', '#0a2016'], dot: '#ffcf6e' },
  { id: 'mono', name: 'Mono', c: ['#3a3f46', '#15171b'], dot: '#e6e8ec' },
  { id: 'matrix', name: 'Matrix', c: ['#053d17', '#000600'], dot: '#39ff88' },
  { id: 'bitcoin', name: 'Bitcoin', c: ['#3a2606', '#0e0a02'], dot: '#f7931a' },
  { id: 'daylight', name: 'Daylight', c: ['#cfe4ff', '#a9c9f5'], dot: '#e8820c' },
  { id: 'sand', name: 'Sand', c: ['#f5e6cf', '#e6c9a0'], dot: '#c25a2b' },
  { id: 'mist', name: 'Mist', c: ['#e8edf3', '#cbd4de'], dot: '#3a6ea5' },
];
function buildThemePicker() {
  const grid = $('#themeGrid');
  if (!grid) return;
  grid.innerHTML = THEME_SWATCHES.map((tm) => `
    <button class="tp-swatch${settings.theme === tm.id ? ' sel' : ''}" data-theme="${tm.id}" style="background:linear-gradient(150deg, ${tm.c[0]}, ${tm.c[1]})">
      <span class="tp-dot" style="background:${tm.dot}"></span><span class="tp-name">${tm.name}</span>
    </button>`).join('');
  grid.querySelectorAll('.tp-swatch').forEach((b) => b.addEventListener('click', () => {
    settings.theme = b.dataset.theme;
    applyTheme(b.dataset.theme);
    saveSettings(settings);
    grid.querySelectorAll('.tp-swatch').forEach((x) => x.classList.toggle('sel', x === b));
  }));
}
function showThemePicker() { buildThemePicker(); $('#themePicker').classList.add('open'); }
function maybeShowThemePicker() {
  try { if (localStorage.getItem('wf.themePicked')) return; } catch { return; }
  showThemePicker();
}
function wireThemePicker() {
  const done = $('#themeDone');
  if (done) done.addEventListener('click', () => {
    try { localStorage.setItem('wf.themePicked', '1'); } catch { /* private mode */ }
    $('#themePicker').classList.remove('open');
  });
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
  if ($('#pager')) return; // pages scroll independently; PTR handled per-page later
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
