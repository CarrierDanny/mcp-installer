// sidebar/tabs/triage-tab.js — Case Triage pipeline (ported from PARADICE Workbench)
(function () {
  'use strict';

  var container = document.getElementById('tab-triage');
  if (!container) return;

  var learn = (typeof GPD_ProgressiveLearn !== 'undefined') ? GPD_ProgressiveLearn : null;
  var B = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;
  var STORAGE_KEY = 'gpd_triage_state';

  function $(id) { return container.querySelector('#' + id) || document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(msg, kind) {
    if (!window.Toast) return;
    if (kind === 'bad') Toast.error(msg);
    else if (kind === 'warn') Toast.warning(msg);
    else Toast.success(msg);
  }
  function record(a, d) { if (learn && learn.record) learn.record(a, d); }
  function uid() { return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function dataUrlB64(url) {
    var i = String(url || '').indexOf(',');
    return i >= 0 ? url.slice(i + 1) : url;
  }
  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  function copyText(t) {
    return navigator.clipboard.writeText(String(t || '')).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = String(t || '');
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    });
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  var style = document.createElement('style');
  style.textContent = [
    '.tri-map { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }',
    '.tri-step { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid #334155; border-radius:999px; font-size:11px; color:#94a3b8; cursor:pointer; background:#0f172a; }',
    '.tri-step .n { width:18px; height:18px; border-radius:50%; background:#1e293b; display:inline-flex; align-items:center; justify-content:center; font-size:10px; }',
    '.tri-step.done { border-color:#22c55e; color:#86efac; }',
    '.tri-step.ready { border-color:#38bdf8; color:#7dd3fc; }',
    '.tri-card { border-left:3px solid #334155; }',
    '.tri-q { font-family:Consolas,Monaco,monospace; font-size:10px; background:#0b1220; border:1px solid #334155; border-radius:6px; padding:8px; max-height:110px; overflow:auto; white-space:pre-wrap; color:#cbd5e1; }',
    '.tri-grid { display:grid; grid-template-columns:1fr; gap:8px; }',
    '@media (min-width:700px){ .tri-grid { grid-template-columns:1fr 1fr; } }',
    '.tri-att, .tri-audio { font-size:11px; padding:6px 8px; border-bottom:1px solid #1e293b; }',
    '.serOk { color:#86efac; } .serBad { color:#fca5a5; }',
    '.tri-results table { width:100%; border-collapse:collapse; font-size:11px; }',
    '.tri-results th, .tri-results td { border:1px solid #334155; padding:4px; vertical-align:top; }',
    '.tri-results input { width:100%; background:#0f172a; border:1px solid #334155; color:#e2e8f0; border-radius:4px; padding:2px 4px; font-size:11px; }'
  ].join('\n');
  document.head.appendChild(style);

  container.innerHTML =
    '<div class="tab-title">Case Triage</div>' +
    '<div class="tab-desc">Cases → attachments → audio → transcript → parsed values → Sheet. Jump in at any step.</div>' +
    '<div class="stu-row" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' +
      '<input type="text" id="triInstance" class="form-control" value="carrierenterprise.lightning.force.com" style="flex:1;min-width:180px;" title="Salesforce instance for download links">' +
      '<button class="btn btn-secondary btn-sm" id="btnTriReset">Reset pipeline</button>' +
    '</div>' +
    '<div class="tri-map" id="triMap"></div>' +

    '<div class="card tri-card" id="triCard1">' +
      '<div class="section-title">1 · Find cases <span id="triStat1" class="text-muted"></span></div>' +
      '<p class="text-xs text-muted" style="margin-bottom:6px;">Paste anything with case numbers (03/04-prefix) or Case IDs (500…).</p>' +
      '<textarea id="tri1In" rows="3" class="form-control" placeholder="VM_03412551.mp3, Case #: 03412887, or 500Nx00000YXD9S…"></textarea>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:6px 0;">' +
        '<button class="btn btn-primary btn-sm" id="btnTri1">Extract cases</button>' +
        '<span class="text-xs text-muted" id="tri1Chips"></span>' +
      '</div>' +
      '<label class="text-xs text-muted">Case detail query</label>' +
      '<div class="tri-q" id="triQ1">— extract cases first —</div>' +
      '<div style="display:flex;gap:6px;margin-top:6px;">' +
        '<button class="btn btn-secondary btn-sm" id="btnTriQ1Copy">Copy query</button>' +
        '<button class="btn btn-secondary btn-sm" id="btnTriWb">Open Workbench</button>' +
      '</div>' +
    '</div>' +

    '<div class="card tri-card" id="triCard2">' +
      '<div class="section-title">2 · Case details <span id="triStat2" class="text-muted"></span></div>' +
      '<textarea id="tri2In" rows="4" class="form-control" placeholder="Paste full Workbench output (with Query Results)…"></textarea>' +
      '<button class="btn btn-primary btn-sm" id="btnTri2" style="margin:6px 0;">Parse case details</button>' +
      '<div class="tri-grid">' +
        '<div><label class="text-xs text-muted">EmailMessage query</label><div class="tri-q" id="triQ2a">— parse cases first —</div>' +
          '<button class="btn btn-secondary btn-sm" id="btnTriQ2aCopy" style="margin-top:4px;">Copy</button></div>' +
        '<div><label class="text-xs text-muted">Direct Case attachment query</label><div class="tri-q" id="triQ2b">— parse cases first —</div>' +
          '<button class="btn btn-secondary btn-sm" id="btnTriQ2bCopy" style="margin-top:4px;">Copy</button></div>' +
      '</div>' +
    '</div>' +

    '<div class="card tri-card" id="triCard3">' +
      '<div class="section-title">3 · Attachments <span id="triStat3" class="text-muted"></span></div>' +
      '<div class="tri-grid">' +
        '<div><textarea id="tri3aIn" rows="3" class="form-control" placeholder="EmailMessage query results…"></textarea>' +
          '<button class="btn btn-primary btn-sm" id="btnTri3a" style="margin:6px 0;">Parse emails</button>' +
          '<label class="text-xs text-muted">Email-attachment query</label><div class="tri-q" id="triQ3">— parse emails first —</div>' +
          '<button class="btn btn-secondary btn-sm" id="btnTriQ3Copy" style="margin-top:4px;">Copy</button></div>' +
        '<div><textarea id="tri3bIn" rows="3" class="form-control" placeholder="Attachment results or bare 00P… IDs…"></textarea>' +
          '<button class="btn btn-primary btn-sm" id="btnTri3b" style="margin:6px 0;">Parse attachments</button>' +
          '<div id="triAttList" style="max-height:200px;overflow:auto;"></div>' +
          '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">' +
            '<button class="btn btn-secondary btn-sm" id="btnTriLinksCopy">Copy download links</button>' +
            '<button class="btn btn-secondary btn-sm" id="btnTriAudioOpen">Open audio links</button>' +
          '</div></div>' +
      '</div>' +
    '</div>' +

    '<div class="card tri-card" id="triCard4">' +
      '<div class="section-title">4 · Audio → Drive + transcript <span id="triStat4" class="text-muted"></span></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">' +
        '<button class="btn btn-secondary btn-sm" id="btnTriAudioAdd">Add audio files</button>' +
        '<input type="file" id="triAudioFile" accept="audio/*,.mp3,.wav,.m4a,.ogg" multiple style="display:none">' +
        '<select id="triSttProv" class="form-control" style="width:auto;min-width:140px;">' +
          '<option value="openai">Whisper (OpenAI)</option>' +
          '<option value="openai-4o">gpt-4o-mini-transcribe</option>' +
          '<option value="gemini">Gemini (audio)</option>' +
          '<option value="manual">Manual — paste transcript</option>' +
        '</select>' +
        '<label class="text-xs" style="display:flex;gap:4px;align-items:center;"><input type="checkbox" id="triShare" checked> shareable Drive links</label>' +
        '<button class="btn btn-primary btn-sm" id="btnTriRunAll">Save + transcribe all</button>' +
      '</div>' +
      '<div id="triAudioList"></div>' +
    '</div>' +

    '<div class="card tri-card" id="triCard5">' +
      '<div class="section-title">5 · Parse &amp; review <span id="triStat5" class="text-muted"></span></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' +
        '<button class="btn btn-primary btn-sm" id="btnTriParseAll">Parse all transcripts</button>' +
        '<button class="btn btn-secondary btn-sm" id="btnTriAiAll">AI extract all</button>' +
        '<button class="btn btn-secondary btn-sm" id="btnTriImgAdd">Add screenshots (OCR)</button>' +
        '<input type="file" id="triImgFile" accept="image/*" multiple style="display:none">' +
      '</div>' +
      '<div id="triImgOut" class="text-xs text-muted"></div>' +
      '<div class="tri-results" id="triResults" style="overflow:auto;max-height:360px;margin-top:8px;"></div>' +
    '</div>' +

    '<div class="card tri-card" id="triCard6">' +
      '<div class="section-title">6 · Export</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
        '<button class="btn btn-primary btn-sm" id="btnTriSheet">Create Google Sheet</button>' +
        '<button class="btn btn-secondary btn-sm" id="btnTriCsv">Download CSV</button>' +
        '<button class="btn btn-secondary btn-sm" id="btnTriTsv">Copy TSV</button>' +
        '<span class="text-xs text-muted" id="triSheetOut"></span>' +
      '</div>' +
    '</div>';

  var triage = {
    s: { caseNumbers: [], caseIds: [], cases: {}, emailIds: [], atts: [], audio: [], imgFinds: [], results: {} },
    save: debounce(function () {
      var lite = Object.assign({}, triage.s, {
        audio: triage.s.audio.map(function (a) {
          return Object.assign({}, a, { data: '' });
        })
      });
      try {
        var saved = B.storage.local.set({ gpd_triage_state: lite });
        if (saved && typeof saved.catch === 'function') saved.catch(function () {});
      } catch (_) {}
    }, 700),
    load: function () {
      // On Firefox `B` is `browser`, whose storage.local.get takes no callback
      // and returns a Promise — the callback-only version never fired, so saved
      // triage state was silently dropped on every load. Promise form first.
      return new Promise(function (resolve) {
        function apply(r) {
          if (r && r[STORAGE_KEY]) triage.s = Object.assign(triage.s, r[STORAGE_KEY]);
          triage.renderAll();
          resolve();
        }
        try {
          var maybe = B.storage.local.get(STORAGE_KEY);
          if (maybe && typeof maybe.then === 'function') {
            maybe.then(apply, function () { triage.renderAll(); resolve(); });
            return;
          }
        } catch (_) {}
        try {
          B.storage.local.get(STORAGE_KEY, apply);
        } catch (_) { triage.renderAll(); resolve(); }
      });
    },
    normCase: function (num) {
      var d = String(num).replace(/\D/g, '');
      if (d.length === 7 && /^[34]/.test(d)) d = '0' + d;
      if (d.length === 9 && /^0(03|04)/.test(d)) d = d.slice(1);
      return (d.length === 8 && /^0[34]/.test(d)) ? d : null;
    },
    extractCases: function (text) {
      var found = new Set(triage.s.caseNumbers);
      [/\b(0[34]\d{6})\b/g, /\b([34]\d{7})\b/g, /(?:Case|Voicemail|VM|ticket)[_\s#:-]*(0?[34]\d{5,7})/gi]
        .forEach(function (re) {
          var m;
          while ((m = re.exec(text))) {
            var n = triage.normCase(m[1]);
            if (n) found.add(n);
          }
        });
      triage.s.caseNumbers = Array.from(found).sort();
      var ids = new Set(triage.s.caseIds);
      (text.match(/\b500[A-Za-z0-9]{12,15}\b/g) || []).forEach(function (id) { ids.add(id); });
      triage.s.caseIds = Array.from(ids);
    },
    inList: function (vals) { return vals.map(function (v) { return "'" + v + "'"; }).join(','); },
    q1: function () {
      if (!triage.s.caseNumbers.length && !triage.s.caseIds.length) return '— extract cases first —';
      var where = triage.s.caseNumbers.length
        ? 'CaseNumber IN (' + triage.inList(triage.s.caseNumbers) + ')'
        : 'Id IN (' + triage.inList(triage.s.caseIds) + ')';
      return 'SELECT Id, CaseNumber, Subject, Description, Status, Priority, Origin, Type, Model_Number__c, Serial_Number__c, Equipment_Type__c, Reason, AccountId, Account.Name, Account.Phone, ContactId, Contact.Name, Contact.Email, Contact.Phone, Owner.Name, CreatedDate FROM Case WHERE ' + where + ' ORDER BY CaseNumber DESC';
    },
    q2a: function () {
      return triage.s.caseIds.length
        ? 'SELECT Id, ParentId, Subject, FromName, FromAddress, ToAddress, TextBody, HasAttachment, MessageDate, Incoming, Status FROM EmailMessage WHERE ParentId IN (' + triage.inList(triage.s.caseIds) + ') ORDER BY MessageDate DESC'
        : '— parse cases first —';
    },
    q2b: function () {
      return triage.s.caseIds.length
        ? 'SELECT Id, ParentId, Name, ContentType, BodyLength, Description, CreatedDate FROM Attachment WHERE ParentId IN (' + triage.inList(triage.s.caseIds) + ') ORDER BY CreatedDate DESC'
        : '— parse cases first —';
    },
    q3: function () {
      return triage.s.emailIds.length
        ? 'SELECT Id, ParentId, Name, ContentType, BodyLength, Description, CreatedDate FROM Attachment WHERE ParentId IN (' + triage.inList(triage.s.emailIds) + ') ORDER BY CreatedDate DESC'
        : '— parse emails first —';
    },
    parseWorkbench: async function (raw) {
      try {
        var r = await window.sendToBackground('SOQL_PARSE_RESULTS', { text: raw });
        if (r && r.ok !== false && (r.headers || (r.data && r.headers))) {
          return {
            headers: r.headers || (r.data && r.data.headers) || [],
            rows: r.rows || (r.data && r.data.rows) || [],
            objectName: r.objectName || (r.data && r.data.objectName) || 'Results'
          };
        }
      } catch (_) {}
      // Local fallback (TSV/CSV with Query Results)
      var text = String(raw || '').replace(/\r\n/g, '\n');
      var lines = text.split('\n');
      var qrIdx = lines.findIndex(function (l) { return /^\s*Query Results\s*$/i.test(l.trim()); });
      var retIdx = lines.findIndex(function (l) { return /^\s*Returned records\b/i.test(l.trim()); });
      var start = retIdx >= 0 ? retIdx + 1 : (qrIdx >= 0 ? qrIdx + 1 : 0);
      var content = lines.slice(start).filter(function (l) { return l !== ''; });
      if (!content.length) return { headers: [], rows: [], objectName: 'Results' };
      var delim = content[0].indexOf('\t') >= 0 ? '\t' : (/\s{2,}/.test(content[0]) ? /\s{2,}/ : ',');
      var headers = String(content[0]).split(delim).map(function (h) { return String(h).trim(); });
      var dropFirst = headers[0] === '' || /^#$/.test(headers[0]);
      if (dropFirst) headers = headers.slice(1);
      var rows = [];
      for (var i = 1; i < content.length; i++) {
        var t = content[i].trim();
        if (!t || /^\s*Requested in\b/i.test(t)) break;
        var parts = String(content[i]).split(delim);
        if (dropFirst || /^\d+$/.test(String(parts[0] || '').trim())) parts = parts.slice(1);
        while (parts.length < headers.length) parts.push('');
        rows.push(parts.slice(0, headers.length).map(function (v) { return String(v || ''); }));
      }
      return { headers: headers, rows: rows, objectName: 'Results' };
    },
    rowsToObjects: function (p) {
      return p.rows.map(function (r) {
        var o = {};
        p.headers.forEach(function (h, i) { o[h] = r[i] != null ? r[i] : ''; });
        return o;
      });
    },
    step1: function () {
      triage.extractCases($('tri1In').value);
      triage.renderAll();
      triage.save();
      record('triage:extract');
      if (!triage.s.caseNumbers.length && !triage.s.caseIds.length) {
        toast('No CE case numbers (03/04…) or Case IDs found', 'warn');
      }
    },
    step2: async function () {
      var p = await triage.parseWorkbench($('tri2In').value);
      if (!p.headers.length) return toast('No Query Results table detected — paste the full Workbench output', 'warn');
      var n = 0;
      var tv = function (v) { return String(v == null ? '' : v).trim(); };
      triage.rowsToObjects(p).forEach(function (row) {
        var id = tv(row.Id || row.id);
        if (!id || id.indexOf('500') !== 0) return;
        var num = triage.normCase(tv(row.CaseNumber)) || tv(row.CaseNumber) || id;
        if (triage.s.caseIds.indexOf(id) < 0) triage.s.caseIds.push(id);
        if (triage.normCase(num) && triage.s.caseNumbers.indexOf(num) < 0) triage.s.caseNumbers.push(num);
        triage.s.cases[num] = {
          id: id, number: num, subject: tv(row.Subject), status: tv(row.Status),
          model: tv(row.Model_Number__c), serial: tv(row.Serial_Number__c), equipType: tv(row.Equipment_Type__c),
          accountName: tv(row['Account.Name']), accountPhone: tv(row['Account.Phone']),
          contactName: tv(row['Contact.Name']), contactEmail: tv(row['Contact.Email']), contactPhone: tv(row['Contact.Phone']),
          description: tv(row.Description)
        };
        n++;
      });
      triage.ensureResults();
      triage.renderAll();
      triage.save();
      record('triage:cases');
      toast(n ? ('Parsed ' + n + ' cases') : 'No Case rows (500…) found', n ? undefined : 'warn');
    },
    step3a: function () {
      var t = $('tri3aIn').value;
      var ids = new Set(triage.s.emailIds);
      (t.match(/\b02s[A-Za-z0-9]{12,15}\b/g) || []).forEach(function (id) { ids.add(id); });
      triage.s.emailIds = Array.from(ids);
      triage.renderAll();
      triage.save();
      toast(triage.s.emailIds.length + ' email IDs collected');
    },
    step3b: async function () {
      var t = $('tri3bIn').value;
      var p = await triage.parseWorkbench(t);
      var seen = new Set(triage.s.atts.map(function (a) { return a.id; }));
      if (p.headers.length) {
        triage.rowsToObjects(p).forEach(function (row) {
          var id = row.Id || row.id;
          if (!id || !/^00P/i.test(id) || seen.has(id)) return;
          seen.add(id);
          triage.s.atts.push({
            id: id, name: row.Name || ('Attachment_' + id),
            type: row.ContentType || '', parent: row.ParentId || '', size: row.BodyLength || ''
          });
        });
      }
      (t.match(/\b00P[A-Za-z0-9]{12,15}\b/g) || []).forEach(function (id) {
        if (!seen.has(id)) {
          seen.add(id);
          triage.s.atts.push({ id: id, name: 'Attachment_' + id, type: '', parent: '', size: '' });
        }
      });
      triage.renderAll();
      triage.save();
      record('triage:atts');
    },
    attKind: function (a) {
      var n = (a.name || '').toLowerCase(), t = (a.type || '').toLowerCase();
      if (t.indexOf('audio') === 0 || /\.(mp3|wav|m4a|ogg|amr)$/.test(n)) return 'audio';
      if (t.indexOf('image') === 0 || /\.(png|jpe?g|gif|bmp|webp)$/.test(n)) return 'image';
      if (t.indexOf('pdf') >= 0 || n.endsWith('.pdf')) return 'pdf';
      return 'file';
    },
    dlUrl: function (a) {
      var host = ($('triInstance').value || '').trim() || 'carrierenterprise.lightning.force.com';
      return 'https://' + host + '/servlet/servlet.FileDownload?file=' + a.id;
    },
    caseForParent: function (pid) {
      for (var num in triage.s.cases) {
        if (triage.s.cases[num].id === pid) return num;
      }
      return '';
    },
    addAudioFiles: async function (files) {
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var u = await readFileAsDataUrl(f);
        var fromName = triage.normCase((f.name.match(/0?[34]\d{6,7}/) || [''])[0] || '');
        triage.s.audio.push({
          id: uid(), name: f.name, size: f.size, mime: f.type || 'audio/mpeg',
          data: dataUrlB64(u), caseNumber: fromName || '', driveUrl: '',
          transcript: '', status: 'ready', provider: ''
        });
      }
      triage.renderAudio();
      triage.renderMap();
      triage.save();
      toast(files.length + ' audio file(s) added');
    },
    driveSave: async function (a) {
      a.status = 'saving…';
      triage.renderAudio();
      try {
        var r = await window.sendToBackground('DRIVE_UPLOAD_BYTES', {
          name: (a.caseNumber ? a.caseNumber + '_' : '') + a.name,
          mime: a.mime,
          data: a.data,
          share: $('triShare').checked
        });
        if (r && (r.ok || r.success || r.url)) {
          a.driveUrl = r.url || (r.data && r.data.url) || '';
          a.status = 'saved';
          toast('Saved to Drive');
        } else {
          a.status = 'ready';
          toast((r && r.error) || 'Drive save failed — check Options → webhook/Drive', 'warn');
        }
      } catch (e) {
        a.status = 'ready';
        toast(e.message || String(e), 'warn');
      }
      triage.renderAudio();
      triage.save();
    },
    transcribe: async function (a) {
      var prov = $('triSttProv').value;
      if (prov === 'manual') {
        a.status = 'paste transcript below';
        triage.renderAudio();
        return;
      }
      if (!a.data) return toast('Audio bytes were not kept after reload — re-add the file', 'warn');
      a.status = 'transcribing…';
      triage.renderAudio();
      try {
        var r = await window.sendToBackground('DANMAN_TRANSCRIBE', {
          provider: prov, mime: a.mime, data: a.data, name: a.name,
          hint: a.caseNumber ? ('CE HVAC case ' + a.caseNumber) : ''
        });
        if (r && (r.ok || r.text)) {
          a.transcript = r.text || (r.data && r.data.text) || '';
          a.provider = r.provider || prov;
          a.status = 'transcribed';
          record('triage:stt');
        } else {
          a.status = 'ready';
          toast((r && r.error) || 'Transcribe failed', 'bad');
        }
      } catch (e) {
        a.status = 'ready';
        toast(e.message || String(e), 'bad');
      }
      triage.renderAudio();
      triage.save();
    },
    runAll: async function () {
      for (var i = 0; i < triage.s.audio.length; i++) {
        var a = triage.s.audio[i];
        if (!a.driveUrl && a.data) await triage.driveSave(a);
        if (!a.transcript) await triage.transcribe(a);
      }
      triage.ensureResults();
      triage.renderResults();
      triage.renderMap();
    },
    MODEL_RES: [/\b\d{2,3}[A-Z]{2,6}[A-Z0-9]?\d{2,4}[A-Z0-9]{0,6}\b/g, /\b[A-Z]{2,4}\d[A-Z]{1,4}\d{2,4}[A-Z0-9]{0,4}\b/g],
    SERIAL_RE: /\b[0-9OQDILZSB]{4}[A-Z0-9][0-9OQDILZSB]{5,6}\b/gi,
    sanitizeSerial: function (raw) {
      var up = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!up) return { raw: raw || '', clean: '', valid: false };
      var fix = function (c) { return ({ O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8' })[c] || c; };
      if (up.length >= 10 && up.length <= 11) {
        var head = Array.from(up.slice(0, 4)).map(fix).join('');
        var plant = up[4];
        var tail = Array.from(up.slice(5)).map(fix).join('');
        if (/\d/.test(plant)) {
          var inv = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 2: 'Z' }[plant];
          if (inv) plant = inv;
        }
        var clean = head + plant + tail;
        if (/^\d{4}[A-Z]\d{5,6}$/.test(clean)) return { raw: raw || '', clean: clean, valid: true };
      }
      return { raw: raw || '', clean: up, valid: /^\d{4}[A-Z]\d{5,6}$/.test(up) };
    },
    findModel: function (text) {
      var t = String(text).toUpperCase();
      var out = new Set();
      triage.MODEL_RES.forEach(function (re) {
        re.lastIndex = 0;
        var m;
        while ((m = re.exec(t))) {
          var v = m[0];
          if (v.length < 6 || v.length > 16) continue;
          if (/^\d+$/.test(v) || /^[A-Z]+$/.test(v)) continue;
          if (/^\d{4}[A-Z]\d{5,6}$/.test(v)) continue;
          out.add(v);
        }
      });
      return Array.from(out);
    },
    ensureResults: function () {
      var nums = new Set(Object.keys(triage.s.cases).concat(
        triage.s.audio.map(function (a) { return a.caseNumber; }).filter(Boolean)
      ));
      if (!nums.size && triage.s.audio.length) nums.add('(unassigned)');
      nums.forEach(function (num) {
        if (!triage.s.results[num]) {
          var c = triage.s.cases[num] || {};
          triage.s.results[num] = {
            caseNumber: num, caseId: c.id || '', status: c.status || '',
            contactName: c.contactName || '', phone: c.contactPhone || c.accountPhone || '',
            email: c.contactEmail || '', account: c.accountName || '', equipment: c.equipType || '',
            model: c.model || '', serialRaw: c.serial || '', serialClean: '', serialValid: false,
            invoice: '', pricing: '', summary: '', source: c.id ? 'salesforce' : '',
            audioUrl: '', provider: ''
          };
          if (c.serial) {
            var s = triage.sanitizeSerial(c.serial);
            triage.s.results[num].serialClean = s.clean;
            triage.s.results[num].serialValid = s.valid;
          }
        }
      });
    },
    parseTranscript: function (a) {
      var r = triage.s.results[a.caseNumber || '(unassigned)'];
      if (!r || !a.transcript) return;
      var t = a.transcript;
      var set = function (k, v, src) {
        v = String(v || '').trim();
        if (v && !String(r[k] || '').trim()) {
          r[k] = v;
          r.source = (r.source ? r.source + '+' : '') + src;
        }
      };
      set('phone', (t.match(/(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/) || [''])[0], 'stt');
      set('email', ((t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [''])[0]).replace(/\.+$/, ''), 'stt');
      var models = triage.findModel(t);
      if (models.length) set('model', models[0], 'stt');
      triage.SERIAL_RE.lastIndex = 0;
      var serials = (t.toUpperCase().match(triage.SERIAL_RE) || []).map(function (s) {
        return triage.sanitizeSerial(s);
      }).sort(function (x, y) { return (y.valid ? 1 : 0) - (x.valid ? 1 : 0); });
      if (serials.length && !r.serialRaw) {
        r.serialRaw = serials[0].raw;
        r.serialClean = serials[0].clean;
        r.serialValid = serials[0].valid;
        r.source = (r.source ? r.source + '+' : '') + 'stt';
      }
      set('invoice', (t.match(/\bINV[-#: ]?\s*(\d{4,10})\b/i) || ['', ''])[1], 'stt');
      set('pricing', (t.match(/\$\s?\d[\d,]*\.?\d{0,2}/) || [''])[0], 'stt');
      r.audioUrl = r.audioUrl || a.driveUrl;
      r.provider = r.provider || a.provider;
    },
    parseAll: function () {
      triage.ensureResults();
      triage.s.audio.forEach(function (a) { triage.parseTranscript(a); });
      triage.renderResults();
      triage.renderMap();
      triage.save();
      toast('Regex pass complete — review then AI-extract');
      record('triage:parse');
    },
    aiAll: async function () {
      triage.ensureResults();
      var cfg = await window.sendToBackground('CONFIG_LOAD');
      var provider = (cfg && cfg.ai_provider) || 'claude';
      for (var i = 0; i < triage.s.audio.length; i++) {
        var a = triage.s.audio[i];
        if (!a.transcript) continue;
        var r = triage.s.results[a.caseNumber || '(unassigned)'];
        if (!r) continue;
        var resp = await window.sendToBackground('DANMAN_CHAT', {
          provider: provider,
          system: 'Extract structured data from an HVAC support voicemail transcript. Return ONLY JSON (no fences): {"contact_name":"","callback_phone":"","email":"","equipment":"","model_number":"","serial_number":"","invoice":"","pricing":"","summary":"one sentence"} — empty string when absent.',
          messages: [{ role: 'user', content: [{ type: 'text', text: a.transcript }] }]
        });
        if (!resp || !(resp.ok || resp.text)) {
          toast((resp && resp.error) || 'AI extract failed', 'bad');
          continue;
        }
        try {
          var text = resp.text || (resp.data && resp.data.text) || '';
          var j = JSON.parse(text.replace(/^```json?|```$/gm, '').trim());
          var put = function (k, v) { if (v && !r[k]) r[k] = v; };
          put('contactName', j.contact_name);
          put('phone', j.callback_phone);
          put('email', j.email);
          put('equipment', j.equipment);
          put('model', j.model_number);
          put('invoice', j.invoice);
          put('pricing', j.pricing);
          if (j.serial_number && !r.serialRaw) {
            var s = triage.sanitizeSerial(j.serial_number);
            r.serialRaw = j.serial_number;
            r.serialClean = s.clean;
            r.serialValid = s.valid;
          }
          r.summary = r.summary || j.summary || '';
          r.source = (r.source ? r.source + '+' : '') + 'ai';
        } catch (e) {
          toast('AI returned unparseable JSON for ' + (a.caseNumber || a.name), 'warn');
        }
      }
      triage.renderResults();
      triage.save();
      record('triage:ai');
      toast('AI extraction done');
    },
    HEADERS: ['CaseNumber', 'CaseId', 'Status', 'ContactName', 'ContactPhone', 'ContactEmail', 'Account', 'Equipment', 'ModelNumber', 'SerialRaw', 'SerialSanitized', 'SerialValid', 'Invoice', 'Pricing', 'Summary', 'AudioDriveLink', 'STTProvider', 'Source'],
    exportRows: function () {
      return Object.keys(triage.s.results).map(function (k) {
        var r = triage.s.results[k];
        return [r.caseNumber, r.caseId, r.status, r.contactName, r.phone, r.email, r.account, r.equipment, r.model, r.serialRaw, r.serialClean, r.serialValid ? 'YES' : 'CHECK', r.invoice, r.pricing, r.summary, r.audioUrl, r.provider, r.source];
      });
    },
    exportSheet: async function () {
      var rows = triage.exportRows();
      if (!rows.length) return toast('Nothing to export yet', 'warn');
      $('triSheetOut').textContent = 'creating sheet…';
      try {
        var r = await window.sendToBackground('SHEETS_WRITE_TABLE', {
          headers: triage.HEADERS,
          rows: rows,
          title: 'DANMAN Triage ' + new Date().toISOString().slice(0, 10),
          share: $('triShare').checked
        });
        if (r && (r.ok || r.url || r.success)) {
          var url = r.url || (r.data && r.data.url) || '';
          $('triSheetOut').innerHTML = url
            ? ('✓ <a href="' + esc(url) + '" target="_blank" style="color:#38bdf8;">Open sheet</a>')
            : '✓ Sheet created';
          record('triage:export');
        } else {
          // Fallback: push via sheets webhook append
          var tsv = [triage.HEADERS.join('\t')].concat(triage.exportRows().map(function (row) {
            return row.join('\t');
          })).join('\n');
          var wh = await window.sendToBackground('SHEETS_WEBHOOK', {
            action: 'append_tsv',
            tsv: tsv,
            sheetName: 'Triage'
          });
          if (wh && (wh.ok || wh.success)) {
            $('triSheetOut').textContent = '✓ Appended via webhook';
            record('triage:export');
          } else {
            $('triSheetOut').textContent = '';
            toast((r && r.error) || (wh && wh.error) || 'Export failed — set Sheets ID in Options', 'warn');
          }
        }
      } catch (e) {
        $('triSheetOut').textContent = '';
        toast(e.message || String(e), 'warn');
      }
    },
    csv: function () {
      var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
      return [triage.HEADERS.map(q).join(',')].concat(
        triage.exportRows().map(function (r) { return r.map(q).join(','); })
      ).join('\n');
    },
    renderMap: function () {
      var s = triage.s;
      var steps = [
        ['Cases', s.caseNumbers.length || s.caseIds.length ? s.caseNumbers.length + ' #s' : '', s.caseNumbers.length || s.caseIds.length],
        ['Details', Object.keys(s.cases).length ? Object.keys(s.cases).length + ' parsed' : '', Object.keys(s.cases).length],
        ['Attachments', s.atts.length ? s.atts.length + ' files' : '', s.atts.length],
        ['Audio', s.audio.length ? s.audio.length + ' clips' : '', s.audio.length],
        ['Parsed', Object.keys(s.results).length ? Object.keys(s.results).length + ' rows' : '', Object.keys(s.results).length],
        ['Export', '', 0]
      ];
      $('triMap').innerHTML = steps.map(function (st, i) {
        var done = st[2];
        var ready = i === 0 || steps[i - 1][2];
        return '<span class="tri-step ' + (done ? 'done' : (ready ? 'ready' : '')) + '" data-step="' + (i + 1) + '"><span class="n">' + (i + 1) + '</span>' + st[0] + (st[1] ? ' · ' + st[1] : '') + '</span>';
      }).join('');
      container.querySelectorAll('#triMap .tri-step').forEach(function (el) {
        el.onclick = function () {
          var c = $('triCard' + el.getAttribute('data-step'));
          if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
      });
      $('triStat1').textContent = s.caseNumbers.length ? (s.caseNumbers.length + ' case numbers · ' + s.caseIds.length + ' IDs') : '';
      $('triStat2').textContent = Object.keys(s.cases).length ? (Object.keys(s.cases).length + ' cases parsed') : '';
      $('triStat3').textContent = s.atts.length ? (s.atts.length + ' attachments') : '';
      $('triStat4').textContent = s.audio.length ? (s.audio.length + ' audio · ' + s.audio.filter(function (a) { return a.transcript; }).length + ' transcribed') : '';
      $('triStat5').textContent = Object.keys(s.results).length ? (Object.keys(s.results).length + ' result rows') : '';
    },
    renderQueries: function () {
      $('triQ1').textContent = triage.q1();
      $('triQ2a').textContent = triage.q2a();
      $('triQ2b').textContent = triage.q2b();
      $('triQ3').textContent = triage.q3();
      $('tri1Chips').textContent = triage.s.caseNumbers.slice(0, 10).join(' · ') +
        (triage.s.caseNumbers.length > 10 ? ' +' + (triage.s.caseNumbers.length - 10) : '');
    },
    renderAtts: function () {
      var host = $('triAttList');
      var icons = { audio: '🎧', image: '🖼', pdf: '📕', file: '📄' };
      host.innerHTML = triage.s.atts.length ? '' : '<div class="text-xs text-muted">No attachments yet.</div>';
      triage.s.atts.slice(0, 200).forEach(function (a) {
        var kind = triage.attKind(a);
        var caseNum = triage.caseForParent(a.parent);
        var d = document.createElement('div');
        d.className = 'tri-att';
        d.innerHTML = icons[kind] + ' <b>' + esc(a.name) + '</b> <span class="text-muted">' + esc(a.type || '?') +
          (caseNum ? ' · case ' + caseNum : '') + '</span> <a href="' + esc(triage.dlUrl(a)) +
          '" target="_blank" style="color:#38bdf8;float:right">download</a>';
        host.appendChild(d);
      });
    },
    renderAudio: function () {
      var host = $('triAudioList');
      host.innerHTML = triage.s.audio.length ? '' : '<div class="text-xs text-muted">Drop or add audio files here.</div>';
      triage.s.audio.forEach(function (a) {
        var d = document.createElement('div');
        d.className = 'tri-audio card';
        d.style.padding = '8px';
        d.innerHTML =
          '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
            '<b>🎧 ' + esc(a.name) + '</b>' +
            '<span class="text-xs text-muted">' + Math.round((a.size || 0) / 1024) + ' KB · ' + esc(a.status) + '</span>' +
            '<input type="text" value="' + esc(a.caseNumber) + '" placeholder="case #" style="width:110px" data-k="case">' +
            (a.driveUrl
              ? '<a href="' + esc(a.driveUrl) + '" target="_blank" style="color:#86efac;">Drive ✓</a>'
              : '<button class="btn btn-sm btn-secondary" data-a="drive">Drive</button>') +
            '<button class="btn btn-sm btn-secondary" data-a="stt">Transcribe</button>' +
            '<button class="btn btn-sm btn-secondary" data-a="del">✕</button>' +
          '</div>' +
          '<textarea rows="3" data-k="tx" class="form-control" style="margin-top:6px;" placeholder="Transcript…">' + esc(a.transcript) + '</textarea>';
        d.querySelector('[data-k=case]').onchange = function (e) {
          a.caseNumber = triage.normCase(e.target.value) || e.target.value.trim();
          triage.save();
        };
        d.querySelector('[data-k=tx]').onchange = function (e) {
          a.transcript = e.target.value;
          triage.save();
        };
        var drv = d.querySelector('[data-a=drive]');
        if (drv) drv.onclick = function () { triage.driveSave(a); };
        d.querySelector('[data-a=stt]').onclick = function () { triage.transcribe(a); };
        d.querySelector('[data-a=del]').onclick = function () {
          triage.s.audio = triage.s.audio.filter(function (x) { return x.id !== a.id; });
          triage.renderAudio();
          triage.renderMap();
          triage.save();
        };
        host.appendChild(d);
      });
    },
    FIELD_COLS: [
      ['contactName', 'Contact'], ['phone', 'Phone'], ['email', 'Email'],
      ['equipment', 'Equipment'], ['model', 'Model'], ['serialRaw', 'Serial'],
      ['invoice', 'Invoice'], ['pricing', 'Pricing'], ['summary', 'Summary']
    ],
    renderResults: function () {
      var host = $('triResults');
      var keys = Object.keys(triage.s.results);
      if (!keys.length) {
        host.innerHTML = '<div class="text-xs text-muted">No result rows yet — parse case details or transcripts.</div>';
        return;
      }
      var html = '<table><tr><th>Case</th>' + triage.FIELD_COLS.map(function (c) {
        return '<th>' + c[1] + '</th>';
      }).join('') + '<th>Serial ✓</th><th>Audio</th></tr>';
      keys.forEach(function (k, ri) {
        var r = triage.s.results[k];
        html += '<tr><td><b>' + esc(r.caseNumber) + '</b><br><span class="text-muted">' + esc(r.status || '') + '</span></td>';
        triage.FIELD_COLS.forEach(function (col) {
          html += '<td><input data-ri="' + ri + '" data-k="' + col[0] + '" value="' + esc(r[col[0]] || '') + '"></td>';
        });
        html += '<td class="' + (r.serialValid ? 'serOk' : 'serBad') + '">' +
          (r.serialClean ? esc(r.serialClean) + (r.serialValid ? ' ✓' : ' ⚠') : '—') + '</td>';
        html += '<td>' + (r.audioUrl ? '<a href="' + esc(r.audioUrl) + '" target="_blank" style="color:#38bdf8;">🎧</a>' : '—') + '</td></tr>';
      });
      host.innerHTML = html + '</table>';
      host.querySelectorAll('input[data-ri]').forEach(function (inp) {
        inp.onchange = function () {
          var r = triage.s.results[keys[+inp.getAttribute('data-ri')]];
          r[inp.getAttribute('data-k')] = inp.value;
          if (inp.getAttribute('data-k') === 'serialRaw') {
            var s = triage.sanitizeSerial(inp.value);
            r.serialClean = s.clean;
            r.serialValid = s.valid;
            triage.renderResults();
          }
          triage.save();
        };
      });
    },
    renderAll: function () {
      triage.renderMap();
      triage.renderQueries();
      triage.renderAtts();
      triage.renderAudio();
      triage.renderResults();
    }
  };

  $('btnTri1').onclick = function () { triage.step1(); };
  $('btnTri2').onclick = function () { triage.step2(); };
  $('btnTri3a').onclick = function () { triage.step3a(); };
  $('btnTri3b').onclick = function () { triage.step3b(); };
  $('btnTriQ1Copy').onclick = function () { copyText(triage.q1()).then(function () { toast('Query copied'); }); };
  $('btnTriQ2aCopy').onclick = function () { copyText(triage.q2a()).then(function () { toast('Query copied'); }); };
  $('btnTriQ2bCopy').onclick = function () { copyText(triage.q2b()).then(function () { toast('Query copied'); }); };
  $('btnTriQ3Copy').onclick = function () { copyText(triage.q3()).then(function () { toast('Query copied'); }); };
  $('btnTriWb').onclick = function () { window.open('https://workbench.developerforce.com/query.php', '_blank'); };
  $('btnTriLinksCopy').onclick = function () {
    copyText(triage.s.atts.map(function (a) { return triage.dlUrl(a); }).join('\n')).then(function () {
      toast('Download links copied');
    });
  };
  $('btnTriAudioOpen').onclick = function () {
    var audio = triage.s.atts.filter(function (a) { return triage.attKind(a) === 'audio'; }).slice(0, 15);
    if (!audio.length) return toast('No audio attachments detected', 'warn');
    audio.forEach(function (a, i) {
      setTimeout(function () { window.open(triage.dlUrl(a), '_blank'); }, i * 350);
    });
    toast('Opening ' + audio.length + ' downloads — allow pop-ups', 'warn');
  };
  $('btnTriAudioAdd').onclick = function () { $('triAudioFile').click(); };
  $('triAudioFile').onchange = function (e) {
    var files = Array.from(e.target.files || []);
    if (files.length) triage.addAudioFiles(files);
    e.target.value = '';
  };
  $('btnTriRunAll').onclick = function () { triage.runAll(); };
  $('btnTriParseAll').onclick = function () { triage.parseAll(); };
  $('btnTriAiAll').onclick = function () { triage.aiAll(); };
  $('btnTriImgAdd').onclick = function () { $('triImgFile').click(); };
  $('triImgFile').onchange = async function (e) {
    var files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    triage.ensureResults();
    var out = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var u = await readFileAsDataUrl(f);
      try {
        var r = await window.sendToBackground('OCR_RUN', {
          images: [{ dataUrl: u, index: 0 }],
          provider: 'auto'
        });
        var text = (r && r.data && (r.data.text || r.data.fullText)) || (r && r.text) || '';
        var cases = [];
        [/\b(0[34]\d{6})\b/g, /\b([34]\d{7})\b/g].forEach(function (re) {
          var m;
          while ((m = re.exec(text))) {
            var n = triage.normCase(m[1]);
            if (n) cases.push(n);
          }
        });
        var inv = text.match(/\bINV[-#: ]?\s*\d{4,10}\b/gi) || [];
        var price = text.match(/\$\s?\d[\d,]*\.?\d{0,2}/g) || [];
        var target = cases.find(function (n) { return triage.s.results[n]; }) || cases[0];
        if (target) {
          if (!triage.s.results[target]) {
            triage.s.results[target] = {
              caseNumber: target, caseId: '', status: '', contactName: '', phone: '', email: '',
              account: '', equipment: '', model: '', serialRaw: '', serialClean: '', serialValid: false,
              invoice: '', pricing: '', summary: '', source: 'ocr', audioUrl: '', provider: ''
            };
          }
          var r2 = triage.s.results[target];
          if (inv.length && !r2.invoice) r2.invoice = inv[0].replace(/^INV[-#: ]?\s*/i, '');
          if (price.length && !r2.pricing) r2.pricing = price.join(' ');
          r2.source = (r2.source ? r2.source + '+' : '') + 'ocr';
        }
        out.push(f.name + ': ' + (cases.join(', ') || 'no case#') +
          (inv.length ? ' · ' + inv.join(', ') : '') +
          (price.length ? ' · ' + price.join(', ') : ''));
      } catch (err) {
        out.push(f.name + ': OCR failed');
      }
    }
    $('triImgOut').innerHTML = out.map(esc).join('<br>');
    triage.renderResults();
    triage.renderMap();
    triage.save();
    record('triage:imgocr');
  };
  $('btnTriSheet').onclick = function () { triage.exportSheet(); };
  $('btnTriCsv').onclick = function () {
    var blob = new Blob([triage.csv()], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'danman_triage_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('btnTriTsv').onclick = function () {
    copyText([triage.HEADERS.join('\t')].concat(triage.exportRows().map(function (r) {
      return r.join('\t');
    })).join('\n')).then(function () { toast('TSV copied'); });
  };
  $('btnTriReset').onclick = function () {
    if (!confirm('Reset the whole triage pipeline?')) return;
    triage.s = { caseNumbers: [], caseIds: [], cases: {}, emailIds: [], atts: [], audio: [], imgFinds: [], results: {} };
    triage.renderAll();
    triage.save();
    $('triImgOut').innerHTML = '';
    $('triSheetOut').textContent = '';
  };

  var card4 = $('triCard4');
  ['dragover', 'drop'].forEach(function (ev) {
    card4.addEventListener(ev, function (e) {
      e.preventDefault();
      if (ev === 'drop') {
        var fs = Array.from(e.dataTransfer.files || []);
        if (fs.length) triage.addAudioFiles(fs);
      }
    });
  });

  // Cross-tab triage state sync
  try {
    B.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes[STORAGE_KEY] || !changes[STORAGE_KEY].newValue) return;
      triage.s = Object.assign(triage.s, changes[STORAGE_KEY].newValue);
      triage.renderAll();
    });
  } catch (_) {}

  if (learn && learn.load) learn.load();
  triage.load();
})();
