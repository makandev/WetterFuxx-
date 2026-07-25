# 🦊 Wetterfux

**Deine professionelle Wetter-App – kostenlos, für die ganze Familie.**

Wetterfux bietet Funktionen, die andere Apps hinter einer Bezahlschranke verstecken –
komplett gratis, ohne Werbung, ohne Konto, ohne Tracking. Läuft als installierbare
Web-App (PWA) auf Handy, Tablet und Desktop.

![Wetterfux](icons/icon-512.png)

---

## ✨ Funktionen

| Kategorie | Was drin ist |
|-----------|--------------|
| **Aktuell** | Temperatur, gefühlte Temperatur, Höchst-/Tiefstwerte, animiertes Wettersymbol |
| **Vorhersage** | **48 h stündlich** mit Temperaturkurve · **14-Tage-Trend** mit Min/Max-Balken |
| **Regen-Radar** | Nowcast: „Regen in X Minuten“ auf 15-Minuten-Basis (nächste 2 h) |
| **Luftqualität** | Europäischer Luftqualitätsindex (AQI), PM2.5, PM10, Ozon, NO₂ |
| **Pollen** | Gräser, Birke, Erle, Ambrosia, Beifuß, Olive |
| **Gesundheit** | UV-Index mit Empfehlung, Taupunkt, Luftfeuchte, Luftdruck, Sicht |
| **Sonne & Mond** | Sonnenauf-/untergang mit Tagesbogen, Tageslänge, Mondphase |
| **Warnungen** | Automatische Hinweise bei Sturmböen, Gewitter, Glatteis, extremer UV-Strahlung |
| **Komfort** | Mehrere Orte speichern · GPS-Standort · Suche · °C/°F · km/h/mph/m/s · DE/EN · Hell/Dunkel |
| **Teilen** | Orte per Link mit der Familie teilen · installierbar (Startbildschirm) · offline-fähig |

Die Oberfläche passt Farben und Animationen dynamisch ans Wetter und die Tageszeit an
(Sonnenstrahlen, ziehende Wolken, Regen, Schnee, Sternenhimmel bei Nacht).

---

## 📊 Datenquelle

Alle Wetterdaten kommen von [**Open-Meteo**](https://open-meteo.com/) – einem kostenlosen,
offenen Wetterdienst **ohne API-Schlüssel** und ohne Nutzer-Tracking. Reverse-Geocoding
(Koordinaten → Ortsname) über [BigDataCloud](https://www.bigdatacloud.com/). Es entstehen
**keine Kosten** – weder für dich noch für deine Familie.

---

## 🚀 So veröffentlichst du die App (einmalig)

Damit deine Familie die App über einen Link öffnen und installieren kann, wird sie über
**GitHub Pages** bereitgestellt – gratis.

1. Änderungen in den Standard-Branch (`main`) mergen.
2. Im Repository: **Settings → Pages → Build and deployment → Source: „GitHub Actions“** wählen.
3. Der enthaltene Workflow (`.github/workflows/deploy.yml`) veröffentlicht die App automatisch.
4. Nach ~1 Minute ist sie erreichbar unter:

   ```
   https://<dein-benutzername>.github.io/<repo-name>/
   ```

Diesen Link schickst du an deine Familie. 🎉

### Auf dem Handy installieren
- **iPhone (Safari):** Teilen-Symbol → „Zum Home-Bildschirm“.
- **Android (Chrome):** Menü ⋮ → „App installieren“ / „Zum Startbildschirm hinzufügen“.

Danach startet Wetterfux wie eine echte App – im Vollbild, mit eigenem Icon, offline-fähig.

---

## 🔗 Orte teilen

In der App auf **↗ Teilen** tippen. Es wird ein Link erzeugt, der den gewählten Ort enthält
(z. B. `…/?lat=52.52&lon=13.40&name=Berlin`). Wer den Link öffnet, sieht sofort das Wetter für
genau diesen Ort. Gespeicherte Orte liegen lokal im Browser jedes Familienmitglieds.

---

## 🛠️ Lokal ausprobieren

Die App ist reines HTML/CSS/JavaScript – **kein Build-Schritt nötig**. Einfach einen kleinen
Webserver im Projektordner starten (für ES-Module/Service-Worker wird `http://` benötigt,
`file://` reicht nicht):

```bash
python3 -m http.server 8000
# dann http://localhost:8000 im Browser öffnen
```

---

## 📁 Projektstruktur

```
index.html               App-Grundgerüst
manifest.webmanifest     PWA-Manifest (Installierbarkeit)
sw.js                    Service Worker (Offline-Cache)
css/style.css            Design, Animationen, dynamische Himmel-Verläufe
js/
  app.js                 Steuerung: Standort, Suche, Orte, Einstellungen, Teilen
  api.js                 Open-Meteo-Anbindung (Wetter, Luftqualität, Geocoding)
  ui.js                  Rendern aller Karten
  effects.js             Canvas-Hintergründe (Regen, Schnee, Sterne, Sonne)
  weathercodes.js        WMO-Wettercodes + animierte SVG-Symbole
  format.js              Formatierung, Mondphase, AQI/UV-Level, Windrichtung
  store.js               Einstellungen & gespeicherte Orte (localStorage) + Share-Links
  i18n.js                Übersetzungen (Deutsch / Englisch)
icons/                   App-Icons (PNG + SVG)
scripts/make_icons.py    Generator für die Icons
```

---

## 🔒 Privatsphäre

- Kein Konto, keine Anmeldung, keine Werbung.
- Der GPS-Standort wird nur im Browser verwendet, um das Wetter abzufragen – nichts wird gespeichert oder versendet.
- Gespeicherte Orte und Einstellungen liegen ausschließlich lokal (`localStorage`) auf dem jeweiligen Gerät.

---

_Wetterdaten: [Open-Meteo](https://open-meteo.com/) · Mit ❤️ gebaut für die ganze Familie._
