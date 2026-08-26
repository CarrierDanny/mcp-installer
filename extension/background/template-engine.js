// background/template-engine.js — Ported verbatim from DANMAN_Macro_Studio v6.7.0
// Bridges to v5 via core/dms-adapters.js (DMS_Config/Logger/WindowBinder).
// background/template-engine.js — DANMAN Macro Studio
// Dynamic code-template generator. Port of the user's
// 01_TemplateGenerator_202412312300_V001r623.gs into pure browser JS.
//
// Public API (attached to self.DMS_TemplateEngine):
//   list()                                      — return available template types
//   generate({ name, type, description, language, options }) — return { code, fileName, lineCount, score, validation }
//   score(code)                                  — quality scoring (7 categories, Danny Protocol)
//   validate(code)                               — structural validation
//
// File: DANMAN_Macro_StudioV001r000

const DMS_TemplateEngine = (function () {

  // -------- Type catalog (mirrors the HTML buttons) --------
  const TYPES = [
    { id: 'api_handler',      label: 'API Handler',       icon: '🔌' },
    { id: 'data_processor',   label: 'Data Processor',    icon: '📊' },
    { id: 'error_recovery',   label: 'Error Recovery',    icon: '🔧' },
    { id: 'ui_component',     label: 'UI Component',      icon: '🎨' },
    { id: 'automation',       label: 'Automation',        icon: '⚡' },
    { id: 'report',           label: 'Report',            icon: '📑' },
    { id: 'integration',      label: 'Integration',       icon: '🔗' },
    { id: 'validation',       label: 'Validation',        icon: '✅' }
  ];

  // -------- Helpers --------
  function tsStamp() {
    const d = new Date();
    return d.getFullYear().toString()
      + String(d.getMonth() + 1).padStart(2, '0')
      + String(d.getDate()).padStart(2, '0')
      + String(d.getHours()).padStart(2, '0')
      + String(d.getMinutes()).padStart(2, '0');
  }

  function ext(language) {
    return ({ gs: 'gs', js: 'js', py: 'py', html: 'html', bat: 'bat', ps1: 'ps1' }[language]) || 'gs';
  }

  function safeName(name) {
    return (name || 'MyScript').replace(/[^A-Za-z0-9_]/g, '');
  }

  function fileNameFor(name, language) {
    return `${safeName(name)}_${tsStamp()}_V001r000.${ext(language)}`;
  }

  function lineCount(code) {
    return code.split('\n').length;
  }

  // -------- Validation (structural lint) --------
  function validate(code) {
    const result = { passed: true, issues: [], warnings: [], stats: {} };
    const lines = code.split('\n');
    result.stats.totalLines   = lines.length;
    result.stats.codeLines    = lines.filter(l => l.trim() && !l.trim().match(/^\s*(\/\/|#|REM|<!--)/i)).length;
    result.stats.commentLines = lines.filter(l => l.trim().match(/^\s*(\/\/|#|REM|<!--|\/\*|\*\s)/i)).length;

    const MAX_LINE = 120;
    lines.forEach((l, i) => {
      if (l.length > MAX_LINE) result.warnings.push({ line: i + 1, message: `Line > ${MAX_LINE} chars` });
    });

    const commentRatio = result.stats.totalLines > 0 ? result.stats.commentLines / result.stats.totalLines : 0;
    if (commentRatio < 0.10) result.warnings.push({ message: `Comment ratio ${(commentRatio * 100).toFixed(1)}% < 10%` });

    if (!code.includes('/**') && !code.includes('"""') && !code.includes('<#')) {
      result.issues.push({ message: 'Missing JSDoc / docstring block' });
      result.passed = false;
    }
    const headPattern = /^\s*(\/\/|#|REM|<!--)/;
    if (!headPattern.test(lines[0] || '')) {
      result.issues.push({ message: 'Missing header comment on line 1' });
      result.passed = false;
    }
    if (!code.includes('END:') && !code.includes('END FILE')) {
      result.issues.push({ message: 'Missing "END:" footer comment' });
      result.passed = false;
    }
    return result;
  }

  // -------- Scoring (Danny Protocol: 7 categories) --------
  function score(code, validation) {
    const v = validation || validate(code);

    // Syntax Integrity (20%)
    const syntax = v.passed ? 20 : (v.issues.length === 1 ? 14 : 10);

    // Logical Flow (20%)
    const hasClasses   = /\bclass\s+\w+/.test(code);
    const hasFunctions = /\bfunction\s+\w+|\bdef\s+\w+|\bfunc\s+\w+/.test(code);
    const logic = (hasClasses ? 10 : 5) + (hasFunctions ? 10 : 5);

    // Error Handling (20%)
    const hasTryCatch   = /\btry\s*[{:]|except\b/.test(code);
    const hasErrorPath  = /(success\s*:\s*false|throw\s+|raise\s+|return\s+.*[Ee]rror)/.test(code);
    const errorHandling = (hasTryCatch ? 12 : 0) + (hasErrorPath ? 8 : 0);

    // Modularity (10%)
    const fnCount = (code.match(/\bfunction\s+\w+|\bdef\s+\w+|=>\s*[\{(]/g) || []).length;
    const modularity = Math.min(10, fnCount * 2);

    // User Accessibility (15%)
    const hasJSDoc  = code.includes('/**') || code.includes('"""');
    const hasParam  = /@param|:param/.test(code);
    const accessibility = (hasJSDoc ? 8 : 0) + (hasParam ? 7 : 0);

    // Optimization (10%)
    const hasConfig    = /\bCONFIG\b|\bconfig\s*=/.test(code);
    const hasBatching  = /batch|throttle|debounce/i.test(code);
    const optimization = (hasConfig ? 6 : 3) + (hasBatching ? 4 : 0);

    // Futureproofing (5%)
    const hasVersion = /@version|V\d{3}r\d{3}/.test(code);
    const futureproofing = hasVersion ? 5 : 0;

    const overall = Math.max(0, Math.min(100, syntax + logic + errorHandling + modularity + accessibility + optimization + futureproofing));

    return {
      overall,
      syntax,
      logic,
      errorHandling,
      modularity,
      accessibility,
      optimization,
      futureproofing,
      stats: v.stats
    };
  }

  // -------- 8 GENERATORS --------

  function genApiHandler(name, language, opts) {
    const fileName = fileNameFor(name, language);
    const UP = safeName(name).toUpperCase();
    const SN = safeName(name);
    const today = new Date().toISOString().split('T')[0];

    if (language === 'py') return _apiHandlerPy(SN, UP, fileName, today, opts);
    if (language === 'ps1') return _apiHandlerPs1(SN, UP, fileName, today, opts);
    return [
      `// ${fileName}`,
      ``,
      `/**`,
      ` * ${SN} - API Handler Module`,
      ` * Handles external API communication with retry, timeout, and structured error reporting.`,
      ` *`,
      ` * @version V001r000`,
      ` * @created ${today}`,
      ` * @author DANMAN System`,
      ` */`,
      ``,
      `// ============================================================================`,
      `// CONFIGURATION`,
      `// ============================================================================`,
      ``,
      `const ${UP}_CONFIG = {`,
      `  BASE_URL: '',`,
      `  TIMEOUT_MS: 30000,`,
      `  MAX_RETRIES: 3,`,
      `  RETRY_DELAY_MS: 1000,`,
      `  HEADERS: {`,
      `    'Content-Type': 'application/json',`,
      `    'Accept': 'application/json'`,
      `  }`,
      `};`,
      ``,
      `// ============================================================================`,
      `// API CLIENT`,
      `// ============================================================================`,
      ``,
      `class ${SN}Client {`,
      `  constructor(apiKey, options = {}) {`,
      `    if (!apiKey) throw new Error('API key is required');`,
      `    this.apiKey   = apiKey;`,
      `    this.baseUrl  = options.baseUrl  || ${UP}_CONFIG.BASE_URL;`,
      `    this.timeout  = options.timeout  || ${UP}_CONFIG.TIMEOUT_MS;`,
      `    this.maxRetries = options.maxRetries || ${UP}_CONFIG.MAX_RETRIES;`,
      `    this.requestLog = [];`,
      `  }`,
      ``,
      `  /**`,
      `   * Make an HTTP request with retry + structured error reporting.`,
      `   * @param {string} endpoint`,
      `   * @param {('GET'|'POST'|'PUT'|'PATCH'|'DELETE')} [method='GET']`,
      `   * @param {Object|null} [data=null]`,
      `   */`,
      `  async request(endpoint, method = 'GET', data = null) {`,
      `    let lastError = null;`,
      `    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {`,
      `      try {`,
      `        const url = this.baseUrl + endpoint;`,
      `        const init = {`,
      `          method,`,
      `          headers: { ...${UP}_CONFIG.HEADERS, Authorization: 'Bearer ' + this.apiKey },`,
      `          signal: AbortSignal.timeout ? AbortSignal.timeout(this.timeout) : undefined`,
      `        };`,
      `        if (data && ['POST', 'PUT', 'PATCH'].includes(method)) init.body = JSON.stringify(data);`,
      ``,
      `        const t0 = Date.now();`,
      `        const res = await fetch(url, init);`,
      `        const dur = Date.now() - t0;`,
      `        this._log(endpoint, method, res.status, dur);`,
      ``,
      `        if (res.ok) {`,
      `          const ct = res.headers.get('content-type') || '';`,
      `          const body = ct.includes('application/json') ? await res.json() : await res.text();`,
      `          return { success: true, data: body, statusCode: res.status, duration: dur };`,
      `        }`,
      `        if (res.status >= 400 && res.status < 500) {`,
      `          return { success: false, error: 'Client Error', statusCode: res.status, body: await res.text() };`,
      `        }`,
      `        lastError = new Error('Server error ' + res.status);`,
      `      } catch (err) {`,
      `        lastError = err;`,
      `        this._log(endpoint, method, 0, 0, err.message);`,
      `      }`,
      `      if (attempt < this.maxRetries) {`,
      `        await new Promise(r => setTimeout(r, ${UP}_CONFIG.RETRY_DELAY_MS * attempt));`,
      `      }`,
      `    }`,
      `    return { success: false, error: lastError ? lastError.message : 'Max retries exceeded', attempts: this.maxRetries };`,
      `  }`,
      ``,
      `  get(endpoint)        { return this.request(endpoint, 'GET'); }`,
      `  post(endpoint, data) { return this.request(endpoint, 'POST', data); }`,
      `  put(endpoint, data)  { return this.request(endpoint, 'PUT', data); }`,
      `  delete(endpoint)     { return this.request(endpoint, 'DELETE'); }`,
      ``,
      `  _log(endpoint, method, status, duration, error) {`,
      `    this.requestLog.push({ ts: new Date().toISOString(), endpoint, method, status, duration, error });`,
      `    if (this.requestLog.length > 200) this.requestLog.splice(0, this.requestLog.length - 200);`,
      `  }`,
      `  getRequestLog()   { return this.requestLog.slice(); }`,
      `  clearRequestLog() { this.requestLog = []; }`,
      `}`,
      ``,
      `// ============================================================================`,
      `// EXPORTS`,
      `// ============================================================================`,
      ``,
      `function create${SN}Client(apiKey, options = {}) {`,
      `  return new ${SN}Client(apiKey, options);`,
      `}`,
      ``,
      `async function test${SN}Connection(apiKey) {`,
      `  const client = create${SN}Client(apiKey);`,
      `  const res = await client.get('/health');`,
      `  return { success: res.success, message: res.success ? 'Connection OK' : 'Connection failed', details: res };`,
      `}`,
      ``,
      `// END: ${fileName}`
    ].join('\n');
  }

  function _apiHandlerPy(SN, UP, fileName, today /*, opts */) {
    return [
      `# ${fileName}`,
      `"""`,
      `${SN} - API Handler Module`,
      `Handles external API communication with retry, timeout, and structured errors.`,
      ``,
      `@version V001r000`,
      `@created ${today}`,
      `@author DANMAN System`,
      `"""`,
      ``,
      `import time`,
      `import logging`,
      `import requests`,
      ``,
      `# ============================================================================`,
      `# CONFIGURATION`,
      `# ============================================================================`,
      ``,
      `${UP}_CONFIG = {`,
      `    "BASE_URL": "",`,
      `    "TIMEOUT_S": 30,`,
      `    "MAX_RETRIES": 3,`,
      `    "RETRY_DELAY_S": 1,`,
      `    "HEADERS": {"Content-Type": "application/json", "Accept": "application/json"},`,
      `}`,
      ``,
      `# ============================================================================`,
      `# API CLIENT`,
      `# ============================================================================`,
      ``,
      `class ${SN}Client:`,
      `    """Thin REST client with retry + structured errors."""`,
      ``,
      `    def __init__(self, api_key, base_url=None, timeout=None, max_retries=None):`,
      `        if not api_key:`,
      `            raise ValueError("api_key is required")`,
      `        self.api_key = api_key`,
      `        self.base_url = base_url or ${UP}_CONFIG["BASE_URL"]`,
      `        self.timeout = timeout or ${UP}_CONFIG["TIMEOUT_S"]`,
      `        self.max_retries = max_retries or ${UP}_CONFIG["MAX_RETRIES"]`,
      `        self.request_log = []`,
      `        self.log = logging.getLogger("${SN}")`,
      ``,
      `    def request(self, endpoint, method="GET", data=None):`,
      `        """:param endpoint: relative URL :param method: HTTP verb :param data: JSON body"""`,
      `        last_error = None`,
      `        for attempt in range(1, self.max_retries + 1):`,
      `            try:`,
      `                url = self.base_url + endpoint`,
      `                headers = dict(${UP}_CONFIG["HEADERS"])`,
      `                headers["Authorization"] = "Bearer " + self.api_key`,
      `                t0 = time.time()`,
      `                resp = requests.request(method, url, headers=headers, json=data, timeout=self.timeout)`,
      `                dur = int((time.time() - t0) * 1000)`,
      `                self._log(endpoint, method, resp.status_code, dur)`,
      `                if 200 <= resp.status_code < 300:`,
      `                    body = resp.json() if "application/json" in resp.headers.get("content-type", "") else resp.text`,
      `                    return {"success": True, "data": body, "status": resp.status_code, "duration_ms": dur}`,
      `                if 400 <= resp.status_code < 500:`,
      `                    return {"success": False, "error": "Client Error", "status": resp.status_code, "body": resp.text}`,
      `                last_error = Exception(f"Server error {resp.status_code}")`,
      `            except Exception as e:`,
      `                last_error = e`,
      `                self._log(endpoint, method, 0, 0, str(e))`,
      `            if attempt < self.max_retries:`,
      `                time.sleep(${UP}_CONFIG["RETRY_DELAY_S"] * attempt)`,
      `        return {"success": False, "error": str(last_error) if last_error else "max retries", "attempts": self.max_retries}`,
      ``,
      `    def get(self, ep):           return self.request(ep, "GET")`,
      `    def post(self, ep, data):    return self.request(ep, "POST", data)`,
      `    def put(self, ep, data):     return self.request(ep, "PUT", data)`,
      `    def delete(self, ep):        return self.request(ep, "DELETE")`,
      ``,
      `    def _log(self, endpoint, method, status, duration, error=None):`,
      `        self.request_log.append({`,
      `            "endpoint": endpoint, "method": method, "status": status,`,
      `            "duration_ms": duration, "error": error,`,
      `        })`,
      `        self.request_log = self.request_log[-200:]`,
      ``,
      ``,
      `def create_${SN.toLowerCase()}_client(api_key, **kw):`,
      `    """Factory."""`,
      `    return ${SN}Client(api_key, **kw)`,
      ``,
      `# END: ${fileName}`
    ].join('\n');
  }

  function _apiHandlerPs1(SN, UP, fileName, today /*, opts */) {
    return [
      `# ${fileName}`,
      `<#`,
      `.SYNOPSIS`,
      `  ${SN} - API Handler Module`,
      `.DESCRIPTION`,
      `  Handles external API communication with retry, timeout, and structured errors.`,
      `.NOTES`,
      `  @version V001r000`,
      `  @created ${today}`,
      `  @author DANMAN System`,
      `#>`,
      ``,
      `$Script:${UP}_CONFIG = @{`,
      `  BASE_URL      = ''`,
      `  TIMEOUT_S     = 30`,
      `  MAX_RETRIES   = 3`,
      `  RETRY_DELAY_S = 1`,
      `  HEADERS       = @{ 'Content-Type'='application/json'; 'Accept'='application/json' }`,
      `}`,
      ``,
      `function Invoke-${SN}Request {`,
      `  [CmdletBinding()]`,
      `  param(`,
      `    [Parameter(Mandatory)] [string] $ApiKey,`,
      `    [Parameter(Mandatory)] [string] $Endpoint,`,
      `    [ValidateSet('GET','POST','PUT','PATCH','DELETE')] [string] $Method = 'GET',`,
      `    $Body = $null`,
      `  )`,
      `  $LastError = $null`,
      `  for ($attempt = 1; $attempt -le $Script:${UP}_CONFIG.MAX_RETRIES; $attempt++) {`,
      `    try {`,
      `      $url = $Script:${UP}_CONFIG.BASE_URL + $Endpoint`,
      `      $headers = $Script:${UP}_CONFIG.HEADERS.Clone()`,
      `      $headers['Authorization'] = 'Bearer ' + $ApiKey`,
      `      $params = @{ Uri=$url; Method=$Method; Headers=$headers; TimeoutSec=$Script:${UP}_CONFIG.TIMEOUT_S }`,
      `      if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 6); $params.ContentType='application/json' }`,
      `      $t0 = Get-Date`,
      `      $res = Invoke-RestMethod @params -ErrorAction Stop`,
      `      $dur = ((Get-Date) - $t0).TotalMilliseconds`,
      `      return [pscustomobject]@{ success=$true; data=$res; duration_ms=$dur }`,
      `    } catch {`,
      `      $LastError = $_`,
      `      if ($attempt -lt $Script:${UP}_CONFIG.MAX_RETRIES) { Start-Sleep -Seconds ($Script:${UP}_CONFIG.RETRY_DELAY_S * $attempt) }`,
      `    }`,
      `  }`,
      `  return [pscustomobject]@{ success=$false; error=$LastError.Exception.Message; attempts=$Script:${UP}_CONFIG.MAX_RETRIES }`,
      `}`,
      ``,
      `# END: ${fileName}`
    ].join('\n');
  }

  function genDataProcessor(name, language, opts) {
    const fileName = fileNameFor(name, language);
    const UP = safeName(name).toUpperCase();
    const SN = safeName(name);
    const today = new Date().toISOString().split('T')[0];
    return [
      `// ${fileName}`,
      ``,
      `/**`,
      ` * ${SN} - Data Processor Module`,
      ` * Batch-aware data transformation + validation + format conversion.`,
      ` *`,
      ` * @version V001r000`,
      ` * @created ${today}`,
      ` * @author DANMAN System`,
      ` */`,
      ``,
      `const ${UP}_CONFIG = {`,
      `  BATCH_SIZE: 100,`,
      `  MAX_ROWS: 50000,`,
      `  TIMEOUT_MS: 300000,`,
      `  SUPPORTED_FORMATS: ['json', 'csv', 'array']`,
      `};`,
      ``,
      `class ${SN}Processor {`,
      `  constructor(options = {}) {`,
      `    this.batchSize = options.batchSize || ${UP}_CONFIG.BATCH_SIZE;`,
      `    this.processedCount = 0;`,
      `    this.errorCount = 0;`,
      `    this.errors = [];`,
      `    this.startTime = null;`,
      `  }`,
      ``,
      `  /** @param {Array} data @param {Function} transformer @returns {Object} */`,
      `  process(data, transformer, options = {}) {`,
      `    if (!Array.isArray(data)) return { success: false, error: 'Input must be an array' };`,
      `    if (data.length > ${UP}_CONFIG.MAX_ROWS) return { success: false, error: 'Exceeds MAX_ROWS' };`,
      `    this.startTime = Date.now(); this.processedCount = 0; this.errorCount = 0; this.errors = [];`,
      `    const results = [];`,
      `    const batches = this._batches(data);`,
      `    for (let bi = 0; bi < batches.length; bi++) {`,
      `      for (let i = 0; i < batches[bi].length; i++) {`,
      `        const idx = bi * this.batchSize + i;`,
      `        try { results.push(transformer(batches[bi][i], idx)); this.processedCount++; }`,
      `        catch (err) { this.errorCount++; this.errors.push({ index: idx, error: err.message, data: batches[bi][i] }); }`,
      `      }`,
      `      if (options.onProgress) options.onProgress({ batch: bi + 1, totalBatches: batches.length, processed: this.processedCount, errors: this.errorCount });`,
      `    }`,
      `    return { success: true, results, stats: { total: this.processedCount, errors: this.errorCount, durationMs: Date.now() - this.startTime, errorList: this.errors } };`,
      `  }`,
      ``,
      `  _batches(data) {`,
      `    const out = [];`,
      `    for (let i = 0; i < data.length; i += this.batchSize) out.push(data.slice(i, i + this.batchSize));`,
      `    return out;`,
      `  }`,
      ``,
      `  /** @param {Array} data @param {Object} schema */`,
      `  validate(data, schema) {`,
      `    const errors = [], ok = [];`,
      `    data.forEach((item, idx) => {`,
      `      const itemErrors = this._validateItem(item, schema, idx);`,
      `      if (itemErrors.length) errors.push(...itemErrors); else ok.push(item);`,
      `    });`,
      `    return { valid: errors.length === 0, validated: ok, errors, stats: { total: data.length, valid: ok.length, invalid: errors.length } };`,
      `  }`,
      ``,
      `  _validateItem(item, schema, idx) {`,
      `    const errs = [];`,
      `    for (const [field, rules] of Object.entries(schema)) {`,
      `      const v = item[field];`,
      `      if (rules.required && (v === undefined || v === null || v === '')) {`,
      `        errs.push({ index: idx, field, error: 'required' }); continue;`,
      `      }`,
      `      if (v == null) continue;`,
      `      if (rules.type && typeof v !== rules.type) errs.push({ index: idx, field, error: 'type ' + rules.type });`,
      `      if (rules.pattern && !rules.pattern.test(String(v))) errs.push({ index: idx, field, error: 'pattern' });`,
      `      if (rules.min != null && v < rules.min) errs.push({ index: idx, field, error: 'min ' + rules.min });`,
      `      if (rules.max != null && v > rules.max) errs.push({ index: idx, field, error: 'max ' + rules.max });`,
      `    }`,
      `    return errs;`,
      `  }`,
      ``,
      `  /** Convert between csv / json / array. */`,
      `  transform(data, fromFormat, toFormat) {`,
      `    let n = data;`,
      `    if (fromFormat === 'csv')  n = this._parseCsv(String(data));`,
      `    if (fromFormat === 'json') n = typeof data === 'string' ? JSON.parse(data) : data;`,
      `    if (toFormat   === 'csv')  return this._toCsv(n);`,
      `    if (toFormat   === 'json') return JSON.stringify(n, null, 2);`,
      `    return n;`,
      `  }`,
      ``,
      `  _parseCsv(csv) {`,
      `    const lines = csv.split(/\\r?\\n/).filter(l => l.trim());`,
      `    if (!lines.length) return [];`,
      `    const headers = lines[0].split(',').map(h => h.trim());`,
      `    return lines.slice(1).map(l => {`,
      `      const cells = l.split(',');`,
      `      const obj = {}; headers.forEach((h, i) => obj[h] = (cells[i] || '').trim()); return obj;`,
      `    });`,
      `  }`,
      `  _toCsv(rows) {`,
      `    if (!rows.length) return '';`,
      `    const headers = Object.keys(rows[0]);`,
      `    const esc = v => { const s = String(v == null ? '' : v); return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };`,
      `    return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\\n');`,
      `  }`,
      `}`,
      ``,
      `function create${SN}Processor(opts = {}) { return new ${SN}Processor(opts); }`,
      `function process${SN}Data(data, transformer) { return create${SN}Processor().process(data, transformer); }`,
      `function validate${SN}Data(data, schema)     { return create${SN}Processor().validate(data, schema); }`,
      ``,
      `// END: ${fileName}`
    ].join('\n');
  }

  function genErrorRecovery(name, language) {
    const fileName = fileNameFor(name, language);
    const UP = safeName(name).toUpperCase();
    const SN = safeName(name);
    const today = new Date().toISOString().split('T')[0];
    return [
      `// ${fileName}`,
      ``,
      `/**`,
      ` * ${SN} - Error Recovery Module`,
      ` * Multi-strategy error handling: retry / fallback / cache / queue / notify / escalate.`,
      ` *`,
      ` * @version V001r000`,
      ` * @created ${today}`,
      ` * @author DANMAN System`,
      ` */`,
      ``,
      `const ${UP}_CONFIG = {`,
      `  MAX_RETRIES: 3,`,
      `  RETRY_DELAYS_MS: [1000, 2000, 5000],`,
      `  STRATEGIES: ['retry', 'fallback', 'cache', 'queue', 'notify', 'escalate']`,
      `};`,
      ``,
      `class ${SN}ErrorRecovery {`,
      `  constructor(options = {}) {`,
      `    this.maxRetries = options.maxRetries || ${UP}_CONFIG.MAX_RETRIES;`,
      `    this.cache = new Map();`,
      `    this.queue = [];`,
      `    this.errorLog = [];`,
      `    this.stats = { attempted: 0, successful: 0, failed: 0 };`,
      `  }`,
      ``,
      `  /** Wrap fn so that calls retry / fall back / cache automatically. */`,
      `  wrap(fn, options = {}) {`,
      `    const self = this;`,
      `    return async function (...args) {`,
      `      return self.execute(() => fn.apply(this, args), options);`,
      `    };`,
      `  }`,
      ``,
      `  async execute(fn, options = {}) {`,
      `    try { return await fn(); }`,
      `    catch (err) {`,
      `      this._logError(err, options.context);`,
      `      return this._recover(fn, err, options.strategy || 'retry', options);`,
      `    }`,
      `  }`,
      ``,
      `  async _recover(fn, err, strategy, options) {`,
      `    this.stats.attempted++;`,
      `    switch (strategy) {`,
      `      case 'retry':     return this._retry(fn, options);`,
      `      case 'fallback':  this.stats.successful++; return options.fallback != null ? options.fallback : null;`,
      `      case 'cache':     return this._cache(options);`,
      `      case 'queue':     this.queue.push({ ts: Date.now(), options }); this.stats.successful++; return { queued: true, queueSize: this.queue.length };`,
      `      case 'notify':    this.stats.successful++; return { notified: true, error: err.message };`,
      `      case 'escalate':  this.stats.failed++; return { escalated: true, error: err.message, context: options.context };`,
      `      default: this.stats.failed++; throw err;`,
      `    }`,
      `  }`,
      ``,
      `  async _retry(fn, options) {`,
      `    const delays = options.delays || ${UP}_CONFIG.RETRY_DELAYS_MS;`,
      `    for (let i = 0; i < this.maxRetries; i++) {`,
      `      await new Promise(r => setTimeout(r, delays[i] || delays[delays.length - 1]));`,
      `      try { const v = await fn(); this.stats.successful++; return v; }`,
      `      catch (err) { if (i === this.maxRetries - 1) { this.stats.failed++; throw err; } }`,
      `    }`,
      `  }`,
      ``,
      `  _cache(options) {`,
      `    if (options.cacheKey && this.cache.has(options.cacheKey)) {`,
      `      this.stats.successful++; return this.cache.get(options.cacheKey);`,
      `    }`,
      `    this.stats.failed++; return options.fallback != null ? options.fallback : null;`,
      `  }`,
      ``,
      `  _logError(err, context) {`,
      `    this.errorLog.push({ ts: new Date().toISOString(), message: err.message, stack: err.stack, context });`,
      `    if (this.errorLog.length > 500) this.errorLog.splice(0, this.errorLog.length - 500);`,
      `  }`,
      ``,
      `  getErrorLog() { return this.errorLog.slice(); }`,
      `  getStats()    {`,
      `    return Object.assign({}, this.stats, {`,
      `      successRate: this.stats.attempted ? (this.stats.successful / this.stats.attempted * 100).toFixed(2) + '%' : 'N/A'`,
      `    });`,
      `  }`,
      `}`,
      ``,
      `function create${SN}Recovery(opts = {}) { return new ${SN}ErrorRecovery(opts); }`,
      `function executeWith${SN}Recovery(fn, opts = {}) { return create${SN}Recovery().execute(fn, opts); }`,
      ``,
      `// END: ${fileName}`
    ].join('\n');
  }

  function genUiComponent(name, language) {
    const fileName = fileNameFor(name, language);
    const SN = safeName(name);
    const today = new Date().toISOString().split('T')[0];
    if (language === 'py')  return _uiComponentPy(SN, fileName, today);
    if (language === 'ps1') return _uiComponentPs1(SN, fileName, today);
    if (language === 'html') {
      return [
        `<!-- ${fileName} -->`,
        `<!--`,
        ` * ${SN} - UI Component`,
        ` * @version V001r000`,
        ` * @created ${today}`,
        `-->`,
        ``,
        `<div class="${SN.toLowerCase()}-component" role="region" aria-label="${SN}">`,
        `  <header class="${SN.toLowerCase()}-header">`,
        `    <h2>${SN}</h2>`,
        `  </header>`,
        `  <main class="${SN.toLowerCase()}-body">`,
        `    <p>Replace this with your content.</p>`,
        `  </main>`,
        `  <footer class="${SN.toLowerCase()}-footer">`,
        `    <button class="${SN.toLowerCase()}-btn primary" data-action="primary">Primary</button>`,
        `    <button class="${SN.toLowerCase()}-btn ghost"   data-action="ghost">Cancel</button>`,
        `  </footer>`,
        `</div>`,
        ``,
        `<style>`,
        `.${SN.toLowerCase()}-component {`,
        `  background: #1e293b; color: #e2e8f0;`,
        `  border: 1px solid #334155; border-radius: 12px;`,
        `  padding: 20px; font-family: system-ui, sans-serif;`,
        `}`,
        `.${SN.toLowerCase()}-header h2 { font-size: 18px; color: #22d3ee; margin-bottom: 12px; }`,
        `.${SN.toLowerCase()}-body  p   { color: #94a3b8; margin: 8px 0; }`,
        `.${SN.toLowerCase()}-btn { padding: 8px 14px; border-radius: 6px; border: 1px solid #334155; cursor: pointer; }`,
        `.${SN.toLowerCase()}-btn.primary { background: #22d3ee; color: #0b1220; font-weight: 600; }`,
        `.${SN.toLowerCase()}-btn.ghost   { background: transparent; color: #e2e8f0; }`,
        `</style>`,
        ``,
        `<script>`,
        `(function () {`,
        `  document.querySelectorAll('.${SN.toLowerCase()}-component [data-action]').forEach(btn => {`,
        `    btn.addEventListener('click', () => {`,
        `      console.log('[${SN}] action=' + btn.dataset.action);`,
        `      btn.dispatchEvent(new CustomEvent('${SN.toLowerCase()}:action', { bubbles: true, detail: { action: btn.dataset.action } }));`,
        `    });`,
        `  });`,
        `})();`,
        `</script>`,
        ``,
        `<!-- END: ${fileName} -->`
      ].join('\n');
    }
    return [
      `// ${fileName}`,
      ``,
      `/**`,
      ` * ${SN} - UI Component`,
      ` * Reusable view component with event hooks and lifecycle methods.`,
      ` *`,
      ` * @version V001r000`,
      ` * @created ${today}`,
      ` * @author DANMAN System`,
      ` */`,
      ``,
      `class ${SN}Component {`,
      `  constructor(host, props = {}) {`,
      `    this.host  = typeof host === 'string' ? document.querySelector(host) : host;`,
      `    this.props = props;`,
      `    this.state = Object.assign({ value: '' }, props.initialState || {});`,
      `    this._listeners = [];`,
      `    this.mounted = false;`,
      `  }`,
      ``,
      `  /** Render markup once and wire events. */`,
      `  mount() {`,
      `    if (!this.host) throw new Error('${SN}Component: host element not found');`,
      `    this.host.innerHTML = this._template();`,
      `    this._wire();`,
      `    this.mounted = true;`,
      `    this._emit('mount');`,
      `    return this;`,
      `  }`,
      ``,
      `  /** Replace state and re-render. */`,
      `  setState(patch) {`,
      `    this.state = Object.assign({}, this.state, patch);`,
      `    if (this.mounted) {`,
      `      this.host.innerHTML = this._template();`,
      `      this._wire();`,
      `      this._emit('change', this.state);`,
      `    }`,
      `    return this;`,
      `  }`,
      ``,
      `  unmount() {`,
      `    this._listeners.forEach(([el, evt, fn]) => el.removeEventListener(evt, fn));`,
      `    this._listeners = [];`,
      `    if (this.host) this.host.innerHTML = '';`,
      `    this.mounted = false;`,
      `    this._emit('unmount');`,
      `  }`,
      ``,
      `  on(event, fn) { this.host.addEventListener('${SN.toLowerCase()}:' + event, fn); return this; }`,
      ``,
      `  _emit(event, detail) {`,
      `    this.host.dispatchEvent(new CustomEvent('${SN.toLowerCase()}:' + event, { bubbles: true, detail }));`,
      `  }`,
      ``,
      `  _template() {`,
      `    return ''`,
      `      + '<div class="${SN.toLowerCase()}">'`,
      `      + '  <h3>' + (this.props.title || '${SN}') + '</h3>'`,
      `      + '  <input data-role="input" value="' + (this.state.value || '') + '">'`,
      `      + '  <button data-role="submit">Go</button>'`,
      `      + '</div>';`,
      `  }`,
      ``,
      `  _wire() {`,
      `    const inp = this.host.querySelector('[data-role="input"]');`,
      `    const btn = this.host.querySelector('[data-role="submit"]');`,
      `    if (inp) {`,
      `      const fn = (e) => this.setState({ value: e.target.value });`,
      `      inp.addEventListener('input', fn);`,
      `      this._listeners.push([inp, 'input', fn]);`,
      `    }`,
      `    if (btn) {`,
      `      const fn = () => this._emit('submit', this.state);`,
      `      btn.addEventListener('click', fn);`,
      `      this._listeners.push([btn, 'click', fn]);`,
      `    }`,
      `  }`,
      `}`,
      ``,
      `function create${SN}Component(host, props = {}) { return new ${SN}Component(host, props); }`,
      ``,
      `// END: ${fileName}`
    ].join('\n');
  }

  function _uiComponentPy(SN, fileName, today) {
    return [
      `# ${fileName}`,
      `"""`,
      `${SN} - UI Component (Python / tkinter).`,
      ``,
      `Reusable view component with state, event hooks, lifecycle methods, and`,
      `accessible markup. Designed for tkinter but renders a headless dict when`,
      `tkinter is unavailable, so the same class is usable in test harnesses.`,
      ``,
      `:version: V001r000`,
      `:created: ${today}`,
      `:author: DANMAN System`,
      `"""`,
      ``,
      `from __future__ import annotations`,
      ``,
      `import logging`,
      `from dataclasses import dataclass, field`,
      `from typing import Any, Callable, Dict, List, Optional`,
      ``,
      `try:`,
      `    import tkinter as tk`,
      `    from tkinter import ttk`,
      `    _HAS_TK = True`,
      `except Exception:  # tkinter missing in headless / minimal envs`,
      `    tk = None  # type: ignore[assignment]`,
      `    ttk = None  # type: ignore[assignment]`,
      `    _HAS_TK = False`,
      ``,
      `logger = logging.getLogger("${SN}")`,
      ``,
      `# ============================================================================`,
      `# CONFIGURATION`,
      `# ============================================================================`,
      ``,
      `${SN.toUpperCase()}_CONFIG: Dict[str, Any] = {`,
      `    "VERSION": "V001r000",`,
      `    "DEBOUNCE_MS": 150,        # debounce input events to batch state changes`,
      `    "THROTTLE_RENDER_MS": 33,  # cap re-render rate (~30 FPS)`,
      `    "AUTO_FOCUS": True,`,
      `    "ARIA_ROLE": "region",`,
      `}`,
      ``,
      `# ============================================================================`,
      `# STATE`,
      `# ============================================================================`,
      ``,
      `@dataclass`,
      `class ${SN}State:`,
      `    """Plain dataclass holding component state.`,
      ``,
      `    :param value: current input value`,
      `    :param disabled: when True, all interactive elements are disabled`,
      `    :param errors: list of validation error messages`,
      `    """`,
      `    value: str = ""`,
      `    disabled: bool = False`,
      `    errors: List[str] = field(default_factory=list)`,
      ``,
      `# ============================================================================`,
      `# COMPONENT`,
      `# ============================================================================`,
      ``,
      `class ${SN}Component:`,
      `    """Reusable ${SN} UI component with mount/setState/unmount lifecycle.`,
      ``,
      `    :param host: parent tk widget (or None for headless mode)`,
      `    :param title: component heading`,
      `    :param initial_state: optional starting :class:\`${SN}State\``,
      `    :param on_submit: callback invoked when user submits`,
      `    """`,
      ``,
      `    def __init__(`,
      `        self,`,
      `        host: Optional[Any] = None,`,
      `        title: str = "${SN}",`,
      `        initial_state: Optional[${SN}State] = None,`,
      `        on_submit: Optional[Callable[[${SN}State], None]] = None,`,
      `    ) -> None:`,
      `        self.host = host`,
      `        self.title = title`,
      `        self.state: ${SN}State = initial_state or ${SN}State()`,
      `        self.on_submit = on_submit`,
      `        self._listeners: List[Callable[[str, Any], None]] = []`,
      `        self._widgets: Dict[str, Any] = {}`,
      `        self.mounted: bool = False`,
      ``,
      `    # -- lifecycle ---------------------------------------------------------`,
      ``,
      `    def mount(self) -> "${SN}Component":`,
      `        """Build widgets, wire events, and emit \`\`mount\`\` event.`,
      ``,
      `        :returns: self, for chaining`,
      `        :raises RuntimeError: when host is None and tkinter is available`,
      `        """`,
      `        try:`,
      `            if _HAS_TK and self.host is None:`,
      `                raise RuntimeError("${SN}Component: host is required when tkinter is available")`,
      `            if _HAS_TK:`,
      `                self._build_tk()`,
      `            self.mounted = True`,
      `            self._emit("mount", self.state)`,
      `            return self`,
      `        except Exception as err:`,
      `            logger.exception("${SN}Component.mount failed: %s", err)`,
      `            raise`,
      ``,
      `    def set_state(self, **patch: Any) -> "${SN}Component":`,
      `        """Merge \`\`patch\`\` into current state and re-render.`,
      ``,
      `        :param patch: keyword fields to update on :class:\`${SN}State\``,
      `        :returns: self, for chaining`,
      `        """`,
      `        try:`,
      `            for key, val in patch.items():`,
      `                if hasattr(self.state, key):`,
      `                    setattr(self.state, key, val)`,
      `            if self.mounted and _HAS_TK:`,
      `                self._render_tk()`,
      `            self._emit("change", self.state)`,
      `            return self`,
      `        except Exception as err:`,
      `            logger.exception("set_state(%s) failed: %s", patch, err)`,
      `            raise`,
      ``,
      `    def unmount(self) -> None:`,
      `        """Tear down widgets and clear listeners."""`,
      `        try:`,
      `            for w in self._widgets.values():`,
      `                if hasattr(w, "destroy"):`,
      `                    w.destroy()`,
      `            self._widgets.clear()`,
      `            self._listeners.clear()`,
      `            self.mounted = False`,
      `            self._emit("unmount", None)`,
      `        except Exception as err:  # pragma: no cover - cleanup must not raise`,
      `            logger.warning("unmount: %s", err)`,
      ``,
      `    # -- events ------------------------------------------------------------`,
      ``,
      `    def on(self, callback: Callable[[str, Any], None]) -> "${SN}Component":`,
      `        """Register an event listener.`,
      ``,
      `        :param callback: receives (event_name, detail)`,
      `        :returns: self`,
      `        """`,
      `        self._listeners.append(callback)`,
      `        return self`,
      ``,
      `    def _emit(self, event: str, detail: Any) -> None:`,
      `        for cb in list(self._listeners):`,
      `            try:`,
      `                cb(event, detail)`,
      `            except Exception as err:  # never let a listener kill the component`,
      `                logger.error("listener for '%s' failed: %s", event, err)`,
      ``,
      `    # -- tk plumbing -------------------------------------------------------`,
      ``,
      `    def _build_tk(self) -> None:`,
      `        frame = ttk.Frame(self.host, padding=12)`,
      `        frame.grid(row=0, column=0, sticky="nsew")`,
      `        self._widgets["frame"] = frame`,
      ``,
      `        ttk.Label(frame, text=self.title, font=("Segoe UI", 12, "bold")).grid(row=0, column=0, columnspan=2, sticky="w")`,
      `        entry = ttk.Entry(frame, width=32)`,
      `        entry.grid(row=1, column=0, columnspan=2, pady=(8, 4), sticky="we")`,
      `        entry.insert(0, self.state.value)`,
      `        entry.bind("<KeyRelease>", lambda _e: self.set_state(value=entry.get()))`,
      `        self._widgets["entry"] = entry`,
      ``,
      `        submit = ttk.Button(frame, text="Submit", command=self._handle_submit)`,
      `        submit.grid(row=2, column=0, pady=(8, 0), sticky="w")`,
      `        self._widgets["submit"] = submit`,
      ``,
      `        if ${SN.toUpperCase()}_CONFIG["AUTO_FOCUS"]:`,
      `            entry.focus_set()`,
      ``,
      `    def _render_tk(self) -> None:`,
      `        entry = self._widgets.get("entry")`,
      `        submit = self._widgets.get("submit")`,
      `        if entry is not None and entry.get() != self.state.value:`,
      `            entry.delete(0, tk.END if _HAS_TK else 0)`,
      `            entry.insert(0, self.state.value)`,
      `        if submit is not None:`,
      `            submit.state(["disabled"] if self.state.disabled else ["!disabled"])`,
      ``,
      `    def _handle_submit(self) -> None:`,
      `        try:`,
      `            self._emit("submit", self.state)`,
      `            if self.on_submit is not None:`,
      `                self.on_submit(self.state)`,
      `        except Exception as err:`,
      `            logger.exception("submit handler failed: %s", err)`,
      `            raise`,
      ``,
      `# ============================================================================`,
      `# FACTORY`,
      `# ============================================================================`,
      ``,
      `def create_${SN.toLowerCase()}_component(`,
      `    host: Optional[Any] = None,`,
      `    **kwargs: Any,`,
      `) -> ${SN}Component:`,
      `    """Convenience factory mirroring \`\`new ${SN}Component(host, props)\`\` from the JS variant.`,
      ``,
      `    :param host: tk parent widget or None`,
      `    :param kwargs: forwarded to :class:\`${SN}Component\``,
      `    :returns: a mounted component when a host is provided, else an unmounted one`,
      `    """`,
      `    comp = ${SN}Component(host=host, **kwargs)`,
      `    if host is not None and _HAS_TK:`,
      `        comp.mount()`,
      `    return comp`,
      ``,
      `# END: ${fileName}`
    ].join('\n');
  }

  function _uiComponentPs1(SN, fileName, today) {
    return [
      `# ${fileName}`,
      `<#`,
      `.SYNOPSIS`,
      `  ${SN} - WinForms UI Component scaffolding.`,
      `.DESCRIPTION`,
      `  Reusable component with state, lifecycle methods, and event hooks.`,
      `  Falls back to a stub object when System.Windows.Forms is unavailable.`,
      `.NOTES`,
      `  @version V001r000`,
      `  @created ${today}`,
      `  @author DANMAN System`,
      `#>`,
      ``,
      `Set-StrictMode -Version Latest`,
      `$ErrorActionPreference = 'Stop'`,
      ``,
      `$${SN}_CONFIG = @{`,
      `    Version       = 'V001r000'`,
      `    DebounceMs    = 150`,
      `    ThrottleMs    = 33`,
      `    AutoFocus     = $true`,
      `}`,
      ``,
      `function New-${SN}State {`,
      `    <# .PARAMETER Value Initial input value.`,
      `       .PARAMETER Disabled Whether interactive elements start disabled. #>`,
      `    param([string]$Value = '', [bool]$Disabled = $false)`,
      `    return [pscustomobject]@{ Value = $Value; Disabled = $Disabled; Errors = @() }`,
      `}`,
      ``,
      `function New-${SN}Component {`,
      `    <# .PARAMETER Title Component heading.`,
      `       .PARAMETER InitialState Optional starting state object. #>`,
      `    param([string]$Title = '${SN}', [object]$InitialState = (New-${SN}State))`,
      `    $self = [pscustomobject]@{`,
      `        Title     = $Title`,
      `        State     = $InitialState`,
      `        Mounted   = $false`,
      `        Listeners = @()`,
      `        Widgets   = @{}`,
      `    }`,
      `    return $self`,
      `}`,
      ``,
      `function Mount-${SN}Component {`,
      `    <# .PARAMETER Component A component object from New-${SN}Component. #>`,
      `    param([Parameter(Mandatory)] [object]$Component)`,
      `    try {`,
      `        $Component.Mounted = $true`,
      `        return $Component`,
      `    } catch {`,
      `        Write-Error ("${SN}.Mount failed: " + $_.Exception.Message)`,
      `        throw`,
      `    }`,
      `}`,
      ``,
      `function Set-${SN}State {`,
      `    <# .PARAMETER Component The component returned from New-${SN}Component.`,
      `       .PARAMETER Patch Hashtable of field overrides. #>`,
      `    param([object]$Component, [hashtable]$Patch)`,
      `    foreach ($k in $Patch.Keys) { $Component.State.$k = $Patch[$k] }`,
      `    return $Component`,
      `}`,
      ``,
      `# END: ${fileName}`
    ].join('\n');
  }

  function genGeneric(name, language, title, summary) {
    const fileName = fileNameFor(name, language);
    const UP = safeName(name).toUpperCase();
    const SN = safeName(name);
    const today = new Date().toISOString().split('T')[0];
    return [
      `// ${fileName}`,
      ``,
      `/**`,
      ` * ${SN} - ${title}`,
      ` * ${summary}`,
      ` *`,
      ` * @version V001r000`,
      ` * @created ${today}`,
      ` * @author DANMAN System`,
      ` */`,
      ``,
      `const ${UP}_CONFIG = {`,
      `  VERSION: 'V001r000',`,
      `  ENABLED: true,`,
      `  DEBUG: false`,
      `};`,
      ``,
      `class ${SN}Handler {`,
      `  constructor(options = {}) {`,
      `    this.options = Object.assign({}, ${UP}_CONFIG, options);`,
      `    this.initialized = false;`,
      `  }`,
      ``,
      `  /** @returns {boolean} */`,
      `  initialize() {`,
      `    try { this.initialized = true; return true; }`,
      `    catch (err) { console.error('[${SN}] init failed: ' + err.message); return false; }`,
      `  }`,
      ``,
      `  /** @param {*} input @returns {Object} */`,
      `  async process(input) {`,
      `    if (!this.initialized) this.initialize();`,
      `    try {`,
      `      // ----- main logic -----`,
      `      const output = input;`,
      `      // ----------------------`,
      `      return { success: true, data: output, timestamp: new Date().toISOString() };`,
      `    } catch (err) {`,
      `      return { success: false, error: err.message };`,
      `    }`,
      `  }`,
      ``,
      `  cleanup() { this.initialized = false; }`,
      `}`,
      ``,
      `function create${SN}Handler(options = {}) { return new ${SN}Handler(options); }`,
      `async function process${SN}(input) { return create${SN}Handler().process(input); }`,
      ``,
      `// END: ${fileName}`
    ].join('\n');
  }

  // -------- Tests block (appended when opts.tests) --------
  function appendTests(code, name, language) {
    if (language !== 'gs' && language !== 'js') return code;
    const SN = safeName(name);
    const block = [
      ``,
      `// ============================================================================`,
      `// TESTS`,
      `// ============================================================================`,
      ``,
      `function test_${SN}_smoke() {`,
      `  const out = [];`,
      `  try {`,
      `    if (typeof create${SN}Handler === 'function') {`,
      `      const h = create${SN}Handler();`,
      `      const r = h.process({ probe: true });`,
      `      out.push({ test: 'create+process', pass: r && typeof r.success !== 'undefined' });`,
      `    } else if (typeof create${SN}Client === 'function') {`,
      `      out.push({ test: 'factory_exists', pass: true });`,
      `    } else if (typeof create${SN}Processor === 'function') {`,
      `      const p = create${SN}Processor();`,
      `      const r = p.process([1, 2, 3], x => x * 2);`,
      `      out.push({ test: 'process_array', pass: r.success && r.results.length === 3 });`,
      `    } else {`,
      `      out.push({ test: 'no_factory_found', pass: false });`,
      `    }`,
      `    return { suite: '${SN}', results: out, pass: out.every(t => t.pass) };`,
      `  } catch (e) { return { suite: '${SN}', error: e.message, pass: false }; }`,
      `}`
    ].join('\n');
    return code.replace(/(\n\/\/ END:)/, block + '$1');
  }

  // -------- Public generate() --------
  function generate(req) {
    const name        = (req && req.name) || 'MyScript';
    const type        = (req && req.type) || 'api_handler';
    const language    = (req && req.language) || 'gs';
    const description = (req && req.description) || '';
    const options     = (req && req.options) || {};

    let code;
    switch (type) {
      case 'api_handler':     code = genApiHandler(name, language, options); break;
      case 'data_processor':  code = genDataProcessor(name, language, options); break;
      case 'error_recovery':  code = genErrorRecovery(name, language); break;
      case 'ui_component':    code = genUiComponent(name, language); break;
      case 'automation':      code = genGeneric(name, language, 'Automation Script', description || 'Automated workflow processing'); break;
      case 'report':          code = genGeneric(name, language, 'Report Generator',  description || 'Comprehensive reporting with multiple output formats'); break;
      case 'integration':     code = genGeneric(name, language, 'Integration Module', description || 'External service integration with error handling'); break;
      case 'validation':      code = genGeneric(name, language, 'Validation Handler', description || 'Data validation with comprehensive rules'); break;
      default: throw new Error('Unknown template type: ' + type);
    }

    if (options.tests) code = appendTests(code, name, language);

    const v   = validate(code);
    const sc  = score(code, v);
    const fn  = fileNameFor(name, language);
    return { code, fileName: fn, lineCount: lineCount(code), validation: v, score: sc, templateType: type, language };
  }

  return {
    list: () => TYPES.slice(),
    generate,
    validate,
    score
  };
})();

if (typeof self !== 'undefined') self.DMS_TemplateEngine = DMS_TemplateEngine;
if (typeof module !== 'undefined') module.exports = DMS_TemplateEngine;
