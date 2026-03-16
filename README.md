# ioBroker.freeair100

[![License](https://img.shields.io/github/license/MPunktBPunkt/Iobroker.freeair100)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/MPunktBPunkt/Iobroker.freeair100)](https://github.com/MPunktBPunkt/Iobroker.freeair100/releases)

**ioBroker-Adapter für die bluMartin freeAir 100 Lüftungsanlage**

Liest alle Messwerte des freeAir 100 Lüftungsgeräts über das Cloud-Portal
[freeair-connect.de](https://www.freeair-connect.de) und stellt sie als ioBroker-Datenpunkte
sowie über ein integriertes Web-Dashboard bereit.

---

## Funktionen

- **45+ ioBroker-States**: Temperaturen aller 4 Luftströme, Luftfeuchte (rel + abs), CO₂,
  Luftdruck, Wärmerückgewinnung, Filterstunden, Betriebsstunden und mehr
- **Filterwechsel-Countdown**: Ring-Gauge, Status-Badge, 7 Filter-States inkl. `filter.changeDue` für Automation
- **Filter-Ampel**: Luftqualität und Filterstatus als Stufe 1–4 (grün → rot)
- **Dark Web-UI** auf Port 8096: Live-Dashboard mit SVG-Strömungsdiagramm, Bogen-Gauges und Metriken
- **Steuerungs-UI**: Comfort-Level und Betriebsart (Comfort / Sleep / Turbo / Turbo Cool)
- **Kein direkter Gerätezugang nötig** — Kommunikation über Cloud-Portal

---

## Unterstützte Geräte

| Gerät         | Status         | Anmerkung                            |
|---------------|----------------|--------------------------------------|
| freeAir 100   | ✅ Getestet    | SW 2.09, mit freeAir Connect Portal  |
| freeAir 100e  | 🔶 Ungetestet  | Vermutlich kompatibel                |

---

## Installation

**Option 1 — Direkt per URL (empfohlen):**

```bash
cd /opt/iobroker
iobroker url https://github.com/MPunktBPunkt/Iobroker.freeair100
```

**Option 2 — Mit `iobroker add` und anschließendem Neustart:**

```bash
cd /opt/iobroker
iobroker add https://github.com/MPunktBPunkt/Iobroker.freeair100
iobroker restart freeair100.0
```

**Option 3 — Über den ioBroker Admin:**

Admin → Adapter → Zahnrad-Symbol oben → „Von URL installieren" →
`https://github.com/MPunktBPunkt/Iobroker.freeair100` eingeben.

Nach der Installation im Admin die Instanz konfigurieren (Seriennummer eintragen) und starten.

---

## Konfiguration

| Parameter               | Beschreibung                                            | Standard |
|-------------------------|---------------------------------------------------------|----------|
| Seriennummer            | Seriennummer des Geräts (z.B. `20573`)                  | —        |
| Abfrage-Intervall       | Wie oft freeair-connect.de abgefragt wird (Sek.)        | 300      |
| Filterwechsel-Intervall | Betriebsstunden bis Filterwechsel (Standard: 1 Jahr)    | 8760     |
| Web-UI Port             | Port für das integrierte Dashboard                      | 8096     |
| Debug-Logging           | Detailliertere Logs                                     | false    |

Die Seriennummer steht auf dem Gerät (Typenschild) und auf
[freeair-connect.de](https://www.freeair-connect.de) oben im Eingabefeld.

---

## Web-Dashboard

Nach der Installation erreichbar unter:
```
http://<iobroker-ip>:8096
```

**Tabs:**
- **Daten** — SVG-Strömungsdiagramm, Bogen-Gauges, Filterwechsel-Ring, Luftstrom-Karten, Steuerung
- **Logs** — Adapter-Logs mit Level/Kategorie-Filter und Export
- **System** — Adapter-Info, Sofort-Poll, Gerätedetails, Links zu Anleitungen

---

## ioBroker-Datenpunkte (Auswahl)

```
freeair100.0
├── air.flowRate                Luftstrom [m³/h]
├── air.heatRecoveryPct         Wärmerückgewinnung [%]
├── air.heatRecoveryW           Energierückgewinnung [W]
├── outdoor.temperature         Außenluft [°C]
├── outdoor.humidityRel         Außenluft Feuchte [%]
├── supply.temperature          Zuluft [°C]
├── extract.temperature         Abluft [°C]
├── extract.co2                 CO₂ [ppm]
├── exhaust.temperature         Fortluft [°C]
├── filter.humidityGrade        Feuchtigkeit Stufe (1–4)
├── filter.outdoorFilterGrade   Außenluftfilter Stufe (1–4)
├── filter.extractFilterGrade   Abluftfilter Stufe (1–4)
├── filter.hoursSinceChange     Betriebsstunden seit Filterwechsel [h]
├── filter.remainingDays        Verbleibende Tage bis Filterwechsel [d]
├── filter.changeDue            ⚠️ true = Filterwechsel fällig!
├── filter.usagePct             Filternutzung [%]
├── device.comfortLevel         Comfort-Level (1–5)
├── device.operatingMode        Betriebsart (cmf/slp/trb/trc)
├── device.operatingHours       Betriebsstunden gesamt [h]
├── device.filterHours          Filterstunden (= hoursSinceChange) [h]
├── control.comfortLevel        Steuerung: Comfort-Level setzen
└── info.connection             Verbindungsstatus
```

Vollständige State-Übersicht: [ClaudeKontextfreeair100Adapter.md](ClaudeKontextfreeair100Adapter.md)

### Filterwechsel-Automation

```javascript
// JavaScript-Adapter: Benachrichtigung wenn Filterwechsel fällig
on({id: 'freeair100.0.filter.changeDue', change: 'ne'}, (obj) => {
    if (obj.state.val === true) {
        sendTo('telegram.0', 'freeAir 100: Filterwechsel ist fällig!');
    }
});
```

---

## Steuerung

> **Hinweis:** Die direkte Gerätesteuerung über die Cloud-API ist noch in Entwicklung.
> Der genaue API-Endpunkt von freeair-connect.de für Steuerkommandos muss noch
> reverse-engineered werden.

Aktueller Workaround: Comfort-Level und Betriebsart direkt über
[freeAir Connect](https://www.freeair-connect.de) einstellen.

---

## Voraussetzungen

- ioBroker mit js-controller ≥ 5.0
- Node.js ≥ 16
- freeAir 100 mit aktiver WLAN-/Cloud-Verbindung
- Internet-Zugang zu `www.freeair-connect.de`

---

## Changelog

### 0.3.8 (2026-03-16)
- **Root-Fix:** Alle 47 States in `io-package.json` `instanceObjects` verschoben
- `_initStates()` und `extendObjectAsync`-Schleife komplett entfernt
- `onReady()` laeuft jetzt in Millisekunden statt in Sekunden → kein Startup-Timeout mehr

### 0.3.7 (2026-03-16)
- **Fix:** Export auf `module.parent` umgestellt (robuster bei verschiedenen js-controller Versionen)
- **Fix:** `EADDRINUSE` liefert klare Fehlermeldung statt stilles Crash
- **Fix:** Alle `this.config.*` Zugriffe mit `(this.config && this.config.X)` abgesichert

### 0.3.6 (2026-03-16)
- **Bugfix:** `JS.join('\n')` statt `JS + string` (Array-Komma-Problem im Browser-Script)
- **Bugfix:** `tabs.indexOf()` null-sicher (kein `-1` Index mehr moeglich)
- **Bugfix:** alle `fetch()` mit `.catch()` abgesichert
- **Bugfix:** Polling-Timer Guard `window._pollTimer` verhindert mehrfachen Timer
- **Bugfix:** DOM-Element-Zugriff null-gesichert (`getElementById` prueft auf null)
- Logs-Limit auf 150 reduziert (weniger DOM-Last)

### 0.3.5 (2026-03-16)
- **Root-Cause Fix:** 40× serielles `await extendObjectAsync` in Schleife → ioBroker Startup-Timeout → SIGKILL
- Lösung: alle `extendObjectAsync` parallel mit `Promise.all` — Initialisierung von ~40× langsam auf einmalig schnell
- Kein `setState` mehr in `_initStates`

### 0.3.4 (2026-03-16)
- **Kritischer Bugfix:** `JSON.stringify(this.config)` in `onReady` verursachte Crash (adapter-core v3 Proxy-Objekt)
- **Bugfix:** `onReady` komplett in try/catch als Sicherheitsnetz

### 0.3.3 (2026-03-16)
- **Kritischer Bugfix:** `await setStateAsync` am Anfang von `onReady` entfernt (SIGKILL durch DB-Timeout)
- Debug-Version: 91 Logpunkte in allen Methoden

### 0.3.2 (2026-03-16)
- Debug-Version mit 91 `[DEBUG][SYSTEM]` Logpunkten zur Fehlerdiagnose

### 0.3.1 (2026-03-15)
- **Bugfix:** jsonConfig `header`-Typ braucht Pflichtfeld `size` — war faelschlich entfernt
- **Bugfix:** `onReady` — `setState` mit 1,5s Verzoegerung damit Objects-DB sicher bereit ist

### 0.3.0 (2026-03-15)
- **Bugfix:** `module.exports` auf adapter-core v3.x Factory-Pattern umgestellt (Adapter startete nicht)
- **Bugfix:** `admin/jsonConfig.json` — `defaultValue` → `default`, ungültige Felder `sm`/`md`/`size` entfernt
- **Bugfix:** `LICENSE`-Datei hinzugefügt

### 0.2.0 (2026-03-15)
- **Neu:** SVG-Strömungsdiagramm (Wärmetauscher mit 4 Luftpfaden, Live-Temperaturen)
- **Neu:** 3× Bogen-Gauges (CO₂, Wärmerückgewinnung, Luftstrom)
- **Neu:** Filterwechsel-Ring-Gauge mit Status-Badge und Progress-Bar
- **Neu:** 7 Filter-States: `filter.changeDue`, `filter.remainingDays`, `filter.usagePct`, …
- **Neu:** Konfigurationsparameter `filterChangeIntervalH` (Standard: 8760h = 1 Jahr)
- **Neu:** WARN-Log wenn Filter < 30 Tage oder überfällig
- Redesign: Grade-Karten, Metriken-Tabelle, dunklere Stream-Karten

### 0.1.0 (2026-03-15)
- Erstveröffentlichung
- Cloud-Scraping freeair-connect.de (nav1 + nav4 + nav2)
- 40+ ioBroker-States
- Dark Web-UI mit 3 Tabs (Daten, Logs, System)
- Steuerungs-UI (Anzeige, Steuerbefehl-API ausstehend)

---

## Verwandte Adapter

- [iobroker.kostalpiko](https://github.com/MPunktBPunkt/iobroker.kostalpiko) — Kostal PIKO Solarwechselrichter
- [iobroker.linuxdashboard](https://github.com/MPunktBPunkt/iobroker.linuxdashboard) — Linux System-Dashboard
- [iobroker.fritzwireguard](https://github.com/MPunktBPunkt/iobroker.fritzwireguard) — WireGuard VPN für FritzBox
- [iobroker.metermaster](https://github.com/MPunktBPunkt/iobroker.metermaster) — Zähler-App Integration

---

## Lizenz

MIT License — Copyright (c) 2026 MPunktBPunkt

---

## Links

- [freeAir Connect Portal](https://www.freeair-connect.de)
- [bluMartin Anleitungen](https://blumartin.de/downloads/anleitungen/)
- [bluMartin freeAir Support](https://blumartin.de/freeair-support/)
