# Schnittstellen.md — iobroker.freeair100

> Letzte Aktualisierung: 2026-03-16 | Version: 0.4.4

---

## 1. Externe Schnittstelle: freeair-connect.de

```
GET https://www.freeair-connect.de/?lang=de&serialnumber={SERIENNUMMER}
```

- Authentifizierung: keine
- Format: Server-Side-Rendered HTML
- Timeout: 20s
- Headers: Firefox-UA + Accept: text/html + Accept-Language: de-DE

**Validierung:**
- Antwort muss die Seriennummer enthalten → sonst Fehler
- Mindestlänge 1000 Zeichen
- Muss mindestens einen der Keys LST / TAU / WRP enthalten

---

## 2. HTML-Parsing

### nav4 — Minutenwerte (primäre Quelle)

```html
<tr><th>LST [m³/h]</th><td>Luftstrom</td><td>20</td></tr>
```

Regex: `/<tr><th[^>]*>([\s\S]*?)<\/th><td[^>]*>[\s\S]*?<\/td><td[^>]*>([\s\S]*?)<\/td><\/tr>/g`

Key-Bereinigung: strip HTML → split auf `[` oder Leerzeichen → ersten Token.

### nav1 — Überblick

- Absolute Feuchte: `/Feuchtigkeit \(abs\)<\/span>([\d.]+)/g` (1. Treffer = Außen, 2. = Abluft)
- Feuchterückgewinnung: Regex auf `.bm-hum-info-button` Block
- Grade-Dots: Anzahl `class="active"` pro `grade-item` Block

---

## 3. Interne REST-API (Port 8096)

| Methode | Pfad           | Beschreibung                                    |
|---------|----------------|-------------------------------------------------|
| GET     | `/`            | Web-UI SPA                                      |
| GET     | `/api/data`    | Rohdaten + `_ts` `{LST,TAU,WRP,…,_ts}`         |
| GET     | `/api/logs`    | Logs (max. 300) `[{ts,level,cat,msg}]`          |
| GET     | `/api/ping`    | Health `{ok:true,ts:…}`                         |
| GET     | `/api/poll`    | Sofort-Poll triggern                            |
| GET     | `/api/version` | `{version:"0.3.0"}`                            |
| GET     | `/api/config`  | `{filterChangeIntervalH:8760}` ← NEU           |
| POST    | `/api/control` | `{cl,ba}` → Placeholder (Endpunkt TBD)         |

### /api/data — Vollständiges Beispiel

```json
{
  "LST":"20","WRP":"92.8","WRW":"80.5",
  "TAU":"6.3","FAU":"71","FAU_abs":"5.2",
  "TZU":"18.3","TZB":"18.3",
  "TAB":"19.3","FAB":"57","FAB_abs":"9.5","CO2":"560",
  "TFO":"9.5","LDR":"940","LDI":"1.120",
  "CL":"1","BA":"cmf","PRG":"mnl",
  "BST":"46970","FST":"1172",
  "VGZ":"816","VGA":"1052",
  "SWV":"2.09","LPV":"9","SNR":"20573",
  "RSSI":"-74","FS":"OK",
  "EM":"nein","SK":"nein","FRG":"inaktiv",
  "GRADE_HUM":1,"GRADE_CO2":1,"GRADE_FILT_OUT":1,"GRADE_FILT_EXT":1,
  "_ts":1742039880000
}
```

### /api/config — Response

```json
{ "filterChangeIntervalH": 8760 }
```

Wird vom Browser beim Init abgerufen um das Filter-Intervall für die Ring-Anzeige zu laden.

---

## 4. Filter-States im Detail

```
filter.hoursSinceChange  = FST (Gerätewert)
filter.changeIntervalH   = config.filterChangeIntervalH (default 8760)
filter.remainingHours    = max(0, intervalH - FST)
filter.remainingDays     = round(remainingHours / 24)
filter.changeDue         = FST >= intervalH
filter.changeOverdueDays = changeDue ? round((FST-intervalH)/24) : 0
filter.usagePct          = min(100, round(FST/intervalH*100))
```

**ioBroker-Automation auf `filter.changeDue`:**

```javascript
// Blockly oder JS-Adapter
on({id:'freeair100.0.filter.changeDue', change:'ne'}, (obj) => {
  if (obj.state.val === true) {
    sendTo('telegram.0', 'freeAir 100: Filterwechsel ist fällig!');
  }
});
```

**Nach dem Filterwechsel:**
Das Gerät setzt FST intern zurück wenn ein neuer Filter erkannt wird
(per NFC-Chip oder manueller Reset über freeAir Connect).
Der `filter.changeDue` State schaltet dann automatisch wieder auf `false`.

---

## 5. Schreibbare ioBroker-States

| State-ID               | Typ    | Werte        | Aktueller Effekt              |
|------------------------|--------|--------------|-------------------------------|
| `control.comfortLevel` | number | 1–5          | Logging, Endpunkt TBD         |
| `control.operatingMode`| string | cmf/slp/trb/trc | Logging, Endpunkt TBD      |

---

## 6. Offene Steuerungs-API

```
Reverse-Engineering des PRESS-Button AJAX-Calls:
1. Browser DevTools (F12) → Netzwerk → Filter: XHR/Fetch
2. freeair-connect.de mit Seriennummer laden
3. PRESS → Parameter wählen → "Anwenden"
4. POST-Request notieren (URL, Body, Headers, Cookie)
5. In main.js setParams() und /api/control implementieren
```

---

## 7. Abhängigkeiten

Nur Node.js-Stdlib außer adapter-core:

| Modul           | Verwendung                |
|-----------------|---------------------------|
| `https`         | Cloud-Scraping            |
| `http`          | Web-Server                |
| `fs`            | package.json lesen        |
| `path`          | __dirname                 |
| `@iobroker/adapter-core` | Adapter-Basis   |

---

## 8. Log-Kategorien

| Kategorie | Bedeutung                              |
|-----------|----------------------------------------|
| `POLL`    | HTTP-Abruf + Parse-Ergebnis            |
| `HTTP`    | Web-Server Fehler                      |
| `CTRL`    | Steuerbefehl empfangen                 |
| `FILTER`  | Filterwechsel-Warnungen                |
