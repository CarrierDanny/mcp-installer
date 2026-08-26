/**
 * =====================================================================
 * Bridge_EnterpriseSuite.gs — DANMAN Bridge tool registry
 * Backend: "DANMAN Enterprise Suite" Sheets-bound GAS project (the one
 * containing Code.js, 15_Integration.js, 19_SalesforceQueryBuilder.js,
 * 20_CaseAnalyzer.js, 21_VoicemailTranscriber.js,
 * Scraper_BrowserIntegration.js, Scraper_AuthHandler.js).
 * =====================================================================
 *
 * WHAT THIS IS
 * ------------
 * Defines the single global `danmanBridgeTools_()` that DANMAN_Bridge.gs
 * (the dispatcher, shipped separately in this kit) calls lazily to
 * resolve any bridge action other than ping/describe. Each tool wraps an
 * EXISTING function of this backend — nothing in the backend is modified
 * by this file. Handlers throw on backend failure so errors surface via
 * the dispatcher's central try/catch.
 *
 * DEPLOYMENT PREREQUISITE — this project is SHEETS-BOUND
 * ------------------------------------------------------
 * The webhook only exists once the bound script is deployed as a Web
 * App: Deploy > New deployment > Web app > Execute as: Me / Who has
 * access: Anyone. Without that deployment there is no /exec URL and no
 * doPost to intercept.
 *
 * INSTALL (3 steps)
 * -----------------
 * 1. Copy BOTH files into the project (Apps Script editor > + > Script):
 *      - DANMAN_Bridge.gs         (the dispatcher — authored separately)
 *      - Bridge_EnterpriseSuite.gs   (this file)
 *
 * 2. Edit 15_Integration.js — function doPost(e), currently at line
 *    ~104. Its body parses the POST into `payload` in a try/catch at
 *    lines ~121-128:
 *        let payload = {};
 *        if (e.postData && e.postData.contents) {
 *          try { payload = JSON.parse(e.postData.contents); } ...
 *        }
 *    and at line ~131 branches GetPower/DANMAN extension payloads to
 *    scraper_handleGetPowerWebhook:
 *        if (payload.action || payload.selection || payload.capture || payload.tabs) {
 *    Bridge bodies also carry `action`, so the intercept MUST be
 *    inserted AFTER the payload parse block and BEFORE that line-131
 *    branch (otherwise scraper_handleGetPowerWebhook eats the request
 *    and replies "Unknown action"):
 *
 *        // DANMAN Bridge intercept (gas-bridge-kit) — before GetPower branch
 *        if (typeof danmanBridgeIsRequest_ === 'function' && danmanBridgeIsRequest_(payload)) {
 *          return ContentService
 *            .createTextOutput(JSON.stringify(danmanBridgeHandle_(payload)))
 *            .setMimeType(ContentService.MimeType.JSON);
 *        }
 *
 * 3. Set Script Property BRIDGE_SECRET (Project Settings > Script
 *    Properties) to a long random string. The dispatcher rejects bridge
 *    calls that do not present it.
 *
 * SECURITY NOTE — LEAKED API KEYS IN 15_Integration.js (fix separately)
 * ---------------------------------------------------------------------
 * 15_Integration.js line ~386 (testOpenAIIntegration) passes a LITERAL
 * OpenAI secret key as the argument to properties.getProperty(...), and
 * line ~426 (testAnthropicIntegration) does the same with a literal
 * Anthropic key. Both keys are committed in source and must be treated as
 * compromised: ROTATE them at the provider, then replace those
 * getProperty calls with real property NAMES (e.g. 'OPENAI_API_KEY',
 * 'ANTHROPIC_API_KEY'). This file intentionally does not repeat the key
 * values and does not touch 15_Integration.js.
 */

