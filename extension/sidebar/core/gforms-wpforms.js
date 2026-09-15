// sidebar/core/gforms-wpforms.js — Google Forms → WPForms JSON converter.
// Verbatim port of FormsProcessorV2 (V001r803) from the DANMAN GAS backend —
// the exact engine that parses FB_PUBLIC_LOAD_DATA_ and emits a
// WPForms-import-ready JSON array (with the US/CA address block injection).
// Changes from the GAS original: wrapped in an IIFE, UrlFetchApp → fetch
// (async), Logger → console. Public surface: window.DMS_GForms.convert().
(function () {
'use strict';
// FormsProcessorV2_202605261200_V001r803.gs
/**
 * FormsProcessorV2 — DANMAN GAS v5.0.0 Form Processing Engine
 * Carrier Enterprise Canada | CETechSupport.com Migration
 *
 * REPLACES: FormsProcessor_202604141430_V001r000.gs (legacy regex parser)
 *
 * WHY THIS EXISTS:
 *   The legacy parser uses /<form[^>]*>([\s\S]*?)<\/form>/ regex on Google
 *   Forms HTML. This returns ~0 fields in practice because Google Forms
 *   render their fields via JavaScript from the FB_PUBLIC_LOAD_DATA_ global
 *   variable injected into the page. The static <form> tag in the HTML is
 *   the OUTER container only — no <input>/<select>/<textarea> tags exist
 *   in the static HTML at all.
 *
 * WHAT THIS DOES:
 *   1. Fetches a published Google Form URL (or accepts pasted HTML/data)
 *   2. Extracts FB_PUBLIC_LOAD_DATA_ from the HTML
 *   3. Parses Google's array-based form schema into normalized fields
 *   4. Auto-injects a US/CA dual-region address block with WPForms
 *      conditional logic into any form containing address fields
 *   5. Generates a fully WPForms-import-ready JSON array
 *   6. Strips dealer-specific or site-specific metadata so the result is
 *      a true "cookie-cutter" template usable by any CE branch
 *
 * SUPPORTS:
 *   - Published forms (any /viewform URL)
 *   - Unpublished forms (via bookmarklet that posts FB_PUBLIC_LOAD_DATA_)
 *   - Edit URLs (only when called from a logged-in admin GAS environment)
 *   - Direct paste of pre-extracted FB_PUBLIC_LOAD_DATA_ array
 *
 * INTEGRATES WITH:
 *   - Code.gs   :: _dispatchFormCapture_  (already wired into action=form_capture)
 *   - Index.html :: tab-forms             (UI entry point)
 *
 * @version V001r803
 * @timestamp 202605261200
 * @author Dan / Carrier Enterprise Canada
 */

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Top-level entry point. Accepts either a Google Form URL or a pre-extracted
 * FB_PUBLIC_LOAD_DATA_ payload, produces a WPForms-importable JSON array.
 *
 * @param {Object} input
 *   {url}      Published Google Form URL (/viewform). Server fetches and parses.
 *   {fbData}   Pre-extracted FB_PUBLIC_LOAD_DATA_ array (from the bookmarklet).
 *   {html}     Raw HTML string (paste). Server extracts FB_PUBLIC_LOAD_DATA_ from it.
 * @param {Object} [options]
 *   {formTitle}              Override the form title (else uses Google's title).
 *   {formDesc}               Override the description.
 *   {injectAddressBlock}     Default true. Set false to skip US/CA injection.
 *   {requireAddress}         Default true. Marks address fields required.
 *   {notificationEmail}      Default '{admin_email}'. Notification recipient.
 *   {confirmationMessage}    Default CE Tech Support boilerplate.
 *   {neutralTemplate}        Default true. Strips dealer-specific labels for
 *                            cookie-cutter use across CE branches.
 * @returns {Object}
 *   {ok: true,  data: {wpformsJson, fieldCount, addressInjected, fbTitle, fbDesc, warnings}}
 *   {ok: false, error: 'CODE', meta: {hint}}
 */
async function convertGoogleFormToWPForms(input, options) {
  try {
    var opts = _mergeOptions_(options);
    var fbData = null;
    var sourceLabel = '';
    var rawHtml = '';

    // --- Resolve input → fbData -------------------------------------------
    if (input && input.fbData) {
      // Path A: bookmarklet posted the array directly. Fastest path.
      fbData = input.fbData;
      sourceLabel = 'bookmarklet';
    } else if (input && input.html) {
      // Path B: caller pasted HTML. Extract FB_PUBLIC_LOAD_DATA_ from it.
      rawHtml = String(input.html);
      fbData = _extractFbDataFromHtml_(rawHtml);
      sourceLabel = 'html_paste';
    } else if (input && input.url) {
      // Path C: caller gave a URL. Server fetches, then extracts.
      var fetchUrl = _normalizeFormUrl_(input.url);
      // Browser port: fetch replaces UrlFetchApp (extension host permissions
      // cover docs.google.com); same semantics — follow redirects, no throw.
      var resp = await fetch(fetchUrl, { redirect: 'follow' });
      if (resp.status !== 200) {
        return {
          ok: false,
          error: 'fetch_failed',
          meta: {
            hint: 'HTTP ' + resp.status +
                  ' fetching ' + fetchUrl +
                  '. If this is an edit URL, open the form in a tab and use "Convert current tab" instead.',
            http_code: resp.status
          }
        };
      }
      rawHtml = await resp.text();
      fbData = _extractFbDataFromHtml_(rawHtml);
      sourceLabel = 'url_fetch';
    } else {
      return {
        ok: false,
        error: 'bad_payload',
        meta: {hint: 'Provide one of: url | html | fbData'}
      };
    }

    if (!fbData) {
      return {
        ok: false,
        error: 'no_form_data',
        meta: {
          hint: 'FB_PUBLIC_LOAD_DATA_ not found in source. ' +
                'For unpublished forms, run the bookmarklet from the edit page.',
          source: sourceLabel
        }
      };
    }

    // --- Parse Google's schema into our normalized field list -------------
    var parsed = _parseFbData_(fbData);
    if (!parsed.fields.length && !parsed.title) {
      return {
        ok: false,
        error: 'parse_failed',
        meta: {hint: 'FB_PUBLIC_LOAD_DATA_ structure unrecognized'}
      };
    }

    // --- Apply options + cookie-cutter neutralization ---------------------
    var formTitle = opts.formTitle || parsed.title || 'CE Imported Form';
    var formDesc  = opts.formDesc  || parsed.description || '';

    if (opts.neutralTemplate) {
      formTitle = _neutralizeTitle_(formTitle);
      formDesc  = _neutralizeDescription_(formDesc);
    }

    // --- Build WPForms field map ------------------------------------------
    var wpFields = {};
    var nextId = 1;
    var sawAddressField = false;
    var warnings = [];

    for (var i = 0; i < parsed.fields.length; i++) {
      var gField = parsed.fields[i];

      // If we're injecting a smart address block, suppress the original
      // address fields (street/city/state/province/zip/postal) — the block
      // we add at the end will replace them.
      if (opts.injectAddressBlock && _isAddressField_(gField.label, gField.description)) {
        sawAddressField = true;
        warnings.push('suppressed_address_field: ' + gField.label);
        continue;
      }

      var wpField = _gFieldToWpField_(gField, nextId);
      if (wpField) {
        wpFields[String(nextId)] = wpField;
        nextId++;
      } else {
        warnings.push('unmapped_field_type: ' + gField.typeCode + ' (' + gField.label + ')');
      }
    }

    // --- Inject US/CA address block if needed -----------------------------
    var addressInjected = false;
    if (opts.injectAddressBlock && sawAddressField) {
      var addrFields = _buildUsCaAddressBlock_(nextId, opts.requireAddress);
      for (var j = 0; j < addrFields.length; j++) {
        wpFields[addrFields[j].id] = addrFields[j];
      }
      addressInjected = true;
      nextId += addrFields.length;
    }

    // --- Wrap in WPForms top-level structure ------------------------------
    var now = _formatNowSql_();
    var wpForm = {
      id: 0,                              // WPForms assigns on import
      name: formTitle,
      created: now,
      modified: now,
      fields: wpFields,
      settings: {
        form_title:             formTitle,
        form_desc:              formDesc,
        submit_text:            'Submit',
        submit_text_processing: 'Sending\u2026',
        honeypot:               '1',
        antispam:               '1',
        notification_enable:    '1',
        notifications: {
          '1': {
            notification_name: 'CE Tech Support Notification',
            email:             opts.notificationEmail,
            subject:           'New CE Form: ' + formTitle,
            sender_name:       'CE Tech Support',
            sender_address:    '{admin_email}',
            replyto:           '',
            message:           '{all_fields}'
          }
        },
        confirmations: {
          '1': {
            name:           'Default Confirmation',
            type:           'message',
            message:        opts.confirmationMessage,
            message_scroll: '1',
            page:           '',
            redirect:       ''
          }
        }
      },
      meta: {
        template:           '',
        ce_source:          'google-forms-migrated',
        ce_fb_title:        parsed.title || '',
        ce_neutralized:     opts.neutralTemplate ? '1' : '0',
        ce_address_logic:   addressInjected ? 'us_ca_conditional' : 'none',
        ce_source_method:   sourceLabel,
        ce_processor_ver:   'V001r803'
      }
    };

    // WPForms import format is a JSON ARRAY of forms.
    var wpformsImport = [wpForm];

    sysLog_('convertGoogleFormToWPForms: ' + formTitle +
            ' | fields=' + (nextId - 1) +
            ' | address_injected=' + addressInjected +
            ' | source=' + sourceLabel);

    return {
      ok: true,
      data: {
        wpformsJson:     wpformsImport,
        fieldCount:      nextId - 1,
        addressInjected: addressInjected,
        fbTitle:         parsed.title || '',
        fbDesc:          parsed.description || '',
        sourceMethod:    sourceLabel,
        warnings:        warnings
      }
    };

  } catch (err) {
    sysLog_('convertGoogleFormToWPForms ERROR: ' + (err && err.stack || err), 'ERROR');
    return {
      ok: false,
      error: 'internal_error',
      meta: {detail: String(err && err.message || err)}
    };
  }
}

// ============================================================================
// FB_PUBLIC_LOAD_DATA_ EXTRACTION
// ============================================================================

/**
 * Extracts the FB_PUBLIC_LOAD_DATA_ JavaScript variable from a Google Form
 * HTML page. The variable is set by inline script as:
 *     var FB_PUBLIC_LOAD_DATA_ = [null, [ ... form structure ... ]];
 *
 * We grep for the assignment then balance brackets to find the closing ];
 * (a flat regex won't work because the array contains nested arrays with
 * arbitrary depth, including strings that may contain '[' and ']').
 *
 * @param {string} html
 * @returns {Array|null}  The parsed FB_PUBLIC_LOAD_DATA_ array, or null.
 * @private
 */
function _extractFbDataFromHtml_(html) {
  if (!html) return null;
  var marker = 'FB_PUBLIC_LOAD_DATA_';
  var startIdx = html.indexOf(marker);
  if (startIdx < 0) return null;

  // Skip past `FB_PUBLIC_LOAD_DATA_ =` to first `[`
  var eqIdx = html.indexOf('=', startIdx);
  if (eqIdx < 0) return null;
  var bracketStart = html.indexOf('[', eqIdx);
  if (bracketStart < 0) return null;

  // Walk forward tracking string state and bracket depth.
  var depth = 0;
  var inStr = false;
  var strChar = '';
  var escape = false;
  var end = -1;
  for (var i = bracketStart; i < html.length; i++) {
    var ch = html.charAt(i);
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === strChar) { inStr = false; }
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; strChar = ch; continue; }
    if (ch === '[') { depth++; continue; }
    if (ch === ']') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null;

  var jsonSlice = html.substring(bracketStart, end + 1);

  // The slice is JavaScript array literal, NOT JSON: it can contain single
  // quotes, undefined embeds, etc. Convert to valid JSON first.
  try {
    return JSON.parse(jsonSlice);
  } catch (e1) {
    // Fallback: normalize JS-ism's then retry
    try {
      var normalized = jsonSlice
        .replace(/\bundefined\b/g, 'null')
        .replace(/,\s*([\]\}])/g, '$1');   // trailing comma cleanup
      return JSON.parse(normalized);
    } catch (e2) {
      sysLog_('_extractFbDataFromHtml_ parse failed: ' + e2.message, 'WARN');
      return null;
    }
  }
}

