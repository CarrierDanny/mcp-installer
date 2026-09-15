// sidebar/tabs/help-tab.js — in-app user guide.
// One expandable card per tab: what it does + numbered how-to steps,
// plus a quick-start for first-run setup. Content mirrors docs/UI_GUIDE.md
// but is written for end users, not developers.
(function () {
  'use strict';

  const container = document.getElementById('tab-help');
  if (!container) return;

  const GUIDE = [
    {
      id: 'quickstart', icon: '🚀', title: 'Quick start (do this first)',
      what: 'Five minutes of setup unlocks everything.',
      steps: [
        'Open Settings (last tab) → AI Provider: paste at least one API key (Claude, OpenAI, or Gemini) and press its Test button.',
        'Open Settings → Webhook Connection: paste Webhook_URL + Webhook_Secret, then Sync (imports Drive/Sheets IDs and API keys from Script Properties).',
        'Pin the memory home: enter your Google Drive Memory Folder ID in the toolbar popup or Settings and press Test — DANMAN validates it and builds the routing subfolders (projects, chats, uploads, rag, transcripts) automatically. Leave it blank and a "DANMAN_Memory" folder is created for you the first time memory is used.',
        'Connect a backend: Bridge tab → + Add → paste your Google Apps Script /exec URL + secret, pick its dialect, press Test, then Discover.',
        'Optional: Options → Quick Connect does the same unified sync. Config Sync can still import from the master spreadsheet CONFIG tab or a JSON file.',
        'You\'re set — every tab below now has what it needs.'
      ]
    },
    {
      id: 'clipboard', icon: '📋', title: 'Clips — 20-slot clipboard manager',
      what: 'Every copy you make on a page is captured into numbered slots you can paste back anywhere, with hotkeys.',
      steps: [
        'Copy text on any page — it lands in the next free slot automatically.',
        'Press Alt+1 … Alt+0 on a page to paste slots 1–10 (toggle NUM for Ctrl+Shift+Numpad).',
        'Click the snowflake to freeze a slot so new captures never overwrite it.',
        'Use the filter box to find a slot, and Export CSV/TXT to save them all.',
        'Pop out opens a small always-visible window of your slots for heavy data entry.'
      ]
    },
    {
      id: 'danman', icon: '🤖', title: 'DANMAN — AI chat',
      what: 'Chat with an AI that can see the current page, your memory, and any files you attach.',
      steps: [
        'Type a question, or use the quick actions (Summarize page / Extract data / Find contacts).',
        'Tick "Include page context" so DANMAN reads the page you\'re on before answering.',
        '📎 attaches files: zips are unpacked (even zips inside zips), audio becomes a transcript, PDFs and documents are read — everything is given to DANMAN with your message and archived to your memory folder\'s uploads/.',
        'Tick "Bridge RAG (server memory)" to route the chat through your backend, which recalls everything you\'ve saved to memory — no re-pasting project context.',
        'Press 💾 Remember on any reply worth keeping — it\'s vectorized into memory.',
        'Every conversation is also logged to your memory folder\'s chats/ automatically.'
      ]
    },
    {
      id: 'scrape', icon: '🔍', title: 'Scrape — page extractor',
      what: 'Pulls the current page\'s text, headings, images, and tables into structured JSON you can download or push to Sheets.',
      steps: [
        'Open the page you want, then press Scrape This Page.',
        'Review the stat boxes and JSON preview.',
        'Download as JSON/ZIP, or push the result to your Google Sheet.',
        'Multi-Tab Full Extract → RAG: press "List open tabs", tick any tabs, and Extract — each tab\'s complete HTML, all CSS, structured JSON, a widgets inventory (every button/input/iframe with its selector), and media files are saved to their own folder under your Drive rag/, with a link row in the master sheet\'s RAG_JOBS tab.'
      ]
    },
    {
      id: 'links', icon: '🔗', title: 'Links — link extractor',
      what: 'Collects every link on the page, split into internal and external, de-duplicated.',
      steps: [
        'Press Extract Links on any page.',
        'Filter the table, then copy the URLs or export CSV.'
      ]
    },
    {
      id: 'tree', icon: '🌳', title: 'Tree — site crawler',
      what: 'Spiders a whole site from a starting URL (depth up to 6, page cap in Settings) and draws the link structure as a tree.',
      steps: [
        'Enter the start URL and pick a depth.',
        'Press Start Crawl — watch progress live; Pause/Resume/Cancel any time.',
        'Export the tree as CSV, JSON, diagram, or straight to Sheets.',
        'Tip: the page cap (Settings → scraping) stops runaway crawls on link-heavy sites.'
      ]
    },
    {
      id: 'forms', icon: '📝', title: 'Forms — scanner & autofill',
      what: 'Scans the page\'s forms, saves your filled values as templates, and replays them on similar pages — or fills rows from a Google Sheet.',
      steps: [
        'Press Scan Forms on a page with a form.',
        'Fill the form once, then Save Template (snapshot).',
        'On a fresh page, Apply Template to refill everything.',
        'Sheet mode: map columns to fields and inject row after row.',
        'AI Assist can propose values for empty fields from page context.',
        'Google Forms → WordPress: open any Google Form in a tab (published or edit view) and press "Convert current tab" — or paste a /viewform URL — to get a WPForms-import-ready JSON download, with the US/CA address block injected automatically.'
      ]
    },
    {
      id: 'macros', icon: '⚙️', title: 'Macros — record & edit automation',
      what: 'Records your clicks, typing, and keypresses into an editable step list you can replay on any page.',
      steps: [
        'Choose Studio (records everything) or Picker (click-only) and press Record.',
        'Do the task once on the page, then Stop.',
        'Edit steps — reorder, duplicate, undo/redo; 16 step types including dropdown Select, screenshots, tab switching, and clipboard.',
        'Use 🎯 pick-from-page to capture a robust selector for any step.',
        'Save — macros keep versions, and the Language dropdown localizes the tab (8 languages).'
      ]
    },
    {
      id: 'execute', icon: '▶️', title: 'Execute — run macros',
      what: 'Runs saved macros with an action-plan preview, per-step include/skip, loops, and a live log.',
      steps: [
        'Pick a macro — review its plan; untick steps to skip.',
        'Set a loop count if the task repeats, then Run.',
        'Pause/Resume/Stop mid-run; the live log shows each step\'s result.',
        'Save as version writes a V###R### revision so you can roll back.'
      ]
    },
    {
      id: 'ocr', icon: '👁️', title: 'OCR — vision text extraction',
      what: 'Reads text out of images and PDFs using vision AI, with entity extraction (names, totals, dates…).',
      steps: [
        'Drag an image or PDF into the drop zone (or browse).',
        'Pick the model (Gemini is not supported for OCR) and press Run OCR.',
        'Copy the text, or use the extracted entities panel.'
      ]
    },
    {
      id: 'soql', icon: '📊', title: 'SOQL — Salesforce query builder',
      what: 'Builds Workbench-ready SOQL from pasted case lists, with a field catalog, templates, and hot slots.',
      steps: [
        'Paste anything containing case numbers — they\'re extracted automatically.',
        'Pick a template and fields; the query builds with your cases in the WHERE IN.',
        'Save favorites to Hot Slots (Alt+Shift+1–5 to recall).',
        'Fill (A): after pasting Workbench results, press A over a row to copy cells in order — rapid data entry.'
      ]
    },
    {
      id: 'eject', icon: '⚡', title: 'EJECT — email → structured data',
      what: 'Turns a messy email (or any text) into clean structured fields: AI extract → examine/score → compare → transfer to Salesforce/Sheets.',
      steps: [
        'Press Scrape Email on Gmail/Outlook (or paste any text), then Run EJECT.',
        'Review the fields with confidence dots and the exam score.',
        'Transfer to Sheets/Salesforce, or copy as text.',
        'Also available from the right-click menu: EJECT selected text, or EJECT this page.'
      ]
    },
    {
      id: 'cellsforce', icon: '🧮', title: 'CellsF — CellsForce data toolkit',
      what: 'The complete CellsForce app embedded: Smart Paste multi-extractor, SOQL builder with WHERE filters, Query Library, Case Triage, Data Parser & sortable Table, Email Merge, Apex generator.',
      steps: [
        'Follow the numbered wizard across the top — Smart Paste is step 1: paste raw text, it finds cases, accounts, IDs, emails, phones.',
        'Build or pick a query (Builder / Library), run it in Workbench, paste results into Parse.',
        'Work the Data Table (sort, filter, missing-field highlights) and generate per-rep merge emails.',
        'Hover anything for its help tooltip — CellsForce has its own contextual help.'
      ]
    },
    {
      id: 'sheets', icon: '📈', title: 'Sheets — Google Sheets I/O',
      what: 'Reads, writes, and appends ranges on your spreadsheet, and receives pushes from Scrape/Links/Tree.',
      steps: [
        'Configure the spreadsheet + webhook (or OAuth) in Settings → Integrations first.',
        'Enter a range like Sheet1!A1:D20 and Read, or paste data and Write/Append.',
        'Other tabs\' "push to Sheets" buttons land here.'
      ]
    },
    {
      id: 'memory', icon: '🧠', title: 'Memory — Drive project memory',
      what: 'Structured project folders in your Drive memory folder: store files per project, mark projects active, and DANMAN chat loads them as context. Fine-tuning (system prompt, personality) lives here too.',
      steps: [
        'Give Drive one credential first — easiest is a Drive Bridge (Bridge tab → add Bridge_Drive.gs to a backend → Discover). The backend runs as you, so after that a Folder ID alone works with no token and nothing that expires.',
        'Set the Memory Folder ID (toolbar popup or here) — subfolders (projects, chats, uploads, rag, transcripts) are created for you. Leave it blank and a DANMAN_Memory folder is made automatically.',
        'Create a project, add files to it, and toggle it Active.',
        'Tick "Include memory context" in the chat tab — active projects ride along.',
        'Fine-tuning: set a system prompt override, custom instructions, personality — saved to the folder\'s config.'
      ]
    },
    {
      id: 'recall', icon: '🔎', title: 'Recall — vectorized memory',
      what: 'Your backend\'s searchable knowledge base: everything you save is chunked and vectorized in Drive, then found again by meaning, not keywords.',
      steps: [
        'Test the bridge (needs a profile in the Bridge tab).',
        'Grow memory: capture this page, ingest a URL, upload files, save notes, keep chat messages, or vectorize clipboard slots.',
        'Search box: type what you mean — hits can be inserted straight into chat.',
        'Bridge-RAG chat recalls all of this automatically; local copies also land in your memory folder\'s rag/.'
      ]
    },
    {
      id: 'bridge', icon: '🌉', title: 'Bridge — connect any GAS webhook',
      what: 'Profiles for every Apps Script backend you own; routing decides which one serves chat, memory, and capture; Discover turns a webhook\'s functions into runnable forms.',
      steps: [
        '+ Add: label, /exec URL, secret, and dialect (use "DANMAN Bridge kit" for backends patched with the kit; presets exist for GrowTelliGence, DANMAN Webapp, Copilot Workbench, Enterprise Suite).',
        'Press Test — a green check means the webhook answered.',
        'Press Discover — kit-patched backends return their tool list, rendered as forms with a Run button and response viewer.',
        'Capability routing: choose which profile serves each feature, or leave on Auto.',
        '+ Custom defines a tool by hand for webhooks you can\'t modify.',
        'Recent calls shows every bridge call with timing — the same rows are logged to your master sheet for budgeting.'
      ]
    },
    {
      id: 'settings', icon: '🔧', title: 'Settings — one config, every door',
      what: 'API keys, integrations, scraping, UI customization, and config import/export. The toolbar popup and the full options page edit the SAME stored settings — change a value anywhere and it\'s changed everywhere.',
      steps: [
        'AI Provider: keys + model, with per-provider Test buttons.',
        'Integrations: master spreadsheet ID (all session logs go to its DANMAN_LOG tab — keep this one sheet forever), webhook URL/secret, Salesforce.',
        'UI Customization: accent color, density, start tab — Reset restores defaults.',
        'Config Sync: import everything from the master sheet\'s CONFIG tab (rows of key,value like memory.folder_id) or JSON; exports redact your API keys.'
      ]
    },
    {
      id: 'help', icon: '❓', title: 'Help — this guide',
      what: 'Tap any section header to expand it. The developer-level reference (message APIs, styling hooks, how to add tabs) lives in docs/UI_GUIDE.md inside the extension folder.',
      steps: []
    }
  ];

  container.innerHTML = `
    <div class="tab-title">&#10067; Help &amp; How-To</div>
    <div class="tab-desc">What every tab does and how to use it — tap a section to expand</div>
    <div id="help-sections"></div>
  `;

  const sectionsEl = container.querySelector('#help-sections');

  GUIDE.forEach((g) => {
    const card = document.createElement('div');
    card.className = 'card';
    const header = document.createElement('div');
    header.className = 'card-header';
    header.style.cursor = 'pointer';
    header.innerHTML = '<span class="section-title">' + g.icon + ' ' + g.title + '</span><span class="text-muted" style="font-size:14px;">▸</span>';
    const body = document.createElement('div');
    body.className = 'hidden';
    let html = '<div class="text-sm" style="margin-bottom:8px;color:#94a3b8;">' + g.what + '</div>';
    if (g.steps.length) {
      html += '<ol style="margin:0 0 0 18px;padding:0;">'
        + g.steps.map((s) => '<li class="text-sm" style="margin-bottom:6px;color:#e2e8f0;">' + s + '</li>').join('')
        + '</ol>';
    }
    body.innerHTML = html;
    header.addEventListener('click', () => {
      const open = !body.classList.contains('hidden');
      body.classList.toggle('hidden', open);
      header.querySelector('span:last-child').textContent = open ? '▸' : '▾';
    });
    card.appendChild(header);
    card.appendChild(body);
    sectionsEl.appendChild(card);
  });

  // Deep link: other tabs can send the user here pre-expanded
  window.addEventListener('gpd-message', (e) => {
    const msg = e.detail;
    if (msg && msg.type === 'GPD_HELP_SECTION' && msg.section) {
      const idx = GUIDE.findIndex((g) => g.id === msg.section);
      if (idx >= 0) {
        const card = sectionsEl.children[idx];
        card.querySelector('div:last-child').classList.remove('hidden');
        card.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });

  console.log('[DANMAN] Help tab loaded');
})();
