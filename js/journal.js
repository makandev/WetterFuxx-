// journal.js — symptom diary analysis (personal bio-weather)
// Pure functions: correlate self-reported symptoms with the weather snapshot
// captured at entry time. All local, privacy-friendly. Not medical advice.

export const SYMPTOMS = [
  { key: 'headache', emoji: '🤕', de: 'Kopfschmerz', en: 'Headache' },
  { key: 'migraine', emoji: '🧠', de: 'Migräne', en: 'Migraine' },
  { key: 'joints', emoji: '🦴', de: 'Gelenke', en: 'Joints' },
  { key: 'circulation', emoji: '💓', de: 'Kreislauf', en: 'Circulation' },
  { key: 'sleep', emoji: '😴', de: 'Schlaf', en: 'Sleep' },
  { key: 'mood', emoji: '🌥️', de: 'Stimmung', en: 'Mood' },
];

export function symptomLabel(key, en) {
  const s = SYMPTOMS.find((x) => x.key === key);
  return s ? (en ? s.en : s.de) : key;
}
export function symptomEmoji(key) {
  const s = SYMPTOMS.find((x) => x.key === key);
  return s ? s.emoji : '•';
}

// Correlation insight for the most-logged symptom vs 12h pressure change
export function buildInsights(entries, en) {
  if (!entries || entries.length < 4) return null;
  const counts = {};
  entries.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const withP = entries.filter((e) => e.type === top && e.wx && typeof e.wx.p12 === 'number');
  if (withP.length < 4) return null;
  const avg = withP.reduce((s, e) => s + e.wx.p12, 0) / withP.length;
  const falling = withP.filter((e) => e.wx.p12 < -2).length;
  const pct = Math.round((falling / withP.length) * 100);
  const lbl = symptomLabel(top, en);
  const text = en
    ? `In ${falling} of ${withP.length} ${lbl.toLowerCase()} entries the air pressure was falling (avg ${avg.toFixed(1)} hPa/12h).`
    : `Bei ${falling} von ${withP.length} ${lbl}-Einträgen fiel der Luftdruck (Ø ${avg.toFixed(1)} hPa/12 h).`;
  return { top, count: withP.length, avg, pct, text, sensitive: avg < -1.5 };
}

// Personalised risk for today from the user's own pattern + today's pressure trend
export function personalRisk(entries, snapshot, en) {
  const ins = buildInsights(entries, en);
  const p12 = snapshot && typeof snapshot.p12 === 'number' ? snapshot.p12 : null;
  if (!ins || p12 == null) return null;
  if (ins.sensitive && p12 < -3) {
    return { level: 'high', text: en
      ? 'Elevated — pressure is falling and your entries often line up with that.'
      : 'Erhöht – der Luftdruck fällt, und deine Einträge passen oft dazu.' };
  }
  if (ins.sensitive && p12 < -1) {
    return { level: 'mod', text: en
      ? 'Slightly elevated — pressure is easing off.'
      : 'Leicht erhöht – der Luftdruck gibt etwas nach.' };
  }
  return { level: 'low', text: en
    ? 'Normal — nothing in the pressure pattern stands out today.'
    : 'Normal – im Luftdruck-Muster sticht heute nichts hervor.' };
}
