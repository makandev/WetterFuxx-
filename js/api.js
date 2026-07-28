// api.js — Open-Meteo integration (free, no API key, no tracking)

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const PHOTON = 'https://photon.komoot.io/api/'; // OSM autocomplete (districts, addresses, ZIP)
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const REVERSE = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const ALERTS = 'https://api.brightsky.dev/alerts'; // official DWD warnings (DE/AT/…)

async function getJSON(url, params, signal) {
  const u = new URL(url);
  if (params) Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) u.searchParams.set(k, Array.isArray(v) ? v.join(',') : v);
  });
  const res = await fetch(u.toString(), { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Search places by name → [{id,name,admin1,country,country_code,lat,lon,tz}]
// Primary: Photon (OSM) → finds districts, streets/addresses and postal codes,
// with an optional location bias so results near the current place rank first.
// Fallback: Open-Meteo geocoding (cities only) when Photon is unavailable.
export async function searchPlaces(query, lang = 'de', bias = null, signal) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const params = { q, limit: 8 };
  if (['de', 'en', 'fr', 'it'].includes(lang)) params.lang = lang;
  if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lon)) {
    params.lat = bias.lat;
    params.lon = bias.lon;
    params.location_bias_scale = 0.3; // gently prefer nearby (e.g. "within Hamburg")
  }
  try {
    const data = await getJSON(PHOTON, params, signal);
    const list = dedupePlaces((data.features || []).map(normalizePhoton).filter(Boolean));
    if (list.length) return list;
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    // fall through to the Open-Meteo fallback below
  }
  if (/^\d+$/.test(q)) return []; // a bare postcode with no Photon hit → nothing useful from Open-Meteo
  try {
    return await searchPlacesOpenMeteo(q, lang);
  } catch {
    return [];
  }
}

// Open-Meteo geocoding (cities/towns only) — used as a fallback.
async function searchPlacesOpenMeteo(query, lang = 'de') {
  const data = await getJSON(GEO, { name: query, count: 8, language: lang, format: 'json' });
  return (data.results || []).map(normalizePlace);
}

// Map one Photon GeoJSON feature → our place model. Coordinates are [lon, lat].
function normalizePhoton(f) {
  const p = f.properties || {};
  const c = (f.geometry || {}).coordinates || [];
  const lon = c[0], lat = c[1];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const name = photonName(p);
  if (!name) return null;
  return {
    id: p.osm_id ? `photon:${p.osm_type || ''}${p.osm_id}` : `geo:${lat.toFixed(4)},${lon.toFixed(4)}`,
    name,
    admin1: photonContext(p, name),
    country: p.country || '',
    country_code: (p.countrycode || '').toUpperCase(),
    lat, lon, tz: 'auto',
  };
}

// The primary label: a named place, else a street(+number), else postcode/city.
function photonName(p) {
  if (p.name) return p.name;
  if (p.street) return p.housenumber ? `${p.street} ${p.housenumber}` : p.street;
  return p.postcode || p.city || p.district || p.county || p.state || p.country || '';
}

// The secondary context line, e.g. "Hamburg" for a district, "20249, Hamburg" for a street.
function photonContext(p, name) {
  const parts = [];
  const add = (v) => { if (v && v !== name && !parts.includes(v)) parts.push(v); };
  if (p.housenumber || p.street) { add(p.postcode); add(p.district); add(p.city); }
  else { add(p.district); add(p.city); }
  add(p.state);
  if (!parts.length) { add(p.county); add(p.country); }
  return parts.slice(0, 2).join(', ');
}

