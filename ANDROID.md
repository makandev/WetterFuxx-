# 📱 Wetterfux als App aufs Handy bringen

Es gibt **zwei Wege**. Weg 1 dauert 10 Sekunden und reicht für die meisten Familien.
Weg 2 erzeugt eine echte `.apk`-Datei mit Download-Link.

---

## ✅ Weg 1: Direkt installieren (empfohlen, kein APK nötig)

Wetterfux ist eine **PWA** – eine Web-App, die sich wie eine echte App installieren lässt.
Kein App-Store, keine APK, kein Play-Store-Konto.

1. Schicke der Familie den Link zur veröffentlichten App
   (z. B. `https://<benutzer>.github.io/<repo-name>/` – siehe `README.md`, Abschnitt „So veröffentlichst du die App").
2. Auf dem Handy im Browser öffnen und installieren:
   - **Android / Chrome:** Menü ⋮ → **„App installieren"** (oder „Zum Startbildschirm hinzufügen")
   - **iPhone / Safari:** Teilen-Symbol → **„Zum Home-Bildschirm"**
3. Fertig – Wetterfux liegt als Icon auf dem Startbildschirm, startet im Vollbild und funktioniert offline.

> Das Ergebnis fühlt sich an wie eine normale App. Für iPhones ist das sogar der **einzige** Weg (Apple erlaubt keine fremden APKs).

---

## 📦 Weg 2: Echte `.apk`-Datei erzeugen (nur Android)

Wenn du unbedingt eine installierbare `.apk`-Datei mit **Download-Link** möchtest, nutze den
kostenlosen Dienst **PWABuilder** (von Microsoft). Er verpackt die veröffentlichte PWA in eine
Android-App. Voraussetzung: Die App ist bereits über GitHub Pages online (Weg 1, Schritt 1).

### Schritt für Schritt
1. Öffne **https://www.pwabuilder.com**
2. Gib die URL deiner veröffentlichten App ein (die github.io-Adresse) → **Start**.
3. PWABuilder prüft die App (Manifest & Service Worker sind bereits vorhanden ✅).
4. Klick auf **„Package for stores" → „Android"**.
5. Lade das **`.apk`** (zum direkten Installieren) bzw. `.aab` (für den Play Store) herunter.
   PWABuilder erzeugt dabei automatisch einen Signatur-Schlüssel – **bewahre die
   `signing.keystore`-Datei gut auf**, du brauchst sie für spätere Updates.

### Damit die App ohne Browser-Leiste startet (optional, empfohlen)
PWABuilder zeigt dir nach dem Erzeugen einen **SHA-256-Fingerprint** deines Schlüssels.
Trage ihn in die Datei `.well-known/assetlinks.json` (liegt bereits im Projekt als Vorlage) ein,
committe sie und deploye neu. Dann verschwindet die Adressleiste und es sieht aus wie eine
native App. Ohne diesen Schritt funktioniert die App trotzdem – nur mit dünner URL-Zeile oben.

---

## 🔗 Download-Link für die Familie erstellen (GitHub Releases)

So bekommst du einen dauerhaften Link zur `.apk`:

1. Im Repository auf **„Releases" → „Create a new release"**.
2. Einen Tag vergeben (z. B. `v1.0`), Titel „Wetterfux 1.0".
3. Die heruntergeladene `.apk` per Drag & Drop als **Asset** anhängen.
4. **„Publish release"** klicken.
5. Rechtsklick auf die angehängte `.apk` → **Link kopieren**. Dieser Link ist dein Download-Link:

   ```
   https://github.com/<benutzer>/<repo-name>/releases/download/v1.0/wetterfux.apk
   ```

Diesen Link an die Familie schicken. Beim Antippen auf einem Android-Handy startet der Download;
danach die Datei öffnen und installieren (evtl. muss einmalig „Installation aus unbekannten
Quellen" für den Browser erlaubt werden).