// ============================================================================
// FB_PUBLIC_LOAD_DATA_ SCHEMA PARSER
// ============================================================================

/**
 * Google Forms question type codes (FB_PUBLIC_LOAD_DATA_[1][1][n][3]):
 *   0  SHORT_ANSWER       → text
 *   1  PARAGRAPH          → textarea
 *   2  MULTIPLE_CHOICE    → radio
 *   3  DROPDOWN           → select
 *   4  CHECKBOXES         → checkbox
 *   5  LINEAR_SCALE       → rating
 *   6  SECTION_HEADER     → divider/heading
 *   7  GRID               → flatten to checkboxes (best-effort)
 *   8  PAGE_BREAK         → divider
 *   9  DATE               → date-time
 *   10 TIME               → date-time
 *   11 IMAGE              → skip (not a question)
 *   13 FILE_UPLOAD        → file-upload
 * @private
 */
var _GFORMS_TYPE_MAP_ = {
  0:  'text',
  1:  'textarea',
  2:  'radio',
  3:  'select',
  4:  'checkbox',
  5:  'rating',
  6:  'divider',
  7:  'checkbox',
  8:  'divider',
  9:  'date-time',
  10: 'date-time',
  13: 'file-upload'
};

/**
 * Walks FB_PUBLIC_LOAD_DATA_ and returns a normalized list of fields.
 *
 * Structure (paths into the array):
 *   [1][0]                = description string
 *   [1][1]                = array of question items
 *   [1][1][n][0]          = numeric question ID
 *   [1][1][n][1]          = question title (label)
 *   [1][1][n][2]          = description / help text
 *   [1][1][n][3]          = type code (see _GFORMS_TYPE_MAP_)
 *   [1][1][n][4]          = field meta array; only present for question types
 *   [1][1][n][4][0][0]    = entry ID (the entry.XXXXXXXXX number)
 *   [1][1][n][4][0][1]    = options array [[label, ...], ...] (radio/cb/dd)
 *   [1][1][n][4][0][2]    = required flag (1 = required)
 *   [1][8]                = form title
 *
 * @param {Array} fb
 * @returns {{title:string, description:string, fields:Array}}
 * @private
 */
