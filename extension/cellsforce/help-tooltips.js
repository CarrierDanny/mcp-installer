/* help-tooltips.js — Contextual hover help for CellsForce
   CellsForce v3.2.0 — DANMAN SOLUTIONS */
(function () {
  'use strict';

  var HELP = {
    'wiz1':          'START HERE. Paste any raw text — emails, reports, CSV, JSON, or free-form notes. CellsForce extracts case numbers, account numbers, SF IDs, emails, and phones automatically.',
    'wiz2':          'Choose which Salesforce fields to include in your SOQL SELECT clause. Use presets for common combinations or search by API name.',
    'wiz3':          'Add WHERE conditions to narrow your query results. Toggle AND/OR logic between rows.',
    'wiz4':          'Review the generated SOQL query. Copy it and open Workbench to run it against your org.',
    'wiz5':          'Open Salesforce Workbench. Paste the SOQL from Step 4, run the query, then copy all results.',
    'wiz6':          'Paste the raw Workbench output here. CellsForce auto-detects the format and builds a sortable table.',
    'wiz7':          'Generate personalized emails grouped by Sales Rep, using merge fields from your parsed data.',
    'tab-extract':   'Smart Paste Engine — paste ANY raw text and CellsForce finds case numbers, account numbers, SF record IDs, emails, and phone numbers automatically. Works with emails, reports, CSVs, JSON, or free-form notes.',
    'tab-builder':   'SOQL Builder — select fields, add filter conditions, and generate a ready-to-run SOQL query. Case numbers from Smart Paste are auto-injected as a WHERE IN clause.',
    'tab-library':   'Query Library — 10 pre-built SOQL queries for Case, Account, Contact, and Equipment objects. Case numbers auto-populate from Smart Paste. Also includes Update/Upsert CSV header templates.',
    'tab-soql':      'SOQL Templates — validated query templates from the DANMAN catalog. Paste a case block, pick a template, and get field-validated SOQL ready for Workbench.',
    'tab-triage':    'Case Triage — paste Google Drive filenames or voicemail recordings to extract case numbers. Generates a complete SOQL pack for Case data, Emails, Attachments, and SF Files.',
    'tab-parse':     'Parse Results — paste raw Workbench output (CSV, TSV, JSON, pipe-delimited). CellsForce auto-detects the format and converts it to a filterable data table.',
    'tab-table':     'Data Table — sortable, filterable view of parsed results. Click column headers to sort. Red highlights show missing required fields. Export as CSV or copy as TSV.',
    'tab-email':     'Email Merge — generates personalized emails grouped by Sales Rep, using {{{triple-brace}}} merge fields. Parse data in Parse Results first.',
    'tab-settings':  'Settings — configure your Salesforce Org URL, Workbench URL, default limits, manage field presets, edit custom API field names, and save/restore your workspace.',
    'speInput':      'Paste ANYTHING: email bodies, Salesforce pages, CSV exports, REST API JSON, reports, or notes with numbers scattered throughout. CellsForce scans for patterns automatically.',
    'imgDropZone':   'Drop a screenshot of a Salesforce report or data table. CellsForce attempts to detect column header text and offers to use them as SOQL field names in the Builder.',
    'caseChips':     'Click a case number chip to select/deselect it. Selected cases are used in SOQL WHERE IN clauses. Use "All" to select everything, or "None" to clear.',
    'exFormat':      'Choose output format for extracted data. "SOQL IN" wraps values in quotes for direct use in WHERE clauses. Other formats for general-purpose use.',
    'fpGroups':      'Field groups organize the 200+ Salesforce Case fields by category. Click a group to see its fields. Green counts show how many fields you\'ve selected in that group.',
    'fpFields':      'Click a field to toggle it in your SOQL SELECT. Hover the field name for the API name, description, and WHERE clause example. Search above to find fields quickly.',
    'filterRows':    'Build WHERE conditions. Choose a field, operator, and value. Click "AND"/"OR" between rows to toggle logic. Add multiple conditions to narrow your query.',
    'soqlOutput':    'Your complete SOQL query, syntax-highlighted. Review it, then click Copy SOQL → Open Workbench to execute. Relationship fields (like Account.Name) may need Workbench settings enabled.',
    'qlSidebar':     'Pre-built queries covering common Salesforce use cases. Click a query to preview it with your case numbers auto-injected.',
    'pasteInput':    'Paste the full Workbench query results here. Supports: Bulk CSV (recommended), TSV, JSON, pipe-delimited, or SF Developer Console copy. Click Parse & Analyse to process.',
    'dataTable':     'Interactive data grid. Click column headers to sort (▲/▼). Use the search box to filter rows. Red "Missing" tags highlight fields that should have values. Export with the buttons above.',
    'emailBlocks':   'Email previews grouped by Sales Rep. Each block shows a formatted email ready to send. Uses {{{merge fields}}} from your parsed data. Download as HTML or generate Apex.',
    'presetList':    'Saved field + filter configurations. Click Apply to restore a preset. Presets store your selected fields, filters, sort order, and object type.',
    'fieldEditorWrap': 'Edit or add custom API field names. If a Salesforce field name changed or your org has custom fields not in the registry, add them here. Changes are saved and persist.',
    'savedQueryList': 'Your saved SOQL queries. Save any query you build for quick recall later. Click Load to restore a saved query, or Delete to remove it.'
  };

  var helpEl = null;
  var hideTimer = null;

  function createHelpEl() {
    if (helpEl) return;
    helpEl = document.createElement('div');
    helpEl.className = 'cf-help-tip';
    helpEl.style.display = 'none';
    document.body.appendChild(helpEl);
  }

  function showHelp(text, rect) {
    createHelpEl();
    clearTimeout(hideTimer);
    helpEl.textContent = text;
    helpEl.style.display = 'block';
    var top = rect.bottom + 6;
    var left = rect.left;
    if (left + 320 > window.innerWidth) left = window.innerWidth - 330;
    if (left < 5) left = 5;
    if (top + 120 > window.innerHeight) top = rect.top - helpEl.offsetHeight - 6;
    helpEl.style.top = top + 'px';
    helpEl.style.left = left + 'px';
  }

  function hideHelp() {
    hideTimer = setTimeout(function () {
      if (helpEl) helpEl.style.display = 'none';
    }, 150);
  }

  function attach() {
    createHelpEl();

    document.querySelectorAll('.cf-step').forEach(function (btn) {
      var key = btn.id;
      if (HELP[key]) {
        btn.setAttribute('data-help', HELP[key]);
      }
    });

    document.querySelectorAll('.cf-tab').forEach(function (btn) {
      var t = btn.getAttribute('data-t');
      var key = 'tab-' + (t || '').replace('t-', '');
      if (HELP[key]) {
        btn.setAttribute('data-help', HELP[key]);
      }
    });

    var idMap = [
      'speInput', 'imgDropZone', 'caseChips', 'fpGroups', 'fpFields',
      'filterRows', 'soqlOutput', 'qlSidebar', 'pasteInput', 'dataTable',
      'emailBlocks', 'presetList', 'fieldEditorWrap', 'savedQueryList'
    ];
    idMap.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && HELP[id]) el.setAttribute('data-help', HELP[id]);
    });

    var selEl = document.getElementById('exFormat');
    if (selEl && HELP['exFormat']) {
      var parent = selEl.parentElement;
      if (parent) parent.setAttribute('data-help', HELP['exFormat']);
    }

    document.addEventListener('mouseover', function (e) {
      var target = e.target.closest('[data-help]');
      if (!target) return;
      var text = target.getAttribute('data-help');
      if (text) showHelp(text, target.getBoundingClientRect());
    }, true);

    document.addEventListener('mouseout', function (e) {
      var target = e.target.closest('[data-help]');
      if (target) hideHelp();
    }, true);
  }

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(attach, 200);
  });
})();
