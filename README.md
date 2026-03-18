# ioBroker freeAir 100 Adapter

[![Version](https://img.shields.io/badge/version-0.5.2-blue)](https://github.com/MPunktBPunkt/Iobroker.freeair100)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-brightgreen)](https://nodejs.org)

Liest alle Messwerte des **bluMartin freeAir 100** Lüftungsgeräts über das Cloud-Portal
[freeair-connect.de](https://www.freeair-connect.de) und stellt sie als ioBroker-Datenpunkte
sowie über ein modernes Web-Dashboard bereit.

---

## Features

| Feature | Beschreibung |
|---|---|
| 📡 **Echtzeit-Daten** | 35+ Messwerte alle 5 Minuten (konfigurierbar) |
| 🌡️ **Temperaturen** | Außen, Zuluft, Abluft, Fortluft (Sensor + berechnet) |
| 💧 **Feuchte & CO₂** | Rel. + abs. Feuchte, CO₂ ppm, Luftqualitäts-Grades |
| ♻️ **Wärmerückgewinnung** | % und Watt, Feuchterückgewinnung |
| 🔧 **Steuerung** | Comfort-Level 1–5, Betriebsart (Comfort/Sleep/Turbo/Turbo Cool) |
| 🔔 **Filter-Alarm** | State `filter.changeDue` für Automation |
| 🛡️ **Code-9-Schutz** | Passwort-Sperre wird erkannt und über Neustarts hinaus eingehalten |
| 🔌 **Verbindungstest** | Button in den Admin-Einstellungen |
| 📊 **Web-Dashboard** | Port 8096, Strömungsdiagramm, Gauges, Filter-Ring |

---

## ⚠️ Aktueller Entwicklungsstand (v0.5.2)

Die Verbindung und Authentifizierung zu freeair-connect.de funktioniert vollständig.
`values.php` antwortet mit **267 kB AES-verschlüsselten Minutenwerten** (1621 Einträge).

**Problem:** Die Sensordaten sind AES-CBC-verschlüsselt. Der Entschlüsselungsschlüssel
liegt im minierten `freeair.js` — er muss noch aus dem JavaScript extrahiert werden.

**So helfen:** DevTools → Sources → `freeair.js` → Suche nach `CryptoJS` oder `decrypt`
→ Schlüssel als [GitHub Issue](https://github.com/MPunktBPunkt/Iobroker.freeair100/issues) melden.

---

## Ausgelesene Messwerte

### Temperaturen
| State | Beschreibung | Einheit |
|---|---|---|
| `outdoor.temperature` | Außenluft | °C |
| `extract.temperature` | Abluft | °C |
| `supply.temperature` | Zuluft (Sensor) | °C |
| `supply.temperatureCalc` | Zuluft (berechnet) | °C |
| `exhaust.temperature` | Fortluft | °C |

### Feuchte & Luft
| State | Beschreibung | Einheit |
|---|---|---|
| `outdoor.humidityRel` | Außenluft Feuchte rel. | % |
| `outdoor.humidityAbs` | Außenluft Feuchte abs. | g/m³ |
| `extract.humidityRel` | Abluft Feuchte rel. | % |
| `extract.humidityAbs` | Abluft Feuchte abs. | g/m³ |
| `extract.co2` | CO₂ Abluft | ppm |
| `air.flowRate` | Luftstrom | m³/h |
| `air.pressure` | Luftdruck | hPa |
| `air.density` | Luftdichte | kg/m³ |

### Wärmerückgewinnung
| State | Beschreibung | Einheit |
|---|---|---|
| `air.heatRecoveryPct` | Wärmerückgewinnung | % |
| `air.heatRecoveryW` | Wärmerückgewinnung | W |
| `air.moistureRecovery` | Feuchterückgewinnung | aktiv/inaktiv |

### Gerätestatus
| State | Beschreibung | Einheit |
|---|---|---|
| `device.operatingMode` | Betriebsart | cmf/slp/trb/trc |
| `device.comfortLevel` | Comfort-Level | 1–5 |
| `device.fanSpeedSupply` | Lüftergeschw. Zuluft | 1/min |
| `device.fanSpeedExtract` | Lüftergeschw. Abluft | 1/min |
| `device.operatingHours` | Betriebsstunden gesamt | h |
| `device.filterHours` | Stunden seit Filterwechsel | h |
| `device.rssi` | WLAN Signalstärke | dBm |
| `device.errorStatus` | Fehlerstatus | — |

### Filterüberwachung
| State | Beschreibung | Einheit |
|---|---|---|
| `filter.changeDue` | **Filterwechsel fällig** ← für Automation | boolean |
| `filter.remainingHours` | Verbleibende Stunden | h |
| `filter.remainingDays` | Verbleibende Tage | d |
| `filter.usagePct` | Filternutzung | % |
| `filter.humidityGrade` | Luftqualität Feuchte | 1–4 |
| `filter.co2Grade` | Luftqualität CO₂ | 1–4 |
| `filter.outdoorFilterGrade` | Außenluftfilter Zustand | 1–4 |
| `filter.extractFilterGrade` | Abluftfilter Zustand | 1–4 |

### Steuerung (schreibbar)
| State | Beschreibung | Werte |
|---|---|---|
| `control.comfortLevel` | Comfort-Level setzen | 1–5 |
| `control.operatingMode` | Betriebsart setzen | cmf / slp / trb / trc |

---

## Installation

### Voraussetzungen
- ioBroker mit js-controller ≥ 5.0
- Node.js ≥ 16
- Aktives Gerät auf [freeair-connect.de](https://www.freeair-connect.de)

### Via GitHub (empfohlen)
```bash
cd /opt/iobroker
sudo -u iobroker -H bash -c "cd /opt/iobroker && npm install https://github.com/MPunktBPunkt/Iobroker.freeair100/archive/main.tar.gz --prefix node_modules/iobroker.freeair100"
iobroker add freeair100
iobroker restart freeair100.0
```

### Via ZIP
1. ZIP herunterladen und entpacken nach `/opt/iobroker/node_modules/iobroker.freeair100`
2. `cd /opt/iobroker && sudo -u iobroker npm install --prefix node_modules/iobroker.freeair100`
3. `iobroker add freeair100`

---

## Konfiguration

| Feld | Beschreibung |
|---|---|
| **Seriennummer** | Steht auf dem Gerät und im freeAir Connect Portal |
| **Passwort** | Login-Passwort für freeair-connect.de (via Connect-USB vergeben) |
| **Verbindung testen** | Testet Session + Login + Datenabruf direkt im Admin |
| **Poll-Intervall** | Abfrage-Intervall in Sekunden (Standard: 300s = 5 Min) |
| **Filter-Intervall** | Stunden bis Filterwechsel (Standard: 8760h = 1 Jahr) |
| **Web-UI Port** | Port des Dashboards (Standard: 8096) |

> ⚠️ **Wichtig:** Nicht zu viele falsche Passwort-Versuche! Nach zu vielen Fehlversuchen sperrt
> freeair-connect.de die Seriennummer für 1 Stunde (Code 9). Der Adapter erkennt diese Sperre,
> hält sie auch über Neustarts hinweg ein und zeigt die verbleibende Wartezeit im Log.

---

## Steuerung

Comfort-Level und Betriebsart können direkt aus dem Web-Dashboard oder über ioBroker-States gesetzt werden:

**Web-Dashboard** (Port 8096) → Daten-Tab → Steuerungsbereich → Auswahl → "Anwenden"

**ioBroker State schreiben:**
```
freeair100.0.control.comfortLevel   ← Zahl 1–5
freeair100.0.control.operatingMode  ← "cmf" / "slp" / "trb" / "trc"
```

Betriebsarten: `cmf` = Comfort · `slp` = Sleep · `trb` = Turbo · `trc` = Turbo Cool

---

## Web-Dashboard

Erreichbar unter `http://<ioBroker-IP>:8096`

| Tab | Inhalt |
|---|---|
| **Daten** | Strömungsdiagramm, Temperatur-Karten, CO₂/WRG/Luftstrom-Gauges, Filter-Ring, Steuerung |
| **Logs** | Adapter-Logs mit Level/Kategorie-Filter und Export |
| **System** | Adapter-Info, Sofort-Poll, Gerätedetails |

---

## Automation-Beispiele

**Filterwechsel-Erinnerung per Telegram:**
```javascript
on({ id: 'freeair100.0.filter.changeDue', change: 'ne' }, (obj) => {
    if (obj.state.val === true) {
        const days = getState('freeair100.0.filter.changeOverdueDays').val;
        sendTo('telegram.0', 'freeAir 100: Filterwechsel fällig! ' + days + ' Tage überfällig.');
    }
});
```

**Nacht-Modus automatisch:**
```javascript
schedule('0 22 * * *', () => setState('freeair100.0.control.operatingMode', 'slp'));
schedule('0 7  * * *', () => setState('freeair100.0.control.operatingMode', 'cmf'));
```

---

## Changelog

### 0.5.2 (2026-03-18)
- **Entdeckung:** values.php liefert AES-verschlüsseltes Array (1621 Minutenwerte)
- **Fix:** parseValues() erkennt Array-Format, gibt hilfreiche Fehlermeldung mit DevTools-Anleitung
- AES-Schlüssel aus freeair.js wird noch benötigt

### 0.5.1 (2026-03-17)
- **Fix:** Falsches Passwort wird nach einmaligem 401 erkannt — kein zweiter Versuch (Code-9-Schutz)
- **Fix:** `_justLoggedIn`-Flag verhindert Retry-Schleife die Code-9 ausloest
- Klarere Fehlermeldung: "Passwort falsch! Bitte in Einstellungen pruefen."

### 0.5.0 (2026-03-17)
- Erste stabile Version — alle Kernfunktionen implementiert und getestet
- Vollständiges README mit Wertetabellen und Beispielen

### 0.4.8 (2026-03-17)
- **Fix:** Verbindungstest zeigt Ergebnis mit Emoji-Status (✅/⚠️/❌)

### 0.4.7 (2026-03-17)
- **Fix:** Veraltete TBD-Steuerungshinweise entfernt

### 0.4.6 (2026-03-17)
- **Fix:** Code-9-Sperre überlebt Adapter-Neustart (`info.loginBlockedUntil` State)
- **Neu:** Verbindungstest-Button in Admin-Einstellungen

### 0.4.5 (2026-03-17)
- **Fix:** Code-9-Erkennung und Login-Sperre für 1 Stunde
- **Neu:** Vollständiges Key-Mapping aus language.php Analyse (alle 35 Felder)

### 0.4.4 (2026-03-17)
- **Root-Fix:** Login-POST sendet bestehenden `PHPSESSID`-Cookie mit
- Korrekter Auth-Flow: `_ensureSession()` → `_login(mit Cookie)` → `fetchValues()`

### 0.4.3 (2026-03-17)
- **Fix:** Korrekte API-Pfade `/api/values.php` und `/api/button.php` (via DevTools)

### 0.4.2 (2026-03-16)
- **Root-Fix:** Daten von `/api/values.php` JSON-API statt HTML-Parsing

### 0.4.1 (2026-03-16)
- **Fix:** Auth-Erkennung prüft auf `<th>BA</th>` statt `id="nav4"`

### 0.4.0 (2026-03-16)
- **Neu:** Session-Authentifizierung, Gerätesteuerung, Passwort-Feld

### 0.3.8 (2026-03-16)
- **Root-Fix:** 47 States in `instanceObjects` → kein Startup-Timeout mehr

### 0.2.0 (2026-03-15)
- Dashboard: SVG-Strömungsdiagramm, Bogen-Gauges, Filter-Ring

### 0.1.0 (2026-03-15)
- Erstveröffentlichung

---

## Lizenz

MIT © 2026 MPunktBPunkt