function _parseFbData_(fb) {
  var out = {title: '', description: '', fields: []};
  if (!fb || !fb[1]) return out;

  var sec = fb[1];
  out.description = String(sec[0] || '');
  out.title       = String(sec[8] || '');

  var items = sec[1] || [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item) continue;

    var typeCode = item[3];
    var label    = String(item[1] || '');
    var desc     = String(item[2] || '');

    // Image/media items have no useful question payload — skip
    if (typeCode === 11) continue;

    // Section headers / page breaks → divider with the title only
    if (typeCode === 6 || typeCode === 8) {
      out.fields.push({
        typeCode:    typeCode,
        wpType:      'divider',
        label:       label,
        description: desc,
        required:    false,
        options:     [],
        entryId:     null
      });
      continue;
    }

    var meta = (item[4] && item[4][0]) ? item[4][0] : [];
    var entryId  = meta[0] || null;
    var optsRaw  = meta[1] || [];
    var required = !!meta[2];

    var options = [];
    if (optsRaw && optsRaw.length) {
      for (var k = 0; k < optsRaw.length; k++) {
        var optRow = optsRaw[k];
        if (optRow && optRow[0] != null) {
          options.push({label: String(optRow[0]), value: String(optRow[0])});
        }
      }
    }

    out.fields.push({
      typeCode:    typeCode,
      wpType:      _GFORMS_TYPE_MAP_[typeCode] || 'text',
      label:       label,
      description: desc,
      required:    required,
      options:     options,
      entryId:     entryId
    });
  }

  return out;
}

