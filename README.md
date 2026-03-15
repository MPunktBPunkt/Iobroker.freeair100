# ioBroker.freeair100

[![NPM version](https://img.shields.io/npm/v/iobroker.freeair100.svg)](https://www.npmjs.com/package/iobroker.freeair100)
[![License](https://img.shields.io/github/license/MPunktBPunkt/iobroker.freeair100)](LICENSE)

**ioBroker-Adapter für die bluMartin freeAir 100 Lüftungsanlage**

Liest alle Messwerte des freeAir 100 Lüftungsgeräts über das Cloud-Portal
[freeair-connect.de](https://www.freeair-connect.de) und stellt sie als ioBroker-Datenpunkte
sowie über ein integriertes Web-Dashboard bereit.

---

## Funktionen

- **40+ ioBroker-States**: Temperaturen aller 4 Luftströme, Luftfeuchte (rel + abs), CO₂,
  Luftdruck, Wärmerückgewinnung, Filterstunden, Betriebsstunden und mehr
- **Filter-Ampel**: Luftqualität und Filterstatus als Stufe 1–4 (grün → rot)
- **Dark Web-UI** auf Port 8093: Live-Dashboard mit allen Messwerten
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

```bash
cd /opt/iobroker
iobroker url https://github.com/MPunktBPunkt/iobroker.freeair100
```

Oder über den ioBroker Admin → Adapter → „Von URL installieren".

---

## Konfiguration

| Parameter          | Beschreibung                                      | Standard |
|--------------------|---------------------------------------------------|----------|
| Seriennummer       | Seriennummer des Geräts (z.B. `20573`)            | —        |
| Abfrage-Intervall  | Wie oft freeair-connect.de abgefragt wird (Sek.)  | 60       |
| Web-UI Port        | Port für das integrierte Dashboard                | 8093     |
| Debug-Logging      | Detailliertere Logs                               | false    |

Die Seriennummer steht auf dem Gerät (Typenschild) und auf
[freeair-connect.de](https://www.freeair-connect.de) oben im Eingabefeld.

---

## Web-Dashboard

Nach der Installation erreichbar unter:
```
http://<iobroker-ip>:8093
```

**Tabs:**
- **Daten** — Live-Anzeige aller Messwerte, Luftstrom-Karten, Steuerung
- **Logs** — Adapter-Logs mit Filter und Export
- **System** — Adapter-Info, Sofort-Poll, Links zu Anleitungen

---

## ioBroker-Datenpunkte (Auswahl)

```
freeair100.0
├── air.flow                    Luftstrom [m³/h]
├── air.heatRecoveryPct         Wärmerückgewinnung [%]
├── air.heatRecoveryW           Energierückgewinnung [W]
├── outdoor.temperature         Außenluft [°C]
├── outdoor.humidityRel         Außenluft Feuchte [%]
├── supply.temperature          Zuluft [°C]
├── extract.temperature         Abluft [°C]
├── extract.co2                 CO₂ [ppm]
├── exhaust.temperature         Fortluft [°C]
├── grade.filterOutdoor         Außenluftfilter Stufe (1–4)
├── grade.filterExtract         Abluftfilter Stufe (1–4)
├── device.comfortLevel         Comfort-Level (1–5)
├── device.operatingMode        Betriebsart (cmf/slp/trb/trc)
├── device.operatingHours       Betriebsstunden
├── device.filterHours          Filterstunden
├── control.comfortLevel        Steuerung: Comfort-Level setzen
└── info.connection             Verbindungsstatus
```

Vollständige State-Übersicht: [ClaudeKontextfreeair100Adapter.md](ClaudeKontextfreeair100Adapter.md)

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
