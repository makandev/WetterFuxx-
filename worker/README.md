# WetterFuxx — geteilter KI-Zugang über einen Gratis-Proxy

Damit **niemand** einen eigenen Gemini-Schlüssel eintragen muss, kann die App über
einen winzigen **Cloudflare Worker** laufen. Der Schlüssel liegt **geheim im Worker**
und taucht **nie** im öffentlichen App-Code auf.

## Einrichten (≈ 5 Minuten, kostenlos)

1. **Neuen Schlüssel holen** (der alte, den du geteilt hast, ist verbrannt):
   [Google AI Studio → API key](https://aistudio.google.com/apikey). Er beginnt mit `AIza…`.
2. **Cloudflare-Konto** (gratis) → **Workers & Pages → Create Worker**.
3. Den kompletten Inhalt von [`gemini-proxy.js`](./gemini-proxy.js) als Worker-Code
   einfügen und **Deploy** klicken.
4. Im Worker → **Settings → Variables**:
   - **Secret** `GEMINI_KEY` = dein neuer Schlüssel (`AIza…`) — als *Secret*, nicht als Text!
   - **Text** `ALLOWED_ORIGINS` = `https://makandev.github.io` (deine App-Adresse;
     mehrere mit Komma; leer lassen = alle erlauben).
5. Die **Worker-URL** kopieren (z. B. `https://gemini-proxy.dein-name.workers.dev`).
6. In [`js/ai.js`](../js/ai.js) die Zeile `export const AI_PROXY = '';` auf deine
   Worker-URL setzen, committen → nach dem Deploy funktioniert die KI **ohne** Key-Eingabe.
7. **Empfohlen:** in Cloudflare eine kostenlose **Rate-Limiting-Regel** auf die
   Worker-Route legen, damit niemand den geteilten Schlüssel leerläuft.

## Sicherheit
- Die **Worker-URL ist kein Geheimnis** — sie darf in den Code.
- Der **Schlüssel** bleibt ausschließlich als Worker-Secret. Er wird nie an Clients zurückgegeben.
- Wer lieber den eigenen Schlüssel nutzt, kann das weiterhin unter **⚙️ → Eigenen Schlüssel nutzen**.
