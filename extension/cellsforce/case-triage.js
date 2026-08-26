/* case-triage.js — Voicemail / attachment SOQL pack (CaseTriageDriveLinkProcessor port) */
(function () {
  'use strict';

  var mounted = false;
  var extractedCases = [];
  var driveFileMap = {};
  var parsedAttachments = [];

  function $(id) { return document.getElementById(id); }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var queries = {};

  function mountPanel() {
    var root = $('t-triage');
    if (!root || mounted) return;
    mounted = true;

    root.innerHTML =
      '<div class="info-box teal">' +
      '&#9642; Paste a <strong>Google Drive file list</strong> or voicemail filenames. Extract case numbers, generate attachment/email SOQL packs, then parse Workbench results for download links.' +
      '</div>' +
      '<div class="spe-wrap">' +
      '  <div class="spe-input-col">' +
      '    <div class="cf-card at">' +
      '      <h2>&#128193; Drive / voicemail file list</h2>' +
      '      <textarea id="ctFileList" rows="10" placeholder="Paste filenames (one per line):&#10;Voicemail_03783088_Name_20260129.mp3&#10;Case_03783089_photo.jpg"></textarea>' +
      '      <div class="fg" style="margin-top:8px;"><label>Drive folder URL (optional — for your notes)</label>' +
      '        <input type="text" id="ctFolderUrl" placeholder="https://drive.google.com/drive/folders/..."/></div>' +
      '      <div class="fg"><label>Add case manually</label>' +
      '        <div style="display:flex;gap:6px;"><input type="text" id="ctManualCase" placeholder="3783088"/><button type="button" class="btn btn-blue btn-sm" id="ctAddCase">Add</button></div></div>' +
      '      <div class="btn-row">' +
      '        <button type="button" class="btn btn-teal" id="ctParseFiles">Extract cases from list</button>' +
      '        <button type="button" class="btn btn-ghost btn-sm" id="ctLoadSample">Sample data</button>' +
      '        <button type="button" class="btn btn-ghost btn-sm" id="ctClearInput">Clear</button>' +
      '      </div>' +
      '    </div>' +
      '    <div class="cf-card at">' +
      '      <h2>&#128202; Extracted cases <span class="cf-badge t" id="ctCaseCount">0</span></h2>' +
      '      <div id="ctCaseList" style="display:flex;flex-wrap:wrap;gap:4px;min-height:32px;"></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="spe-output-col">' +
      '    <div class="cf-card ap">' +
      '      <h2>&#128218; SOQL query pack</h2>' +
      '      <div class="btn-row" style="margin-bottom:8px;">' +
      '        <button type="button" class="btn btn-purple btn-sm ct-query-tab active" data-ctq="all">All queries</button>' +
      '        <button type="button" class="btn btn-ghost btn-sm ct-query-tab" data-ctq="case">Case data</button>' +
      '        <button type="button" class="btn btn-ghost btn-sm ct-query-tab" data-ctq="email">Emails</button>' +
      '        <button type="button" class="btn btn-ghost btn-sm ct-query-tab" data-ctq="attach">Attachments</button>' +
      '        <button type="button" class="btn btn-ghost btn-sm ct-query-tab" data-ctq="files">SF Files</button>' +
      '      </div>' +
      '      <textarea id="ctQueryOut" rows="14" readonly style="font-family:Consolas,monospace;font-size:10px;"></textarea>' +
      '      <div class="btn-row">' +
      '        <button type="button" class="btn btn-orange" id="ctGenQueries">Generate SOQL pack</button>' +
      '        <button type="button" class="btn btn-blue" id="ctCopyQuery">Copy query</button>' +
      '        <button type="button" class="btn btn-gold" id="ctOpenWb">Open Workbench</button>' +
      '      </div>' +
      '    </div>' +
      '    <div class="cf-card at">' +
      '      <h2>&#128206; Parse attachment results</h2>' +
      '      <textarea id="ctAttachResults" rows="6" placeholder="Paste Workbench Attachment or ContentDocumentLink results (CSV/TSV)..."></textarea>' +
      '      <div class="btn-row">' +
      '        <button type="button" class="btn btn-teal" id="ctParseAttach">Parse results</button>' +
      '        <button type="button" class="btn btn-ghost btn-sm" id="ctCopyLinks">Copy download URLs</button>' +
      '      </div>' +
      '      <div id="ctAttachList" style="margin-top:8px;max-height:140px;overflow-y:auto;font-size:10px;"></div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    $('ctParseFiles').addEventListener('click', parseFileList);
    $('ctLoadSample').addEventListener('click', loadSample);
    $('ctClearInput').addEventListener('click', clearInput);
    $('ctAddCase').addEventListener('click', addManualCase);
    $('ctGenQueries').addEventListener('click', generateAllQueries);
    $('ctCopyQuery').addEventListener('click', copyQuery);
    $('ctOpenWb').addEventListener('click', openTriageWorkbench);
    $('ctParseAttach').addEventListener('click', parseAttachmentResults);
    $('ctCopyLinks').addEventListener('click', copyDownloadLinks);

    root.querySelectorAll('.ct-query-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        root.querySelectorAll('.ct-query-tab').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        showQueryTab(btn.getAttribute('data-ctq'));
      });
    });

    queries = {};
  }

  var SAMPLE =
    'Voicemail_03783088_DustinElles_BryansMech_20260129.mp3\n' +
    'Case_03783089_service_report.pdf\n' +
    'VM03783090_recording.wav';

  function normalizeCase(raw) {
    var caseNum = String(raw || '').trim().replace(/^0+/, '');
    if (caseNum.length < 6 || caseNum.length > 8) return null;
    return caseNum.padStart(8, '0');
  }

  function extractCasesFromLine(line) {
    var found = [];
    var patterns = [
      /\b(0\d{7})\b/g,
      /\b(\d{8})\b/g,
      /Case[_\s-]?(\d{6,8})/gi,
      /VM[_\s-]?(\d{6,8})/gi,
      /Voicemail[_\s-]?(\d{6,8})/gi,
    ];
    patterns.forEach(function (pattern) {
      var m;
      var re = new RegExp(pattern.source, pattern.flags);
      while ((m = re.exec(line)) !== null) {
        var n = normalizeCase(m[1] || m[0]);
        if (n) found.push(n);
      }
    });
    return found;
  }

  function parseFileList() {
    var input = ($('ctFileList') && $('ctFileList').value) || '';
    var lines = input.split('\n').filter(function (l) { return l.trim(); });
    var foundCases = {};
    driveFileMap = {};

    lines.forEach(function (line) {
      extractCasesFromLine(line).forEach(function (c) {
        foundCases[c] = true;
        if (!driveFileMap[c]) driveFileMap[c] = [];
        driveFileMap[c].push(line.trim());
      });
    });

    if (typeof SoqlEngine !== 'undefined' && SoqlEngine.extractCaseNumbers) {
      SoqlEngine.extractCaseNumbers(input).forEach(function (c) {
        foundCases[c] = true;
      });
    }

    extractedCases = Object.keys(foundCases).sort();
    renderCaseList();
    window.setStatus('Extracted ' + extractedCases.length + ' case(s) from file list');
  }

  function renderCaseList() {
    var list = $('ctCaseList');
    var count = $('ctCaseCount');
    if (count) count.textContent = String(extractedCases.length);
    if (!list) return;
    if (!extractedCases.length) {
      list.innerHTML = '<span style="color:var(--muted);font-size:10px;">No cases yet</span>';
      return;
    }
    list.innerHTML = extractedCases.map(function (c, i) {
      var files = (driveFileMap[c] || []).length;
      return '<span class="case-chip selected" data-ct-case="' + i + '" title="' + escHtml((driveFileMap[c] || []).join('\n')) + '">' +
        escHtml(c) + (files ? ' (' + files + ')' : '') +
        ' <button type="button" class="btn btn-ghost btn-sm" data-ct-remove="' + i + '" style="padding:0 4px;line-height:1;">×</button></span>';
    }).join('');

    list.querySelectorAll('[data-ct-remove]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-ct-remove'), 10);
        extractedCases.splice(idx, 1);
        renderCaseList();
      });
    });
  }

  function addManualCase() {
    var input = $('ctManualCase');
    if (!input) return;
    var n = normalizeCase(input.value);
    if (!n) return;
    if (extractedCases.indexOf(n) === -1) {
      extractedCases.push(n);
      extractedCases.sort();
      renderCaseList();
    }
    input.value = '';
  }

  function loadSample() {
    $('ctFileList').value = SAMPLE;
    parseFileList();
  }

  function clearInput() {
    $('ctFileList').value = '';
    extractedCases = [];
    driveFileMap = {};
    queries = {};
    parsedAttachments = [];
    renderCaseList();
    $('ctQueryOut').value = '';
    $('ctAttachList').innerHTML = '';
    window.setStatus('Cleared triage input');
  }

  function caseInList() {
    return extractedCases.map(function (c) { return "'" + c + "'"; }).join(', ');
  }

  function orgBaseUrl() {
    if (typeof v === 'function') {
      var u = v('cfg_orgUrl');
      if (u) return u.replace(/\/$/, '');
    }
    return 'https://yourorg.my.salesforce.com';
  }

  function generateAllQueries() {
    if (!extractedCases.length) {
      window.setStatus('Extract case numbers first');
      return;
    }
    var caseNumberList = caseInList();

    queries.case =
      'SELECT Id, CaseNumber, Subject, Description, Status, Priority, Origin, Type,\n' +
      '       Model_Number__c, Serial_Number__c, Equipment__c_Type__c, Brand__c,\n' +
      '       AccountId, ContactId, OwnerId, CreatedDate, LastModifiedDate\n' +
      'FROM Case\n' +
      'WHERE CaseNumber IN (' + caseNumberList + ')\n' +
      'ORDER BY CaseNumber';

    queries.email =
      'SELECT Id, ParentId, Subject, FromName, FromAddress, ToAddress, TextBody,\n' +
      '       HasAttachment, Status, MessageDate, Incoming, CreatedDate\n' +
      'FROM EmailMessage\n' +
      'WHERE ParentId IN (SELECT Id FROM Case WHERE CaseNumber IN (' + caseNumberList + '))\n' +
      'ORDER BY ParentId, MessageDate DESC';

    queries.attach =
      'SELECT Id, ParentId, Name, ContentType, BodyLength, Description, CreatedDate, CreatedById\n' +
      'FROM Attachment\n' +
      'WHERE ParentId IN (\n' +
      '  SELECT Id FROM EmailMessage WHERE ParentId IN (\n' +
      '    SELECT Id FROM Case WHERE CaseNumber IN (' + caseNumberList + ')\n' +
      '  )\n' +
      ')\n' +
      'ORDER BY CreatedDate DESC';

    queries.files =
      'SELECT Id, ContentDocumentId, LinkedEntityId, ShareType, Visibility,\n' +
      '       ContentDocument.Title, ContentDocument.FileType, ContentDocument.ContentSize,\n' +
      '       ContentDocument.FileExtension, ContentDocument.LatestPublishedVersionId,\n' +
      '       ContentDocument.CreatedDate\n' +
      'FROM ContentDocumentLink\n' +
      'WHERE LinkedEntityId IN (SELECT Id FROM Case WHERE CaseNumber IN (' + caseNumberList + '))\n' +
      'ORDER BY ContentDocument.CreatedDate DESC';

    var ts = new Date().toISOString();
    queries.all =
      '-- CE Case Triage SOQL Pack — ' + ts + '\n' +
      '-- Cases: ' + extractedCases.join(', ') + '\n\n' +
      '-- QUERY 1: CASE DATA\n' + queries.case + '\n\n' +
      '-- QUERY 2: EMAIL MESSAGES\n' + queries.email + '\n\n' +
      '-- QUERY 3: LEGACY ATTACHMENTS (on emails)\n' + queries.attach + '\n\n' +
      '-- QUERY 4: SALESFORCE FILES\n' + queries.files + '\n';

    showQueryTab('all');
    window.setStatus('Generated SOQL pack for ' + extractedCases.length + ' cases');
  }

  function showQueryTab(which) {
    var out = $('ctQueryOut');
    if (!out) return;
    out.value = queries[which] || queries.all || '-- Click Generate SOQL pack --';
  }

  function copyQuery() {
    var text = ($('ctQueryOut') && $('ctQueryOut').value) || '';
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { window.setStatus('Query copied'); });
    } else if (typeof fbCopy === 'function') {
      fbCopy(text);
    }
  }

  function openTriageWorkbench() {
    copyQuery();
    var wb = typeof v === 'function' ? v('cfg_wbUrl') : '';
    if (wb) window.open(wb, '_blank');
    else window.setStatus('Set Workbench URL in Settings');
  }

  function parseDelimited(text) {
    var lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    var delim = lines[0].indexOf('\t') >= 0 ? '\t' : (lines[0].indexOf(',') >= 0 ? ',' : '\t');
    var headers = lines[0].split(delim).map(function (h) { return h.trim().replace(/^"|"$/g, ''); });
    return lines.slice(1).map(function (line) {
      var cells = line.split(delim).map(function (c) { return c.trim().replace(/^"|"$/g, ''); });
      var row = {};
      headers.forEach(function (h, i) { row[h] = cells[i] != null ? cells[i] : ''; });
      return row;
    });
  }

  function parseAttachmentResults() {
    var input = ($('ctAttachResults') && $('ctAttachResults').value) || '';
    if (!input.trim()) {
      window.setStatus('Paste Workbench results first');
      return;
    }
    parsedAttachments = [];
    try {
      var data = JSON.parse(input);
      if (Array.isArray(data)) {
        parsedAttachments = data.map(mapAttachmentRow);
      }
    } catch (e) {
      parsedAttachments = parseDelimited(input).map(mapAttachmentRow);
    }
    renderAttachments();
    window.setStatus('Parsed ' + parsedAttachments.length + ' attachment row(s)');
  }

  function mapAttachmentRow(row) {
    var caseNum = row.CaseNumber || row.Case__c || '';
    if (!caseNum && row.Name) {
      extractCasesFromLine(row.Name).forEach(function (c) { caseNum = c; });
    }
    return {
      caseNumber: caseNum || 'Unknown',
      id: row.Id || row.ContentDocumentId || '',
      name: row.Name || row.Title || row.ContentDocument && row.ContentDocument.Title || 'file',
      type: row.ContentType || row.FileType || '',
      size: parseInt(row.BodyLength || row.ContentSize, 10) || 0,
      date: row.CreatedDate || '',
    };
  }

  function attachmentDownloadUrl(id) {
    if (!id) return '';
    if (id.length === 18 && id.indexOf('069') === 0) {
      return orgBaseUrl() + '/sfc/servlet.shepherd/document/download/' + id;
    }
    return orgBaseUrl() + '/servlet/servlet.FileDownload?file=' + id;
  }

  function renderAttachments() {
    var box = $('ctAttachList');
    if (!box) return;
    if (!parsedAttachments.length) {
      box.innerHTML = '<div style="color:var(--muted);padding:8px;">No attachments parsed</div>';
      return;
    }
    box.innerHTML = parsedAttachments.map(function (att, i) {
      var url = attachmentDownloadUrl(att.id);
      return '<div style="padding:4px 0;border-bottom:1px solid var(--border);">' +
        '<strong>' + escHtml(att.name) + '</strong><br/>' +
        '<span style="color:var(--muted);">Case ' + escHtml(att.caseNumber) + ' · ' + escHtml(att.type) + '</span><br/>' +
        (url ? '<a href="' + escHtml(url) + '" target="_blank" rel="noopener" style="color:#67e8f9;font-size:9px;">' + escHtml(url) + '</a>' : '') +
        '</div>';
    }).join('');
  }

  function copyDownloadLinks() {
    if (!parsedAttachments.length) {
      window.setStatus('Parse attachment results first');
      return;
    }
    var lines = parsedAttachments.map(function (att) {
      return [att.caseNumber, att.name, attachmentDownloadUrl(att.id)].join('\t');
    }).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lines).then(function () { window.setStatus('Download links copied'); });
    } else if (typeof fbCopy === 'function') {
      fbCopy(lines);
    }
  }

  function refresh() {
    mountPanel();
  }

  window.CaseTriage = {
    mount: mountPanel,
    refresh: refresh,
    getCases: function () { return extractedCases.slice(); },
  };
})();
