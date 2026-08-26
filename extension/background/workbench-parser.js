// background/workbench-parser.js — Parse full Salesforce Workbench export text
(function (global) {
  'use strict';

  function detectDelimiter(line) {
    if (line.indexOf('\t') >= 0) return '\t';
    if (/\s{2,}/.test(line)) return /\s{2,}/;
    if (line.indexOf(',') >= 0) return ',';
    return '\t';
  }

  function splitLine(line, delimiter) {
    if (delimiter instanceof RegExp) return String(line).split(delimiter);
    return String(line).split(delimiter);
  }

  function normalizeHeaders(headers) {
    const seen = {};
    return headers.map((h, idx) => {
      let key = String(h || '').trim();
      if (!key) key = 'Column_' + (idx + 1);
      if (seen[key] == null) {
        seen[key] = 0;
        return key;
      }
      seen[key] += 1;
      return key + '_' + seen[key];
    });
  }

  function detectWorkbenchObject(soql, headers) {
    const m = String(soql || '').match(/\bFROM\s+([A-Za-z0-9_]+)/i);
    if (m && m[1]) return m[1].replace(/Equipement__c/i, 'Equipment__c');

    const hs = (headers || []).map((h) => String(h || ''));
    if (hs.indexOf('ParentId') >= 0 && hs.indexOf('FromAddress') >= 0) return 'EmailMessage';
    if (hs.indexOf('BodyLength') >= 0 && hs.indexOf('ContentType') >= 0) return 'Attachment';
    if (hs.indexOf('CaseNumber') >= 0) return 'Case';
    return 'Results';
  }

  function reorderColumnsForObject(headers, rows, objectName) {
    const preferredByObject = {
      Case: [
        'Id', 'CaseNumber', 'Subject', 'Description', 'Status', 'Priority', 'Origin', 'Type',
        'Reason', 'AccountId', 'Account.Name', 'ContactId', 'Contact.Name',
        'OwnerId', 'Owner.Name', 'CreatedDate', 'ClosedDate', 'IsClosed',
      ],
      EmailMessage: [
        'Id', 'ParentId', 'Subject', 'FromName', 'FromAddress', 'ToAddress', 'CcAddress',
        'HasAttachment', 'MessageDate', 'Incoming', 'Status', 'TextBody',
      ],
      Attachment: [
        'Id', 'ParentId', 'Name', 'ContentType', 'BodyLength', 'Description', 'CreatedDate',
      ],
      Equipment__c: [
        'Id', 'Name', 'Case__c', 'Serial_Number__c', 'Product_Line__c', 'Type__c',
      ],
    };

    const preferred = preferredByObject[objectName] || [];
    const existing = headers.slice();
    const orderedHeaders = [];
    preferred.forEach((h) => {
      if (existing.indexOf(h) >= 0 && orderedHeaders.indexOf(h) < 0) orderedHeaders.push(h);
    });
    existing.forEach((h) => {
      if (orderedHeaders.indexOf(h) < 0) orderedHeaders.push(h);
    });

    const indexMap = orderedHeaders.map((h) => existing.indexOf(h));
    const orderedRows = rows.map((r) => indexMap.map((i) => (i >= 0 ? r[i] : '')));
    return { headers: orderedHeaders, rows: orderedRows };
  }

  function rowsToObjects(headers, rows) {
    return rows.map((r) => {
      const o = {};
      headers.forEach((h, i) => {
        o[h] = r[i] != null ? r[i] : '';
      });
      return o;
    });
  }

  /**
   * Parse full Workbench output (SOQL block + Query Results table).
   * @returns {{headers:string[],rows:string[][],rowObjects:Object[],sourceLine:string,soql:string,objectName:string}}
   */
  function parseWorkbenchTextToTable(rawText) {
    const text = String(rawText || '').replace(/\r\n/g, '\n');
    const lines = text.split('\n');

    let sourceLine = '';
    let soql = '';

    const sourceIdx = lines.findIndex((l) => /^SOQL Query\b/i.test(l.trim()));
    if (sourceIdx >= 0) sourceLine = lines[sourceIdx].trim();

    const selectIdx = lines.findIndex((l) => /^\s*SELECT\b/i.test(l));
    const queryResultsIdx = lines.findIndex((l) => /^\s*Query Results\s*$/i.test(l.trim()));
    if (selectIdx >= 0) {
      const soqlEnd = queryResultsIdx > selectIdx ? queryResultsIdx : Math.min(lines.length, selectIdx + 120);
      soql = lines.slice(selectIdx, soqlEnd).join('\n').trim();
    }

    const returnedIdx = lines.findIndex((l) => /^\s*Returned records\b/i.test(l.trim()));
    const startSearch = returnedIdx >= 0 ? returnedIdx + 1 : (queryResultsIdx >= 0 ? queryResultsIdx + 1 : 0);
    const contentLines = lines.slice(startSearch).filter((l) => l !== '');

    if (contentLines.length === 0) {
      return {
        headers: [],
        rows: [],
        rowObjects: [],
        sourceLine,
        soql,
        objectName: detectWorkbenchObject(soql, []),
      };
    }

    const headerLine = contentLines[0];
    const delimiter = detectDelimiter(headerLine);
    let headers = splitLine(headerLine, delimiter).map((h) => String(h).trim());

    let dropFirst = false;
    if (headers[0] === '' || /^#$/i.test(headers[0])) dropFirst = true;
    headers = normalizeHeaders(dropFirst ? headers.slice(1) : headers);

    const rows = [];
    for (let i = 1; i < contentLines.length; i++) {
      const line = contentLines[i];
      const t = line.trim();
      if (!t) continue;
      if (/^\s*Requested in\b/i.test(t)) break;
      if (/^\s*Workbench\b/i.test(t)) break;

      let parts = splitLine(line, delimiter);
      if (dropFirst || /^\d+$/.test(String(parts[0] || '').trim())) {
        parts = parts.slice(1);
      }

      if (parts.length > headers.length) {
        const textBodyIdx = headers.findIndex((h) => /^TextBody$/i.test(h));
        const mergeIdx = textBodyIdx >= 0 ? textBodyIdx : headers.length - 1;
        const head = parts.slice(0, mergeIdx);
        const merged = parts
          .slice(mergeIdx, parts.length - (headers.length - mergeIdx - 1))
          .join(' ');
        const tail = parts.slice(parts.length - (headers.length - mergeIdx - 1));
        parts = head.concat([merged], tail);
      } else if (parts.length < headers.length) {
        parts = parts.concat(new Array(headers.length - parts.length).fill(''));
      }

      rows.push(parts.map((v) => String(v || '')));
    }

    const objectName = detectWorkbenchObject(soql, headers);
    const ordered = reorderColumnsForObject(headers, rows, objectName);

    return {
      headers: ordered.headers,
      rows: ordered.rows,
      rowObjects: rowsToObjects(ordered.headers, ordered.rows),
      sourceLine,
      soql,
      objectName,
    };
  }

  global.WorkbenchParser = {
    parseWorkbenchTextToTable,
    detectWorkbenchObject,
    rowsToObjects,
  };
})(typeof self !== 'undefined' ? self : this);