// Drop near-identical hits (same rounded coordinates + name) that OSM often returns.
function dedupePlaces(list) {
  const seen = new Set();
  const out = [];
  for (const r of list) {
    const key = `${r.lat.toFixed(4)},${r.lon.toFixed(4)}|${(r.name || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// Reverse geocode coordinates → a place label
export async function reversePlace(lat, lon, lang = 'de') {
  try {
    const d = await getJSON(REVERSE, { latitude: lat, longitude: lon, localityLanguage: lang });
    const name = d.city || d.locality || d.principalSubdivision || 'Standort';
    return {
      id: `geo:${lat.toFixed(3)},${lon.toFixed(3)}`,
      name,
      admin1: d.principalSubdivision || '',
      country: d.countryName || '',
      country_code: d.countryCode || '',
      lat, lon, tz: 'auto',
    };
  } catch {
    return { id: `geo:${lat.toFixed(3)},${lon.toFixed(3)}`, name: 'Mein Standort', admin1: '', country: '', country_code: '', lat, lon, tz: 'auto' };
  }
}

function normalizePlace(r) {
  return {
    id: String(r.id),
    name: r.name,
    admin1: r.admin1 || '',
    country: r.country || '',
    country_code: r.country_code || '',
    lat: r.latitude,
    lon: r.longitude,
    tz: r.timezone || 'auto',
  };
}

// Full weather bundle for a place
export async function getWeather(place, units = {}) {
  const tempUnit = units.temp === 'F' ? 'fahrenheit' : 'celsius';
  const windUnit = units.wind === 'mph' ? 'mph' : units.wind === 'ms' ? 'ms' : 'kmh';
  const precipUnit = units.temp === 'F' ? 'inch' : 'mm';

  const forecast = await getJSON(FORECAST, {
    latitude: place.lat,
    longitude: place.lon,
    timezone: 'auto',
    temperature_unit: tempUnit,
    wind_speed_unit: windUnit,
    precipitation_unit: precipUnit,
    forecast_days: 14,
    current: [
      'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
      'precipitation', 'weather_code', 'cloud_cover', 'pressure_msl', 'surface_pressure',
      'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    ],
    hourly: [
      'temperature_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation',
      'weather_code', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'is_day',
      'relative_humidity_2m', 'visibility', 'uv_index', 'pressure_msl', 'dew_point_2m', 'cloud_cover',
    ],
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min',
      'apparent_temperature_max', 'apparent_temperature_min',
      'sunrise', 'sunset', 'daylight_duration', 'uv_index_max',
      'precipitation_sum', 'precipitation_probability_max',
      'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant',
    ],
    minutely_15: ['precipitation', 'weather_code'],
  });

  // Air quality (best-effort — may be unavailable in some regions)
  let air = null;
  try {
    air = await getJSON(AIR, {
      latitude: place.lat,
      longitude: place.lon,
      timezone: 'auto',
      current: ['european_aqi', 'pm2_5', 'pm10', 'nitrogen_dioxide', 'ozone', 'sulphur_dioxide', 'carbon_monoxide'],
      hourly: ['alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'olive_pollen', 'ragweed_pollen'],
      forecast_days: 1,
    });
  } catch { /* air quality is optional */ }

  return { place, forecast, air, fetchedAt: Date.now() };
}

// Official DWD severe-weather warnings via Bright Sky (best-effort, DE/AT coverage).
// Bright Sky returns warnings whose validity overlaps roughly "now", but that
// includes ones that only start later today/tomorrow — and occasionally ones
// that have just expired. We therefore drop expired warnings, flag each one as
// currently active or still upcoming, and sort the most relevant first, so a
// heat warning that only begins this afternoon isn't shown as if it's live now.
export async function getAlerts(lat, lon) {
  try {
    const data = await getJSON(ALERTS, { lat, lon });
    const now = Date.now();
    const sevRank = { extreme: 4, severe: 3, moderate: 2, minor: 1 };
    return (data.alerts || []).map((a) => {
      const onsetMs = a.onset ? Date.parse(a.onset) : NaN;
      const expiresMs = a.expires ? Date.parse(a.expires) : NaN;
      const started = Number.isNaN(onsetMs) || onsetMs <= now;
      const ended = !Number.isNaN(expiresMs) && expiresMs <= now;
      return {
        event: a.event_de || a.event_en || a.event || '',
        eventEn: a.event_en || a.event_de || '',
        headline: a.headline_de || a.headline_en || '',
        headlineEn: a.headline_en || a.headline_de || '',
        description: a.description_de || a.description_en || '',
        descriptionEn: a.description_en || a.description_de || '',
        instruction: a.instruction_de || a.instruction_en || '',
        instructionEn: a.instruction_en || a.instruction_de || '',
        severity: (a.severity || 'minor').toLowerCase(),
        onset: a.onset, expires: a.expires,
        active: started && !ended,
        ended,
      };
    })
      .filter((a) => !a.ended) // hide warnings that already ran out (e.g. yesterday's gusts)
      .sort((x, y) => (Number(y.active) - Number(x.active))
        || ((sevRank[y.severity] || 0) - (sevRank[x.severity] || 0))
        || ((x.onset ? Date.parse(x.onset) : 0) - (y.onset ? Date.parse(y.onset) : 0)));
  } catch {
    return [];
  }
}

// Lightweight current conditions for the family dashboard & comparison
export async function getCurrentBrief(place, units = {}) {
  const tempUnit = units.temp === 'F' ? 'fahrenheit' : 'celsius';
  const windUnit = units.wind === 'mph' ? 'mph' : units.wind === 'ms' ? 'ms' : 'kmh';
  try {
    const d = await getJSON(FORECAST, {
      latitude: place.lat, longitude: place.lon, timezone: 'auto',
      temperature_unit: tempUnit, wind_speed_unit: windUnit,
      current: ['temperature_2m', 'weather_code', 'is_day', 'apparent_temperature', 'wind_speed_10m'],
      daily: ['temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max'],
      forecast_days: 1,
    });
    const dy = d.daily || {};
    return {
      temp: d.current.temperature_2m,
      feels: d.current.apparent_temperature,
      code: d.current.weather_code,
      isDay: d.current.is_day === 1,
      wind: d.current.wind_speed_10m,
      hi: dy.temperature_2m_max ? dy.temperature_2m_max[0] : null,
      lo: dy.temperature_2m_min ? dy.temperature_2m_min[0] : null,
      pop: dy.precipitation_probability_max ? dy.precipitation_probability_max[0] : null,
    };
  } catch {
    return null;
  }
}