// ============================================================================
// WPFORMS FIELD CONSTRUCTION
// ============================================================================

/**
 * Convert one normalized Google Forms field into a WPForms field object.
 * @private
 */
function _gFieldToWpField_(g, fieldId) {
  if (!g) return null;
  var idStr = String(fieldId);
  var req   = g.required ? '1' : '0';

  // Heading/divider — render as WPForms html block with the label
  if (g.wpType === 'divider') {
    return {
      id:       idStr,
      type:     'html',
      label:    g.label,
      code:     '<h3 class="ce-section-header">' + _escHtml_(g.label) + '</h3>' +
                (g.description ? '<p>' + _escHtml_(g.description) + '</p>' : ''),
      position: idStr
    };
  }

  var field = {
    id:          idStr,
    type:        g.wpType,
    label:       g.label || ('Field ' + fieldId),
    description: g.description,
    required:    req,
    size:        'medium',
    placeholder: '',
    position:    idStr,
    meta: {
      ce_google_entry_id: g.entryId ? String(g.entryId) : ''
    }
  };

  // Type-specific embellishments
  if (g.options && g.options.length) {
    field.choices = {};
    for (var i = 0; i < g.options.length; i++) {
      field.choices[String(i + 1)] = {
        label:   g.options[i].label,
        value:   g.options[i].value,
        image:   '',
        icon:    '',
        default: ''
      };
    }
  }

  if (g.wpType === 'text' || g.wpType === 'textarea') {
    field.limit_count = '0';
    field.limit_mode  = 'characters';
  }

  if (g.wpType === 'rating') {
    field.scale = '5';
    field.icon  = 'star';
  }

  return field;
}

