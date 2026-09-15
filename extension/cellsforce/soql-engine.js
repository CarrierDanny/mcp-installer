// soql-engine.js — CellsForce SOQL builder (ported from GetPower DANMAN v6.9)
(function (global) {
  'use strict';

  const CATALOG_URL = 'data/soql-catalog.json';
  const STORAGE_TEMPLATES = 'cf_soql_hot_slots';
  const MAX_CASES = 200;
  const rt = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);

  let _catalog = null;
  let _catalogPromise = null;

  function getCatalogUrl() {
    try {
      if (rt && rt.runtime && rt.runtime.getURL) return rt.runtime.getURL(CATALOG_URL);
    } catch (_) {}
    return CATALOG_URL;
  }

  async function loadCatalog(force) {
    if (_catalog && !force) return _catalog;
    if (_catalogPromise && !force) return _catalogPromise;
    _catalogPromise = fetch(getCatalogUrl())
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load SOQL catalog: ' + r.status);
        return r.json();
      })
      .then((data) => {
        _catalog = data;
        return data;
      });
    return _catalogPromise;
  }

  function normalizeObjectName(name) {
    if (!name) return 'Case';
    const trimmed = String(name).trim();
    const catalog = _catalog;
    if (catalog && catalog.objectAliases && catalog.objectAliases[trimmed]) {
      return catalog.objectAliases[trimmed];
    }
    if (trimmed === 'Equipement__c' || trimmed === 'Equipment') return 'Equipment__c';
    return trimmed;
  }

  /** Extract CellsForce-style 8-digit case numbers from pasted text */
  function extractCaseNumbers(text) {
    if (!text || typeof text !== 'string') return [];
    const found = new Set();

    const re8 = /\b(0\d{7}|\d{8})\b/g;
    let m;
    while ((m = re8.exec(text)) !== null) {
      const n = m[1];
      if (n.length === 8) found.add(n);
    }

    const reGlue = /(?:New|Re-opened|Reopened|Open|Closed|Pending)(0\d{7})/gi;
    while ((m = reGlue.exec(text)) !== null) found.add(m[1]);

    const reCaseWord = /Case\s*#?\s*:?\s*(0\d{7}|\d{8})/gi;
    while ((m = reCaseWord.exec(text)) !== null) found.add(m[1]);

    return [...found].sort().slice(0, MAX_CASES);
  }

  function formatCaseInList(caseNumbers) {
    return caseNumbers.map((c) => "'" + String(c).replace(/'/g, "\\'") + "'").join(',');
  }

  function replaceCasePlaceholders(soql, caseNumbers) {
    let q = soql;
    const inList = formatCaseInList(caseNumbers.length ? caseNumbers : ['00000000']);
    q = q.replace(/\(\s*'\{\{\{CaseNumber\}\}\}'\s*,\s*'\{\{\{CaseNumber\}\}\}'\s*\)/gi, '(' + inList + ')');
    q = q.replace(/'\{\{\{CaseNumber\}\}\}'/gi, inList);
    q = q.replace(/Equipement__c/gi, 'Equipment__c');
    return q;
  }

  function fieldsFromSoql(soql) {
    const m = soql.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+/i);
    if (!m) return [];
    return m[1]
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f && !/\(/.test(f));
  }

  function objectFromSoql(soql) {
    const m = soql.match(/\sFROM\s+([A-Za-z0-9_]+)/i);
    return m ? normalizeObjectName(m[1]) : 'Case';
  }

  function validateFields(objectApi, fields) {
    const obj = normalizeObjectName(objectApi);
    const meta = _catalog && _catalog.objects && _catalog.objects[obj];
    const allowed = meta && meta.fields ? new Set(meta.fields) : null;
    const valid = [];
    const invalid = [];
    for (const f of fields) {
      const field = f.trim();
      if (!field) continue;
      if (!allowed || allowed.has(field)) valid.push(field);
      else invalid.push(field);
    }
    return { valid, invalid, objectApi: obj };
  }

  function buildSelect(objectApi, fields) {
    const { valid, invalid } = validateFields(objectApi, fields);
    const use = valid.length ? valid : ['Id', 'CaseNumber'];
    return {
      soqlFragment: 'SELECT ' + use.join(', '),
      fields: use,
      invalid,
    };
  }

  function buildSoql(options) {
    const {
      templateId,
      objectApi,
      fields,
      caseNumbers,
      rawSoql,
    } = options || {};

    let soql = rawSoql || '';
    let obj = normalizeObjectName(objectApi || 'Case');

    if (templateId && _catalog && _catalog.templates) {
      const tpl = _catalog.templates.find((t) => t.id === templateId);
      if (tpl) {
        soql = tpl.soql;
        obj = objectFromSoql(soql);
      }
    }

    if (!soql && fields && fields.length) {
      const meta = _catalog && _catalog.objects && _catalog.objects[obj];
      const where = (meta && meta.wherePattern) || 'CaseNumber IN ({cases})';
      const { valid, invalid } = validateFields(obj, fields);
      const inCases = formatCaseInList(caseNumbers && caseNumbers.length ? caseNumbers : ['00000000']);
      const whereClause = where.replace(/\{cases\}/g, inCases);
      soql = 'SELECT ' + (valid.length ? valid.join(', ') : 'Id') + ' FROM ' + obj + ' WHERE ' + whereClause;
      return {
        ok: true,
        soql: replaceCasePlaceholders(soql, caseNumbers || []),
        objectApi: obj,
        fields: valid,
        invalid,
        caseNumbers: caseNumbers || [],
      };
    }

    if (soql && fields && fields.length) {
      const { valid, invalid } = validateFields(obj, fields);
      const built = buildSelect(obj, valid);
      const fromRest = soql.replace(/^SELECT\s+[\s\S]+?\s+FROM\s+/i, 'FROM ');
      soql = built.soqlFragment + ' ' + fromRest;
      return finalize(soql, caseNumbers, obj, valid, invalid);
    }

    if (!soql) {
      return { ok: false, error: 'No template or fields provided' };
    }

    return finalize(replaceCasePlaceholders(soql, caseNumbers || []), caseNumbers, obj);
  }

  /** Rebuild SELECT list using only catalog-valid fields (prevents Workbench errors) */
  function sanitizeSoql(soql) {
    const obj = objectFromSoql(soql);
    const parsed = fieldsFromSoql(soql);
    const check = validateFields(obj, parsed);
    const useFields = check.valid.length ? check.valid : ['Id'];
    const selectPart = 'SELECT ' + useFields.join(', ');
    const rest = soql.replace(/^SELECT\s+[\s\S]+?\s+FROM\s+/i, 'FROM ');
    return {
      soql: selectPart + ' ' + rest,
      objectApi: obj,
      fields: useFields,
      invalid: check.invalid,
    };
  }

  function finalize(soql, caseNumbers, obj, fields, invalid) {
    soql = replaceCasePlaceholders(soql, caseNumbers || []);
    soql = soql.replace(/Equipement__c/gi, 'Equipment__c');
    const sanitized = sanitizeSoql(soql);
    return {
      ok: true,
      soql: sanitized.soql,
      objectApi: obj || sanitized.objectApi,
      fields: sanitized.fields,
      invalid: sanitized.invalid,
      caseNumbers: caseNumbers || [],
    };
  }

  async function getHotSlots() {
    if (!rt || !rt.storage || !rt.storage.local) return defaultSlots();
    return new Promise((resolve) => {
      rt.storage.local.get([STORAGE_TEMPLATES], (r) => {
        const slots = (r && r[STORAGE_TEMPLATES]) || defaultSlots();
        resolve(normalizeSlots(slots));
      });
    });
  }

  function defaultSlots() {
    return [0, 1, 2, 3, 4].map((i) => ({
      slot: i + 1,
      name: 'Slot ' + (i + 1),
      hotkey: 'Alt+Shift+' + (i + 1),
      templateId: i === 0 ? 'case-parse-query' : '',
      objectApi: 'Case',
      fields: [],
    }));
  }

  function normalizeSlots(slots) {
    const base = defaultSlots();
    if (!Array.isArray(slots)) return base;
    return base.map((def, idx) => {
      const s = slots.find((x) => x.slot === def.slot) || slots[idx] || {};
      return {
        slot: def.slot,
        name: s.name || def.name,
        hotkey: s.hotkey || def.hotkey,
        templateId: s.templateId || def.templateId,
        objectApi: normalizeObjectName(s.objectApi || def.objectApi),
        fields: Array.isArray(s.fields) ? s.fields : [],
      };
    });
  }

  async function saveHotSlot(slotIndex, data) {
    const slots = await getHotSlots();
    const idx = Math.max(0, Math.min(4, (slotIndex || 1) - 1));
    slots[idx] = { ...slots[idx], ...data, slot: idx + 1 };
    if (!rt || !rt.storage || !rt.storage.local) return { ok: true, slots };
    return new Promise((resolve) => {
      rt.storage.local.set({ [STORAGE_TEMPLATES]: slots }, () => resolve({ ok: true, slots }));
    });
  }

  function parseWorkbenchResults(text) {
    if (typeof WorkbenchParser !== 'undefined' && WorkbenchParser.parseWorkbenchTextToTable) {
      const parsed = WorkbenchParser.parseWorkbenchTextToTable(text);
      return {
        headers: parsed.headers || [],
        rows: parsed.rowObjects || [],
        rowArrays: parsed.rows || [],
        objectName: parsed.objectName,
        soql: parsed.soql,
        sourceLine: parsed.sourceLine,
      };
    }
    if (!text || !text.trim()) return { headers: [], rows: [] };
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return { headers: [], rows: [] };
    const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : '\t';
    const headers = lines[0].split(delim).map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, i) => {
        row[h] = cells[i] != null ? cells[i] : '';
      });
      return row;
    });
    return { headers, rows };
  }

  async function importWorkbenchToSheets(rawText) {
    if (!rawText || !String(rawText).trim()) {
      return { ok: false, error: 'Paste Workbench output first.' };
    }
    const preview = parseWorkbenchResults(rawText);
    if (!preview.headers || !preview.headers.length) {
      return {
        ok: false,
        error: 'No query result table detected. Paste the full Workbench output including "Query Results".',
        preview,
      };
    }
    if (typeof handleDanmanGasProxy !== 'function') {
      return {
        ok: false,
        error: 'Sheets bridge not loaded. Configure webhook in Settings → Integrations.',
        preview,
      };
    }
    try {
      const config = typeof ConfigManager !== 'undefined' && ConfigManager.load
        ? await ConfigManager.load()
        : {};
      const proxy = await handleDanmanGasProxy({
        method: 'importWorkbenchResultsToNewSheet',
        args: [{
          rawText: String(rawText),
          spreadsheetId: (config.sheets && config.sheets.spreadsheet_id) || '',
          fast: true,
        }],
      });
      const res = proxy && proxy.data !== undefined ? proxy.data : proxy;
      if (res && res.success) {
        const sheetUrl = res.sheetUrl ||
          (res.spreadsheetId
            ? 'https://docs.google.com/spreadsheets/d/' + res.spreadsheetId + '/edit' +
              (res.gid != null ? '#gid=' + res.gid : '')
            : null);
        if (sheetUrl && typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
          try {
            await chrome.tabs.create({ url: sheetUrl, active: true });
          } catch (_) {}
        }
        return {
          ok: true,
          ...res,
          sheetUrl,
          preview,
          importerVersion: res.importerVersion || null
        };
      }
      if (res && res.error && /210,140,140/.test(String(res.error))) {
        return {
          ok: false,
          error: 'Apps Script still running old Workbench importer. Run push.bat from CellsForceNew, then Deploy → New version of the Web App.',
          preview,
        };
      }
      return {
        ok: false,
        error: (res && res.error) || 'Import failed. Add importWorkbenchResultsToNewSheet to your Apps Script webhook (see gas/workbench-importer.gs).',
        preview,
      };
    } catch (e) {
      return { ok: false, error: e.message || String(e), preview };
    }
  }

  async function handleSoqlMessage(type, payload) {
    await loadCatalog();
    switch (type) {
      case 'SOQL_GET_CATALOG':
        return { ok: true, catalog: _catalog };
      case 'SOQL_EXTRACT_CASES':
        return { ok: true, caseNumbers: extractCaseNumbers(payload && payload.text) };
      case 'SOQL_BUILD':
        return buildSoql({
          templateId: payload.templateId,
          objectApi: payload.objectApi,
          fields: payload.fields,
          caseNumbers: payload.caseNumbers || extractCaseNumbers(payload.text),
          rawSoql: payload.rawSoql,
        });
      case 'SOQL_VALIDATE':
        return validateFields(payload.objectApi, payload.fields || []);
      case 'SOQL_GET_SLOTS':
        return { ok: true, slots: await getHotSlots() };
      case 'SOQL_SAVE_SLOT':
        return saveHotSlot(payload.slot, payload);
      case 'SOQL_PARSE_RESULTS':
        return { ok: true, ...parseWorkbenchResults(payload && payload.text) };
      case 'SOQL_PREVIEW_WORKBENCH': {
        const preview = parseWorkbenchResults(payload && payload.text);
        return {
          ok: !!(preview.headers && preview.headers.length),
          ...preview,
          error: preview.headers && preview.headers.length
            ? undefined
            : 'No query result table detected. Paste full Workbench output including "Query Results".',
        };
      }
      case 'SOQL_IMPORT_WORKBENCH':
        return importWorkbenchToSheets(payload && payload.text);
      default:
        return { error: 'Unknown SOQL message: ' + type };
    }
  }

  global.SoqlEngine = {
    loadCatalog,
    extractCaseNumbers,
    buildSoql,
    validateFields,
    replaceCasePlaceholders,
    normalizeObjectName,
    getHotSlots,
    saveHotSlot,
    parseWorkbenchResults,
    importWorkbenchToSheets,
    handleSoqlMessage,
  };
})(typeof self !== 'undefined' ? self : this);
