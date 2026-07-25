// api.js — Open-Meteo integration (free, no API key, no tracking)

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const REVERSE = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

async function getJSON(url, params) {
  const u = new URL(url);
  if (params) Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) u.searchParams.set(k, Array.isArray(v) ? v.join(',') : v);
  });
  const res = await fetch(u.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Search places by name → [{id,name,admin1,country,country_code,lat,lon,tz}]
export async function searchPlaces(query, lang = 'de') {
  if (!query || query.trim().length < 2) return [];
  const data = await getJSON(GEO, { name: query.trim(), count: 8, language: lang, format: 'json' });
  return (data.results || []).map(normalizePlace);
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
      'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'is_day',
      'relative_humidity_2m', 'visibility', 'uv_index',
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