function danmanBridgeTools_() {

  // -- shared helpers (file-local) ------------------------------------

  function requireSuccess_(res, what) {
    if (!res || res.success !== true) {
      throw new Error(what + ' failed: ' + (res && res.error ? res.error : 'no result'));
    }
    return res;
  }

  return {
    service: 'enterprise-suite',
    version: '1.0.0-20260721',

    caps: {
      'transcribe': 'voicemail_transcribe',
      'capture': 'capture'
      // NO chat cap: this backend's LLM entry points (callAnalysisAI etc.)
      // are task-shaped, not generic conversational chat.
    },

    tools: {

      // ── sf_set_connection ────────────────────────────────────────
      // Verified: Code.js:105 setConnection(instanceUrl, sessionId)
      //   -> stores DocumentProperties, returns {success:true}
      'sf_set_connection': {
        description: 'Store Salesforce Instance URL + Session ID (DocumentProperties)',
        category: 'salesforce',
        params: [
          { key: 'instanceUrl', label: 'Salesforce instance URL', type: 'string', required: true },
          { key: 'sessionId', label: 'Salesforce session ID', type: 'string', required: true }
        ],
        handler: function (args) {
          return requireSuccess_(setConnection(args.instanceUrl, args.sessionId), 'sf_set_connection');
        }
      },

      // ── sf_test ──────────────────────────────────────────────────
      // Verified: Code.js:121 testConnection() — no args
      //   -> {success, message, sample} | {success:false, error}
      // Returned as-is (not thrown): reporting a failed connection IS
      // this tool's job.
      'sf_test': {
        description: 'Test the stored Salesforce connection (SELECT Organization LIMIT 1)',
        category: 'salesforce',
        params: [],
        handler: function () {
          return testConnection();
        }
      },

      // ── sf_query ─────────────────────────────────────────────────
      // Verified: Code.js:649 sfQueryAll_(soql) — follows nextRecordsUrl
      //   pagination; -> {success:true, records:[...]} | {success:false, error}
      'sf_query': {
        description: 'Run a SOQL query against the stored Salesforce connection (all pages)',
        category: 'salesforce',
        params: [
          { key: 'soql', label: 'SOQL query', type: 'text', required: true }
        ],
        handler: function (args) {
          if (!args.soql) throw new Error('sf_query requires soql');
          var res = requireSuccess_(sfQueryAll_(String(args.soql)), 'sf_query');
          return { records: res.records || [], count: (res.records || []).length };
        }
      },

      // ── voicemail_transcribe (cap: transcribe) ───────────────────
      // Verified: 21_VoicemailTranscriber.js:280
      //   transcribeAudioFile(fileId, provider) — takes a Google DRIVE
      //   FILE ID, not base64. Providers (VM_CONFIG.PROVIDERS, :24-29):
      //   'openai_whisper' | 'google_cloud' | 'gemini' | 'assembly_ai'
      //   (unknown/absent -> gemini). Whisper path returns
      //   {success, text, language, duration, confidence, provider, segments}.
      // ADAPTER: the standard verb sends {name?, mime, data(base64)}, so
      // this handler first materializes the audio as a Drive file in the
      // project's voicemail folder (getOrCreateVoicemailFolder, :113),
      // then calls transcribeAudioFile with the new file's id. The file
      // is KEPT (it doubles as the voicemail archive) and its URL is
      // returned.
      'voicemail_transcribe': {
        description: 'Transcribe base64 audio (saved to Drive first) via Whisper/Gemini/GCloud/AssemblyAI',
        category: 'ai',
        params: [
          { key: 'mime', label: 'Audio MIME type', type: 'string', required: true },
          { key: 'data', label: 'Base64 audio', type: 'text', required: true },
          { key: 'name', label: 'File name', type: 'string', required: false },
          { key: 'provider', label: 'openai_whisper|google_cloud|gemini|assembly_ai', type: 'string', required: false }
        ],
        handler: function (args) {
          if (!args.data) throw new Error('voicemail_transcribe requires data (base64 audio)');
          // Map friendly aliases onto VM_CONFIG.PROVIDERS values.
          var p = String(args.provider || '').toLowerCase();
          if (p === 'whisper' || p === 'openai') p = VM_CONFIG.PROVIDERS.OPENAI_WHISPER;
          var known = [
            VM_CONFIG.PROVIDERS.OPENAI_WHISPER,
            VM_CONFIG.PROVIDERS.GOOGLE_CLOUD,
            VM_CONFIG.PROVIDERS.GEMINI,
            VM_CONFIG.PROVIDERS.ASSEMBLY_AI
          ];
          if (known.indexOf(p) === -1) p = VM_CONFIG.PROVIDERS.GEMINI; // backend default path

          var folder = getOrCreateVoicemailFolder(); // :113 -> {success, folderId, ...}
          requireSuccess_(folder, 'voicemail folder');
          var blob = Utilities.newBlob(
            Utilities.base64Decode(String(args.data)),
            args.mime || 'audio/mpeg',
            String(args.name || ('bridge_vm_' + Date.now() + '.mp3'))
          );
          var file = DriveApp.getFolderById(folder.folderId).createFile(blob);

          var res = transcribeAudioFile(file.getId(), p);
          requireSuccess_(res, 'voicemail_transcribe');
          // Standard cap shape: {text, language?, duration?, segments?}
          return {
            text: res.text,
            language: res.language || null,
            duration: res.duration || null,
            segments: res.segments || [],
            provider: res.provider || p,
            confidence: res.confidence || null,
            fileId: file.getId(),
            fileUrl: file.getUrl()
          };
        }
      },

      // ── warranty_lookup ──────────────────────────────────────────
      // Verified: 20_CaseAnalyzer.js:457 lookupCarrierWarrantyInfo(serialNumber)
      //   — SINGLE argument (the brief's optional {model} does not exist
      //   in the real signature and is dropped). Returns parsed page info
      //   + serialNumber, warrantyUrl, partsUrl (success flag inside).
      'warranty_lookup': {
        description: 'Carrier Enterprise warranty lookup by equipment serial number',
        category: 'carrier',
        params: [
          { key: 'serial', label: 'Equipment serial number', type: 'string', required: true }
        ],
        handler: function (args) {
          if (!args.serial) throw new Error('warranty_lookup requires serial');
          // Returned as-is: a failed lookup (bad serial / HTTP error)
          // carries success:false + sanitizedSerial diagnostics the
          // caller needs.
          return lookupCarrierWarrantyInfo(String(args.serial));
        }
      },

      // ── model_decode ─────────────────────────────────────────────
      // Verified: 20_CaseAnalyzer.js:3593 decodeCarrierModelNumber(modelNumber)
      //   -> {success, type, productLine, description?, matchedPrefix?, confidence, category?}
      'model_decode': {
        description: 'Decode a Carrier model number to Type__c / Product_Line__c',
        category: 'carrier',
        params: [
          { key: 'model', label: 'Model number', type: 'string', required: true }
        ],
        handler: function (args) {
          if (!args.model) throw new Error('model_decode requires model');
          // Returned as-is: "not recognized" (success:false) is a
          // legitimate decode outcome, not an execution error.
          return decodeCarrierModelNumber(String(args.model));
        }
      },

      // ── case_analyze ─────────────────────────────────────────────
      // Verified: 20_CaseAnalyzer.js:2058 analyzeCaseData(caseData)
      //   — caseData is an ARRAY of case objects (SOQL-shaped records).
      //   -> {success:true, results:[...], stats:{...}, timestamp}
      'case_analyze': {
        description: 'Analyze case records: missing/empty fields, data quality, suggestible fields',
        category: 'cases',
        params: [
          { key: 'cases', label: 'Array of case objects (SOQL records)', type: 'json', required: true }
        ],
        handler: function (args) {
          var list = args.cases || args.caseData || [];
          if (!Array.isArray(list)) list = [list]; // accept a single record
          return requireSuccess_(analyzeCaseData(list), 'case_analyze');
        }
      },

      // ── case_suggest ─────────────────────────────────────────────
      // Verified: 20_CaseAnalyzer.js:2225
      //   getAISuggestionsForCase(caseRecord, fieldsToSuggest)
      //   — caseRecord object + ARRAY of field names.
      //   -> {success:true, caseNumber, suggestions, assessment,
      //       recommendedPriority, nextSteps}
      'case_suggest': {
        description: 'AI-suggested values for missing case fields (provider from ANALYSIS_PROVIDER prop)',
        category: 'cases',
        params: [
          { key: 'caseRecord', label: 'Case object', type: 'json', required: true },
          { key: 'fields', label: 'Field names needing values', type: 'json', required: true }
        ],
        handler: function (args) {
          if (!args.caseRecord) throw new Error('case_suggest requires caseRecord');
          var fields = Array.isArray(args.fields) ? args.fields : [];
          return requireSuccess_(getAISuggestionsForCase(args.caseRecord, fields), 'case_suggest');
        }
      },

      // ── stakeholder_message ──────────────────────────────────────
      // Verified: 20_CaseAnalyzer.js:2472
      //   generateStakeholderMessage(caseRecord, stakeholderType, options = {})
      //   — stakeholderType: dealer|technician|accountManager|homeowner
      //   (keys of STAKEHOLDER_TYPES); options {tone?, includeNextSteps?, nextSteps?}.
      //   -> {success:true, stakeholderType, stakeholderName, caseNumber,
      //       email:{subject, greeting, body, closing, fullEmail}}
      'stakeholder_message': {
        description: 'Generate a stakeholder email for a case (dealer/technician/accountManager/homeowner)',
        category: 'cases',
        params: [
          { key: 'caseRecord', label: 'Case object', type: 'json', required: true },
          { key: 'stakeholderType', label: 'dealer|technician|accountManager|homeowner', type: 'string', required: true },
          { key: 'options', label: 'Options {includeNextSteps, nextSteps, ...}', type: 'json', required: false }
        ],
        handler: function (args) {
          if (!args.caseRecord) throw new Error('stakeholder_message requires caseRecord');
          if (!args.stakeholderType) throw new Error('stakeholder_message requires stakeholderType');
          return requireSuccess_(
            generateStakeholderMessage(args.caseRecord, String(args.stakeholderType), args.options || {}),
            'stakeholder_message'
          );
        }
      },

      // ── screenshot_soql ──────────────────────────────────────────
      // Verified: 19_SalesforceQueryBuilder.js:1003
      //   processScreenshotAndCreateSpreadsheet(imageData, fileName)
      //   — imageData is base64, RAW or a data: URL; the downstream
      //   parser (extractFullTableFromScreenshot, :294-309) sniffs mime
      //   from a "data:<mime>;base64," prefix and defaults to image/png
      //   otherwise. To honor a caller-supplied mime we synthesize the
      //   data URL here. -> {success:true, spreadsheetUrl, spreadsheetId,
      //   headers, rows..., caseNumbers, soqlQuery, workbenchUrl, ...}
      'screenshot_soql': {
        description: 'Extract a Salesforce Cases screenshot into a new Sheet + generated SOQL',
        category: 'salesforce',
        params: [
          { key: 'data', label: 'Base64 screenshot', type: 'text', required: true },
          { key: 'mime', label: 'Image MIME (default image/png)', type: 'string', required: false },
          { key: 'name', label: 'Original file name', type: 'string', required: false }
        ],
        handler: function (args) {
          if (!args.data) throw new Error('screenshot_soql requires data (base64 image)');
          var imageData = String(args.data);
          if (imageData.indexOf(',') === -1 && args.mime) {
            imageData = 'data:' + args.mime + ';base64,' + imageData;
          }
          return requireSuccess_(
            processScreenshotAndCreateSpreadsheet(imageData, String(args.name || 'bridge_screenshot.png')),
            'screenshot_soql'
          );
        }
      },

      // ── capture (cap: capture) ───────────────────────────────────
      // Verified: Scraper_AuthHandler.js:1163
      //   scraper_processCapturedContent(jsonContent) — takes a JSON
      //   STRING; the parsed object requires url AND html ({url, html,
      //   title?, text?, timestamp?}); runs the scraper AI pipeline and
      //   saves to Drive. -> {success, message}
      // ADAPTER: the standard verb sends {url, title?, html?, text?};
      // when only text is supplied it is wrapped in <pre> so the
      // backend's html requirement is met.
      'capture': {
        description: 'Feed a captured page (url/title/html/text) into the scraper AI pipeline',
        category: 'scraper',
        params: [
          { key: 'url', label: 'Page URL', type: 'string', required: true },
          { key: 'title', label: 'Page title', type: 'string', required: false },
          { key: 'html', label: 'Page HTML', type: 'text', required: false },
          { key: 'text', label: 'Page text (used if html absent)', type: 'text', required: false }
        ],
        handler: function (args) {
          if (!args.url) throw new Error('capture requires url');
          var html = args.html;
          if (!html && args.text) {
            html = '<pre>' +
              String(args.text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
              '</pre>';
          }
          if (!html) throw new Error('capture requires html or text');
          var res = scraper_processCapturedContent(JSON.stringify({
            url: String(args.url),
            title: String(args.title || ''),
            html: html,
            text: String(args.text || ''),
            timestamp: new Date().toISOString()
          }));
          requireSuccess_(res, 'capture');
          return { ok: true, message: res.message || 'Content processed', url: String(args.url) };
        }
      }
    }
  };
}
