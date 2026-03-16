'use strict';

const utils = require('@iobroker/adapter-core');
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// States sind in io-package.json instanceObjects definiert

// ─────────────────────────────────────────────────────────────────────────────
//  ADAPTER CLASS
// ─────────────────────────────────────────────────────────────────────────────
class FreeAir100 extends utils.Adapter {
  constructor(options = {}) {
    super({ ...options, name: 'freeair100' });
    this.logs         = [];
    this.lastData     = {};
    this.httpServer   = null;
    this.pollTimer    = null;
    this.pack         = null;
    this.sessionCookie = null;   // PHPSESSID from login
    this.loginPending  = false;
    this._dbg('constructor START - Node.js ' + process.version + '  pid=' + process.pid);
    try {
      this.pack = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
      this._dbg('constructor package.json geladen: v' + this.pack.version);
    } catch(e) {
      this._dbg('constructor package.json FEHLER: ' + e.message);
    }
    try { this._dbg('constructor config keys: ' + JSON.stringify(Object.keys(this.config || {}))); }
    catch(e) { this._dbg('constructor config keys FEHLER: ' + e.message); }
    this._dbg('constructor serialnumber=' + (this.config && this.config.serialnumber ? this.config.serialnumber : 'LEER'));
    this._dbg('constructor webPort=' + (this.config && this.config.webPort ? this.config.webPort : '(default 8096)'));
    this._dbg('constructor pollInterval=' + (this.config && this.config.pollInterval ? this.config.pollInterval : '(default 300)'));
    this.on('ready',       this.onReady.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));
    this.on('unload',      this.onUnload.bind(this));
    this._dbg('constructor DONE - event handlers registriert');
  }

  async onReady() {
    try {
    this._dbg('onReady START');
    try {
      const cfgSafe = { serialnumber: this.config.serialnumber, pollInterval: this.config.pollInterval,
        webPort: this.config.webPort, filterChangeIntervalH: this.config.filterChangeIntervalH,
        logBuffer: this.config.logBuffer, verbose: this.config.verbose };
      this._dbg('onReady config dump: ' + JSON.stringify(cfgSafe));
    } catch(e) { this._dbg('onReady config dump FEHLER: ' + e.message); }
    this._dbg('onReady namespace: ' + this.namespace);

    // KEIN await setStateAsync hier - States-DB ist noch nicht bereit!
    // Wir setzen info.connection erst NACH _initStates via fire-and-forget
    this._dbg('onReady Schritt 1: setStateAsync UEBERSPRUNGEN (DB noch nicht bereit)');

    this._dbg('onReady Schritt 2: States werden durch io-package.json verwaltet - kein _initStates noetig');

    this._dbg('onReady Schritt 3: subscribeStates control.*');
    this.subscribeStates('control.*');
    this._dbg('onReady Schritt 3: OK');

    this._dbg('onReady Schritt 4: _startServer() Port=' + (this.config.webPort || 8096));
    try {
      this._startServer();
      this._dbg('onReady Schritt 4: _startServer() aufgerufen');
    } catch(e) {
      this._dbg('onReady Schritt 4: _startServer() FEHLER - ' + e.message);
    }

    this._dbg('onReady Schritt 5: warte 1500ms vor erstem Poll');
    setTimeout(() => {
      this._dbg('onReady Schritt 5: Timeout abgelaufen, starte _poll()');
      this._poll().then(() => {
        this._dbg('onReady Schritt 5: erster Poll OK, starte Intervall');
        const iv = (this.config.pollInterval || 300) * 1000;
        this._dbg('onReady Schritt 6: pollInterval=' + iv + 'ms');
        if (iv > 0) {
          this.pollTimer = setInterval(() => this._poll(), iv);
          this._dbg('onReady Schritt 6: setInterval gestartet');
        }
      }).catch((e) => {
        this._dbg('onReady Schritt 5: erster Poll FEHLER - ' + e.message);
      });
    }, 1500);

    this._dbg('onReady DONE (Poll laeuft asynchron)');
    } catch(fatalErr) {
      try { this.log.error('[FATAL] onReady ungefangener Fehler: ' + fatalErr.message + ' | ' + fatalErr.stack); } catch(e2) { console.error('FATAL onReady:', fatalErr); }
    }
  }

  async onUnload(callback) {
    this._dbg('onUnload aufgerufen');
    try {
      if (this.pollTimer) { clearInterval(this.pollTimer); this._dbg('onUnload pollTimer gestoppt'); }
    } catch(e) { this._dbg('onUnload pollTimer FEHLER: ' + e.message); }
    try {
      if (this.httpServer) { this.httpServer.close(); this._dbg('onUnload httpServer geschlossen'); }
    } catch(e) { this._dbg('onUnload httpServer FEHLER: ' + e.message); }
    this._dbg('onUnload DONE');
    callback();
  }

  onStateChange(id, state) {
    this._dbg('onStateChange: id=' + id + '  val=' + (state ? state.val : 'null') + '  ack=' + (state ? state.ack : '?'));
    if (!state || state.ack) {
      this._dbg('onStateChange: ignoriert (ack=true oder null)');
      return;
    }
    const shortId = id.split('.').slice(2).join('.');
    this._dbg('onStateChange: shortId=' + shortId);
    if (shortId === 'control.comfortLevel') {
      this._log('info', 'CTRL', 'Setze Comfort-Level: ' + state.val);
      this.setParams(parseInt(state.val), null);
    } else if (shortId === 'control.operatingMode') {
      this._log('info', 'CTRL', 'Setze Betriebsart: ' + state.val);
      this.setParams(null, String(state.val));
    } else {
      this._dbg('onStateChange: unbekannte State-ID ' + shortId);
    }
  }

  // Debug helper: always logs to ioBroker log regardless of verbose setting
  _dbg(msg) {
    const ts = new Date().toISOString().substring(11, 23);
    const line = '[DEBUG][SYSTEM] ' + msg;
    try { if (this.log) this.log.debug(line); else console.log(ts + ' ' + line); } catch(e) { console.log(ts + ' ' + line); }
    this.logs.push({ ts: Date.now(), level: 'debug', cat: 'SYSTEM', msg: String(msg) });
    if (this.logs.length > (this.config && this.config.logBuffer ? this.config.logBuffer : 500)) this.logs.shift();
  }

  _log(level, cat, msg) {
    const entry = { ts: Date.now(), level, cat, msg: String(msg) };
    this.logs.push(entry);
    if (this.logs.length > ((this.config && this.config.logBuffer) || 500)) this.logs.shift();
    try { if (this.log && typeof this.log[level] === 'function') this.log[level]('[' + cat + '] ' + msg); } catch(e){}
  }


  // ── HTTP helper ──────────────────────────────────────────────────────────
  _httpsRequest(opts, body) {
    return new Promise((resolve, reject) => {
      const req = https.request(opts, res => {
        this._dbg('HTTP ' + opts.method + ' ' + opts.path + ' -> ' + res.statusCode);
        // Capture Set-Cookie header
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          // Extract PHPSESSID
          for (const c of setCookie) {
            const m = c.match(/PHPSESSID=([^;]+)/);
            if (m) {
              this.sessionCookie = 'PHPSESSID=' + m[1];
              this._dbg('Session-Cookie gespeichert: ' + this.sessionCookie);
            }
          }
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
      });
      req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout 20s')); });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  // ── Login: POST serialnumber + password ───────────────────────────────────
  async _login() {
    const sn  = (this.config && this.config.serialnumber) || '';
    const pw  = (this.config && this.config.password)     || '';
    if (!pw) {
      this._dbg('_login: kein Passwort konfiguriert - ueberspringe Login');
      return false;
    }
    this._dbg('_login: POST Login SN=' + sn);
    const body = 'serialnumber=' + encodeURIComponent(sn) + '&serial_password=' + encodeURIComponent(pw);
    const res = await this._httpsRequest({
      hostname: 'www.freeair-connect.de',
      path: '/?lang=de&serialnumber=' + encodeURIComponent(sn),
      method: 'POST',
      headers: {
        'User-Agent':     'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Accept':         'text/html,application/xhtml+xml',
        'Accept-Language':'de-DE,de;q=0.9',
      }
    }, body);
    if (this.sessionCookie) {
      this._dbg('_login OK: Cookie=' + this.sessionCookie);
      this._log('info', 'AUTH', 'Login erfolgreich, Session-Cookie erhalten');
      return true;
    }
    this._dbg('_login: kein Cookie erhalten (Status ' + res.status + ') - Passwort falsch?');
    this._log('warn', 'AUTH', 'Login fehlgeschlagen - kein Session-Cookie erhalten. Passwort korrekt?');
    return false;
  }

  // ── Fetch data via values.php JSON API ──────────────────────────────────
  // Discovered via DevTools: freeair-connect.de loads data dynamically via
  // GET /values.php?serialnumber=XXXXX  (76 kB JSON, no login required!)
  async fetchValues() {
    const sn = (this.config && this.config.serialnumber) || '';
    this._dbg('fetchValues START: values.php?serialnumber=' + sn);
    this._log('info', 'POLL', 'Abrufen values.php SN=' + sn);

    const headers = {
      'User-Agent':      'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
      'Accept':          'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'de-DE,de;q=0.9',
      'Referer':         'https://www.freeair-connect.de/?lang=de&serialnumber=' + encodeURIComponent(sn),
      'X-Requested-With':'XMLHttpRequest',
    };
    if (this.sessionCookie) headers['Cookie'] = this.sessionCookie;

    const res = await this._httpsRequest({
      hostname: 'www.freeair-connect.de',
      path:     '/values.php?serialnumber=' + encodeURIComponent(sn),
      method:   'GET',
      headers,
    });

    this._dbg('fetchValues: ' + res.body.length + ' Bytes  status=' + res.status);

    // If we get a short response or error, try login first
    if (res.status === 403 || (res.body.length < 100 && res.status !== 200)) {
      this._dbg('fetchValues: Zugriff verweigert (status=' + res.status + ') - versuche Login');
      if (this.config && this.config.password) {
        await this._login();
        if (this.sessionCookie) {
          headers['Cookie'] = this.sessionCookie;
          const res2 = await this._httpsRequest({
            hostname: 'www.freeair-connect.de',
            path:     '/values.php?serialnumber=' + encodeURIComponent(sn),
            method:   'GET',
            headers,
          });
          this._dbg('fetchValues Retry: ' + res2.body.length + ' Bytes');
          return res2.body;
        }
      }
    }

    return res.body;
  }

  // ── Legacy HTML fetch (fallback only) ────────────────────────────────────
  async fetchHtml() {
    const sn = (this.config && this.config.serialnumber) || '';
    this._dbg('fetchHtml (fallback) SN=' + sn);
    const headers = {
      'User-Agent':      'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
      'Accept':          'text/html,application/xhtml+xml',
      'Accept-Language': 'de-DE,de;q=0.9',
    };
    if (this.sessionCookie) headers['Cookie'] = this.sessionCookie;
    const res = await this._httpsRequest({
      hostname: 'www.freeair-connect.de',
      path:     '/?lang=de&serialnumber=' + encodeURIComponent(sn),
      method:   'GET',
      headers,
    });
    return res.body;
  }
  // ── Control: POST CL + OM to device ──────────────────────────────────────
  async sendControl(cl, om) {
    const sn = (this.config && this.config.serialnumber) || '';
    if (!this.sessionCookie) {
      this._log('warn', 'CTRL', 'Kein Session-Cookie - bitte zuerst anmelden');
      return { ok: false, error: 'Nicht angemeldet' };
    }
    const body = 'CL=' + encodeURIComponent(cl) + '&OM=' + encodeURIComponent(om);
    this._dbg('sendControl POST: ' + body);
    try {
      const res = await this._httpsRequest({
        hostname: 'www.freeair-connect.de',
        path: '/?lang=de&serialnumber=' + encodeURIComponent(sn),
        method: 'POST',
        headers: {
          'User-Agent':      'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
          'Content-Type':    'application/x-www-form-urlencoded',
          'Content-Length':  Buffer.byteLength(body),
          'Cookie':          this.sessionCookie,
          'Accept':          'text/html,application/xhtml+xml',
          'Accept-Language': 'de-DE,de;q=0.9',
        }
      }, body);
      this._dbg('sendControl Response: ' + res.status);
      this._log('info', 'CTRL', 'Steuerbefehl gesendet: CL=' + cl + ' OM=' + om + ' Status=' + res.status);
      return { ok: true };
    } catch(e) {
      this._log('error', 'CTRL', 'Steuerbefehl fehlgeschlagen: ' + e.message);
      return { ok: false, error: e.message };
    }
  }

  // ── Parse HTML ────────────────────────────────────────────────────────────
  // ── Parse JSON from values.php ───────────────────────────────────────────
  // values.php returns a large JSON object with all device data
  // Key mapping discovered from nav4 HTML table (same abbreviations)
  parseValues(jsonStr) {
    const d = {};
    let raw;
    try {
      raw = JSON.parse(jsonStr);
      this._dbg('parseValues: JSON OK, keys=' + Object.keys(raw).length);
    } catch(e) {
      this._dbg('parseValues: JSON.parse FEHLER: ' + e.message);
      this._dbg('parseValues: Antwort-Anfang: ' + jsonStr.substring(0, 300));
      // Fallback: try HTML parsing
      return this.parseData(jsonStr);
    }

    // Map JSON fields to our abbreviation scheme
    // Direct fields (if values.php uses same keys as nav4)
    const directKeys = ['BA','PRG','EM','SK','CL','RF','VGZ','VGA','LST',
      'TAB','FAB','TAU','FAU','CO2','TZU','TZB','TFO','LDR','LDI',
      'WRP','WRW','BST','FST','SNR','RSSI','FS','FRG'];
    directKeys.forEach(k => {
      if (raw[k] !== undefined && raw[k] !== null) d[k] = String(raw[k]);
    });

    // Also try common alternative key names from REST APIs
    const keyMap = {
      'airflow':          'LST',  'flowrate':          'LST',
      'heatRecovery':     'WRP',  'heatRecoveryW':     'WRW',
      'tempOutdoor':      'TAU',  'tempSupply':        'TZU',
      'tempExtract':      'TAB',  'tempExhaust':       'TFO',
      'humOutdoor':       'FAU',  'humExtract':        'FAB',
      'co2':              'CO2',  'co2ppm':            'CO2',
      'pressure':         'LDR',  'density':           'LDI',
      'comfortLevel':     'CL',   'comfort_level':     'CL',
      'operatingMode':    'BA',   'operating_mode':    'BA',
      'operatingHours':   'BST',  'filterHours':       'FST',
      'fanSupply':        'VGZ',  'fanExtract':        'VGA',
      'rssi':             'RSSI', 'errorStatus':       'FS',
      'serialNumber':     'SNR',  'serial':            'SNR',
    };
    Object.keys(keyMap).forEach(jsonKey => {
      if (raw[jsonKey] !== undefined && raw[jsonKey] !== null && !d[keyMap[jsonKey]]) {
        d[keyMap[jsonKey]] = String(raw[jsonKey]);
      }
    });

    // Humidity absolute (may be nested)
    if (raw.FAU_abs !== undefined) d.FAU_abs = raw.FAU_abs;
    if (raw.FAB_abs !== undefined) d.FAB_abs = raw.FAB_abs;
    if (raw.humOutdoorAbs !== undefined) d.FAU_abs = raw.humOutdoorAbs;
    if (raw.humExtractAbs !== undefined) d.FAB_abs = raw.humExtractAbs;

    // Grade values (1-4)
    if (raw.GRADE_HUM !== undefined)      d.GRADE_HUM      = raw.GRADE_HUM;
    if (raw.GRADE_CO2 !== undefined)      d.GRADE_CO2      = raw.GRADE_CO2;
    if (raw.GRADE_FILT_OUT !== undefined) d.GRADE_FILT_OUT = raw.GRADE_FILT_OUT;
    if (raw.GRADE_FILT_EXT !== undefined) d.GRADE_FILT_EXT = raw.GRADE_FILT_EXT;
    if (raw.gradeHumidity !== undefined)  d.GRADE_HUM      = raw.gradeHumidity;
    if (raw.gradeCO2 !== undefined)       d.GRADE_CO2      = raw.gradeCO2;

    // Store raw JSON for dashboard display
    d._rawJson = raw;

    this._dbg('parseValues: gemappt: LST=' + d.LST + ' TAU=' + d.TAU + ' WRP=' + d.WRP + ' CO2=' + d.CO2 + ' FS=' + d.FS);
    return d;
  }

  // ── Legacy HTML parser (fallback) ─────────────────────────────────────────
  parseData(html) {
    const d = {};
    this._dbg('parseData HTML-Fallback: ' + html.length + ' Bytes');
    const strip = s => s.replace(/<[^>]+>/g, '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();
    const trRe = /<tr><th[^>]*>([\s\S]*?)<\/th><td[^>]*>[\s\S]*?<\/td><td[^>]*>([\s\S]*?)<\/td><\/tr>/g;
    let m;
    while ((m = trRe.exec(html)) !== null) {
      const rawKey = strip(m[1]);
      const abbr   = rawKey.split(/[\s[]/)[0];
      const val    = strip(m[2]);
      if (abbr && abbr !== 'ZEIT') d[abbr] = val;
    }
    const absM = [...html.matchAll(/Feuchtigkeit \(abs\)<\/span>([\d.]+)/g)];
    if (absM[0]) d.FAU_abs = absM[0][1];
    if (absM[1]) d.FAB_abs = absM[1][1];
    const gradeM = [...html.matchAll(/<div class="grade-item">([\s\S]*?)<\/div>/g)];
    ['GRADE_HUM','GRADE_CO2','GRADE_FILT_OUT','GRADE_FILT_EXT'].forEach((k,i) => {
      if (gradeM[i]) d[k] = (gradeM[i][1].match(/class="active"/g) || []).length;
    });
    return d;
  }

  // ── Write states ──────────────────────────────────────────────────────────
  async _updateStates(d) {
    const n = (k, def=0) => { const v = parseFloat(d[k]); return isNaN(v) ? def : v; };
    const s = (k, def='') => (d[k] !== undefined && d[k] !== null) ? String(d[k]) : def;

    // Filter change calculation
    const fst          = n('FST', 0);
    const cfgInterval  = this.config.filterChangeIntervalH || 8760;
    const remaining    = cfgInterval - fst;
    const changeDue    = fst >= cfgInterval;
    const overdueDays  = changeDue ? Math.round((fst - cfgInterval) / 24) : 0;
    const usagePct     = Math.min(100, Math.round((fst / cfgInterval) * 100));

    const updates = {
      'info.serialnumber':          s('SNR', this.config.serialnumber||''),
      'device.operatingMode':       s('BA'),
      'device.program':             s('PRG'),
      'device.comfortLevel':        n('CL'),
      'device.operatingHours':      n('BST'),
      'device.filterHours':         fst,
      'device.floorSpace':          n('RF'),
      'device.twoRoomConnect':      n('2A'),
      'device.fanSpeedSupply':      n('VGZ'),
      'device.fanSpeedExtract':     n('VGA'),
      'device.softwareVersion':     s('SWV'),
      'device.boardVersion':        n('LPV'),
      'device.rssi':                n('RSSI'),
      'device.errorStatus':         s('FS'),
      'device.defrostingMode':      d['EM'] === 'ja',
      'device.summerCooling':       d['SK'] === 'ja',
      'air.flowRate':               n('LST'),
      'air.heatRecoveryPct':        n('WRP'),
      'air.heatRecoveryW':          n('WRW'),
      'air.moistureRecovery':       s('FRG','unbekannt'),
      'air.pressure':               n('LDR'),
      'air.density':                n('LDI'),
      'outdoor.temperature':        n('TAU'),
      'outdoor.humidityRel':        n('FAU'),
      'outdoor.humidityAbs':        n('FAU_abs'),
      'supply.temperature':         n('TZU'),
      'supply.temperatureCalc':     n('TZB'),
      'extract.temperature':        n('TAB'),
      'extract.humidityRel':        n('FAB'),
      'extract.humidityAbs':        n('FAB_abs'),
      'extract.co2':                n('CO2'),
      'exhaust.temperature':        n('TFO'),
      'filter.humidityGrade':       d['GRADE_HUM']  || 0,
      'filter.co2Grade':            d['GRADE_CO2']  || 0,
      'filter.outdoorFilterGrade':  d['GRADE_FILT_OUT'] || 0,
      'filter.extractFilterGrade':  d['GRADE_FILT_EXT'] || 0,
      'filter.hoursSinceChange':    fst,
      'filter.changeIntervalH':     cfgInterval,
      'filter.remainingHours':      Math.max(0, remaining),
      'filter.remainingDays':       Math.max(0, Math.round(remaining / 24)),
      'filter.changeDue':           changeDue,
      'filter.changeOverdueDays':   overdueDays,
      'filter.usagePct':            usagePct,
    };

    for (const [id, val] of Object.entries(updates)) {
      await this.setStateAsync(id, { val, ack:true }).catch(()=>{});
    }

    if (changeDue) {
      this._log('warn', 'FILTER', 'Filterwechsel f\u00e4llig! ' + fst + 'h Betrieb (' + overdueDays + ' Tage \u00fcberf\u00e4llig)');
    } else if (remaining < 24 * 30) {
      this._log('warn', 'FILTER', 'Filterwechsel in weniger als 30 Tagen f\u00e4llig (' + Math.round(remaining / 24) + ' Tage)');
    }
  }

  // ── Control (endpoint TBD) ─────────────────────────────────────────────────
  async setParams(cl, ba) {
    // OM numeric mapping: 1=cmf(Comfort), 2=slp(Sleep), 3=trb(Turbo), 4=trc(Turbo Cool)
    const omMap = { cmf: 1, slp: 2, trb: 3, trc: 4 };
    // Keep current values if only one is being changed
    const currentCL = cl !== null ? cl : (this.lastData && this.lastData.CL ? parseInt(this.lastData.CL) : 1);
    const currentBA = ba !== null ? ba : (this.lastData && this.lastData.BA ? this.lastData.BA : 'cmf');
    const om = omMap[currentBA] || 1;
    this._dbg('setParams: CL=' + currentCL + ' BA=' + currentBA + ' OM=' + om);
    const result = await this.sendControl(currentCL, om);
    if (!result.ok) {
      this._log('warn', 'CTRL', 'Steuerung fehlgeschlagen: ' + result.error);
    }
  }

  // ── Poll ──────────────────────────────────────────────────────────────────
  async _poll() {
    const sn = (this.config && this.config.serialnumber) || '';
    this._dbg('_poll START sn=' + sn + '  lastData keys=' + Object.keys(this.lastData).length);
    if (!sn) {
      this._dbg('_poll ABBRUCH: keine Seriennummer');
      this._log('warn', 'POLL', 'Keine Seriennummer konfiguriert');
      await this.setStateAsync('info.connection', { val:false, ack:true }).catch(()=>{});
      return;
    }
    try {
      this._log('info', 'POLL', 'Abrufen SN=' + sn);

      this._dbg('_poll Schritt 1: fetchValues() JSON-API');
      const jsonStr = await this.fetchValues();
      this._dbg('_poll Schritt 1 OK: ' + jsonStr.length + ' Bytes');

      if (!jsonStr || jsonStr.length < 10) {
        this._dbg('_poll FEHLER: Antwort zu kurz (' + (jsonStr?jsonStr.length:0) + ')');
        this._dbg('_poll Antwort-Anfang: ' + (jsonStr ? jsonStr.substring(0,200) : 'null'));
        throw new Error('Ungueltige Antwort von values.php (len=' + (jsonStr?jsonStr.length:0) + ')');
      }

      this._dbg('_poll Schritt 2: parseValues()');
      const data = this.parseValues(jsonStr);
      const parsedKeys = Object.keys(data).filter(k => k !== '_rawJson');
      this._dbg('_poll Schritt 2 OK: ' + parsedKeys.length + ' Keys: ' + parsedKeys.slice(0,10).join(', '));
      this._dbg('_poll Werte: LST=' + data.LST + ' TAU=' + data.TAU + ' TAB=' + data.TAB + ' WRP=' + data.WRP + ' CO2=' + data.CO2 + ' FS=' + data.FS);


      const parsedCount = Object.keys(data).filter(k => k !== '_rawJson').length;
      if (parsedCount === 0 || (!data.LST && !data.TAU && !data.WRP && !data.CO2 && !data.CL)) {
        this._dbg('_poll FEHLER: ' + parsedCount + ' Keys geparst, keine Kerndaten');
        this._dbg('_poll Antwort-Anfang: ' + jsonStr.substring(0,300));
        this._dbg('_poll Alle Keys: ' + JSON.stringify(Object.keys(data)));
        this._log('warn', 'POLL', 'Parsing: ' + parsedCount + ' Keys, keine Kerndaten (LST/TAU/WRP leer). Geraet offline oder HTML-Struktur geaendert?');
        // Dont throw - keep trying on next interval
        await this.setStateAsync('info.connection', { val:false, ack:true }).catch(()=>{});
        return;
      }

      this._dbg('_poll Schritt 3: _updateStates()');
      this.lastData = { ...data, _ts: Date.now() };
      await this._updateStates(data);
      this._dbg('_poll Schritt 3 OK');

      this._dbg('_poll Schritt 4: info.connection=true + lastPoll setzen');
      try { await this.setStateAsync('info.connection', { val:true, ack:true }); this._dbg('info.connection=true OK'); }
      catch(e) { this._dbg('info.connection FEHLER: ' + e.message); }
      try { await this.setStateAsync('info.lastPoll', { val:new Date().toISOString(), ack:true }); this._dbg('info.lastPoll OK'); }
      catch(e) { this._dbg('info.lastPoll FEHLER: ' + e.message); }
      this._dbg('_poll Schritt 4 OK');

      this._log('info', 'POLL', 'OK  LST=' + data.LST + ' m3/h  TAB=' + data.TAB + '\u00b0C  TAU=' + data.TAU + '\u00b0C  CO2=' + data.CO2 + ' ppm  WRP=' + data.WRP + '%  FST=' + data.FST + 'h');
      this._dbg('_poll DONE');
    } catch(e) {
      this._dbg('_poll FEHLER: ' + e.message);
      this._log('error', 'POLL', 'Fehler: ' + e.message);
      try { await this.setStateAsync('info.connection', { val:false, ack:true }); } catch(e2) { this._dbg('info.connection=false FEHLER: ' + e2.message); }
    }
  }

  // ── HTTP server ────────────────────────────────────────────────────────────
  _startServer() {
    const port = (this.config && this.config.webPort) || 8096;
    this._dbg('_startServer: erstelle HTTP-Server auf Port ' + port);
    this.httpServer = http.createServer((req, res) => {
      const p = new URL(req.url||'/', 'http://x').pathname;
      const ip = req.socket.remoteAddress || '?';
      this._dbg('HTTP ' + req.method + ' ' + p + '  von ' + ip);
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'OPTIONS') {
        this._dbg('HTTP OPTIONS preflight -> 200');
        res.writeHead(200); return res.end();
      }
      const json = (obj, code=200) => {
        this._dbg('HTTP -> ' + code + ' JSON ' + p + ' (' + JSON.stringify(obj).length + ' Bytes)');
        res.writeHead(code, {'Content-Type':'application/json'});
        res.end(JSON.stringify(obj));
      };
      if (p === '/' || p === '/index.html') {
        this._dbg('HTTP Dashboard-Seite wird gesendet');
        res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
        return res.end(this.buildHtml());
      }
      if (p === '/api/ping')    return json({ ok:true, ts:Date.now() });
      if (p === '/api/data') {
        this._dbg('HTTP /api/data lastData-Keys: ' + Object.keys(this.lastData).length);
        return json(this.lastData);
      }
      if (p === '/api/logs')    return json(this.logs.slice(-150));
      if (p === '/api/version') return json({ version: this.pack ? this.pack.version : '0.4.2' });
      if (p === '/api/config') {
        const cfg = { filterChangeIntervalH: this.config.filterChangeIntervalH || 8760 };
        this._dbg('HTTP /api/config: ' + JSON.stringify(cfg));
        return json(cfg);
      }
      if (p === '/api/poll') {
        this._dbg('HTTP /api/poll: manueller Poll angefordert');
        this._poll().catch((e) => { this._dbg('HTTP /api/poll Poll-Fehler: ' + e.message); });
        return json({ ok:true });
      }
      if (p === '/api/control' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          this._dbg('HTTP /api/control Body: ' + body);
          try {
            const { cl, ba } = JSON.parse(body);
            this._dbg('HTTP /api/control: cl=' + cl + '  ba=' + ba);
            this.setParams(cl!=null ? parseInt(cl) : null, ba||null)
              .then(()=>{}).catch(()=>{});
            json({ ok:true, msg:'Steuerbefehl gesendet' });
          } catch(e) {
            this._dbg('HTTP /api/control FEHLER: ' + e.message);
            json({ ok:false, msg:e.message }, 400);
          }
        });
        return;
      }
      this._dbg('HTTP 404: ' + p);
      res.writeHead(404, {'Content-Type':'text/plain'}); res.end('Not found');
    });
    this.httpServer.listen(port, '0.0.0.0', () => {
      this._dbg('_startServer: HTTP-Server lauscht auf 0.0.0.0:' + port);
      this._log('info','HTTP','Web-UI Port ' + port);
    });
    this.httpServer.on('error', (e) => {
      this._dbg('_startServer FEHLER: ' + e.message + '  code=' + e.code);
      if (e.code === 'EADDRINUSE') {
        this._log('error', 'HTTP', 'Port ' + port + ' bereits belegt (EADDRINUSE)! Bitte anderen Port in den Einstellungen waehlen.');
      } else {
        this._log('error', 'HTTP', e.message);
      }
    });
    this._dbg('_startServer: server.listen() aufgerufen');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  HTML BUILDER
  // ─────────────────────────────────────────────────────────────────────────
  buildHtml() {
    const ver  = this.pack ? this.pack.version : '0.4.2';
    const sn   = (this.config && this.config.serialnumber) || '---';
    const port = (this.config && this.config.webPort) || 8096;
    const iv   = (this.config && this.config.pollInterval) || 300;
    const filterH = (this.config && this.config.filterChangeIntervalH) || 8760;

    // ── CSS ──
    const CSS = [
      ':root{',
      '--bg0:#0d1117;--bg1:#161b22;--bg2:#1c2128;--bg3:#21262d;--bg4:#0a0f14;',
      '--border:#30363d;--border2:#3d444d;',
      '--blue:#58a6ff;--blue-dim:#1f6feb;',
      '--green:#3fb950;--yellow:#e3b341;--orange:#f0883e;--red:#f85149;',
      '--cyan:#00b4d8;--cyan2:#0090a8;',
      '--text:#e6edf3;--muted:#8b949e;--dim:#656d76;',
      '--out:#4db8e8;--sup:#3fb950;--ext:#f0883e;--exh:#a8b2c0;',
      '}',
      '*{box-sizing:border-box;margin:0;padding:0}',
      'body{background:var(--bg0);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif;min-height:100vh;overflow-x:hidden}',
      // Header
      'header{background:var(--bg1);border-bottom:1px solid var(--border);padding:14px 22px;display:flex;align-items:center;gap:14px;position:sticky;top:0;z-index:100}',
      '.hlogo{display:flex;align-items:center;gap:10px;font-size:1.15rem;font-weight:700;color:var(--cyan)}',
      '.hbadge{background:var(--bg3);color:var(--muted);font-size:.7rem;padding:2px 8px;border-radius:10px}',
      '.hright{margin-left:auto;display:flex;align-items:center;gap:14px;font-size:.82rem;color:var(--muted)}',
      '.dot{width:9px;height:9px;border-radius:50%;display:inline-block;background:var(--red);transition:background .5s}',
      '.dot.ok{background:var(--green)}',
      // Tabs
      'nav{background:var(--bg1);border-bottom:1px solid var(--border);display:flex;gap:2px;padding:0 14px;overflow-x:auto}',
      '.tb{background:none;border:none;color:var(--muted);padding:12px 18px;cursor:pointer;font-size:.88rem;border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap}',
      '.tb:hover{color:var(--text)}.tb.act{color:var(--cyan);border-bottom-color:var(--cyan)}',
      '.tp{display:none;padding:20px 22px}.tp.act{display:block}',
      // Layout grids
      '.row{display:grid;gap:14px;margin-bottom:16px}',
      '.r3{grid-template-columns:repeat(3,1fr)}.r4{grid-template-columns:repeat(4,1fr)}.r2{grid-template-columns:repeat(2,1fr)}',
      '.r-flow{grid-template-columns:2fr 1fr}',
      '@media(max-width:1000px){.r4{grid-template-columns:repeat(2,1fr)}.r3{grid-template-columns:repeat(2,1fr)}}',
      '@media(max-width:680px){.r4,.r3,.r2,.r-flow{grid-template-columns:1fr}}',
      // Base card
      '.card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px}',
      '.card-title{font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;gap:6px}',
      '.card-title .dot{width:6px;height:6px}',
      // Hero cards (big numbers)
      '.hero{font-size:2.4rem;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}',
      '.hero-unit{font-size:.95rem;color:var(--muted);font-weight:400;margin-left:4px}',
      '.hero-sub{font-size:.82rem;color:var(--muted);margin-top:5px}',
      '.c-cyan .hero{color:var(--cyan)}.c-green .hero{color:var(--green)}.c-yellow .hero{color:var(--yellow)}.c-red .hero{color:var(--red)}',
      // Airflow diagram card
      '.flow-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:18px;overflow:hidden}',
      '.flow-card svg{width:100%;height:auto}',
      // Air stream info boxes
      '.stream-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}',
      '.stream{border-radius:8px;padding:12px 14px;border-left:3px solid}',
      '.s-out{background:#071520;border-color:var(--out)}.s-sup{background:#071510;border-color:var(--sup)}',
      '.s-ext{background:#1a0d03;border-color:var(--ext)}.s-exh{background:#0d0f12;border-color:var(--exh)}',
      '.s-name{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px}',
      '.s-out .s-name{color:var(--out)}.s-sup .s-name{color:var(--sup)}.s-ext .s-name{color:var(--ext)}.s-exh .s-name{color:var(--exh)}',
      '.s-temp{font-size:1.9rem;font-weight:700;font-variant-numeric:tabular-nums;line-height:1}',
      '.s-out .s-temp{color:var(--out)}.s-sup .s-temp{color:var(--sup)}.s-ext .s-temp{color:var(--ext)}.s-exh .s-temp{color:var(--exh)}',
      '.s-unit{font-size:.82rem;color:var(--muted)}',
      '.s-row{display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted);margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,.05)}',
      '.s-val{color:var(--text);font-weight:500}',
      // Gauge (SVG arc)
      '.gauge-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}',
      '.gauge-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);text-align:center}',
      // Filter card
      '.filter-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:18px}',
      '.filter-ring{display:flex;align-items:center;gap:20px;flex-wrap:wrap}',
      '.filter-info{flex:1;min-width:140px}',
      '.filter-status{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:12px;font-size:.78rem;font-weight:600;margin-bottom:10px}',
      '.fs-ok{background:rgba(63,185,80,.15);color:var(--green)}.fs-warn{background:rgba(227,179,65,.15);color:var(--yellow)}',
      '.fs-due{background:rgba(248,81,73,.15);color:var(--red)}',
      '.filter-days{font-size:2rem;font-weight:700;font-variant-numeric:tabular-nums;line-height:1;margin-bottom:2px}',
      '.filter-meta{font-size:.8rem;color:var(--muted)}',
      '.filter-bar{background:var(--bg3);border-radius:6px;height:8px;overflow:hidden;margin-top:12px}',
      '.filter-bar-fill{height:100%;border-radius:6px;transition:width .6s ease}',
      '.filter-hours-row{display:flex;justify-content:space-between;font-size:.76rem;color:var(--muted);margin-top:5px}',
      // Grade / quality
      '.grade-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}',
      '@media(max-width:680px){.grade-grid{grid-template-columns:repeat(2,1fr)}}',
      '.grade-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center}',
      '.grade-name{font-size:.68rem;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em}',
      '.grade-dots{display:flex;justify-content:center;gap:5px;margin-bottom:6px}',
      '.gdot{width:13px;height:13px;border-radius:50%;background:var(--bg3);border:1px solid var(--border2);transition:background .3s}',
      '.gdot.l1{background:var(--green)}.gdot.l2{background:var(--yellow)}.gdot.l3{background:var(--orange)}.gdot.l4{background:var(--red)}',
      '.grade-text{font-size:.72rem;font-weight:600}',
      '.gt1{color:var(--green)}.gt2{color:var(--yellow)}.gt3{color:var(--orange)}.gt4{color:var(--red)}.gt0{color:var(--dim)}',
      // Metrics row (fan, pressure etc)
      '.metric{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.83rem}',
      '.metric:last-child{border:none}',
      '.metric-lbl{color:var(--muted)}.metric-val{font-weight:600;font-variant-numeric:tabular-nums}',
      // Control panel
      '.ctrl-panel{background:var(--bg2);border:1px solid var(--border2);border-radius:10px;padding:18px;margin-bottom:16px}',
      '.ctrl-heading{font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:14px}',
      '.ctrl-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}',
      '.ctrl-lbl{font-size:.8rem;color:var(--muted);min-width:110px}',
      '.btn-grp{display:flex;gap:6px;flex-wrap:wrap}',
      '.cbtn{background:var(--bg3);border:1px solid var(--border2);color:var(--muted);padding:6px 14px;border-radius:6px;cursor:pointer;font-size:.82rem;transition:all .18s}',
      '.cbtn:hover{border-color:var(--blue);color:var(--text)}',
      '.cbtn.sel{background:var(--blue-dim);border-color:var(--blue);color:#fff;font-weight:600}',
      '.send-btn{background:var(--cyan2);border:none;color:#fff;padding:8px 20px;border-radius:7px;cursor:pointer;font-size:.88rem;font-weight:600;transition:opacity .2s}',
      '.send-btn:hover{opacity:.85}',
      '.ctrl-note{font-size:.75rem;margin-top:8px;min-height:1.2em}',
      // Logs
      '.log-bar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}',
      '.lf{background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:6px;font-size:.8rem}',
      '.log-box{font-family:"JetBrains Mono","Fira Code",monospace;font-size:.75rem;max-height:520px;overflow-y:auto;background:var(--bg1);border:1px solid var(--border);border-radius:8px;padding:12px}',
      '.ll{padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);display:flex;gap:8px;flex-wrap:wrap}',
      '.lts{color:var(--dim);flex-shrink:0;min-width:70px}.lc{color:var(--blue);flex-shrink:0;min-width:54px}.lm{color:var(--text);word-break:break-all}',
      '.ll.error .lm{color:var(--red)}.ll.warn .lm{color:var(--yellow)}.ll.debug .lm{color:var(--muted)}',
      // System
      '.sys-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}',
      '@media(max-width:680px){.sys-grid{grid-template-columns:1fr}}',
      '.kv-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.83rem}',
      '.kv-row:last-child{border:none}.kk{color:var(--muted)}.kv-v{font-weight:500}',
      '.warn-box{background:rgba(227,179,65,.07);border:1px solid rgba(227,179,65,.25);border-radius:8px;padding:14px;font-size:.82rem;color:var(--muted);line-height:1.7}',
      '.action-btn{background:var(--bg3);border:1px solid var(--border2);color:var(--text);padding:9px 18px;border-radius:7px;cursor:pointer;font-size:.85rem;font-weight:500;transition:all .2s;text-decoration:none;display:inline-block}',
      '.action-btn:hover{border-color:var(--cyan);color:var(--cyan)}',
      '.action-btn.primary{background:var(--cyan2);border-color:var(--cyan);color:#fff}',
      '.action-btn.primary:hover{opacity:.85}',
      // Update bar
      '.update-bar{position:sticky;bottom:0;background:var(--bg1);border-top:1px solid var(--border);padding:7px 22px;font-size:.75rem;color:var(--dim);display:flex;gap:20px;flex-wrap:wrap}',
      '.update-bar span{color:var(--muted)}',
    ].join('');

    // ── DATEN TAB ──
    // The SVG flow diagram is built as static HTML with JS-updated text elements
    const SVG_FLOW = [
      '<svg viewBox="0 0 600 190" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;max-width:700px;margin:0 auto">',
      // Background
      '<rect width="600" height="190" fill="none"/>',
      // Heat exchanger box
      '<rect x="220" y="20" width="160" height="150" rx="12" fill="#0d1520" stroke="#2d4a6b" stroke-width="1.5"/>',
      '<text x="300" y="90" text-anchor="middle" font-size="11" fill="#3a6a8a" font-family="monospace" font-weight="600">W\u00c4RME</text>',
      '<text x="300" y="105" text-anchor="middle" font-size="11" fill="#3a6a8a" font-family="monospace" font-weight="600">TAUSCHER</text>',
      // Cross-flow pattern lines
      '<line x1="240" y1="40" x2="360" y2="150" stroke="#1a3040" stroke-width="1"/>',
      '<line x1="260" y1="40" x2="380" y2="150" stroke="#1a3040" stroke-width="1"/>',
      '<line x1="220" y1="60" x2="340" y2="170" stroke="#1a3040" stroke-width="1"/>',
      // === TOP PATH: OUTDOOR → SUPPLY ===
      // Outdoor left arrow (incoming)
      '<line x1="20" y1="55" x2="218" y2="55" stroke="#4db8e8" stroke-width="2.5" stroke-dasharray="6,3"/>',
      '<polygon points="215,49 226,55 215,61" fill="#4db8e8"/>',
      // Supply right arrow (outgoing)
      '<line x1="382" y1="55" x2="570" y2="55" stroke="#3fb950" stroke-width="2.5"/>',
      '<polygon points="565,49 580,55 565,61" fill="#3fb950"/>',
      // Top labels
      '<text x="14" y="43" font-size="9.5" fill="#4db8e8" font-family="monospace" font-weight="700">AU\u00dFEN</text>',
      '<text x="545" y="43" text-anchor="end" font-size="9.5" fill="#3fb950" font-family="monospace" font-weight="700">ZULUFT</text>',
      // Top temperatures (JS-updated)
      '<text id="sv-tau" x="82" y="72" font-size="18" font-weight="700" fill="#4db8e8" font-family="monospace" text-anchor="middle">--</text>',
      '<text x="82" y="82" font-size="9" fill="#4db8e8" font-family="monospace" text-anchor="middle">\u00b0C</text>',
      '<text id="sv-tzu" x="510" y="72" font-size="18" font-weight="700" fill="#3fb950" font-family="monospace" text-anchor="middle">--</text>',
      '<text x="510" y="82" font-size="9" fill="#3fb950" font-family="monospace" text-anchor="middle">\u00b0C</text>',
      // === BOTTOM PATH: EXTRACT → EXHAUST ===
      // Extract right arrow (incoming)
      '<line x1="570" y1="135" x2="382" y2="135" stroke="#f0883e" stroke-width="2.5" stroke-dasharray="6,3"/>',
      '<polygon points="385,129 374,135 385,141" fill="#f0883e"/>',
      // Exhaust left arrow (outgoing)
      '<line x1="218" y1="135" x2="20" y2="135" stroke="#a8b2c0" stroke-width="2.5"/>',
      '<polygon points="25,129 10,135 25,141" fill="#a8b2c0"/>',
      // Bottom labels
      '<text x="580" y="123" text-anchor="end" font-size="9.5" fill="#f0883e" font-family="monospace" font-weight="700">ABLUFT</text>',
      '<text x="14" y="123" font-size="9.5" fill="#a8b2c0" font-family="monospace" font-weight="700">FORTLUFT</text>',
      // Bottom temperatures
      '<text id="sv-tab" x="510" y="151" font-size="18" font-weight="700" fill="#f0883e" font-family="monospace" text-anchor="middle">--</text>',
      '<text x="510" y="161" font-size="9" fill="#f0883e" font-family="monospace" text-anchor="middle">\u00b0C</text>',
      '<text id="sv-tfo" x="82" y="151" font-size="18" font-weight="700" fill="#a8b2c0" font-family="monospace" text-anchor="middle">--</text>',
      '<text x="82" y="161" font-size="9" fill="#a8b2c0" font-family="monospace" text-anchor="middle">\u00b0C</text>',
      // WRP efficiency label in center
      '<text id="sv-wrp" x="300" y="128" text-anchor="middle" font-size="16" font-weight="700" fill="#00b4d8" font-family="monospace">--%</text>',
      '<text x="300" y="140" text-anchor="middle" font-size="8" fill="#3a6a8a" font-family="monospace">W\u00c4RME-RG</text>',
      // CO2 badge in top right
      '<rect x="440" y="8" width="68" height="24" rx="5" fill="#1a0d03" stroke="#f0883e" stroke-width="1"/>',
      '<text x="446" y="18" font-size="7.5" fill="#f0883e" font-family="monospace">CO\u2082</text>',
      '<text id="sv-co2" x="474" y="24" text-anchor="middle" font-size="11" font-weight="700" fill="#f0883e" font-family="monospace">--</text>',
      '</svg>'
    ].join('');

    // Gauge SVG helper (arc, built client-side in JS)
    const GAUGE_CO2   = '<div class="gauge-wrap"><svg id="g-co2"  viewBox="0 0 120 70" width="120" height="70"></svg><div class="gauge-label">CO\u2082 Abluft</div></div>';
    const GAUGE_WRG   = '<div class="gauge-wrap"><svg id="g-wrg"  viewBox="0 0 120 70" width="120" height="70"></svg><div class="gauge-label">W\u00e4rme-RG</div></div>';
    const GAUGE_FLOW  = '<div class="gauge-wrap"><svg id="g-flow" viewBox="0 0 120 70" width="120" height="70"></svg><div class="gauge-label">Luftstrom</div></div>';

    const HTML_DATEN = [
      // Row 1: Hero + Filter card
      '<div class="row r-flow" style="margin-bottom:16px">',
      // Left: Flow diagram
      '<div class="flow-card">',
      '<div class="card-title"><span class="dot ok"></span>Luftstr\u00f6me &amp; W\u00e4rmetauscher</div>',
      SVG_FLOW,
      '<div class="stream-grid">',
      '<div class="stream s-out"><div class="s-name">Au\u00dfenluft</div>',
      '<div><span class="s-temp" id="sd-tau">--</span><span class="s-unit"> \u00b0C</span></div>',
      '<div class="s-row"><span>Feuchte rel</span><span class="s-val"><span id="sd-fau">--</span>%</span></div>',
      '<div class="s-row"><span>Feuchte abs</span><span class="s-val"><span id="sd-fauabs">--</span> g/m\u00b3</span></div>',
      '</div>',
      '<div class="stream s-sup"><div class="s-name">Zuluft</div>',
      '<div><span class="s-temp" id="sd-tzu">--</span><span class="s-unit"> \u00b0C</span></div>',
      '<div class="s-row"><span>Temp. ber.</span><span class="s-val"><span id="sd-tzb">--</span> \u00b0C</span></div>',
      '</div>',
      '<div class="stream s-ext"><div class="s-name">Abluft</div>',
      '<div><span class="s-temp" id="sd-tab">--</span><span class="s-unit"> \u00b0C</span></div>',
      '<div class="s-row"><span>Feuchte rel</span><span class="s-val"><span id="sd-fab">--</span>%</span></div>',
      '<div class="s-row"><span>CO\u2082</span><span class="s-val"><span id="sd-co2">--</span> ppm</span></div>',
      '</div>',
      '<div class="stream s-exh"><div class="s-name">Fortluft</div>',
      '<div><span class="s-temp" id="sd-tfo">--</span><span class="s-unit"> \u00b0C</span></div>',
      '<div class="s-row"><span>Luftdruck</span><span class="s-val"><span id="sd-ldr">--</span> hPa</span></div>',
      '</div>',
      '</div>', // stream-grid
      '</div>', // flow-card

      // Right: Filter + Gauges
      '<div style="display:flex;flex-direction:column;gap:14px">',
      // Filter card
      '<div class="filter-card">',
      '<div class="card-title"><span class="dot" id="filter-dot"></span>J\u00e4hrlicher Filterwechsel</div>',
      '<div class="filter-ring">',
      '<svg id="filter-ring-svg" viewBox="0 0 120 120" width="110" height="110" style="flex-shrink:0"></svg>',
      '<div class="filter-info">',
      '<div class="filter-status fs-ok" id="filter-status-badge">\u2705 In Ordnung</div>',
      '<div class="filter-days" id="filter-days">---</div>',
      '<div class="filter-meta" id="filter-meta">Tage verbleibend</div>',
      '<div class="filter-bar"><div class="filter-bar-fill" id="filter-bar-fill" style="width:0%;background:var(--green)"></div></div>',
      '<div class="filter-hours-row"><span id="filter-h-used">0 h</span><span id="filter-h-total">-- h</span></div>',
      '</div>',
      '</div>',
      '</div>', // filter-card

      // Gauges row
      '<div class="card" style="display:flex;justify-content:space-around;align-items:flex-end;flex-wrap:wrap;gap:10px;padding:14px">',
      GAUGE_CO2, GAUGE_WRG, GAUGE_FLOW,
      '</div>',
      '</div>', // right column
      '</div>', // row r-flow

      // Row 2: Grade cards
      '<div class="grade-grid" style="margin-bottom:16px">',
      '<div class="grade-card"><div class="grade-name">Feuchtigkeit</div><div class="grade-dots" id="gr-hum"></div><div class="grade-text" id="grt-hum">--</div></div>',
      '<div class="grade-card"><div class="grade-name">CO\u2082</div><div class="grade-dots" id="gr-co2"></div><div class="grade-text" id="grt-co2">--</div></div>',
      '<div class="grade-card"><div class="grade-name">Au\u00dfenluftfilter</div><div class="grade-dots" id="gr-fout"></div><div class="grade-text" id="grt-fout">--</div></div>',
      '<div class="grade-card"><div class="grade-name">Abluftfilter</div><div class="grade-dots" id="gr-fext"></div><div class="grade-text" id="grt-fext">--</div></div>',
      '</div>',

      // Row 3: Metrics + Control
      '<div class="row r2" style="margin-bottom:16px">',
      '<div class="card">',
      '<div class="card-title">Ger\u00e4te-Metriken</div>',
      '<div class="metric"><span class="metric-lbl">Betriebsart</span><span class="metric-val" id="m-ba">--</span></div>',
      '<div class="metric"><span class="metric-lbl">Comfort-Level</span><span class="metric-val" id="m-cl">--</span></div>',
      '<div class="metric"><span class="metric-lbl">Betriebsstunden</span><span class="metric-val" id="m-bst">--</span></div>',
      '<div class="metric"><span class="metric-lbl">Filterstunden</span><span class="metric-val" id="m-fst">--</span></div>',
      '<div class="metric"><span class="metric-lbl">L\u00fcfter Zuluft</span><span class="metric-val" id="m-vgz">--</span></div>',
      '<div class="metric"><span class="metric-lbl">L\u00fcfter Abluft</span><span class="metric-val" id="m-vga">--</span></div>',
      '<div class="metric"><span class="metric-lbl">Feuchte-R\u00fcckgew.</span><span class="metric-val" id="m-frg">--</span></div>',
      '<div class="metric"><span class="metric-lbl">Fehlerstatus</span><span class="metric-val" id="m-fs">--</span></div>',
      '<div class="metric"><span class="metric-lbl">WLAN RSSI</span><span class="metric-val" id="m-rssi">--</span></div>',
      '</div>',
      '<div class="ctrl-panel">',
      '<div class="ctrl-heading">\u2699\uFE0F Steuerung <span style="color:var(--yellow);font-size:.68rem;text-transform:none;letter-spacing:0">(Endpunkt TBD)</span></div>',
      '<div class="ctrl-row"><span class="ctrl-lbl">Comfort-Level</span>',
      '<div class="btn-grp" id="cl-btns">',
      '<button class="cbtn" data-cl="1" onclick="selCL(this)">1</button>',
      '<button class="cbtn" data-cl="2" onclick="selCL(this)">2</button>',
      '<button class="cbtn" data-cl="3" onclick="selCL(this)">3</button>',
      '<button class="cbtn" data-cl="4" onclick="selCL(this)">4</button>',
      '<button class="cbtn" data-cl="5" onclick="selCL(this)">5</button>',
      '</div></div>',
      '<div class="ctrl-row"><span class="ctrl-lbl">Betriebsart</span>',
      '<div class="btn-grp" id="ba-btns">',
      '<button class="cbtn" data-ba="cmf" onclick="selBA(this)">Comfort</button>',
      '<button class="cbtn" data-ba="slp" onclick="selBA(this)">Sleep</button>',
      '<button class="cbtn" data-ba="trb" onclick="selBA(this)">Turbo</button>',
      '<button class="cbtn" data-ba="trc" onclick="selBA(this)">Turbo Cool</button>',
      '</div></div>',
      '<button class="send-btn" onclick="sendCtrl()">Anwenden (zeitverz\u00f6gert)</button>',
      '<div class="ctrl-note" id="ctrl-msg"></div>',
      '</div>',
      '</div>', // row r2

    ].join('');

    // ── LOGS TAB ──
    const HTML_LOGS = [
      '<div class="log-bar">',
      '<select class="lf" id="logLevel" onchange="renderLogs()"><option value="">Alle Level</option>',
      '<option value="error">Fehler</option><option value="warn">Warnung</option>',
      '<option value="info">Info</option><option value="debug">Debug</option></select>',
      '<select class="lf" id="logCat" onchange="renderLogs()"><option value="">Alle Kategorien</option>',
      '<option value="POLL">POLL</option><option value="HTTP">HTTP</option>',
      '<option value="CTRL">CTRL</option><option value="FILTER">FILTER</option></select>',
      '<button class="action-btn primary" onclick="fetchLogs()">Aktualisieren</button>',
      '<button class="action-btn" onclick="exportLogs()">Export</button>',
      '</div>',
      '<div class="log-box" id="logBox"><div style="color:var(--dim);padding:10px">Lade Logs\u2026</div></div>'
    ].join('');

    // ── SYSTEM TAB ──
    const HTML_SYS = [
      '<div class="sys-grid">',
      '<div class="card"><div class="card-title">Adapter-Info</div>',
      '<div class="kv-row"><span class="kk">Version</span><span class="kv-v">' + ver + '</span></div>',
      '<div class="kv-row"><span class="kk">Seriennummer</span><span class="kv-v">' + sn + '</span></div>',
      '<div class="kv-row"><span class="kk">Web-UI Port</span><span class="kv-v">' + port + '</span></div>',
      '<div class="kv-row"><span class="kk">Poll-Intervall</span><span class="kv-v">' + iv + ' s</span></div>',
      '<div class="kv-row"><span class="kk">Filter-Intervall</span><span class="kv-v">' + filterH + ' h (' + Math.round(filterH/24) + ' Tage)</span></div>',
      '</div>',
      '<div class="card"><div class="card-title">Aktionen</div>',
      '<div style="display:flex;flex-direction:column;gap:9px;margin-top:4px">',
      '<button class="action-btn primary" onclick="manualPoll()">\u25b6 Sofort abfragen</button>',
      '<a class="action-btn" href="https://www.freeair-connect.de/?lang=de&serialnumber=' + sn + '" target="_blank">\uD83C\uDF10 freeAir Connect \u2192</a>',
      '<a class="action-btn" href="https://blumartin.de/downloads/anleitungen/" target="_blank">\uD83D\uDCD6 Anleitungen</a>',
      '<a class="action-btn" href="https://blumartin.de/freeair-support/" target="_blank">\uD83D\uDEA8 Support</a>',
      '</div></div>',
      '</div>',
      '<div class="card" style="margin-bottom:14px"><div class="card-title">Ger\u00e4te-Details</div>',
      '<div id="devDetails"><span style="color:var(--dim)">Noch kein Poll\u2026</span></div>',
      '</div>',
      '<div class="warn-box">',
      '<strong style="color:var(--yellow)">\u26a0\uFE0F Steuerungsendpunkt noch nicht implementiert</strong><br>',
      'Der AJAX-Endpunkt f\u00fcr Steuerkommandos auf freeair-connect.de muss noch analysiert werden.<br>',
      '<strong>So finden:</strong> Browser DevTools \u2192 Netzwerk \u2192 freeair-connect.de laden \u2192 ',
      'PRESS-Button klicken \u2192 "Anwenden" \u2192 XHR/Fetch-Request notieren.<br>',
      'Bitte als <a style="color:var(--blue)" href="https://github.com/MPunktBPunkt/iobroker.freeair100/issues" target="_blank">GitHub Issue</a> melden.',
      '</div>'
    ].join('');

    // ── JAVASCRIPT ──
    const JS = [
      'var logs=[],selCl=null,selBa=null,curTab="daten",filterInterval=8760;',
      'var baLabel={cmf:"Comfort",slp:"Sleep",trb:"Turbo",trc:"Turbo Cool"};',
      'var gradeLabel=["","Gut","OK","Erh\u00f6ht","Kritisch"];',

      // Tab switching
      'function sw(name){',
      '  document.querySelectorAll(".tb").forEach(function(b){b.classList.remove("act");});',
      '  document.querySelectorAll(".tp").forEach(function(p){p.classList.remove("act");});',
      '  var tabs=["daten","logs","system"];',
      '  var idx=tabs.indexOf(name);if(idx>=0)document.querySelectorAll(".tb")[idx].classList.add("act");',
      '  var pane=document.getElementById("pane-"+name);if(pane)pane.classList.add("act");',
      '  curTab=name;',
      '  if(name==="logs")fetchLogs();',
      '  if(name==="system")fetchSys();',
      '}',

      // ── set helper ──
      'function set(id,val){var e=document.getElementById(id);if(e)e.textContent=(val!==undefined&&val!==null&&val!=="")? val:"--";}',
      'function f1(v){return(v===undefined||v===null||v==="")?"--":parseFloat(v).toFixed(1);}',
      'function f0(v){return(v===undefined||v===null||v==="")?"--":Math.round(parseFloat(v));}',

      // ── Arc gauge (SVG) ──
      // Draws a half-arc gauge. el=svg id, pct=0-100, color=css color, value=text, label2=sub
      'function drawGauge(id,pct,color,value,unit){',
      '  var el=document.getElementById(id);if(!el)return;',
      '  var r=44,cx=60,cy=64;',
      '  var startA=-Math.PI,endA=0;',
      '  var ang=startA+(endA-startA)*Math.min(1,Math.max(0,pct/100));',
      '  function pt(a){return{x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)};}',
      '  var s=pt(startA),e=pt(ang),ef=pt(endA);',
      '  var bg="<path d=\'M"+s.x+","+s.y+" A"+r+","+r+",0,0,1,"+ef.x+","+ef.y+"\' fill=\'none\' stroke=\'#21262d\' stroke-width=\'10\' stroke-linecap=\'round\'/>";',
      '  var fill="";',
      '  if(pct>0){fill="<path d=\'M"+s.x+","+s.y+" A"+r+","+r+",0,"+(ang-startA>Math.PI?1:0)+",1,"+e.x+","+e.y+"\' fill=\'none\' stroke=\'"+color+"\' stroke-width=\'10\' stroke-linecap=\'round\'/>";}',
      '  var txt="<text x=\'60\' y=\'54\' text-anchor=\'middle\' font-size=\'18\' font-weight=\'700\' fill=\'"+color+"\' font-family=\'monospace\'>"+value+"</text>";',
      '  var utxt="<text x=\'60\' y=\'65\' text-anchor=\'middle\' font-size=\'9\' fill=\'#8b949e\' font-family=\'monospace\'>"+unit+"</text>";',
      '  el.innerHTML=bg+fill+txt+utxt;',
      '}',

      // ── Filter ring (full circle) ──
      'function drawFilterRing(pct,color){',
      '  var el=document.getElementById("filter-ring-svg");if(!el)return;',
      '  var r=48,cx=60,cy=60,circ=2*Math.PI*r;',
      '  var dash=Math.min(1,pct/100)*circ;',
      '  var gap=circ-dash;',
      '  var h=\'<circle cx="\'+cx+\'" cy="\'+cy+\'" r="\'+r+\'" fill="none" stroke="#21262d" stroke-width="12"/>\';',
      '  h+=\'<circle cx="\'+cx+\'" cy="\'+cy+\'" r="\'+r+\'" fill="none" stroke="\'+color+\'" stroke-width="12"\';',
      '  h+=\' stroke-dasharray="\'+dash+\' \'+gap+\'" stroke-dashoffset="\'+circ*0.25+\'" stroke-linecap="round"/>\';',
      '  h+=\'<text x="\'+cx+\'" y="\'+cy+\'" text-anchor="middle" dominant-baseline="middle" font-size="15" font-weight="700" fill="\'+color+\'" font-family="monospace">\'+Math.round(pct)+\'%</text>\';',
      '  el.innerHTML=h;',
      '}',

      // ── Grade dots ──
      'function renderGrade(baseId,n){',
      '  var dots=document.getElementById("gr-"+baseId);if(!dots)return;',
      '  var h="";',
      '  for(var i=1;i<=4;i++)h+=\'<div class="gdot \'+(i<=n?"l"+n:"")+\'"></div>\';',
      '  dots.innerHTML=h;',
      '  var txt=document.getElementById("grt-"+baseId);',
      '  if(txt){txt.textContent=gradeLabel[n]||"--";txt.className="grade-text gt"+n;}',
      '}',

      // ── CO2 color helper ──
      'function co2Color(v){',
      '  v=parseFloat(v);',
      '  if(isNaN(v))return"#8b949e";',
      '  if(v<800)return"#3fb950";',
      '  if(v<1200)return"#e3b341";',
      '  if(v<1600)return"#f0883e";',
      '  return"#f85149";',
      '}',

      // ── Render Daten ──
      'function renderDaten(d){',
      // SVG diagram temps
      '  set("sv-tau",f1(d.TAU));set("sv-tzu",f1(d.TZU));',
      '  set("sv-tab",f1(d.TAB));set("sv-tfo",f1(d.TFO));',
      '  set("sv-co2",d.CO2||"--");',
      '  set("sv-wrp",(d.WRP?d.WRP+"%":"--"));',
      // Stream cards
      '  set("sd-tau",f1(d.TAU));set("sd-fau",d.FAU||"--");set("sd-fauabs",d.FAU_abs||"--");',
      '  set("sd-tzu",f1(d.TZU));set("sd-tzb",f1(d.TZB));',
      '  set("sd-tab",f1(d.TAB));set("sd-fab",d.FAB||"--");set("sd-co2",d.CO2||"--");',
      '  set("sd-tfo",f1(d.TFO));set("sd-ldr",d.LDR||"--");',
      // Metrics
      '  set("m-ba",(baLabel[d.BA]||d.BA)||"--");',
      '  set("m-cl",d.CL||"--");',
      '  set("m-bst",d.BST?d.BST+" h":"--");',
      '  set("m-fst",d.FST?d.FST+" h":"--");',
      '  set("m-vgz",d.VGZ?d.VGZ+" 1/min":"--");',
      '  set("m-vga",d.VGA?d.VGA+" 1/min":"--");',
      '  set("m-frg",d.FRG||"--");',
      '  var fsEl=document.getElementById("m-fs");',
      '  if(fsEl){fsEl.textContent=d.FS||"--";fsEl.style.color=(d.FS==="OK")?"var(--green)":"var(--red)";}',
      '  set("m-rssi",d.RSSI?d.RSSI+" dBm":"--");',
      // Grades
      '  renderGrade("hum",d.GRADE_HUM||0);',
      '  renderGrade("co2",d.GRADE_CO2||0);',
      '  renderGrade("fout",d.GRADE_FILT_OUT||0);',
      '  renderGrade("fext",d.GRADE_FILT_EXT||0);',
      // Gauges
      '  var co2v=parseFloat(d.CO2)||0;var co2pct=Math.min(100,co2v/2000*100);',
      '  drawGauge("g-co2",co2pct,co2Color(d.CO2),d.CO2||"--","ppm");',
      '  var wrpv=parseFloat(d.WRP)||0;',
      '  var wrpColor=wrpv>=80?"#3fb950":wrpv>=60?"#e3b341":"#f85149";',
      '  drawGauge("g-wrg",wrpv,wrpColor,(d.WRP||"--"),"%");',
      '  var lstv=parseFloat(d.LST)||0;var lstPct=Math.min(100,lstv/150*100);',
      '  drawGauge("g-flow",lstPct,"#00b4d8",(d.LST||"--"),"m\u00b3/h");',
      // Control button sync
      '  if(d.CL&&!selCl){selCl=String(d.CL);hlBtn("cl-btns","cl",selCl);}',
      '  if(d.BA&&!selBa){selBa=d.BA;hlBtn("ba-btns","ba",selBa);}',
      // Status dot
      '  var hdot=document.getElementById("hDot");if(hdot)hdot.className="dot"+(d._ts?" ok":"");',
      '  var upd=document.getElementById("hUpd");if(upd&&d._ts)upd.textContent=new Date(d._ts).toLocaleTimeString("de-DE");',
      // Filter
      '  renderFilter(d.FST,d.FS);',
      '}',

      // ── Render Filter ──
      'function renderFilter(fst,fs){',
      '  var fstH=parseFloat(fst)||0;',
      '  var remaining=Math.max(0,filterInterval-fstH);',
      '  var overdue=fstH>filterInterval;',
      '  var pct=Math.min(100,fstH/filterInterval*100);',
      '  var days=Math.round(remaining/24);',
      '  var color=pct<60?"#3fb950":pct<80?"#e3b341":pct<100?"#f0883e":"#f85149";',
      // Ring
      '  drawFilterRing(pct,color);',
      // Bar
      '  var bar=document.getElementById("filter-bar-fill");',
      '  if(bar){bar.style.width=pct+"%";bar.style.background=color;}',
      // Status badge
      '  var badge=document.getElementById("filter-status-badge");',
      '  var dot=document.getElementById("filter-dot");',
      '  if(badge){',
      '    if(overdue){badge.className="filter-status fs-due";badge.textContent="\u26a0\ufe0f Wechsel f\u00e4llig!";if(dot)dot.className="dot derr";}',
      '    else if(pct>=80){badge.className="filter-status fs-warn";badge.textContent="\uD83D\uDD14 Bald f\u00e4llig";if(dot)dot.className="dot dwarn";}',
      '    else{badge.className="filter-status fs-ok";badge.textContent="\u2705 In Ordnung";if(dot)dot.className="dot ok";}',
      '  }',
      // Days display
      '  var dEl=document.getElementById("filter-days");',
      '  var mEl=document.getElementById("filter-meta");',
      '  if(dEl&&mEl){',
      '    if(overdue){',
      '      dEl.textContent=Math.round((fstH-filterInterval)/24);dEl.style.color="#f85149";',
      '      mEl.textContent="Tage \u00fcberf\u00e4llig";',
      '    }else{',
      '      dEl.textContent=days;dEl.style.color=color;',
      '      mEl.textContent="Tage verbleibend";',
      '    }',
      '  }',
      // Hours labels
      '  set("filter-h-used",Math.round(fstH)+" h genutzt");',
      '  set("filter-h-total",filterInterval+" h Intervall");',
      '}',

      // ── System details ──
      'function renderSys(d){',
      '  var el=document.getElementById("devDetails");if(!el)return;',
      '  var pairs=[',
      '    ["Betriebsart",baLabel[d.BA]||d.BA],["Comfort-Level",d.CL],',
      '    ["Betriebsstunden",d.BST?d.BST+" h":"--"],["Filterstunden",d.FST?d.FST+" h":"--"],',
      '    ["SW-Version",d.SWV],["LP-Version",d.LPV],["Seriennummer",d.SNR],',
      '    ["RSSI",d.RSSI?d.RSSI+" dBm":"--"],["Luftdichte",d.LDI?d.LDI+" kg/m\u00b3":"--"],',
      '    ["Luftdruck",d.LDR?d.LDR+" hPa":"--"],',
      '    ["Enteisung",d.EM],["Sommer-K\u00fchlung",d.SK]',
      '  ];',
      '  var h="";',
      '  for(var i=0;i<pairs.length;i++){',
      '    h+=\'<div class="kv-row"><span class="kk">\'+pairs[i][0]+\'</span><span class="kv-v">\'+(pairs[i][1]||"--")+"</span></div>";',
      '  }',
      '  el.innerHTML=h;',
      '}',

      // ── Control helpers ──
      'function hlBtn(gid,dkey,val){',
      '  var g=document.getElementById(gid);if(!g)return;',
      '  g.querySelectorAll(".cbtn").forEach(function(b){b.classList.toggle("sel",b.dataset[dkey]===val);});',
      '}',
      'function selCL(btn){selCl=btn.dataset.cl;hlBtn("cl-btns","cl",selCl);}',
      'function selBA(btn){selBa=btn.dataset.ba;hlBtn("ba-btns","ba",selBa);}',
      'function sendCtrl(){',
      '  var msg=document.getElementById("ctrl-msg");',
      '  if(!selCl&&!selBa){msg.textContent="Bitte zuerst CL oder BA w\u00e4hlen.";return;}',
      '  msg.textContent="Sende\u2026";msg.style.color="var(--muted)";',
      '  fetch("/api/control",{method:"POST",headers:{"Content-Type":"application/json"},',
      '    body:JSON.stringify({cl:selCl?parseInt(selCl):null,ba:selBa})})',
      '  .then(function(r){return r.json();})',
      '  .then(function(d){msg.textContent=d.msg||(d.ok?"\u2705 OK":"\u26a0\ufe0f "+d.msg);msg.style.color=d.ok?"var(--green)":"var(--yellow)";})',
      '  .catch(function(e){msg.textContent="Fehler: "+e.message;msg.style.color="var(--red)";});',
      '}',

      // ── Fetch data ──
      'function fetchData(){',
      '  fetch("/api/data").then(function(r){return r.json();}).then(function(d){',
      '    if(curTab==="daten")renderDaten(d);',
      '  }).catch(function(e){console.warn("fetchData Fehler:",e);});',
      '}',
      'function fetchSys(){',
      '  fetch("/api/data").then(function(r){return r.json();}).then(function(d){renderSys(d);}).catch(function(){});',
      '}',
      'function manualPoll(){',
      '  var dot=document.getElementById("hDot");if(dot)dot.className="dot dwarn";',
      '  fetch("/api/poll").then(function(){setTimeout(function(){fetchData();fetchSys();},1800);});',
      '}',

      // ── Logs ──
      'function fetchLogs(){',
      '  fetch("/api/logs").then(function(r){return r.json();}).then(function(data){logs=data;renderLogs();}).catch(function(){});',
      '}',
      'function renderLogs(){',
      '  var lv=document.getElementById("logLevel").value;',
      '  var cat=document.getElementById("logCat").value;',
      '  var f=logs.filter(function(l){return(!lv||l.level===lv)&&(!cat||l.cat===cat);}).slice(-250).reverse();',
      '  var box=document.getElementById("logBox");if(!box)return;',
      '  if(!f.length){box.innerHTML=\'<div style="color:var(--dim);padding:10px">Keine Eintr\u00e4ge.</div>\';return;}',
      '  var h="";',
      '  for(var i=0;i<f.length;i++){',
      '    var l=f[i];',
      '    h+=\'<div class="ll \'+l.level+\'">\';',
      '    h+=\'<span class="lts">\'+new Date(l.ts).toLocaleTimeString("de-DE")+\'</span>\';',
      '    h+=\'<span class="lc">[\'+l.cat+\']</span>\';',
      '    h+=\'<span class="lm">\'+l.msg+\'</span></div>\';',
      '  }',
      '  box.innerHTML=h;',
      '}',
      'function exportLogs(){',
      '  var txt=logs.map(function(l){return new Date(l.ts).toISOString()+" ["+l.level.toUpperCase()+"] ["+l.cat+"] "+l.msg;}).join("\\n");',
      '  var a=document.createElement("a");',
      '  a.href="data:text/plain;charset=utf-8,"+encodeURIComponent(txt);',
      '  a.download="freeair100-logs.txt";a.click();',
      '}',

      // ── Init ──
      'fetch("/api/config").then(function(r){return r.json();}).then(function(c){filterInterval=c.filterChangeIntervalH||8760;});',
      'fetchData();',
      'if(!window._pollTimer){window._pollTimer=setInterval(function(){if(curTab==="daten")fetchData();else if(curTab==="logs")fetchLogs();},15000);}',
    ];

    // ── Assemble HTML ──
    return [
      '<!DOCTYPE html>',
      '<html lang="de">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1.0">',
      '<title>freeAir 100 \u2013 ioBroker Adapter</title>',
      '<style>' + CSS + '</style>',
      '</head>',
      '<body>',
      '<header>',
      '<div class="hlogo">',
      '<svg width="30" height="30" viewBox="0 0 32 32">',
      '<circle cx="16" cy="16" r="15.5" fill="#0e1f2e" stroke="#00b4d8" stroke-width="1.2"/>',
      '<g fill="#00b4d8">',
      '<path d="M16 4 Q20 10 16 12 Q12 10 16 4Z"/>',
      '<path d="M16 4 Q20 10 16 12 Q12 10 16 4Z" transform="rotate(60,16,16)"/>',
      '<path d="M16 4 Q20 10 16 12 Q12 10 16 4Z" transform="rotate(120,16,16)"/>',
      '<path d="M16 4 Q20 10 16 12 Q12 10 16 4Z" transform="rotate(180,16,16)"/>',
      '<path d="M16 4 Q20 10 16 12 Q12 10 16 4Z" transform="rotate(240,16,16)"/>',
      '<path d="M16 4 Q20 10 16 12 Q12 10 16 4Z" transform="rotate(300,16,16)"/>',
      '</g>',
      '<circle cx="16" cy="16" r="4.5" fill="#0d1117" stroke="#00b4d8" stroke-width="1.2"/>',
      '<circle cx="16" cy="16" r="2" fill="#00b4d8"/>',
      '</svg>',
      'freeAir 100',
      '</div>',
      '<span class="hbadge">ioBroker v' + ver + '</span>',
      '<div class="hright">',
      '<span>SN\u00a0<strong>' + sn + '</strong></span>',
      '<span class="dot" id="hDot"></span>',
      '<span id="hUpd">---</span>',
      '</div>',
      '</header>',
      '<nav>',
      '<button class="tb act" onclick="sw(\'daten\')">\uD83D\uDCA8\u00a0Daten</button>',
      '<button class="tb" onclick="sw(\'logs\')">\uD83D\uDCCB\u00a0Logs</button>',
      '<button class="tb" onclick="sw(\'system\')">\u2699\uFE0F\u00a0System</button>',
      '</nav>',
      '<div class="tp act" id="pane-daten">' + HTML_DATEN + '</div>',
      '<div class="tp" id="pane-logs">'   + HTML_LOGS + '</div>',
      '<div class="tp" id="pane-system">' + HTML_SYS + '</div>',
      '<div class="update-bar">',
      '<span>Letzte Abfrage:</span><span id="hUpd2">---</span>',
      '<span>Intervall:</span><span>' + iv + 's</span>',
      '<span>Filter-Intervall:</span><span>' + filterH + 'h</span>',
      '</div>',
      '<script>' + JS.join('\n').replace(/<\/script>/gi,'<\\/script>') + '<\/script>',
      '</body></html>'
    ].join('\n');
  }
}

if (module.parent) {
    module.exports = (options) => new FreeAir100(options);
} else {
    new FreeAir100();
}