// ============================================================================
// US/CA ADDRESS BLOCK (the part Gemini forgot)
// ============================================================================

/**
 * Builds the 7-field US/CA conditional address block. Country drives
 * show/hide of state-vs-province and zip-vs-postal via WPForms Smart
 * Conditional Logic (requires WPForms Pro; degrades gracefully on Free).
 *
 * @param {number} startId  Next available field ID
 * @param {boolean} required
 * @returns {Array<Object>} WPForms field objects (already id-indexed)
 * @private
 */
function _buildUsCaAddressBlock_(startId, required) {
  var req = required ? '1' : '0';
  var countryId = startId;
  var streetId  = startId + 1;
  var cityId    = startId + 2;
  var stateId   = startId + 3;
  var provId    = startId + 4;
  var zipId     = startId + 5;
  var postalId  = startId + 6;

  var cidStr = String(countryId);

  // Conditional logic: show field when Country == "United States"
  var showWhenUsa = {
    status: 'active',
    action: 'show',
    'if':   [[{field: cidStr, operator: 'is', value: 'United States'}]]
  };
  var showWhenCan = {
    status: 'active',
    action: 'show',
    'if':   [[{field: cidStr, operator: 'is', value: 'Canada'}]]
  };

  return [
    {
      id:          cidStr,
      type:        'select',
      label:       'Country',
      description: 'Select your country of service',
      required:    req,
      size:        'medium',
      placeholder: '\u2014 Select Country \u2014',
      position:    cidStr,
      choices: {
        '1': {label: 'United States', value: 'United States', image: '', icon: '', default: '1'},
        '2': {label: 'Canada',        value: 'Canada',        image: '', icon: '', default: ''}
      },
      meta: {ce_region: 'selector'}
    },
    {
      id:          String(streetId),
      type:        'text',
      label:       'Street Address',
      required:    req,
      size:        'large',
      placeholder: '123 Main Street',
      position:    String(streetId)
    },
    {
      id:          String(cityId),
      type:        'text',
      label:       'City',
      required:    req,
      size:        'medium',
      position:    String(cityId)
    },
    {
      id:                 String(stateId),
      type:               'select',
      label:              'State',
      required:           req,
      size:               'medium',
      placeholder:        '\u2014 Select State \u2014',
      position:           String(stateId),
      choices:            _choicesFromMap_(_US_STATES_),
      conditional_logic:  '1',
      conditionals:       showWhenUsa,
      meta:               {ce_region: 'usa_only'}
    },
    {
      id:                 String(provId),
      type:               'select',
      label:              'Province / Territory',
      required:           req,
      size:               'medium',
      placeholder:        '\u2014 Select Province \u2014',
      position:           String(provId),
      choices:            _choicesFromMap_(_CA_PROVINCES_),
      conditional_logic:  '1',
      conditionals:       showWhenCan,
      meta:               {ce_region: 'can_only'}
    },
    {
      id:                 String(zipId),
      type:               'text',
      label:              'ZIP Code',
      required:           req,
      size:               'small',
      placeholder:        'e.g. 90210',
      input_mask:         '99999',
      position:           String(zipId),
      conditional_logic:  '1',
      conditionals:       showWhenUsa,
      meta:               {ce_region: 'usa_only'}
    },
    {
      id:                 String(postalId),
      type:               'text',
      label:              'Postal Code',
      required:           req,
      size:               'small',
      placeholder:        'e.g. M5V 3L9',
      position:           String(postalId),
      conditional_logic:  '1',
      conditionals:       showWhenCan,
      meta:               {ce_region: 'can_only'}
    }
  ];
}

var _US_STATES_ = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  DC:'District of Columbia'
};

var _CA_PROVINCES_ = {
  AB:'Alberta',BC:'British Columbia',MB:'Manitoba',NB:'New Brunswick',
  NL:'Newfoundland and Labrador',NS:'Nova Scotia',NT:'Northwest Territories',
  NU:'Nunavut',ON:'Ontario',PE:'Prince Edward Island',QC:'Quebec',
  SK:'Saskatchewan',YT:'Yukon'
};

function _choicesFromMap_(m) {
  var out = {};
  var keys = Object.keys(m);
  for (var i = 0; i < keys.length; i++) {
    out[String(i + 1)] = {
      label:   m[keys[i]],
      value:   keys[i],
      image:   '',
      icon:    '',
      default: ''
    };
  }
  return out;
}

