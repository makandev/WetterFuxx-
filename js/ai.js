// ai.js — optional, opt-in "Ask the Fuxx" AI mode.
//
// Uses the user's OWN Google Gemini API key (free tier). The key is stored ONLY
// in this browser (localStorage) — it is never written into the source, never
// committed, and never sent anywhere except directly to Google's Gemini API.
//
// The AI explains, teaches and searches the live web (Gemini's Google Search
// grounding, which returns real source links). It must NEVER invent weather
// numbers: the app's own Open-Meteo data stays the single source of truth for
// the forecast — that rule is enforced in the system prompt below.

const KEY_STORE = 'wf.ai.v1';
const MODEL = 'gemini-2.0-flash';
const endpoint = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

export function loadAIKey() {
  try { return (JSON.parse(localStorage.getItem(KEY_STORE) || '{}').key) || ''; }
  catch { return ''; }
}
export function saveAIKey(key) {
  try { localStorage.setItem(KEY_STORE, JSON.stringify({ key: (key || '').trim() })); } catch { /* private mode */ }
}
export function clearAIKey() {
  try { localStorage.removeItem(KEY_STORE); } catch { /* private mode */ }
}
export function hasAIKey() { return !!loadAIKey(); }

function systemPrompt(lang) {
  const de = lang !== 'en';
  return de
    ? `Du bist „Fuxx", ein freundlicher Fuchs und Begleiter in einer Familien-Wetter-App.
Deine Aufgabe: neugierige Fragen zu Wetter, Natur, Universum und dem Leben draußen verständlich beantworten – für Kinder und Erwachsene, wie ein guter Lehrer. Warm, klar, kurz.

WICHTIGE REGELN:
• Die App liefert die EXAKTEN Wetterzahlen selbst (aus Open-Meteo). Erfinde NIEMALS Temperaturen, Regenwahrscheinlichkeiten oder eine eigene Vorhersage. Wird nach der konkreten Vorhersage gefragt, nutze die unten mitgelieferten App-Daten oder verweise freundlich auf die Karten der App.
• Nutze die Google-Suche für Aktuelles (Nachrichten, Ereignisse, neue Forschung) und stütze Aussagen auf echte Quellen.
• Bei Gefahr (Gewitter, Sturm, Blitz, Hitze) steht Sicherheit an erster Stelle.
• Antworte in der Sprache der Frage. Halte dich kurz (2–5 Sätze), außer es wird ausdrücklich mehr gewünscht.`
    : `You are "Fuxx", a friendly fox companion in a family weather app.
Your job: answer curious questions about weather, nature, the universe and outdoor life clearly — for kids and adults, like a good teacher. Warm, clear, short.

IMPORTANT RULES:
• The app provides the EXACT weather numbers itself (from Open-Meteo). NEVER invent temperatures, rain chances or your own forecast. If asked for the concrete forecast, use the app data provided below or kindly point to the app's cards.
• Use Google Search for current things (news, events, new research) and ground claims in real sources.
• For danger (thunderstorms, storms, lightning, heat) safety comes first.
• Answer in the language of the question. Keep it short (2–5 sentences) unless more is explicitly requested.`;
}

// Pull up to 5 unique web sources out of the grounding metadata.
function extractSources(cand) {
  const gm = cand && cand.groundingMetadata;
  const chunks = (gm && gm.groundingChunks) || [];
  const seen = new Set(); const out = [];
  for (const c of chunks) {
    const w = c.web || c.retrievedContext;
    if (!w || !w.uri || seen.has(w.uri)) continue;
    seen.add(w.uri);
    out.push({ title: w.title || w.uri, uri: w.uri });
    if (out.length >= 5) break;
  }
  return out;
}

// Ask Gemini. Returns { text, sources }. Throws an Error whose .message is one
// of: 'no-key' | 'network' | 'bad-key' | 'quota' | 'empty' | 'http-<code>'.
export async function askFuxxAI({ question, context = '', history = [], lang = 'de' }) {
  const key = loadAIKey();
  if (!key) throw new Error('no-key');

  const contents = [];
  for (const m of history) {
    if (!m || !m.text) continue;
    contents.push({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.text }] });
  }
  // The live app data rides along only with the newest question, never stored.
  const userText = context ? `${context}\n\n${question}` : question;
  contents.push({ role: 'user', parts: [{ text: userText }] });

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(lang) }] },
    contents,
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
  };

  let res;
  try {
    res = await fetch(endpoint(MODEL, key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { throw new Error('network'); }

  if (res.status === 400 || res.status === 403) throw new Error('bad-key');
  if (res.status === 429) throw new Error('quota');
  if (!res.ok) throw new Error('http-' + res.status);

  const json = await res.json().catch(() => null);
  const cand = json && json.candidates && json.candidates[0];
  const parts = (cand && cand.content && cand.content.parts) || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  if (!text) throw new Error('empty');
  return { text, sources: extractSources(cand) };
}