// ============================================================================
// HEURISTICS — address detection + cookie-cutter neutralization
// ============================================================================

/**
 * Tight address-keyword matcher with exclusion list (avoids matching
 * "Email Address" or "Section: Unit Information").
 * @private
 */
function _isAddressField_(label, desc) {
  var combined = ((label || '') + ' ' + (desc || '')).toLowerCase();

  var EXCLUDES = [
    'email', 'how long', 'age of', 'number of', 'preferred',
    'existing', 'description', 'has the', 'is the', 'section:'
  ];
  for (var e = 0; e < EXCLUDES.length; e++) {
    if (combined.indexOf(EXCLUDES[e]) >= 0) return false;
  }

  var KEYWORDS = [
    'street address', 'mailing address', 'service address',
    'installation address', 'site address', 'ship-to address',
    'shipping address', 'billing address',
    'zip / postal', 'zip/postal', 'zip code', 'postal code',
    'state / province', 'state/province', 'province', 'territory',
    'city'
  ];
  for (var k = 0; k < KEYWORDS.length; k++) {
    if (combined.indexOf(KEYWORDS[k]) >= 0) return true;
  }
  return false;
}

/**
 * Strip dealer-specific phrasing so the template is reusable across CE
 * branches. Maps common dealer/region markers to neutral placeholders.
 * @private
 */
function _neutralizeTitle_(title) {
  if (!title) return title;
  return title
    .replace(/Carrier Enterprise (Canada|USA|US)\b/gi, 'Carrier Enterprise')
    .replace(/\bCE (Canada|USA)\b/gi, 'CE')
    .replace(/\b(Toronto|Markham|Mississauga|Vaughan|Atlanta|Charlotte|Houston|Dallas)\b/gi, '[Branch]')
    .replace(/\s+/g, ' ')
    .trim();
}

function _neutralizeDescription_(desc) {
  if (!desc) return desc;
  return desc
    .replace(/Carrier Enterprise (Canada|USA|US)\b/gi, 'Carrier Enterprise')
    .replace(/\b(Toronto|Markham|Mississauga|Vaughan|Atlanta|Charlotte|Houston|Dallas)\b/gi, '[Branch]')
    .replace(/dealer-?specific|branch-?specific/gi, 'location-neutral')
    .trim();
}

// ============================================================================
// URL / OPTIONS / FORMATTING HELPERS
// ============================================================================

/**
 * Normalize any flavor of Google Form URL to the /viewform variant the
 * fetcher can read without auth.
 * @private
 */
function _normalizeFormUrl_(url) {
  var u = String(url || '').trim();
  // /edit, /edit?usp=..., /prefill, /closedform → /viewform
  u = u.replace(/\/edit[^?#]*/, '/viewform');
  u = u.replace(/\/prefill[^?#]*/, '/viewform');
  u = u.replace(/\/closedform[^?#]*/, '/viewform');
  // If the bare /d/{id} form is given, add /viewform
  if (/\/forms\/d\/[^\/]+\/?$/.test(u)) {
    u = u.replace(/\/?$/, '/viewform');
  }
  return u;
}

function _mergeOptions_(o) {
  o = o || {};
  return {
    formTitle:           o.formTitle           || '',
    formDesc:            o.formDesc            || '',
    injectAddressBlock:  o.injectAddressBlock !== false,
    requireAddress:      o.requireAddress     !== false,
    notificationEmail:   o.notificationEmail   || '{admin_email}',
    confirmationMessage: o.confirmationMessage ||
      '<p>Thank you for contacting CE Tech Support. ' +
      'A representative will follow up with you shortly.</p>',
    neutralTemplate:     o.neutralTemplate    !== false
  };
}

function _formatNowSql_() {
  var d = new Date();
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
         ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function _escHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * sysLog_ may not exist in isolated test contexts — guard the call so this
 * file can be unit-tested locally without the rest of the DANMAN stack.
 * @private
 */
// Browser port: declared unconditionally at IIFE scope. The GAS original
// wrapped this in `if (typeof sysLog_ !== 'function')`, which works in
// sloppy mode but under 'use strict' block-scopes the declaration — the
// call sites then throw "sysLog_ is not defined".
function sysLog_(msg, level) {
  try { console.log('[DMS_GForms ' + (level || 'INFO') + '] ' + msg); } catch (_) {}
}

// END: FormsProcessorV2_202605261200_V001r803.gs

window.DMS_GForms = { convert: convertGoogleFormToWPForms };
})();