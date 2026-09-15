// sidebar/i18n/dms-i18n.js — GetPower by DANMAN Solutions
// File: GetPower_DANMAN_v6.9.0
//
// Lightweight i18n engine. Lookups are dotted-path against a per-language
// dictionary. Falls back to English on a missing key, then to the key itself
// (so missing translations are obvious in the UI rather than vanishing).
//
// Supported languages:
//   en — English          (full)
//   fr — Français         (full)
//   es — Español          (full)
//   zh — 中文 (Simplified) (full)
//   ar — العربية         (full, RTL)
//   pa — ਪੰਜਾਬੀ          (full)
//   hi — हिन्दी           (full)
//   ko — 한국어           (full)
//
// Public API:
//   DMS_I18n.t(path[, ...args])        — translate; ${0}, ${1} placeholders
//   DMS_I18n.list(path)                — fetch array (e.g. tour steps)
//   DMS_I18n.setLanguage(code)         — switch; dispatches dms:language-changed
//   DMS_I18n.lang                      — current 2-letter code
//   DMS_I18n.langs                     — [{code, label, native, rtl?}]
//   DMS_I18n.isRtl()                   — true when current lang is RTL

(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Language meta (used by the Settings picker)
  // -----------------------------------------------------------------------
  const LANG_META = [
    { code: 'en', label: 'English',     native: 'English'   },
    { code: 'fr', label: 'French',      native: 'Français'  },
    { code: 'es', label: 'Spanish',     native: 'Español'   },
    { code: 'zh', label: 'Chinese',     native: '中文'      },
    { code: 'ar', label: 'Arabic',      native: 'العربية',  rtl: true },
    { code: 'pa', label: 'Punjabi',     native: 'ਪੰਜਾਬੀ'    },
    { code: 'hi', label: 'Hindi',       native: 'हिन्दी'    },
    { code: 'ko', label: 'Korean',      native: '한국어'    }
  ];
  const RTL_SET = new Set(LANG_META.filter(l => l.rtl).map(l => l.code));

  // -----------------------------------------------------------------------
  // English source-of-truth dictionary
  // -----------------------------------------------------------------------
  const en = {
    brand: {
      tagline: 'If knowledge is Power, this add-on plugs you in to get more POWER.',
      acronym_label: 'DANMAN =',
      acronym: 'Data And Numbers, Metrics And Networks',
      acronym_footer: 'Every letter earns its keep.',
      pitch: 'Like waking up on Christmas morning and finding everything you asked for — and more — under the tree. The must-have add-on for anyone living the corporate life.',
      marketing: 'GetPower turns every browser tab into a programmable surface. From clipboard slots to email-to-Salesforce pipelines, from element pickers to scheduled crawlers, DANMAN packed an entire corporate toolkit into a single add-on. Persistence in Drive. Logs in Sheets. Memory across sessions. Plug in and Get the Power.'
    },
    about: {
      title_prefix: '★ Welcome to ',
      hero_subtitle_sep: ' · v',
      stats_tabs: 'Tabs of power',
      stats_templates: 'Template types',
      stats_langs: 'Languages',
      section_features: 'Everything under the tree',
      footer_hover: 'Hover any tab, field, or status dot to read a quick hint. Disable hints in {0}Settings → UI{1} if you prefer a quiet panel.',
      ok: 'Plug me in',
      cancel: 'Later',
      features: [
        'Visual macro builder with AI-assisted step generation',
        'Batch OCR for invoices, statements, receipts, and scanned PDFs',
        'Site-tree RAG crawl with multi-tab selection',
        'One-click page scrape, link extraction, and form autofill',
        'Persistent memory backed by Google Drive folders',
        'Native messaging host for OS-wide kill-switch hotkey',
        'Google Sheets logging for every action you take',
        'Import / export of every config, key, and template'
      ]
    },
    tour: {
      step: 'Step',
      of: 'of',
      back: '← Back',
      next: 'Next →',
      skip: 'Skip tour',
      finish: '★ Get the Power',
      welcome: [
        { title: '⚡ Welcome to GetPower', body: 'DANMAN packed an entire enterprise toolkit into this 420px panel. This 30-second tour gives you the lay of the land. Hit Next anytime — or Skip to dive right in.' },
        { title: '🧱 Builder', body: 'Drag pre-built step types (Click, Type, Wait, Extract…) into a sequence, or describe what you want and let DANMAN AI draft the whole macro. Save, run, schedule.' },
        { title: '🤖 DANMAN AI', body: 'Your chat companion. Ask for a macro, a page summary, an entity extraction, anything. Knows your Drive memory and your saved workflows.' },
        { title: '🌲 Tree (RAG crawl)', body: 'Crawl any site to a chosen depth — or click the Tabs button to seed from any other Firefox tab you have open. Multiple export formats included.' },
        { title: '🔍 Scrape', body: 'One-click extract content, headings, images, tables. Push to Google Sheets, save to a Drive folder, or download as a local ZIP. No coding required.' },
        { title: '📋 Forms', body: 'Detect every form on the page, generate selectors, save autofill templates to Sheets, then inject values one-by-one or all at once. AI-skip mode handles fuzzy fields.' },
        { title: '🖨️ OCR (batch)', body: 'Drop one PDF for preview, or 2+ for batch mode. Vision-AI OCR extracts text AND structured entities — invoice numbers, totals, dates, emails, phone numbers.' },
        { title: '📊 Sheets', body: 'Read, write, and append to any Google Sheet you own. Works via API or routed through your DANMAN webhook so daily caps apply.' },
        { title: '🧠 Memory', body: 'Persistent project memory backed by Google Drive folders. Your AI chats remember context across sessions and devices.' },
        { title: '⚙️ Settings', body: 'API keys, Sheets / Drive credentials, native host install, plus a one-click EXPORT / IMPORT for every config you set. Move machines without losing anything.' },
        { title: "★ You're plugged in", body: 'Hover any tab, field, or status dot to read a hint. Re-play this tour anytime from Settings → Advanced. Now go GetPower.' }
      ],
      power: [
        { title: '⚡ Power-user tour', body: 'Now you know what each tab does — here are the keyboard shortcuts, the kill switch, the element picker, and the OS-level integrations that make GetPower fly. About 30 seconds.' },
        { title: '🛑 Emergency stop · Ctrl+Shift+.', body: 'The red button (and its hotkey) kills every running macro instantly, releases focus-lock, and writes a STOP entry to your activity log. With the native host installed it works even from a different window.' },
        { title: '🎯 Element picker · Ctrl+Shift+E', body: 'Click this then hover the page — every element you hover gets a coloured outline, and a click captures its CSS selector straight into the Builder. Saves you writing selectors by hand.' },
        { title: '🎬 Macro recorder · Ctrl+Shift+R', body: 'Click to start recording, perform the workflow on the page, click again to stop. Every click, keypress, and form-fill becomes a Builder step you can edit and replay.' },
        { title: '🔒 Window / tab binding', body: 'In the Builder you can pin a macro to a specific Firefox tab or window. Once bound, the macro refuses to touch anything else. Only Alt+F4 or the kill hotkey releases.' },
        { title: '🖥️ Native messaging host', body: 'Optional helper that gives GetPower OS-wide hotkeys (work even when Firefox is minimised) and a focus-lock that snaps the bound window to foreground when you stray. Install from native_host/install-native-host.bat — Settings → Native shows status.' },
        { title: '⌨️ Custom global hotkey', body: 'Pick any combo you like (default Ctrl+Alt+Shift+K) in Settings → Native and the host will fire your kill switch even from Excel, Outlook, or your IDE.' },
        { title: '🩺 Diagnostics tab', body: 'Hidden by default — flip the Settings → Advanced toggle to expose live self-tests: template engine, OCR regex, native host ping, storage sanity. Use when something feels off.' },
        { title: '📥 Import / Export config', body: 'Bottom of Settings → Export Config writes a JSON with every key, sheet ID, and toggle. Import on a new machine for instant parity. API keys are redacted by default; toggle "Include secrets" if needed.' },
        { title: '⚡ Plug in and go', body: 'Hotkeys live, picker live, recorder live, kill switch live. You are now a GetPower power-user. Re-play either tour anytime from Settings → Advanced.' }
      ]
    },
    macros: {
      title: 'Macros',
      desc: 'Record, edit, and replay automation on any page.',
      language: 'Language',
      saved_title: 'Saved Macros',
      recorder_title: 'Recorder',
      steps_title: 'Steps',
      progress_title: 'Progress',
      record_studio: 'Studio record',
      record_picker: 'Picker record',
      stop_record: 'Stop',
      undo: 'Undo',
      redo: 'Redo',
      duplicate: 'Duplicate',
      idle: 'Idle',
      recording_studio: 'Studio recording — interact with the page, then Stop',
      recording_picker: 'Picker recording — click elements, then Stop',
      new_macro: 'New macro',
      run: 'Run',
      save: 'Save',
      delete: 'Delete',
      add_step: 'Add step',
      no_steps: 'No steps yet. Use Studio record or Add step.',
      step_count: '{0} steps',
      execute_title: 'Execute',
      execute_desc: 'Preview the action plan before running.',
      action_plan: 'Action plan',
      save_variant: 'Save as version'
    },
    hint: {
      header: {
        brand_t: 'Get|Power — Plug In · Power Up',
        brand_b: 'DANMAN Solutions packs scrape, OCR, AI macros, Drive-backed memory, and Sheets logging into a single sidebar. Click the ★ button to see the full feature tour.',
        about_t: 'About GetPower',
        about_b: "Read the DANMAN acronym, the full feature list, and what's new in v6.9.",
        record_t: 'Record macro · Ctrl+Shift+R',
        record_b: 'Capture clicks, keystrokes, and form-fills on the current page. Stops when you click again.',
        picker_t: 'Element picker · Ctrl+Shift+E',
        picker_b: 'Point at any element on the page to grab a CSS selector you can paste into Builder or Forms.',
        options_t: 'Full settings page',
        options_b: 'Opens the options tab — API keys, Sheets / Drive credentials, native host install, advanced toggles.',
        kill_t: 'EMERGENCY STOP · Ctrl+Shift+.',
        kill_b: 'Kills every running macro, releases focus-lock, and writes a STOP entry to your activity log. Works even from a different window when the native host is enabled.'
      },
      status: {
        engine_t: 'Macro engine',
        engine_b: 'idle = no macro running. running = step in flight. paused = focus-lock waiting for the bound window.',
        bind_t: 'Scope binding',
        bind_b: 'global = runs on any tab. tab = pinned to one tab id. window = pinned to one Firefox window; closing it ends the macro.',
        native_t: 'Native host',
        native_b: 'PowerShell + Win32 helper that enables OS-wide kill-switch and focus-lock. Off until you install it from Settings → Native Host.',
        ai_t: 'AI mode',
        ai_b: 'webhook = routes through your DANMAN Apps Script. direct = uses keys you pasted in Settings. both = falls back automatically.',
        hotkey_t: 'Global hotkey',
        hotkey_b: 'When green, your kill-switch hotkey is being polled by the native host even when Firefox is in the background.'
      },
      tab: {
        builder_t: 'Builder',
        builder_b: 'Drag steps together to create a macro. DANMAN can draft the whole sequence for you — just describe what you want done.',
        templates_t: 'Templates',
        templates_b: 'Dynamic code-template generator (8 types × 4 languages) plus your saved macro library. Save, load, edit, score with the Danny Protocol.',
        execute_t: 'Execute',
        execute_b: 'Run any saved macro with live step trace. Window-bind, dry-run, or replay against a different tab.',
        scheduler_t: 'Scheduler',
        scheduler_b: 'Cron-style triggers for recurring automations. Runs in the background via chrome.alarms even when the sidebar is closed.',
        clipboard_t: 'Clipboard',
        clipboard_b: '20 named clipboard slots with cross-tab sync. Paste directly into the active page or remap hotkeys.',
        danman_t: 'DANMAN AI',
        danman_b: 'Chat companion. Ask DANMAN to write a macro, summarise a page, debug a selector, or read your Drive memory.',
        scrape_t: 'Scrape',
        scrape_b: 'One-click extract: content, headings, images, tables. Copy, push to Sheets, or save the whole bundle to Drive / a local ZIP.',
        links_t: 'Links',
        links_b: 'Enumerate every anchor on the page, categorise (internal / external / mailto / tel), filter, search, and export.',
        tree_t: 'Tree (RAG crawl)',
        tree_b: "Crawl the current site to a chosen depth — or click 'Tabs' to pick another open browser tab as the seed URL. Multiple export formats.",
        forms_t: 'Forms',
        forms_b: 'Detect forms, generate selectors, save autofill templates to Sheets, inject values one-by-one, all-at-once, or AI-skip-mode.',
        memory_t: 'Memory',
        memory_b: "Persistent Drive-backed memory: per-project folders, fine-tune DANMAN's personality, view project stats.",
        sheets_t: 'Sheets',
        sheets_b: 'Read / write / append to any Google Sheet by ID or URL. Works via API or via your DANMAN webhook.',
        ocr_t: 'OCR (batch)',
        ocr_b: 'Drop one PDF for preview mode, or 2+ for batch mode. AI-vision OCR + structured extraction (invoices, totals, dates, IDs).',
        eject_t: 'EJECT pipeline',
        eject_b: '5-stage email-processing pipeline: scrape → JSONify → examine → compare → transfer to Salesforce or Sheets.',
        settings_t: 'Settings',
        settings_b: "API keys, Sheets / Drive / Salesforce credentials, scrape limits, plus IMPORT / EXPORT of every config you've set up.",
        diag_t: 'Diagnostics',
        diag_b: 'Live self-tests: template engine, OCR entity regex, native host ping, storage sanity.'
      },
      legacy: {
        // Per-section descriptors for the proven tabs — used by legacy-hints.js
        scrape_run_t: 'Run scrape',
        scrape_run_b: 'Pulls every text block, heading, image src, and table from the current page. Result appears in the cards below.',
        scrape_copy_t: 'Copy to clipboard',
        scrape_copy_b: 'Copies the selected extract to your system clipboard. Useful for quick paste into Sheets, Docs, or Notepad.',
        scrape_sheets_t: 'Push to Sheets',
        scrape_sheets_b: 'Appends the extract as a new row in your configured Google Sheet. Spreadsheet ID lives in Settings → Sheets.',
        scrape_drive_t: 'Save to Drive',
        scrape_drive_b: 'Bundles HTML + JSON + images into your configured Drive folder. Folder ID lives in Settings → Memory.',
        scrape_zip_t: 'Save as ZIP',
        scrape_zip_b: 'Downloads everything as a single ZIP file. No cloud round-trip — local-only.',

        links_run_t: 'Extract links',
        links_run_b: 'Enumerates every anchor on the active page. Categorises internal vs external vs mailto / tel.',
        links_filter_t: 'Filter',
        links_filter_b: 'Live-filter the link list by category or by substring match.',
        links_export_t: 'Export',
        links_export_b: 'Save the categorised links as CSV or JSON.',

        tree_url_t: 'Seed URL',
        tree_url_b: 'Where the crawl starts. Defaults to the currently active tab. Use the Tabs button to pick a different open tab.',
        tree_tabs_t: 'Tabs picker',
        tree_tabs_b: 'Reveals every Firefox tab you have open and lets you use any one of them as the crawl seed.',
        tree_depth_t: 'Max depth',
        tree_depth_b: 'How many click-throughs deep the crawl goes. 1 = same page only. 2 = one level of internal links. Above 3 can get expensive.',
        tree_start_t: 'Start crawl',
        tree_start_b: 'Begins the recursive walk. Live stats appear below. Cancellable.',
        tree_export_t: 'Export tree',
        tree_export_b: 'Save the crawl result in your chosen format: JSON, CSV, HTML report, or Markdown sitemap.',

        forms_scan_t: 'Scan forms',
        forms_scan_b: 'Detects every <form> element on the page along with all its fields, types, and computed selectors.',
        forms_template_t: 'Save template',
        forms_template_b: 'Persists your selector + value mapping to Google Sheets so you can autofill the same form on future visits.',
        forms_inject_t: 'Inject values',
        forms_inject_b: 'Fills in the matching fields. Inject ONE = next blank only. ALL = every match. SKIP = AI guesses non-obvious mappings.',
        forms_pick_t: 'Pick element',
        forms_pick_b: 'Visual element selector. Click anywhere on the page to grab a CSS selector you can paste into a template row.',

        memory_drive_t: 'Drive folder ID',
        memory_drive_b: 'The Google Drive folder where DANMAN persists project memory, OCR bundles, and chat transcripts.',
        memory_enabled_t: 'Memory ON/OFF',
        memory_enabled_b: 'Master toggle. When off the AI chat does not query Drive — useful for quick one-off chats with no persistence.',
        memory_personality_t: 'Personality',
        memory_personality_b: 'A free-text seed that gets prepended to every DANMAN AI conversation. Tone, formatting preferences, jargon hints.',
        memory_export_t: 'Export config',
        memory_export_b: 'Downloads a JSON containing your Memory folder ID + personality so you can import on another machine.',

        sheets_id_t: 'Spreadsheet ID',
        sheets_id_b: 'The long ID in your Sheet URL between /d/ and /edit. Required for Read / Write / Append.',
        sheets_range_t: 'Range',
        sheets_range_b: 'A1 notation: SheetName!A1:D — leave the row-end open to auto-detect.',
        sheets_read_t: 'Read',
        sheets_read_b: 'GETs the range and renders it as a table. Use to verify your sheet ID and range are correct.',
        sheets_write_t: 'Write',
        sheets_write_b: 'Replaces the range contents with the rows you provide. Destructive — confirms first.',
        sheets_append_t: 'Append',
        sheets_append_b: 'Adds new rows below the last filled row. Safe — non-destructive.',

        eject_paste_t: 'Paste email',
        eject_paste_b: 'Drop the raw email text here. Or use Auto-scrape to pull it from the currently-open Gmail / Outlook tab.',
        eject_run_t: 'Run pipeline',
        eject_run_b: 'Five stages: scrape → JSONify → examine → compare → transfer. Each stage logs progress and can be re-run independently.',
        eject_transfer_t: 'Transfer',
        eject_transfer_b: 'Pushes the validated result to Salesforce (if configured) or to a Google Sheet row.',

        clip_slot_t: 'Clipboard slot',
        clip_slot_b: 'One of 20 named slots. Click the slot label to load it into the system clipboard. Shift+click to paste straight to the active page.',
        clip_poll_t: 'Auto-capture',
        clip_poll_b: 'Polls your system clipboard and auto-saves new content to the next free slot. Useful while researching.',
        clip_export_t: 'Export slots',
        clip_export_b: 'Saves every slot as a JSON file so you can restore the workspace on another machine.',

        danman_send_t: 'Send to DANMAN',
        danman_send_b: 'Sends your message + the chosen context (current page or saved memory) to the AI. Stream-mode replies appear inline.',
        danman_context_t: 'Include context',
        danman_context_b: 'When ON the current page text and / or your Drive memory get attached as background context.',
        danman_popout_t: 'Pop out chat',
        danman_popout_b: 'Detaches the chat into a floating window so you can keep it visible while working in another tab.',

        settings_export_t: 'Export Config',
        settings_export_b: 'Downloads a JSON containing every setting in this tab — API key fields are redacted unless you tick Include secrets first.',
        settings_import_t: 'Import Config',
        settings_import_b: 'Restore from a previously-exported JSON. Useful when moving to a new machine or browser profile.'
      },
      ui: {
        language_label: 'Language',
        language_hint_t: 'Interface language',
        language_hint_b: 'Switches every hint, tour step, and About modal copy into the chosen language. Stored per browser profile.',
        replay_welcome_t: 'Replay welcome tour',
        replay_welcome_b: 'Re-runs the 30-second guided walkthrough you saw on first install. Highlights each tab in turn.',
        replay_power_t: 'Replay power-user tour',
        replay_power_b: "A second 30-second tour for shortcuts, the kill switch, element picker, recorder, and OS-level integrations."
      }
    }
  };

  // -----------------------------------------------------------------------
  // Language packs — only the keys that need translating are included.
  // Anything missing falls back to English at runtime.
  // -----------------------------------------------------------------------

  // ----- FRENCH (fr) -----
  const fr = {
    brand: {
      tagline: 'Si le savoir est Puissance, ce module vous branche pour obtenir plus de PUISSANCE.',
      acronym_label: 'DANMAN =',
      acronym: 'Données et Nombres, Métriques et Réseaux',
      acronym_footer: 'Chaque lettre justifie sa présence.',
      pitch: "Comme un matin de Noël où vous trouvez sous le sapin tout ce que vous avez demandé — et plus encore. Le module indispensable pour quiconque vit la vie d'entreprise.",
      marketing: "GetPower transforme chaque onglet en surface programmable. Du presse-papiers aux pipelines email-vers-Salesforce, des sélecteurs d'éléments aux explorateurs planifiés — DANMAN a empaqueté toute une boîte à outils d'entreprise dans un seul module. Persistance dans Drive. Journaux dans Sheets. Mémoire entre sessions. Branchez-vous et Obtenez la Puissance."
    },
    about: {
      title_prefix: '★ Bienvenue sur ',
      hero_subtitle_sep: ' · v',
      stats_tabs: 'Onglets de puissance',
      stats_templates: 'Types de modèles',
      stats_langs: 'Langues',
      section_features: 'Tout sous le sapin',
      footer_hover: 'Survolez un onglet, un champ ou un voyant pour lire un conseil. Désactivez les conseils dans {0}Paramètres → IU{1} pour un panneau plus calme.',
      ok: 'Branchez-moi',
      cancel: 'Plus tard',
      features: [
        "Constructeur de macros visuel avec génération d'étapes par IA",
        'OCR par lot pour factures, relevés, reçus et PDF scannés',
        'Exploration RAG du site avec sélection multi-onglets',
        'Extraction de page, de liens et remplissage de formulaires en un clic',
        'Mémoire persistante adossée à des dossiers Google Drive',
        "Hôte de messagerie natif pour raccourci d'arrêt à l'échelle de l'OS",
        'Journalisation Google Sheets pour chaque action effectuée',
        'Importation / exportation de chaque configuration, clé et modèle'
      ]
    },
    tour: {
      step: 'Étape',
      of: 'sur',
      back: '← Précédent',
      next: 'Suivant →',
      skip: 'Passer le tour',
      finish: '★ Obtenir la Puissance',
      welcome: [
        { title: '⚡ Bienvenue sur GetPower', body: "DANMAN a empaqueté toute une boîte à outils d'entreprise dans ce panneau de 420 px. Ce tour de 30 secondes vous donne la vue d'ensemble. Appuyez sur Suivant — ou Passer pour foncer." },
        { title: '🧱 Constructeur', body: "Glissez les types d'étapes (Clic, Saisie, Attente, Extraire…) dans une séquence, ou décrivez votre besoin et laissez DANMAN AI rédiger la macro complète. Enregistrer, exécuter, planifier." },
        { title: '🤖 DANMAN AI', body: "Votre compagnon de discussion. Demandez une macro, un résumé de page, une extraction d'entités, n'importe quoi. Connaît votre mémoire Drive et vos flux enregistrés." },
        { title: '🌲 Arbre (exploration RAG)', body: "Explorez n'importe quel site jusqu'à une profondeur choisie — ou cliquez sur Onglets pour démarrer depuis un autre onglet Firefox ouvert. Plusieurs formats d'export." },
        { title: '🔍 Extraction', body: 'En un clic : contenu, titres, images, tableaux. Envoi vers Sheets, sauvegarde dans Drive ou téléchargement en ZIP local. Sans code.' },
        { title: '📋 Formulaires', body: "Détecte chaque formulaire, génère les sélecteurs, sauvegarde des modèles d'autoremplissage dans Sheets, puis injecte un champ à la fois ou tout d'un coup. Le mode AI-skip gère les champs ambigus." },
        { title: '🖨️ OCR (par lot)', body: "Déposez un PDF pour l'aperçu, ou 2+ pour le mode lot. L'OCR par IA-vision extrait le texte ET les entités structurées — numéros de facture, totaux, dates, e-mails, téléphones." },
        { title: '📊 Sheets', body: "Lire, écrire, et ajouter à n'importe quelle feuille Google qui vous appartient. Via API ou via votre webhook DANMAN pour respecter les plafonds quotidiens." },
        { title: '🧠 Mémoire', body: 'Mémoire de projet persistante via dossiers Google Drive. Vos discussions IA conservent le contexte entre sessions et appareils.' },
        { title: '⚙️ Paramètres', body: "Clés API, identifiants Sheets / Drive, installation de l'hôte natif — plus EXPORT / IMPORT en un clic de toute la configuration. Changez de machine sans rien perdre." },
        { title: '★ Vous êtes branché', body: 'Survolez un onglet, un champ ou un voyant pour lire un conseil. Rejouez ce tour à tout moment depuis Paramètres → Avancé. À vous la Puissance.' }
      ],
      power: [
        { title: '⚡ Tour utilisateur avancé', body: "Vous connaissez maintenant chaque onglet — voici les raccourcis clavier, le bouton d'arrêt, le sélecteur d'élément et les intégrations au niveau OS qui font décoller GetPower. Environ 30 secondes." },
        { title: '🛑 Arrêt d\'urgence · Ctrl+Maj+.', body: "Le bouton rouge (et son raccourci) tue instantanément toutes les macros en cours, libère le verrouillage de focus et écrit une entrée STOP dans votre journal. Avec l'hôte natif installé, il fonctionne même depuis une autre fenêtre." },
        { title: "🎯 Sélecteur d'élément · Ctrl+Maj+E", body: "Cliquez puis survolez la page — chaque élément reçoit un contour coloré, et un clic capture son sélecteur CSS directement dans le Constructeur. Plus besoin d'écrire les sélecteurs à la main." },
        { title: '🎬 Enregistreur de macros · Ctrl+Maj+R', body: "Cliquez pour démarrer l'enregistrement, exécutez le flux sur la page, cliquez à nouveau pour arrêter. Chaque clic, frappe et remplissage devient une étape éditable et rejouable." },
        { title: '🔒 Liaison fenêtre / onglet', body: "Dans le Constructeur, vous pouvez épingler une macro à un onglet ou une fenêtre Firefox spécifique. Une fois liée, la macro refuse de toucher autre chose. Seul Alt+F4 ou le raccourci d'arrêt libère." },
        { title: '🖥️ Hôte de messagerie natif', body: 'Assistant optionnel qui donne à GetPower des raccourcis à l\'échelle OS (fonctionnent même si Firefox est réduit) et un verrouillage de focus qui ramène la fenêtre liée au premier plan. Installez via native_host/install-native-host.bat — Paramètres → Natif affiche l\'état.' },
        { title: '⌨️ Raccourci global personnalisé', body: 'Choisissez la combinaison de votre choix (par défaut Ctrl+Alt+Maj+K) dans Paramètres → Natif et l\'hôte déclenchera votre arrêt même depuis Excel, Outlook ou votre IDE.' },
        { title: '🩺 Onglet Diagnostics', body: 'Caché par défaut — basculez Paramètres → Avancé pour exposer les autotests en direct : moteur de modèles, regex OCR, ping de l\'hôte natif, intégrité du stockage. Utilisez-le si quelque chose cloche.' },
        { title: '📥 Import / Export config', body: "En bas de Paramètres → Exporter la config écrit un JSON avec chaque clé, ID de feuille et bascule. Importez sur une nouvelle machine pour la parité instantanée. Les clés API sont masquées par défaut — cochez « Inclure les secrets » au besoin." },
        { title: '⚡ Branchez et partez', body: 'Raccourcis actifs, sélecteur actif, enregistreur actif, arrêt actif. Vous êtes maintenant un utilisateur avancé de GetPower. Rejouez n\'importe quel tour depuis Paramètres → Avancé.' }
      ]
    },
    hint: {
      header: {
        brand_t: 'Get|Power — Branchez · Allumez',
        brand_b: 'DANMAN Solutions concentre scrape, OCR, macros IA, mémoire Drive et journaux Sheets dans une seule barre latérale. Cliquez ★ pour le tour complet.',
        about_t: 'À propos de GetPower',
        about_b: "Lisez l'acronyme DANMAN, la liste complète des fonctionnalités et les nouveautés de la v6.7.",
        record_t: 'Enregistrer macro · Ctrl+Maj+R',
        record_b: 'Capture les clics, frappes et remplissages sur la page courante. Reclic = arrêt.',
        picker_t: "Sélecteur d'élément · Ctrl+Maj+E",
        picker_b: "Pointez sur un élément de la page pour récupérer un sélecteur CSS à coller dans le Constructeur ou les Formulaires.",
        options_t: 'Page de paramètres complète',
        options_b: "Ouvre l'onglet options — clés API, identifiants Sheets / Drive, installation hôte natif, bascules avancées.",
        kill_t: "ARRÊT D'URGENCE · Ctrl+Maj+.",
        kill_b: "Tue toutes les macros en cours, libère le verrouillage de focus et écrit une entrée STOP dans votre journal. Fonctionne même depuis une autre fenêtre avec l'hôte natif activé."
      },
      status: {
        engine_t: 'Moteur de macros',
        engine_b: 'inactif = aucune macro. en cours = étape en vol. en pause = verrouillage de focus en attente de la fenêtre liée.',
        bind_t: 'Liaison de portée',
        bind_b: 'global = sur tout onglet. onglet = épinglé à un id. fenêtre = épinglé à une fenêtre Firefox ; la fermer termine la macro.',
        native_t: 'Hôte natif',
        native_b: 'Assistant PowerShell + Win32 qui active arrêt et verrouillage à l\'échelle OS. Désactivé tant que vous ne l\'installez pas via Paramètres → Hôte natif.',
        ai_t: 'Mode IA',
        ai_b: 'webhook = passe par votre Apps Script DANMAN. direct = utilise les clés collées dans Paramètres. les deux = repli automatique.',
        hotkey_t: 'Raccourci global',
        hotkey_b: "Quand vert, l'hôte natif surveille votre raccourci d'arrêt même quand Firefox est en arrière-plan."
      },
      tab: {
        builder_t: 'Constructeur', builder_b: 'Glissez les étapes pour créer une macro. DANMAN peut rédiger toute la séquence — décrivez simplement votre intention.',
        templates_t: 'Modèles', templates_b: 'Générateur dynamique de modèles de code (8 types × 4 langages) et bibliothèque de macros. Sauvegarder, charger, scorer avec le Danny Protocol.',
        execute_t: 'Exécuter', execute_b: 'Lance une macro sauvegardée avec trace en direct. Liaison fenêtre, simulation, ou rejeu sur un autre onglet.',
        scheduler_t: 'Planificateur', scheduler_b: "Déclencheurs cron pour automatisations récurrentes. Tourne en arrière-plan via chrome.alarms même quand la barre latérale est fermée.",
        clipboard_t: 'Presse-papiers', clipboard_b: "20 emplacements nommés avec sync entre onglets. Collez directement sur la page active ou réaffectez les raccourcis.",
        danman_t: 'DANMAN AI', danman_b: "Compagnon de discussion. Demandez à DANMAN d'écrire une macro, résumer une page, déboguer un sélecteur, ou lire votre mémoire Drive.",
        scrape_t: 'Extraction', scrape_b: "Extraction en un clic : contenu, titres, images, tableaux. Copier, envoyer vers Sheets, ou sauvegarder l'ensemble vers Drive / ZIP local.",
        links_t: 'Liens', links_b: "Énumère chaque ancre de la page, catégorise (interne / externe / mailto / tel), filtre, recherche et exporte.",
        tree_t: 'Arbre (RAG)', tree_b: "Explore le site courant à la profondeur choisie — ou cliquez 'Onglets' pour démarrer depuis un autre onglet ouvert. Plusieurs formats d'export.",
        forms_t: 'Formulaires', forms_b: "Détecte les formulaires, génère les sélecteurs, sauvegarde des modèles d'autoremplissage, injecte un par un, tout d'un coup, ou en mode AI-skip.",
        memory_t: 'Mémoire', memory_b: "Mémoire persistante adossée à Drive : dossiers par projet, personnalité DANMAN, statistiques.",
        sheets_t: 'Sheets', sheets_b: "Lire / écrire / ajouter dans n'importe quelle feuille Google par ID ou URL. Via API ou via votre webhook DANMAN.",
        ocr_t: 'OCR (lot)', ocr_b: "Déposez un PDF pour l'aperçu, ou 2+ pour le mode lot. OCR IA-vision + extraction structurée (factures, totaux, dates, ID).",
        eject_t: 'Pipeline EJECT', eject_b: 'Pipeline e-mail en 5 étapes : extraire → JSONifier → examiner → comparer → transférer vers Salesforce ou Sheets.',
        settings_t: 'Paramètres', settings_b: "Clés API, identifiants Sheets / Drive / Salesforce, limites de scrape, plus IMPORT / EXPORT de toute configuration.",
        diag_t: 'Diagnostics', diag_b: 'Autotests en direct : moteur de modèles, regex OCR, ping hôte natif, intégrité stockage.'
      },
      legacy: {
        scrape_run_t: 'Lancer extraction', scrape_run_b: 'Tire chaque bloc texte, titre, image et tableau de la page courante. Résultat dans les cartes en dessous.',
        scrape_copy_t: 'Copier', scrape_copy_b: 'Copie le résultat dans le presse-papiers système. Pratique pour collage rapide.',
        scrape_sheets_t: 'Envoyer vers Sheets', scrape_sheets_b: "Ajoute le résultat comme nouvelle ligne dans votre feuille Google configurée.",
        scrape_drive_t: 'Sauver vers Drive', scrape_drive_b: 'Empaquette HTML + JSON + images dans votre dossier Drive configuré.',
        scrape_zip_t: 'Sauver en ZIP', scrape_zip_b: 'Télécharge tout dans un seul fichier ZIP. Local uniquement.',
        links_run_t: 'Extraire les liens', links_run_b: 'Énumère chaque ancre de la page active. Catégorise interne / externe / mailto / tel.',
        links_filter_t: 'Filtrer', links_filter_b: 'Filtrage en direct par catégorie ou correspondance de sous-chaîne.',
        links_export_t: 'Exporter', links_export_b: 'Sauve les liens catégorisés en CSV ou JSON.',
        tree_url_t: 'URL de départ', tree_url_b: "Point de départ de l'exploration. Par défaut l'onglet actif. Utilisez Onglets pour choisir.",
        tree_tabs_t: 'Sélecteur d\'onglets', tree_tabs_b: 'Affiche chaque onglet Firefox ouvert et vous laisse en choisir un comme graine.',
        tree_depth_t: 'Profondeur max', tree_depth_b: "Combien de clics en profondeur. 1 = page seule. 2 = un niveau de liens. >3 peut coûter cher.",
        tree_start_t: 'Démarrer', tree_start_b: 'Lance le parcours récursif. Stats en direct. Annulable.',
        tree_export_t: 'Exporter arbre', tree_export_b: 'Sauve le résultat en JSON, CSV, rapport HTML ou plan Markdown.',
        forms_scan_t: 'Scanner', forms_scan_b: 'Détecte chaque <form> et tous ses champs, types et sélecteurs calculés.',
        forms_template_t: 'Sauver modèle', forms_template_b: "Persiste votre mapping sélecteur + valeur dans Google Sheets.",
        forms_inject_t: 'Injecter', forms_inject_b: 'Remplit les champs. UN = prochain vide. TOUS = chaque correspondance. SKIP = IA devine.',
        forms_pick_t: 'Choisir élément', forms_pick_b: 'Sélecteur visuel. Cliquez sur la page pour récupérer un sélecteur CSS.',
        memory_drive_t: 'ID dossier Drive', memory_drive_b: 'Dossier Google Drive où DANMAN persiste la mémoire, OCR, transcriptions.',
        memory_enabled_t: 'Mémoire ON/OFF', memory_enabled_b: 'Bascule maître. Off = chats IA sans requête Drive.',
        memory_personality_t: 'Personnalité', memory_personality_b: 'Préambule libre injecté avant chaque conversation IA.',
        memory_export_t: 'Exporter config', memory_export_b: 'Télécharge un JSON avec ID dossier + personnalité.',
        sheets_id_t: 'ID feuille', sheets_id_b: "ID long entre /d/ et /edit dans l'URL Sheets.",
        sheets_range_t: 'Plage', sheets_range_b: 'Notation A1 : NomFeuille!A1:D — laissez la fin ouverte pour auto-détecter.',
        sheets_read_t: 'Lire', sheets_read_b: 'GET la plage et rend un tableau.',
        sheets_write_t: 'Écrire', sheets_write_b: 'Remplace la plage. Destructif — confirme.',
        sheets_append_t: 'Ajouter', sheets_append_b: 'Ajoute des lignes après la dernière remplie. Non-destructif.',
        eject_paste_t: 'Coller email', eject_paste_b: "Collez le texte brut ici. Ou Auto-scrape depuis l'onglet Gmail / Outlook ouvert.",
        eject_run_t: 'Lancer pipeline', eject_run_b: '5 étapes : extraire → JSONifier → examiner → comparer → transférer.',
        eject_transfer_t: 'Transférer', eject_transfer_b: 'Pousse le résultat validé vers Salesforce ou une ligne Sheets.',
        clip_slot_t: 'Emplacement', clip_slot_b: 'Un des 20 emplacements nommés. Clic = charger. Maj+Clic = coller sur la page.',
        clip_poll_t: 'Auto-capture', clip_poll_b: 'Surveille le presse-papiers et sauve dans le prochain emplacement libre.',
        clip_export_t: 'Exporter', clip_export_b: 'Sauve tous les emplacements en JSON.',
        danman_send_t: 'Envoyer', danman_send_b: "Envoie votre message + le contexte choisi (page courante ou mémoire) à l'IA.",
        danman_context_t: 'Inclure contexte', danman_context_b: 'Quand ON, la page et / ou la mémoire Drive sont jointes en contexte.',
        danman_popout_t: 'Détacher chat', danman_popout_b: 'Détache le chat en fenêtre flottante.',
        settings_export_t: 'Exporter Config', settings_export_b: 'Télécharge un JSON avec tous les paramètres. Clés API masquées sauf si vous cochez Inclure les secrets.',
        settings_import_t: 'Importer Config', settings_import_b: 'Restaure depuis un JSON exporté. Pratique pour changer de machine.'
      },
      ui: {
        language_label: 'Langue',
        language_hint_t: "Langue de l'interface",
        language_hint_b: "Bascule chaque conseil, étape de tour et texte de la fenêtre À propos. Conservé par profil de navigateur.",
        replay_welcome_t: 'Rejouer le tour de bienvenue',
        replay_welcome_b: 'Rejoue la visite guidée de 30 secondes. Met en évidence chaque onglet.',
        replay_power_t: 'Rejouer le tour avancé',
        replay_power_b: "Second tour de 30 s sur raccourcis, arrêt, sélecteur, enregistreur et intégrations OS."
      }
    }
  };

  // ----- SPANISH (es) -----
  const es = {
    brand: {
      tagline: 'Si el conocimiento es Poder, este complemento te conecta para obtener más PODER.',
      acronym_label: 'DANMAN =',
      acronym: 'Datos y Números, Métricas y Redes',
      acronym_footer: 'Cada letra se gana su lugar.',
      pitch: 'Como despertar en Navidad y encontrar bajo el árbol todo lo que pediste — y más. El complemento imprescindible para cualquiera que viva la vida corporativa.',
      marketing: 'GetPower convierte cada pestaña en una superficie programable. Desde ranuras de portapapeles hasta pipelines email-a-Salesforce, desde selectores de elementos hasta rastreadores programados, DANMAN empaquetó toda una caja de herramientas corporativa en un solo complemento. Persistencia en Drive. Registros en Sheets. Memoria entre sesiones. Conéctate y Obtén el Poder.'
    },
    about: {
      title_prefix: '★ Bienvenido a ',
      hero_subtitle_sep: ' · v',
      stats_tabs: 'Pestañas de poder',
      stats_templates: 'Tipos de plantilla',
      stats_langs: 'Idiomas',
      section_features: 'Todo bajo el árbol',
      footer_hover: 'Pasa el cursor sobre una pestaña, campo o indicador para leer una pista. Desactiva las pistas en {0}Ajustes → UI{1} si prefieres un panel silencioso.',
      ok: 'Conéctame',
      cancel: 'Más tarde',
      features: [
        'Constructor visual de macros con generación de pasos por IA',
        'OCR por lotes para facturas, estados de cuenta, recibos y PDF escaneados',
        'Rastreo RAG del sitio con selección multi-pestaña',
        'Extracción de página, enlaces y autorrelleno de formularios en un clic',
        'Memoria persistente respaldada por carpetas de Google Drive',
        'Host de mensajería nativo para atajo de parada a nivel OS',
        'Registro en Google Sheets para cada acción que realizas',
        'Importación / exportación de cada configuración, clave y plantilla'
      ]
    },
    tour: {
      step: 'Paso',
      of: 'de',
      back: '← Atrás',
      next: 'Siguiente →',
      skip: 'Saltar tour',
      finish: '★ Obtén el Poder',
      welcome: [
        { title: '⚡ Bienvenido a GetPower', body: 'DANMAN empaquetó toda una caja de herramientas corporativa en este panel de 420 px. Este tour de 30 segundos te muestra el terreno. Pulsa Siguiente — o Saltar para sumergirte.' },
        { title: '🧱 Constructor', body: 'Arrastra tipos de paso predefinidos (Clic, Escribir, Esperar, Extraer…) en una secuencia, o describe lo que quieres y deja que DANMAN AI redacte la macro entera. Guarda, ejecuta, programa.' },
        { title: '🤖 DANMAN AI', body: 'Tu compañero de chat. Pídele una macro, un resumen de página, una extracción de entidades, lo que sea. Conoce tu memoria Drive y tus flujos guardados.' },
        { title: '🌲 Árbol (rastreo RAG)', body: 'Rastrea cualquier sitio a la profundidad elegida — o pulsa el botón Pestañas para sembrar desde otra pestaña Firefox abierta. Varios formatos de exportación.' },
        { title: '🔍 Extracción', body: 'Extrae contenido, encabezados, imágenes y tablas en un clic. Envía a Sheets, guarda en una carpeta Drive o descarga como ZIP local. Sin código.' },
        { title: '📋 Formularios', body: 'Detecta cada formulario, genera selectores, guarda plantillas de autorrelleno en Sheets, e inyecta valores uno a uno o todos a la vez. El modo AI-skip maneja campos ambiguos.' },
        { title: '🖨️ OCR (por lotes)', body: 'Suelta un PDF para vista previa, o 2+ para modo lote. OCR por IA-visión extrae texto Y entidades estructuradas — números de factura, totales, fechas, emails, teléfonos.' },
        { title: '📊 Sheets', body: 'Lee, escribe y añade a cualquier hoja de Google que poseas. A través de API o enrutado por tu webhook DANMAN para respetar los topes diarios.' },
        { title: '🧠 Memoria', body: 'Memoria de proyecto persistente respaldada por carpetas Google Drive. Tus chats IA recuerdan contexto entre sesiones y dispositivos.' },
        { title: '⚙️ Ajustes', body: 'Claves API, credenciales Sheets / Drive, instalación de host nativo, más EXPORT / IMPORT en un clic de toda configuración. Cambia de máquina sin perder nada.' },
        { title: '★ Estás conectado', body: 'Pasa el cursor sobre cualquier pestaña, campo o indicador para leer una pista. Rejuega este tour desde Ajustes → Avanzado. Ahora ve a GetPower.' }
      ],
      power: [
        { title: '⚡ Tour de usuario avanzado', body: 'Ya sabes lo que hace cada pestaña — aquí están los atajos de teclado, el botón de parada, el selector de elementos y las integraciones a nivel OS que hacen volar a GetPower. Unos 30 segundos.' },
        { title: '🛑 Parada de emergencia · Ctrl+Mayús+.', body: 'El botón rojo (y su atajo) mata todas las macros instantáneamente, libera el bloqueo de foco y escribe una entrada STOP en tu registro. Con el host nativo instalado funciona incluso desde otra ventana.' },
        { title: '🎯 Selector de elementos · Ctrl+Mayús+E', body: 'Pulsa esto y pasa el cursor por la página — cada elemento obtiene un contorno coloreado, y un clic captura su selector CSS directamente al Constructor. Te ahorra escribir selectores a mano.' },
        { title: '🎬 Grabadora de macros · Ctrl+Mayús+R', body: 'Pulsa para empezar a grabar, ejecuta el flujo en la página, pulsa de nuevo para parar. Cada clic, tecla y relleno se convierte en un paso editable y rejugable.' },
        { title: '🔒 Vinculación a ventana / pestaña', body: 'En el Constructor puedes fijar una macro a una pestaña o ventana específica. Una vez vinculada, la macro se niega a tocar nada más. Solo Alt+F4 o el atajo de parada la libera.' },
        { title: '🖥️ Host de mensajería nativo', body: 'Ayudante opcional que da a GetPower atajos a nivel OS (funcionan incluso con Firefox minimizado) y un bloqueo de foco que devuelve la ventana al frente cuando te alejas. Instala desde native_host/install-native-host.bat — Ajustes → Nativo muestra el estado.' },
        { title: '⌨️ Atajo global personalizado', body: 'Elige cualquier combinación (por defecto Ctrl+Alt+Mayús+K) en Ajustes → Nativo y el host disparará tu parada incluso desde Excel, Outlook o tu IDE.' },
        { title: '🩺 Pestaña Diagnósticos', body: 'Oculta por defecto — activa el interruptor en Ajustes → Avanzado para exponer autotests en vivo: motor de plantillas, regex OCR, ping de host nativo, salud del almacenamiento. Úsalo cuando algo no encaje.' },
        { title: '📥 Importar / Exportar config', body: 'En la parte inferior de Ajustes → Exportar Config escribe un JSON con cada clave, ID de hoja y interruptor. Importa en una máquina nueva para paridad instantánea. Las claves API se redactan por defecto; activa "Incluir secretos" si lo necesitas.' },
        { title: '⚡ Conéctate y dispara', body: 'Atajos activos, selector activo, grabadora activa, parada activa. Ahora eres un usuario avanzado de GetPower. Rejuega cualquier tour desde Ajustes → Avanzado.' }
      ]
    },
    hint: {
      header: {
        brand_t: 'Get|Power — Conéctate · Enciende',
        brand_b: 'DANMAN Solutions concentra scrape, OCR, macros IA, memoria Drive y registros Sheets en una sola barra lateral. Pulsa ★ para el tour completo.',
        about_t: 'Acerca de GetPower',
        about_b: 'Lee el acrónimo DANMAN, la lista completa de funciones y las novedades de v6.7.',
        record_t: 'Grabar macro · Ctrl+Mayús+R',
        record_b: 'Captura clics, teclas y rellenos en la página actual. Pulsa de nuevo para parar.',
        picker_t: 'Selector de elementos · Ctrl+Mayús+E',
        picker_b: 'Apunta a cualquier elemento para obtener un selector CSS que pegar en Constructor o Formularios.',
        options_t: 'Página completa de ajustes',
        options_b: 'Abre la pestaña de opciones — claves API, credenciales Sheets / Drive, host nativo, interruptores avanzados.',
        kill_t: 'PARADA DE EMERGENCIA · Ctrl+Mayús+.',
        kill_b: 'Mata todas las macros, libera el bloqueo de foco y escribe STOP en tu registro. Funciona desde otra ventana con el host nativo.'
      },
      status: {
        engine_t: 'Motor de macros',
        engine_b: 'inactivo = sin macro. ejecutando = paso en vuelo. pausado = bloqueo de foco esperando la ventana vinculada.',
        bind_t: 'Vinculación de alcance',
        bind_b: 'global = corre en cualquier pestaña. pestaña = fijado a un id. ventana = fijado a una ventana Firefox; cerrarla termina la macro.',
        native_t: 'Host nativo',
        native_b: 'Ayudante PowerShell + Win32 que habilita parada y bloqueo de foco a nivel OS. Apagado hasta que lo instales desde Ajustes → Host nativo.',
        ai_t: 'Modo IA',
        ai_b: 'webhook = pasa por tu Apps Script DANMAN. directo = usa las claves de Ajustes. ambos = repliega automáticamente.',
        hotkey_t: 'Atajo global',
        hotkey_b: 'Cuando esté verde, el host nativo monitorea tu atajo de parada incluso con Firefox en segundo plano.'
      },
      tab: {
        builder_t: 'Constructor', builder_b: 'Arrastra pasos para crear una macro. DANMAN puede redactar toda la secuencia — solo describe la intención.',
        templates_t: 'Plantillas', templates_b: 'Generador dinámico de plantillas (8 tipos × 4 lenguajes) y biblioteca de macros. Guarda, carga, puntúa con el Danny Protocol.',
        execute_t: 'Ejecutar', execute_b: 'Ejecuta una macro guardada con trazado en vivo. Vincula ventana, simula o rejuega en otra pestaña.',
        scheduler_t: 'Programador', scheduler_b: 'Disparadores cron para automatizaciones recurrentes. Corre en segundo plano vía chrome.alarms.',
        clipboard_t: 'Portapapeles', clipboard_b: '20 ranuras nombradas con sync entre pestañas. Pega directo en la página activa o reasigna atajos.',
        danman_t: 'DANMAN AI', danman_b: 'Compañero de chat. Pídele una macro, resumen, depuración o lectura de tu memoria Drive.',
        scrape_t: 'Extracción', scrape_b: 'Extracción en un clic: contenido, encabezados, imágenes, tablas. Copia, envía a Sheets, o guarda todo a Drive / ZIP local.',
        links_t: 'Enlaces', links_b: 'Enumera cada ancla, categoriza (interno / externo / mailto / tel), filtra, busca, exporta.',
        tree_t: 'Árbol (RAG)', tree_b: "Rastrea el sitio actual a la profundidad elegida — o pulsa 'Pestañas' para elegir otra pestaña abierta como semilla.",
        forms_t: 'Formularios', forms_b: 'Detecta formularios, genera selectores, guarda plantillas de autorrelleno, inyecta uno-a-uno, todo-a-la-vez o modo AI-skip.',
        memory_t: 'Memoria', memory_b: "Memoria persistente respaldada en Drive: carpetas por proyecto, personalidad DANMAN, estadísticas.",
        sheets_t: 'Sheets', sheets_b: 'Lee / escribe / añade a cualquier hoja Google por ID o URL. Vía API o vía tu webhook DANMAN.',
        ocr_t: 'OCR (lote)', ocr_b: 'Suelta un PDF para preview, o 2+ para lote. OCR IA-visión + extracción estructurada (facturas, totales, fechas, IDs).',
        eject_t: 'Pipeline EJECT', eject_b: 'Pipeline email de 5 etapas: scrape → JSONify → examinar → comparar → transferir a Salesforce o Sheets.',
        settings_t: 'Ajustes', settings_b: 'Claves API, credenciales Sheets / Drive / Salesforce, límites de scrape, e IMPORT / EXPORT de toda configuración.',
        diag_t: 'Diagnósticos', diag_b: 'Autotests en vivo: motor de plantillas, regex OCR, ping host nativo, salud de almacenamiento.'
      },
      legacy: {
        scrape_run_t: 'Ejecutar scrape', scrape_run_b: 'Saca cada bloque de texto, encabezado, imagen y tabla de la página actual. Resultado aparece en las tarjetas siguientes.',
        scrape_copy_t: 'Copiar', scrape_copy_b: 'Copia al portapapeles del sistema. Útil para pegado rápido.',
        scrape_sheets_t: 'Enviar a Sheets', scrape_sheets_b: 'Añade como nueva fila en tu hoja Google configurada.',
        scrape_drive_t: 'Guardar a Drive', scrape_drive_b: 'Empaqueta HTML + JSON + imágenes en tu carpeta Drive configurada.',
        scrape_zip_t: 'Guardar como ZIP', scrape_zip_b: 'Descarga todo en un solo archivo ZIP. Solo local.',
        links_run_t: 'Extraer enlaces', links_run_b: 'Enumera cada ancla. Categoriza interno / externo / mailto / tel.',
        links_filter_t: 'Filtrar', links_filter_b: 'Filtro en vivo por categoría o coincidencia de substring.',
        links_export_t: 'Exportar', links_export_b: 'Guarda los enlaces categorizados como CSV o JSON.',
        tree_url_t: 'URL semilla', tree_url_b: 'Donde empieza el rastreo. Por defecto la pestaña activa. Usa Pestañas para elegir otra.',
        tree_tabs_t: 'Selector de pestañas', tree_tabs_b: 'Muestra cada pestaña Firefox abierta para usar como semilla.',
        tree_depth_t: 'Profundidad máx', tree_depth_b: 'Cuántos clics de profundidad. 1 = solo página. 2 = un nivel de enlaces. >3 puede ser costoso.',
        tree_start_t: 'Empezar', tree_start_b: 'Inicia el recorrido recursivo. Estadísticas en vivo. Cancelable.',
        tree_export_t: 'Exportar árbol', tree_export_b: 'Guarda el resultado como JSON, CSV, reporte HTML o sitemap Markdown.',
        forms_scan_t: 'Escanear', forms_scan_b: 'Detecta cada <form> y todos sus campos, tipos y selectores calculados.',
        forms_template_t: 'Guardar plantilla', forms_template_b: 'Persiste tu mapeo selector + valor en Google Sheets.',
        forms_inject_t: 'Inyectar', forms_inject_b: 'Rellena campos. UNO = próximo vacío. TODOS = cada coincidencia. SKIP = IA adivina.',
        forms_pick_t: 'Elegir elemento', forms_pick_b: 'Selector visual. Click en la página para obtener un selector CSS.',
        memory_drive_t: 'ID carpeta Drive', memory_drive_b: 'Carpeta Drive donde DANMAN persiste memoria, OCR, transcripciones.',
        memory_enabled_t: 'Memoria ON/OFF', memory_enabled_b: 'Interruptor maestro. Off = chats IA sin consulta Drive.',
        memory_personality_t: 'Personalidad', memory_personality_b: 'Preámbulo libre inyectado antes de cada chat IA.',
        memory_export_t: 'Exportar config', memory_export_b: 'Descarga JSON con ID carpeta + personalidad.',
        sheets_id_t: 'ID hoja', sheets_id_b: 'ID largo entre /d/ y /edit en la URL.',
        sheets_range_t: 'Rango', sheets_range_b: 'Notación A1: NombreHoja!A1:D — deja el final abierto para auto-detectar.',
        sheets_read_t: 'Leer', sheets_read_b: 'GET el rango y renderiza como tabla.',
        sheets_write_t: 'Escribir', sheets_write_b: 'Reemplaza el rango. Destructivo — confirma.',
        sheets_append_t: 'Añadir', sheets_append_b: 'Añade filas tras la última rellena. No destructivo.',
        eject_paste_t: 'Pegar email', eject_paste_b: 'Pega texto crudo aquí. O Auto-scrape desde Gmail / Outlook abierto.',
        eject_run_t: 'Ejecutar pipeline', eject_run_b: '5 etapas: scrape → JSONify → examinar → comparar → transferir.',
        eject_transfer_t: 'Transferir', eject_transfer_b: 'Empuja el resultado validado a Salesforce o a una fila Sheets.',
        clip_slot_t: 'Ranura', clip_slot_b: 'Una de 20 ranuras nombradas. Click = cargar. Mayús+Click = pegar en la página.',
        clip_poll_t: 'Auto-captura', clip_poll_b: 'Monitorea el portapapeles y guarda en la siguiente ranura libre.',
        clip_export_t: 'Exportar', clip_export_b: 'Guarda todas las ranuras como JSON.',
        danman_send_t: 'Enviar', danman_send_b: 'Envía tu mensaje + contexto elegido (página o memoria) a la IA.',
        danman_context_t: 'Incluir contexto', danman_context_b: 'Cuando ON, página y / o memoria Drive se adjuntan como contexto.',
        danman_popout_t: 'Sacar chat', danman_popout_b: 'Desprende el chat en ventana flotante.',
        settings_export_t: 'Exportar Config', settings_export_b: 'Descarga JSON con todos los ajustes. Claves API redactadas salvo marca Incluir secretos.',
        settings_import_t: 'Importar Config', settings_import_b: 'Restaura desde JSON exportado. Útil para mudanza de máquina.'
      },
      ui: {
        language_label: 'Idioma',
        language_hint_t: 'Idioma de la interfaz',
        language_hint_b: 'Cambia cada pista, paso de tour y texto del modal Acerca de al idioma elegido. Guardado por perfil de navegador.',
        replay_welcome_t: 'Rejugar tour de bienvenida',
        replay_welcome_b: 'Rejuega el recorrido guiado de 30 segundos. Resalta cada pestaña.',
        replay_power_t: 'Rejugar tour avanzado',
        replay_power_b: 'Segundo tour de 30 s sobre atajos, parada, selector, grabadora e integraciones OS.'
      }
    }
  };

  // ----- CHINESE Simplified (zh) -----
  const zh = {
    brand: {
      tagline: '如果知识就是力量,这个扩展就是你的电源插头,给你更多的力量。',
      acronym_label: 'DANMAN =',
      acronym: '数据与数字、指标与网络',
      acronym_footer: '每个字母都名副其实。',
      pitch: '就像圣诞节早晨,你在圣诞树下发现了所有你想要的东西——还有更多。 这是每位职场人士都必备的扩展。',
      marketing: 'GetPower 把每个浏览器标签页都变成可编程界面。从剪贴板槽位到邮件转 Salesforce 管道,从元素选择器到定时爬虫——DANMAN 把整套企业工具箱打包进单一扩展。Drive 持久化。Sheets 日志。跨会话记忆。插上电,获取力量。'
    },
    about: {
      title_prefix: '★ 欢迎使用 ',
      hero_subtitle_sep: ' · v',
      stats_tabs: '功能选项卡',
      stats_templates: '模板类型',
      stats_langs: '支持语言',
      section_features: '圣诞树下的一切',
      footer_hover: '将光标悬停在选项卡、字段或状态点上即可查看快速提示。 如需安静面板,可在 {0}设置 → 界面{1} 中关闭提示。',
      ok: '为我接通',
      cancel: '稍后再说',
      features: [
        'AI 辅助生成步骤的可视化宏构建器',
        '发票、对账单、收据和扫描 PDF 的批量 OCR',
        '多标签页选择的站点树 RAG 爬取',
        '一键页面抓取、链接提取和表单自动填充',
        '由 Google Drive 文件夹支持的持久化内存',
        '用于操作系统级紧急停止热键的本地消息主机',
        '为你每个操作记录的 Google Sheets 日志',
        '所有配置、密钥和模板的导入 / 导出'
      ]
    },
    tour: {
      step: '步骤',
      of: '/',
      back: '← 返回',
      next: '下一步 →',
      skip: '跳过引导',
      finish: '★ 获取力量',
      welcome: [
        { title: '⚡ 欢迎使用 GetPower', body: 'DANMAN 把整套企业工具箱塞进了这个 420 像素宽的面板。 这个 30 秒的引导将带你认识它。 随时点击下一步——或跳过直接开始。' },
        { title: '🧱 构建器', body: '将预设步骤类型(点击、输入、等待、提取……)拖入序列,或者描述你想要的,让 DANMAN AI 起草整个宏。 保存、运行、计划。' },
        { title: '🤖 DANMAN AI', body: '你的对话伙伴。 让它写宏、总结页面、提取实体——什么都行。 它知道你的 Drive 记忆和已保存的工作流。' },
        { title: '🌲 树(RAG 爬取)', body: '将任意站点爬取到指定深度——或点击"标签页"按钮,从你打开的另一个 Firefox 标签页开始。 多种导出格式。' },
        { title: '🔍 抓取', body: '一键提取内容、标题、图片、表格。 推送到 Sheets,保存到 Drive 文件夹,或下载为本地 ZIP。 无需编码。' },
        { title: '📋 表单', body: '检测页面上的每个表单,生成选择器,将自动填充模板保存到 Sheets,然后逐字段或一次性注入值。 AI 跳过模式处理模糊字段。' },
        { title: '🖨️ OCR(批处理)', body: '放一个 PDF 进入预览模式,或放 2+ 个进入批处理模式。 AI 视觉 OCR 提取文本和结构化实体——发票号、金额、日期、邮箱、电话。' },
        { title: '📊 Sheets', body: '读取、写入和追加你拥有的任意 Google 表格。 通过 API 或经由你的 DANMAN webhook 路由,以遵守每日上限。' },
        { title: '🧠 记忆', body: '由 Google Drive 文件夹支持的持久化项目记忆。 你的 AI 对话能跨会话和设备保留上下文。' },
        { title: '⚙️ 设置', body: 'API 密钥、Sheets / Drive 凭据、本地主机安装,以及所有配置的一键 EXPORT / IMPORT。 换机器不丢东西。' },
        { title: '★ 你已接通', body: '将光标悬停在任意选项卡、字段或状态点上以查看提示。 随时从设置 → 高级 重放此引导。 现在去 GetPower 吧。' }
      ],
      power: [
        { title: '⚡ 高级用户引导', body: '现在你知道每个选项卡的功能了——以下是让 GetPower 飞起来的键盘快捷键、紧急停止、元素选择器和操作系统级集成。 约 30 秒。' },
        { title: '🛑 紧急停止 · Ctrl+Shift+.', body: '红色按钮(及其热键)瞬间杀死所有运行中的宏,释放焦点锁定,并在活动日志中写入 STOP 记录。 安装本地主机后,即使从另一个窗口也能工作。' },
        { title: '🎯 元素选择器 · Ctrl+Shift+E', body: '点击此处,然后在页面上悬停——每个被悬停的元素都会获得彩色轮廓,点击即可将其 CSS 选择器直接捕获到构建器。 省去手写选择器的麻烦。' },
        { title: '🎬 宏录制器 · Ctrl+Shift+R', body: '点击开始录制,在页面上执行工作流,再次点击停止。 每次点击、按键和填表都会成为可编辑、可重放的构建器步骤。' },
        { title: '🔒 窗口 / 标签页绑定', body: '在构建器中,你可以把宏固定到某个 Firefox 标签页或窗口。 绑定后,宏拒绝触碰其他任何地方。 只有 Alt+F4 或紧急停止热键才能解除。' },
        { title: '🖥️ 本地消息主机', body: '可选辅助程序,让 GetPower 拥有操作系统级热键(即使 Firefox 最小化也能用)和焦点锁定——当你走神时,会把绑定窗口拉回前台。 通过 native_host/install-native-host.bat 安装——设置 → 本地 显示状态。' },
        { title: '⌨️ 自定义全局热键', body: '在设置 → 本地 中选择任意组合(默认 Ctrl+Alt+Shift+K),即使在 Excel、Outlook 或 IDE 中,主机也会触发你的紧急停止。' },
        { title: '🩺 诊断选项卡', body: '默认隐藏——切换设置 → 高级 中的开关以暴露实时自检:模板引擎、OCR 正则、本地主机 ping、存储健康。 当感觉不对劲时使用。' },
        { title: '📥 导入 / 导出配置', body: '设置底部 → 导出配置 写出包含每个密钥、表格 ID 和开关的 JSON。 在新机器上导入即可即时对齐。 API 密钥默认会被遮蔽;需要时勾选"包含密钥"。' },
        { title: '⚡ 接通即用', body: '热键就绪、选择器就绪、录制器就绪、紧急停止就绪。 你已经是 GetPower 高级用户。 随时从设置 → 高级 重放任一引导。' }
      ]
    },
    hint: {
      header: {
        brand_t: 'Get|Power — 接通 · 通电',
        brand_b: 'DANMAN Solutions 把抓取、OCR、AI 宏、Drive 记忆和 Sheets 日志集中在一条侧边栏中。 点击 ★ 查看完整功能引导。',
        about_t: '关于 GetPower',
        about_b: '查阅 DANMAN 缩写、完整功能列表以及 v6.7 的更新。',
        record_t: '录制宏 · Ctrl+Shift+R',
        record_b: '捕获当前页面的点击、按键和填表。 再次点击停止。',
        picker_t: '元素选择器 · Ctrl+Shift+E',
        picker_b: '指向页面上的任意元素以获取可粘贴到构建器或表单的 CSS 选择器。',
        options_t: '完整设置页面',
        options_b: '打开选项标签页——API 密钥、Sheets / Drive 凭据、本地主机安装、高级开关。',
        kill_t: '紧急停止 · Ctrl+Shift+.',
        kill_b: '杀死所有运行中的宏,释放焦点锁定,并在活动日志中写入 STOP。 启用本地主机时,即使在别的窗口也有效。'
      },
      status: {
        engine_t: '宏引擎',
        engine_b: '空闲 = 无宏运行。 运行中 = 步骤执行中。 暂停 = 焦点锁定等待绑定窗口。',
        bind_t: '作用范围绑定',
        bind_b: '全局 = 任意标签页。 标签 = 固定到一个 id。 窗口 = 固定到一个 Firefox 窗口;关闭即结束。',
        native_t: '本地主机',
        native_b: 'PowerShell + Win32 助手,启用 OS 级紧急停止和焦点锁定。 在设置 → 本地主机 安装前为关闭状态。',
        ai_t: 'AI 模式',
        ai_b: 'webhook = 走你的 DANMAN Apps Script。 direct = 使用设置里的密钥。 both = 自动回退。',
        hotkey_t: '全局热键',
        hotkey_b: '当为绿色时,本地主机会监测你的紧急停止热键,即使 Firefox 在后台。'
      },
      tab: {
        builder_t: '构建器', builder_b: '拖动步骤创建宏。 DANMAN 可以为你起草整个序列——只需描述意图。',
        templates_t: '模板', templates_b: '动态代码模板生成器(8 类型 × 4 语言)及你的宏库。 保存、加载、用 Danny Protocol 评分。',
        execute_t: '执行', execute_b: '运行已保存的宏并查看实时步骤跟踪。 绑定窗口、试运行或在另一标签页重放。',
        scheduler_t: '调度器', scheduler_b: '类 cron 触发器用于重复自动化。 通过 chrome.alarms 在后台运行,即使侧边栏关闭。',
        clipboard_t: '剪贴板', clipboard_b: '20 个命名的剪贴板槽位,跨标签页同步。 直接粘贴到当前页或重映射热键。',
        danman_t: 'DANMAN AI', danman_b: '聊天伙伴。 让 DANMAN 写宏、总结页面、调试选择器或读取 Drive 记忆。',
        scrape_t: '抓取', scrape_b: '一键提取:内容、标题、图片、表格。 复制、推送到 Sheets,或将整包保存到 Drive / 本地 ZIP。',
        links_t: '链接', links_b: '枚举页面上每个锚点,分类(内部/外部/mailto/tel)、过滤、搜索、导出。',
        tree_t: '树(RAG)', tree_b: "把当前站点爬到指定深度——或点击「标签页」选择另一个已打开标签页作为种子 URL。",
        forms_t: '表单', forms_b: '检测表单,生成选择器,将自动填充模板保存到 Sheets,逐个、一次或 AI 跳过模式注入。',
        memory_t: '记忆', memory_b: 'Drive 持久化记忆:按项目文件夹、调教 DANMAN 个性、查看项目统计。',
        sheets_t: 'Sheets', sheets_b: '按 ID 或 URL 读取 / 写入 / 追加任意 Google 表格。 通过 API 或通过你的 DANMAN webhook。',
        ocr_t: 'OCR(批处理)', ocr_b: '放一个 PDF 进入预览模式,或 2+ 个进入批处理。 AI 视觉 OCR + 结构化提取(发票、金额、日期、ID)。',
        eject_t: 'EJECT 管道', eject_b: '5 阶段邮件处理管道:抓取 → JSON 化 → 检验 → 比对 → 转移到 Salesforce 或 Sheets。',
        settings_t: '设置', settings_b: 'API 密钥、Sheets / Drive / Salesforce 凭据、抓取限额,以及所有配置的 IMPORT / EXPORT。',
        diag_t: '诊断', diag_b: '实时自检:模板引擎、OCR 实体正则、本地主机 ping、存储健康。'
      },
      legacy: {
        scrape_run_t: '运行抓取', scrape_run_b: '从当前页面拉取每个文本块、标题、图片源和表格。 结果显示在下方卡片中。',
        scrape_copy_t: '复制', scrape_copy_b: '复制到系统剪贴板。 便于快速粘贴。',
        scrape_sheets_t: '推送到 Sheets', scrape_sheets_b: '在你配置的 Google 表格中作为新行追加。',
        scrape_drive_t: '保存到 Drive', scrape_drive_b: '把 HTML + JSON + 图片打包进你配置的 Drive 文件夹。',
        scrape_zip_t: '保存为 ZIP', scrape_zip_b: '把所有内容下载为一个 ZIP。 仅本地。',
        links_run_t: '提取链接', links_run_b: '枚举页面上每个锚点。 分类内部 / 外部 / mailto / tel。',
        links_filter_t: '过滤', links_filter_b: '按类别或子串匹配实时过滤。',
        links_export_t: '导出', links_export_b: '把分类链接保存为 CSV 或 JSON。',
        tree_url_t: '种子 URL', tree_url_b: '爬取起点。 默认为当前活动标签页。 用「标签页」按钮选择其他。',
        tree_tabs_t: '标签页选择器', tree_tabs_b: '列出每个已打开的 Firefox 标签页作为种子。',
        tree_depth_t: '最大深度', tree_depth_b: '点击穿透多深。 1 = 仅本页。 2 = 一层内部链接。 >3 可能很贵。',
        tree_start_t: '开始爬取', tree_start_b: '开始递归遍历。 实时统计。 可取消。',
        tree_export_t: '导出树', tree_export_b: '保存爬取结果为 JSON、CSV、HTML 报告或 Markdown 站点图。',
        forms_scan_t: '扫描', forms_scan_b: '检测每个 <form> 及其所有字段、类型和计算出的选择器。',
        forms_template_t: '保存模板', forms_template_b: '把选择器+值映射持久化到 Google Sheets。',
        forms_inject_t: '注入', forms_inject_b: '填充字段。 一个 = 下一个空白。 全部 = 每个匹配。 SKIP = AI 猜测。',
        forms_pick_t: '选择元素', forms_pick_b: '可视化选择器。 点击页面以获取 CSS 选择器。',
        memory_drive_t: 'Drive 文件夹 ID', memory_drive_b: 'DANMAN 持久化记忆、OCR 包、聊天记录的 Drive 文件夹。',
        memory_enabled_t: '记忆 ON/OFF', memory_enabled_b: '主开关。 OFF = AI 聊天不查询 Drive。',
        memory_personality_t: '个性', memory_personality_b: '注入到每次 DANMAN AI 对话前的自由文本种子。',
        memory_export_t: '导出配置', memory_export_b: '下载包含文件夹 ID + 个性的 JSON。',
        sheets_id_t: '表格 ID', sheets_id_b: 'Sheets URL 中 /d/ 和 /edit 之间的长 ID。',
        sheets_range_t: '范围', sheets_range_b: 'A1 表示法: 表名!A1:D ——结束行留空可自动检测。',
        sheets_read_t: '读取', sheets_read_b: 'GET 该范围并渲染为表格。',
        sheets_write_t: '写入', sheets_write_b: '替换范围内容。 破坏性 — 会确认。',
        sheets_append_t: '追加', sheets_append_b: '在最后填充行之后添加新行。 非破坏性。',
        eject_paste_t: '粘贴邮件', eject_paste_b: '把原始邮件文本粘贴到此处。 或用 Auto-scrape 从已打开的 Gmail / Outlook 拉取。',
        eject_run_t: '运行管道', eject_run_b: '5 阶段: 抓取 → JSON 化 → 检验 → 比对 → 转移。',
        eject_transfer_t: '转移', eject_transfer_b: '把验证后的结果推送到 Salesforce 或一行 Sheets。',
        clip_slot_t: '剪贴板槽位', clip_slot_b: '20 个命名槽位之一。 点击 = 载入。 Shift+点击 = 粘贴到页面。',
        clip_poll_t: '自动捕获', clip_poll_b: '监测系统剪贴板,新内容自动存到下一个空槽位。',
        clip_export_t: '导出槽位', clip_export_b: '把所有槽位保存为 JSON。',
        danman_send_t: '发送给 DANMAN', danman_send_b: '把你的消息 + 所选上下文(当前页或记忆)发给 AI。',
        danman_context_t: '包含上下文', danman_context_b: '为 ON 时,当前页面文本和 / 或 Drive 记忆作为背景上下文附加。',
        danman_popout_t: '弹出聊天', danman_popout_b: '把聊天拆为浮动窗口。',
        settings_export_t: '导出配置', settings_export_b: '下载包含每项设置的 JSON。 API 密钥默认隐去,除非勾选「包含密钥」。',
        settings_import_t: '导入配置', settings_import_b: '从之前导出的 JSON 恢复。 换机器时实用。'
      },
      ui: {
        language_label: '语言',
        language_hint_t: '界面语言',
        language_hint_b: '把每条提示、引导步骤和「关于」文案切换为所选语言。 按浏览器配置保存。',
        replay_welcome_t: '重放欢迎引导',
        replay_welcome_b: '重放 30 秒的欢迎引导。 依次高亮每个选项卡。',
        replay_power_t: '重放高级用户引导',
        replay_power_b: '第二个 30 秒引导,涵盖快捷键、紧急停止、选择器、录制器和 OS 集成。'
      }
    }
  };

  // ----- ARABIC (ar) — RTL -----
  const ar = {
    brand: {
      tagline: 'إذا كانت المعرفة قوة، فهذا الملحق يوصلك بمصدر القوة لتحصل على المزيد من القوة.',
      acronym_label: 'DANMAN =',
      acronym: 'البيانات والأرقام، المقاييس والشبكات',
      acronym_footer: 'كل حرف يستحق مكانه.',
      pitch: 'مثل الاستيقاظ صباح عيد الميلاد لتجد تحت الشجرة كل ما طلبته — وأكثر. الملحق الذي لا غنى عنه لكل من يعيش الحياة المؤسسية.',
      marketing: 'يحوّل GetPower كل علامة تبويب في المتصفح إلى سطح قابل للبرمجة. من خانات الحافظة إلى خطوط أنابيب البريد إلى Salesforce، ومن منتقي العناصر إلى الزواحف المجدولة — حشر DANMAN صندوق أدوات مؤسسي كامل في ملحق واحد. ثبات في Drive. سجلات في Sheets. ذاكرة عبر الجلسات. أوصِل القابس واحصل على القوة.'
    },
    about: {
      title_prefix: '★ مرحباً بك في ',
      hero_subtitle_sep: ' · v',
      stats_tabs: 'علامات تبويب القوة',
      stats_templates: 'أنواع القوالب',
      stats_langs: 'لغات',
      section_features: 'كل شيء تحت الشجرة',
      footer_hover: 'مرّر المؤشر فوق أي علامة تبويب أو حقل أو نقطة حالة لقراءة تلميح سريع. عطّل التلميحات من {0}الإعدادات ← واجهة المستخدم{1} إن أردت لوحة هادئة.',
      ok: 'أوصِل القابس',
      cancel: 'لاحقاً',
      features: [
        'منشئ ماكرو مرئي مع توليد خطوات بمساعدة الذكاء الاصطناعي',
        'OCR دفعي للفواتير وكشوف الحسابات والإيصالات وملفات PDF الممسوحة',
        'زحف RAG لشجرة الموقع مع اختيار متعدد العلامات',
        'استخراج صفحة، استخراج روابط، وملء نماذج بنقرة واحدة',
        'ذاكرة دائمة مدعومة بمجلدات Google Drive',
        'مضيف مراسلة أصلي لاختصار إيقاف على مستوى نظام التشغيل',
        'تسجيل في Google Sheets لكل إجراء تقوم به',
        'استيراد / تصدير كل إعداد ومفتاح وقالب'
      ]
    },
    tour: {
      step: 'الخطوة',
      of: 'من',
      back: '→ السابق',
      next: 'التالي ←',
      skip: 'تخطّي الجولة',
      finish: '★ احصل على القوة',
      welcome: [
        { title: '⚡ مرحباً بك في GetPower', body: 'حشر DANMAN صندوق أدوات مؤسسي كاملاً في هذه اللوحة بعرض 420 بكسل. هذه الجولة من 30 ثانية تعرّفك على أرضية المكان. اضغط التالي في أي وقت — أو تخطّى للانطلاق فوراً.' },
        { title: '🧱 المنشئ', body: 'اسحب أنواع الخطوات الجاهزة (نقر، كتابة، انتظار، استخراج…) إلى تسلسل، أو صف ما تريد ودَع DANMAN AI يصوغ الماكرو كله. احفظ، شغّل، جدوِل.' },
        { title: '🤖 DANMAN AI', body: 'رفيقك في الدردشة. اطلب ماكرو، ملخص صفحة، استخراج كيانات، أي شيء. يعرف ذاكرتك على Drive وسير عملك المحفوظ.' },
        { title: '🌲 الشجرة (زحف RAG)', body: 'ازحف أي موقع إلى عمق تختاره — أو اضغط زر «علامات التبويب» لتبدأ من علامة تبويب Firefox أخرى مفتوحة لديك. صيغ تصدير متعددة.' },
        { title: '🔍 الاستخراج', body: 'استخرج المحتوى والعناوين والصور والجداول بنقرة. ادفع إلى Sheets، احفظ في مجلد Drive، أو نزِّل ZIP محلي. بلا برمجة.' },
        { title: '📋 النماذج', body: 'يكتشف كل نموذج في الصفحة، يولّد المحددات، يحفظ قوالب التعبئة التلقائية في Sheets، ثم يحقن القيم خطوة بخطوة أو دفعة واحدة. وضع AI-skip يتعامل مع الحقول الغامضة.' },
        { title: '🖨️ OCR (دفعي)', body: 'أسقِط PDF واحد للمعاينة، أو 2+ للوضع الدفعي. OCR بالذكاء الاصطناعي البصري يستخرج النص والكيانات المهيكلة — أرقام الفواتير، المجاميع، التواريخ، البريد، الهواتف.' },
        { title: '📊 Sheets', body: 'اقرأ، اكتب، وألحِق إلى أي جدول Google تملكه. عبر API أو موجَّهاً عبر webhook DANMAN لاحترام السقوف اليومية.' },
        { title: '🧠 الذاكرة', body: 'ذاكرة مشاريع دائمة مدعومة بمجلدات Drive. محادثات الذكاء الاصطناعي تتذكر السياق عبر الجلسات والأجهزة.' },
        { title: '⚙️ الإعدادات', body: 'مفاتيح API، بيانات اعتماد Sheets / Drive، تثبيت المضيف الأصلي، إضافة EXPORT / IMPORT بنقرة لكل إعداد. انتقل بين الأجهزة دون فقد شيء.' },
        { title: '★ أنت موصول', body: 'مرّر فوق أي علامة تبويب أو حقل أو نقطة حالة لقراءة تلميح. أعِد تشغيل هذه الجولة من الإعدادات ← متقدم. الآن انطلق بِـ GetPower.' }
      ],
      power: [
        { title: '⚡ جولة المستخدم المتقدم', body: 'الآن تعرف وظيفة كل علامة تبويب — هنا اختصارات لوحة المفاتيح، مفتاح الإيقاف، منتقي العناصر، والتكاملات على مستوى نظام التشغيل التي تجعل GetPower يحلّق. نحو 30 ثانية.' },
        { title: '🛑 إيقاف طارئ · Ctrl+Shift+.', body: 'الزر الأحمر (واختصاره) يقتل كل ماكرو يعمل فوراً، يحرر قفل التركيز، ويكتب إدخال STOP في سجلّك. مع المضيف الأصلي يعمل حتى من نافذة أخرى.' },
        { title: '🎯 منتقي العناصر · Ctrl+Shift+E', body: 'انقر هنا ثم مرّر فوق الصفحة — كل عنصر يحصل على إطار ملوّن، والنقر يلتقط محدّده CSS مباشرة إلى المنشئ. يوفّر عليك كتابة المحددات يدوياً.' },
        { title: '🎬 مسجّل الماكرو · Ctrl+Shift+R', body: 'انقر لبدء التسجيل، نفّذ سير العمل على الصفحة، وانقر مجدداً للإيقاف. كل نقرة وضغطة مفتاح وتعبئة حقل تصبح خطوة قابلة للتحرير وإعادة التشغيل.' },
        { title: '🔒 ربط نافذة / علامة تبويب', body: 'في المنشئ يمكنك تثبيت ماكرو على علامة تبويب أو نافذة Firefox محددة. بعد الربط يرفض الماكرو لمس أي شيء آخر. فقط Alt+F4 أو اختصار الإيقاف يحرّر.' },
        { title: '🖥️ مضيف المراسلة الأصلي', body: 'مساعد اختياري يمنح GetPower اختصارات على مستوى نظام التشغيل (تعمل حتى لو كان Firefox مصغّراً) وقفل تركيز يعيد النافذة المربوطة إلى الواجهة عند الانحراف. ثبّت من native_host/install-native-host.bat — الإعدادات ← أصلي يعرض الحالة.' },
        { title: '⌨️ اختصار عام مخصص', body: 'اختر أي تركيبة (افتراضياً Ctrl+Alt+Shift+K) من الإعدادات ← أصلي، وسيشغّل المضيف إيقافك حتى من Excel أو Outlook أو محرّر الأكواد.' },
        { title: '🩺 تبويب التشخيص', body: 'مخفي افتراضياً — فعِّل المفتاح في الإعدادات ← متقدم لإظهار اختبارات ذاتية حيّة: محرك القوالب، تعابير OCR، ping المضيف الأصلي، صحة التخزين. استخدمه عند الإحساس بخلل.' },
        { title: '📥 استيراد / تصدير الإعدادات', body: 'في أسفل الإعدادات ← تصدير الإعدادات يكتب JSON بكل مفتاح ومعرف ورق ومفتاح تبديل. استورِد على جهاز جديد للحصول على نفس الحالة فوراً. مفاتيح API مخفية افتراضياً — فعّل «تضمين الأسرار» إن لزم.' },
        { title: '⚡ أوصِل وانطلق', body: 'الاختصارات نشطة، المنتقي نشط، المسجّل نشط، الإيقاف نشط. أنت الآن مستخدم متقدم لـ GetPower. أعِد تشغيل أي جولة من الإعدادات ← متقدم.' }
      ]
    },
    hint: {
      header: {
        brand_t: 'Get|Power — أوصِل · شغّل',
        brand_b: 'يجمع DANMAN Solutions الاستخراج وOCR وماكرو الذكاء الاصطناعي والذاكرة على Drive وسجلات Sheets في شريط جانبي واحد. انقر ★ لمشاهدة جولة الميزات الكاملة.',
        about_t: 'حول GetPower',
        about_b: 'اقرأ اختصار DANMAN وقائمة الميزات الكاملة وما الجديد في v6.7.',
        record_t: 'تسجيل ماكرو · Ctrl+Shift+R',
        record_b: 'يلتقط النقرات والمفاتيح وتعبئة النماذج على الصفحة الحالية. أعِد النقر للإيقاف.',
        picker_t: 'منتقي العناصر · Ctrl+Shift+E',
        picker_b: 'أشِر إلى أي عنصر على الصفحة لالتقاط محدد CSS تلصقه في المنشئ أو النماذج.',
        options_t: 'صفحة الإعدادات الكاملة',
        options_b: 'يفتح صفحة الخيارات — مفاتيح API، بيانات اعتماد Sheets / Drive، تثبيت المضيف الأصلي، مفاتيح متقدمة.',
        kill_t: 'إيقاف طارئ · Ctrl+Shift+.',
        kill_b: 'يقتل كل ماكرو يعمل، يحرر قفل التركيز، ويكتب STOP في السجل. يعمل حتى من نافذة أخرى عند تفعيل المضيف الأصلي.'
      },
      status: {
        engine_t: 'محرك الماكرو',
        engine_b: 'خامل = لا ماكرو يعمل. قيد التشغيل = خطوة في الطريق. متوقف مؤقتاً = قفل التركيز ينتظر النافذة المربوطة.',
        bind_t: 'ربط النطاق',
        bind_b: 'عام = يعمل على أي علامة تبويب. علامة تبويب = مثبت على معرف واحد. نافذة = مثبت على نافذة Firefox؛ إغلاقها ينهي الماكرو.',
        native_t: 'المضيف الأصلي',
        native_b: 'مساعد PowerShell + Win32 يفعّل الإيقاف الطارئ وقفل التركيز على مستوى نظام التشغيل. مغلق حتى تثبّته من الإعدادات ← المضيف الأصلي.',
        ai_t: 'وضع الذكاء الاصطناعي',
        ai_b: 'webhook = يمرّ عبر Apps Script لـ DANMAN. direct = يستخدم المفاتيح من الإعدادات. both = يعود تلقائياً.',
        hotkey_t: 'اختصار عام',
        hotkey_b: 'عندما يكون أخضر، يراقب المضيف الأصلي اختصار الإيقاف حتى لو كان Firefox في الخلفية.'
      },
      tab: {
        builder_t: 'المنشئ', builder_b: 'اسحب الخطوات لإنشاء ماكرو. يستطيع DANMAN صياغة التسلسل كله — فقط صِف القصد.',
        templates_t: 'القوالب', templates_b: 'مولد قوالب كود ديناميكي (8 أنواع × 4 لغات) ومكتبة الماكرو. احفظ، حمّل، عدّل، صنّف بـ Danny Protocol.',
        execute_t: 'تشغيل', execute_b: 'شغّل أي ماكرو محفوظ بتتبع خطوات حيّ. ربط نافذة، تجربة، أو إعادة تشغيل على علامة تبويب أخرى.',
        scheduler_t: 'المجدول', scheduler_b: 'مشغّلات بنمط cron للأتمتة المتكررة. يعمل في الخلفية عبر chrome.alarms حتى لو كان الشريط الجانبي مغلقاً.',
        clipboard_t: 'الحافظة', clipboard_b: '20 خانة حافظة مسماة مع مزامنة عبر العلامات. الصق مباشرة على الصفحة النشطة أو أعد تعيين الاختصارات.',
        danman_t: 'DANMAN AI', danman_b: 'رفيق الدردشة. اطلب من DANMAN كتابة ماكرو، تلخيص صفحة، تصحيح محدد، أو قراءة ذاكرة Drive.',
        scrape_t: 'الاستخراج', scrape_b: 'استخراج بنقرة: محتوى، عناوين، صور، جداول. انسخ، ادفع إلى Sheets، أو احفظ الحزمة كاملة إلى Drive / ZIP محلي.',
        links_t: 'الروابط', links_b: 'يعدّ كل رابط في الصفحة، يصنّف (داخلي / خارجي / mailto / tel)، يصفّي، يبحث، ويصدّر.',
        tree_t: 'الشجرة (RAG)', tree_b: 'يزحف الموقع الحالي إلى عمق محدد — أو اضغط «علامات التبويب» لاختيار علامة تبويب أخرى كنقطة بداية.',
        forms_t: 'النماذج', forms_b: 'يكتشف النماذج، يولّد المحددات، يحفظ قوالب التعبئة التلقائية، يحقن القيم خطوة-خطوة، دفعة، أو وضع AI-skip.',
        memory_t: 'الذاكرة', memory_b: 'ذاكرة دائمة مدعومة بـ Drive: مجلدات لكل مشروع، ضبط شخصية DANMAN، عرض إحصاءات.',
        sheets_t: 'Sheets', sheets_b: 'قراءة / كتابة / إلحاق لأي جدول Google عبر ID أو URL. عبر API أو عبر webhook DANMAN.',
        ocr_t: 'OCR (دفعي)', ocr_b: 'أسقط PDF واحداً للمعاينة، أو 2+ للدفعي. OCR ذكاء بصري + استخراج مهيكل (فواتير، مجاميع، تواريخ، معرفات).',
        eject_t: 'خط أنابيب EJECT', eject_b: 'خط أنابيب بريد من 5 مراحل: استخراج ← JSON ← فحص ← مقارنة ← نقل إلى Salesforce أو Sheets.',
        settings_t: 'الإعدادات', settings_b: 'مفاتيح API، اعتمادات Sheets / Drive / Salesforce، حدود الاستخراج، وIMPORT / EXPORT لكل إعداد.',
        diag_t: 'التشخيص', diag_b: 'اختبارات ذاتية حية: محرك القوالب، تعابير OCR، ping المضيف الأصلي، صحة التخزين.'
      },
      legacy: {
        scrape_run_t: 'تشغيل الاستخراج', scrape_run_b: 'يسحب كل كتلة نص وعنوان ومصدر صورة وجدول من الصفحة الحالية. النتيجة تظهر في البطاقات أدناه.',
        scrape_copy_t: 'نسخ', scrape_copy_b: 'نسخ إلى حافظة النظام. مفيد للصق سريع.',
        scrape_sheets_t: 'إرسال إلى Sheets', scrape_sheets_b: 'يضيف كصف جديد في جدول Google المهيأ.',
        scrape_drive_t: 'حفظ إلى Drive', scrape_drive_b: 'يحزم HTML + JSON + الصور في مجلد Drive المهيأ.',
        scrape_zip_t: 'حفظ كـ ZIP', scrape_zip_b: 'ينزّل كل شيء في ملف ZIP واحد. محلياً فقط.',
        links_run_t: 'استخراج روابط', links_run_b: 'يعدّ كل رابط في الصفحة. يصنّف داخلي / خارجي / mailto / tel.',
        links_filter_t: 'تصفية', links_filter_b: 'تصفية حيّة حسب الفئة أو مطابقة جزء النص.',
        links_export_t: 'تصدير', links_export_b: 'احفظ الروابط المصنّفة كـ CSV أو JSON.',
        tree_url_t: 'URL البداية', tree_url_b: 'حيث يبدأ الزحف. افتراضياً التبويب النشط. استخدم زر «علامات التبويب» للاختيار.',
        tree_tabs_t: 'منتقي علامات التبويب', tree_tabs_b: 'يكشف كل علامة تبويب Firefox مفتوحة لاستخدامها كبداية.',
        tree_depth_t: 'أقصى عمق', tree_depth_b: 'كم نقرة للعمق. 1 = الصفحة فقط. 2 = مستوى واحد من الروابط. >3 قد يكون مكلفاً.',
        tree_start_t: 'بدء', tree_start_b: 'يبدأ الزحف التكراري. إحصاءات حيّة. قابل للإلغاء.',
        tree_export_t: 'تصدير الشجرة', tree_export_b: 'احفظ النتيجة كـ JSON أو CSV أو تقرير HTML أو خريطة Markdown.',
        forms_scan_t: 'مسح', forms_scan_b: 'يكتشف كل <form> وكل حقولها وأنواعها ومحدداتها المحسوبة.',
        forms_template_t: 'حفظ قالب', forms_template_b: 'يثبّت تخطيطك محدد + قيمة في Google Sheets.',
        forms_inject_t: 'حقن', forms_inject_b: 'يملأ الحقول. واحد = التالي الفارغ. الكل = كل تطابق. SKIP = الذكاء يخمن.',
        forms_pick_t: 'اختيار عنصر', forms_pick_b: 'منتقي مرئي. انقر على الصفحة للحصول على محدد CSS.',
        memory_drive_t: 'معرف مجلد Drive', memory_drive_b: 'مجلد Drive حيث يثبّت DANMAN الذاكرة وOCR والمحادثات.',
        memory_enabled_t: 'الذاكرة ON/OFF', memory_enabled_b: 'مفتاح رئيسي. OFF = محادثات الذكاء لا تستعلم Drive.',
        memory_personality_t: 'الشخصية', memory_personality_b: 'بذرة نص حر تسبق كل محادثة AI.',
        memory_export_t: 'تصدير الإعدادات', memory_export_b: 'تنزيل JSON يحتوي معرف المجلد + الشخصية.',
        sheets_id_t: 'معرف الجدول', sheets_id_b: 'المعرف الطويل بين /d/ و /edit في URL.',
        sheets_range_t: 'النطاق', sheets_range_b: 'تدوين A1: اسم!A1:D — اترك نهاية السطر مفتوحة للاكتشاف التلقائي.',
        sheets_read_t: 'قراءة', sheets_read_b: 'GET النطاق ويعرضه كجدول.',
        sheets_write_t: 'كتابة', sheets_write_b: 'يستبدل محتوى النطاق. هدّام — يطلب تأكيداً.',
        sheets_append_t: 'إلحاق', sheets_append_b: 'يضيف صفوفاً بعد آخر صف معبأ. غير هدّام.',
        eject_paste_t: 'لصق بريد', eject_paste_b: 'ألصق نص البريد الخام هنا. أو Auto-scrape من Gmail / Outlook المفتوح.',
        eject_run_t: 'تشغيل خط الأنابيب', eject_run_b: '5 مراحل: استخراج ← JSON ← فحص ← مقارنة ← نقل.',
        eject_transfer_t: 'نقل', eject_transfer_b: 'يدفع النتيجة المؤكدة إلى Salesforce أو صف Sheets.',
        clip_slot_t: 'خانة حافظة', clip_slot_b: 'واحدة من 20 خانة مسماة. نقر = تحميل. Shift+نقر = لصق على الصفحة.',
        clip_poll_t: 'التقاط تلقائي', clip_poll_b: 'يراقب الحافظة ويحفظ المحتوى الجديد في الخانة الفارغة التالية.',
        clip_export_t: 'تصدير الخانات', clip_export_b: 'احفظ كل الخانات كـ JSON.',
        danman_send_t: 'إرسال إلى DANMAN', danman_send_b: 'يرسل رسالتك + السياق المختار (الصفحة الحالية أو الذاكرة) إلى الذكاء.',
        danman_context_t: 'تضمين سياق', danman_context_b: 'عند ON، يُرفق نص الصفحة و/أو ذاكرة Drive كسياق خلفي.',
        danman_popout_t: 'إخراج المحادثة', danman_popout_b: 'يفصل المحادثة إلى نافذة عائمة.',
        settings_export_t: 'تصدير الإعدادات', settings_export_b: 'يحمّل JSON بكل الإعدادات. مفاتيح API مخفية ما لم تختر تضمين الأسرار.',
        settings_import_t: 'استيراد الإعدادات', settings_import_b: 'استعادة من JSON مصدَّر. مفيد للانتقال بين الأجهزة.'
      },
      ui: {
        language_label: 'اللغة',
        language_hint_t: 'لغة الواجهة',
        language_hint_b: 'يبدّل كل تلميح وخطوة جولة ونصوص «حول» إلى اللغة المختارة. محفوظ لكل ملف تعريف متصفح.',
        replay_welcome_t: 'إعادة جولة الترحيب',
        replay_welcome_b: 'إعادة تشغيل الجولة الموجهة لمدة 30 ثانية. يبرز كل علامة تبويب.',
        replay_power_t: 'إعادة جولة المتقدم',
        replay_power_b: 'جولة ثانية مدتها 30 ثانية حول الاختصارات والإيقاف والمنتقي والمسجل وتكامل OS.'
      }
    }
  };

  // ----- PUNJABI (pa) -----
  const pa = {
    brand: {
      tagline: 'ਜੇ ਗਿਆਨ ਹੀ ਸ਼ਕਤੀ ਹੈ, ਤਾਂ ਇਹ ਐਡ-ਆਨ ਤੁਹਾਨੂੰ ਜੋੜ ਕੇ ਹੋਰ ਸ਼ਕਤੀ ਦੇਵੇਗਾ।',
      acronym_label: 'DANMAN =',
      acronym: 'ਡੇਟਾ ਅਤੇ ਨੰਬਰ, ਮੈਟ੍ਰਿਕਸ ਅਤੇ ਨੈੱਟਵਰਕ',
      acronym_footer: 'ਹਰੇਕ ਅੱਖਰ ਆਪਣੀ ਥਾਂ ਦਾ ਹੱਕਦਾਰ ਹੈ।',
      pitch: 'ਜਿਵੇਂ ਕ੍ਰਿਸਮਸ ਦੀ ਸਵੇਰ ਉੱਠ ਕੇ ਰੁੱਖ ਥੱਲੇ ਉਹ ਸਭ ਕੁਝ ਮਿਲ ਜਾਏ ਜੋ ਤੁਸੀਂ ਮੰਗਿਆ ਸੀ — ਅਤੇ ਉਸ ਤੋਂ ਵੱਧ ਵੀ। ਕਾਰਪੋਰੇਟ ਜੀਵਨ ਜੀਣ ਵਾਲੇ ਹਰ ਕਿਸੇ ਲਈ ਜ਼ਰੂਰੀ ਐਡ-ਆਨ।',
      marketing: 'GetPower ਹਰ ਬ੍ਰਾਊਜ਼ਰ ਟੈਬ ਨੂੰ ਇੱਕ ਪ੍ਰੋਗਰਾਮ-ਯੋਗ ਸਤਹ ਵਿੱਚ ਬਦਲਦਾ ਹੈ। ਕਲਿੱਪਬੋਰਡ ਸਲੋਟਾਂ ਤੋਂ ਲੈ ਕੇ ਈਮੇਲ-ਟੂ-Salesforce ਪਾਈਪਲਾਈਨਾਂ ਤੱਕ, ਐਲੀਮੈਂਟ ਪਿੱਕਰਾਂ ਤੋਂ ਨਿਯਤ ਕ੍ਰਾਲਰਾਂ ਤੱਕ — DANMAN ਨੇ ਇੱਕ ਪੂਰਾ ਕਾਰਪੋਰੇਟ ਟੂਲਕਿਟ ਇੱਕ ਐਡ-ਆਨ ਵਿੱਚ ਪੈਕ ਕੀਤਾ ਹੈ। Drive ਵਿੱਚ ਪਰਸਿਸਟੈਂਸ। Sheets ਵਿੱਚ ਲਾਗ। ਸੈਸ਼ਨਾਂ ਵਿੱਚ ਮੈਮੋਰੀ। ਪਲੱਗ ਇਨ ਕਰੋ ਅਤੇ ਸ਼ਕਤੀ ਪਾਓ।'
    },
    about: {
      title_prefix: '★ ਜੀ ਆਇਆਂ ਨੂੰ ',
      hero_subtitle_sep: ' · v',
      stats_tabs: 'ਸ਼ਕਤੀ ਟੈਬਾਂ',
      stats_templates: 'ਟੈਂਪਲੇਟ ਕਿਸਮਾਂ',
      stats_langs: 'ਭਾਸ਼ਾਵਾਂ',
      section_features: 'ਰੁੱਖ ਥੱਲੇ ਸਭ ਕੁਝ',
      footer_hover: 'ਕਿਸੇ ਵੀ ਟੈਬ, ਫੀਲਡ ਜਾਂ ਸਥਿਤੀ ਡਾਟ ਉੱਤੇ ਕਰਸਰ ਰੱਖ ਕੇ ਛੋਟਾ ਹਿੰਟ ਪੜ੍ਹੋ। ਚੁੱਪ ਪੈਨਲ ਚਾਹੁੰਦੇ ਹੋ ਤਾਂ {0}ਸੈਟਿੰਗ → UI{1} ਵਿੱਚ ਹਿੰਟਸ ਬੰਦ ਕਰ ਦਿਓ।',
      ok: 'ਮੈਨੂੰ ਜੋੜੋ',
      cancel: 'ਬਾਅਦ ਵਿੱਚ',
      features: [
        'AI-ਸਹਾਇਤਾ ਨਾਲ ਪੜਾਅ ਉਤਪਾਦਨ ਵਾਲਾ ਵਿਜ਼ੂਅਲ ਮੈਕਰੋ ਬਿਲਡਰ',
        'ਇਨਵਾਇਸ, ਸਟੇਟਮੈਂਟਾਂ, ਰਸੀਦਾਂ ਅਤੇ ਸਕੈਨ ਕੀਤੇ PDFs ਲਈ ਬੈਚ OCR',
        'ਮਲਟੀ-ਟੈਬ ਚੋਣ ਨਾਲ ਸਾਈਟ-ਟ੍ਰੀ RAG ਕ੍ਰਾਲ',
        'ਇੱਕ-ਕਲਿੱਕ ਪੰਨਾ ਸਕ੍ਰੈਪ, ਲਿੰਕ ਐਕਸਟ੍ਰੈਕਸ਼ਨ ਅਤੇ ਫਾਰਮ ਆਟੋਫਿਲ',
        'Google Drive ਫੋਲਡਰਾਂ ਨਾਲ ਸਥਾਈ ਮੈਮੋਰੀ',
        'OS-ਪੱਧਰ ਕਿਲ-ਸਵਿੱਚ ਹੌਟਕੀ ਲਈ ਨੇਟਿਵ ਮੈਸੇਜਿੰਗ ਹੋਸਟ',
        'ਤੁਹਾਡੀ ਹਰ ਕਾਰਵਾਈ ਲਈ Google Sheets ਲਾਗਿੰਗ',
        'ਹਰ ਕੌਨਫਿਗ, ਕੁੰਜੀ ਅਤੇ ਟੈਂਪਲੇਟ ਦੀ ਆਯਾਤ / ਨਿਰਯਾਤ'
      ]
    },
    tour: {
      step: 'ਪੜਾਅ',
      of: '/',
      back: '← ਪਿੱਛੇ',
      next: 'ਅੱਗੇ →',
      skip: 'ਟੂਰ ਛੱਡੋ',
      finish: '★ ਸ਼ਕਤੀ ਪਾਓ',
      welcome: [
        { title: '⚡ GetPower ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ', body: 'DANMAN ਨੇ ਇੱਕ ਪੂਰਾ ਐਂਟਰਪ੍ਰਾਈਜ਼ ਟੂਲਕਿਟ ਇਸ 420px ਪੈਨਲ ਵਿੱਚ ਪੈਕ ਕੀਤਾ ਹੈ। ਇਹ 30-ਸੈਕੰਡ ਦਾ ਟੂਰ ਤੁਹਾਨੂੰ ਜ਼ਮੀਨ ਦਿਖਾਉਂਦਾ ਹੈ। ਕਦੇ ਵੀ ਅੱਗੇ ਦਬਾਓ — ਜਾਂ ਛੱਡੋ ਅਤੇ ਸਿੱਧਾ ਡੁੱਬੋ।' },
        { title: '🧱 ਬਿਲਡਰ', body: 'ਪੂਰਵ-ਨਿਰਮਿਤ ਪੜਾਅ ਕਿਸਮਾਂ (ਕਲਿੱਕ, ਟਾਈਪ, ਉਡੀਕ, ਐਕਸਟ੍ਰੈਕਟ…) ਨੂੰ ਇੱਕ ਕ੍ਰਮ ਵਿੱਚ ਖਿੱਚੋ, ਜਾਂ ਤੁਸੀਂ ਜੋ ਚਾਹੁੰਦੇ ਹੋ ਉਸਦੀ ਵਿਆਖਿਆ ਕਰੋ ਅਤੇ DANMAN AI ਨੂੰ ਪੂਰੀ ਮੈਕਰੋ ਖਰੜਾ ਬਣਾਉਣ ਦਿਓ। ਸੁਰੱਖਿਅਤ ਕਰੋ, ਚਲਾਓ, ਅਨੁਸੂਚਿਤ ਕਰੋ।' },
        { title: '🤖 DANMAN AI', body: 'ਤੁਹਾਡਾ ਚੈਟ ਸਾਥੀ। ਮੈਕਰੋ, ਪੰਨਾ ਸਾਰ, ਇਕਾਈ ਐਕਸਟ੍ਰੈਕਸ਼ਨ — ਕੁਝ ਵੀ ਮੰਗੋ। ਇਹ ਤੁਹਾਡੀ Drive ਮੈਮੋਰੀ ਅਤੇ ਸੁਰੱਖਿਅਤ ਵਰਕਫਲੋ ਜਾਣਦਾ ਹੈ।' },
        { title: '🌲 ਟ੍ਰੀ (RAG ਕ੍ਰਾਲ)', body: 'ਚੁਣੀ ਡੂੰਘਾਈ ਤੱਕ ਕਿਸੇ ਵੀ ਸਾਈਟ ਨੂੰ ਕ੍ਰਾਲ ਕਰੋ — ਜਾਂ ਖੁੱਲ੍ਹੀ ਕਿਸੇ ਵੀ Firefox ਟੈਬ ਨੂੰ ਬੀਜ ਵਜੋਂ ਚੁਣਨ ਲਈ "ਟੈਬਾਂ" ਬਟਨ ਦਬਾਓ। ਕਈ ਨਿਰਯਾਤ ਫਾਰਮੈਟ।' },
        { title: '🔍 ਸਕ੍ਰੈਪ', body: 'ਇੱਕ-ਕਲਿੱਕ: ਸਮੱਗਰੀ, ਸਿਰਲੇਖ, ਚਿੱਤਰ, ਸਾਰਣੀਆਂ। Sheets ਨੂੰ ਪੁਸ਼ ਕਰੋ, Drive ਫੋਲਡਰ ਵਿੱਚ ਸੁਰੱਖਿਅਤ ਕਰੋ, ਜਾਂ ਲੋਕਲ ZIP ਡਾਊਨਲੋਡ ਕਰੋ। ਕੋਈ ਕੋਡਿੰਗ ਨਹੀਂ।' },
        { title: '📋 ਫਾਰਮ', body: 'ਪੰਨੇ ਉੱਤੇ ਹਰ ਫਾਰਮ ਪਛਾਣੋ, ਸਿਲੈਕਟਰ ਬਣਾਓ, ਆਟੋਫਿਲ ਟੈਂਪਲੇਟਾਂ ਨੂੰ Sheets ਵਿੱਚ ਸੁਰੱਖਿਅਤ ਕਰੋ, ਫਿਰ ਇੱਕ-ਇੱਕ ਜਾਂ ਇੱਕ-ਸਾਰੇ ਮੁੱਲ ਟੀਕਾ ਲਗਾਓ। AI-skip ਮੋਡ ਅਸਪਸ਼ਟ ਫੀਲਡਾਂ ਨੂੰ ਸੰਭਾਲਦਾ ਹੈ।' },
        { title: '🖨️ OCR (ਬੈਚ)', body: 'ਪ੍ਰੀਵਿਊ ਲਈ ਇੱਕ PDF ਛੱਡੋ, ਜਾਂ ਬੈਚ ਮੋਡ ਲਈ 2+। AI-vision OCR ਟੈਕਸਟ ਅਤੇ ਢਾਂਚਾਗਤ ਇਕਾਈਆਂ ਕੱਢਦਾ ਹੈ — ਇਨਵਾਇਸ ਨੰਬਰ, ਕੁੱਲ, ਤਾਰੀਖਾਂ, ਈਮੇਲ, ਫੋਨ।' },
        { title: '📊 Sheets', body: 'ਆਪਣੀ ਕਿਸੇ ਵੀ Google ਸ਼ੀਟ ਨੂੰ ਪੜ੍ਹੋ, ਲਿਖੋ, ਅਤੇ ਜੋੜੋ। API ਰਾਹੀਂ ਜਾਂ ਆਪਣੇ DANMAN webhook ਰਾਹੀਂ ਰੋਜ਼ਾਨਾ ਸੀਮਾਵਾਂ ਲਾਗੂ ਕਰਨ ਲਈ।' },
        { title: '🧠 ਮੈਮੋਰੀ', body: 'Google Drive ਫੋਲਡਰਾਂ ਦੁਆਰਾ ਸਮਰਥਿਤ ਸਥਾਈ ਪ੍ਰੋਜੈਕਟ ਮੈਮੋਰੀ। ਤੁਹਾਡੀਆਂ AI ਚੈਟ ਸੈਸ਼ਨਾਂ ਅਤੇ ਡਿਵਾਈਸਾਂ ਵਿੱਚ ਸੰਦਰਭ ਯਾਦ ਰੱਖਦੀਆਂ ਹਨ।' },
        { title: '⚙️ ਸੈਟਿੰਗ', body: 'API ਕੁੰਜੀਆਂ, Sheets / Drive ਪ੍ਰਮਾਣ-ਪੱਤਰ, ਨੇਟਿਵ ਹੋਸਟ ਇੰਸਟਾਲ, ਅਤੇ ਹਰ ਕੌਨਫਿਗ ਦਾ ਇੱਕ-ਕਲਿੱਕ EXPORT / IMPORT। ਬਿਨਾਂ ਕੁਝ ਗੁਆਏ ਮਸ਼ੀਨਾਂ ਬਦਲੋ।' },
        { title: '★ ਤੁਸੀਂ ਜੁੜ ਗਏ', body: 'ਹਿੰਟ ਪੜ੍ਹਨ ਲਈ ਕਿਸੇ ਵੀ ਟੈਬ, ਫੀਲਡ ਜਾਂ ਸਥਿਤੀ ਡਾਟ ਉੱਤੇ ਕਰਸਰ ਰੱਖੋ। ਸੈਟਿੰਗ → ਉੱਨਤ ਤੋਂ ਕਿਸੇ ਵੀ ਸਮੇਂ ਇਹ ਟੂਰ ਮੁੜ ਚਲਾਓ। ਹੁਣ GetPower ਜਾਓ।' }
      ],
      power: [
        { title: '⚡ ਪਾਵਰ-ਯੂਜ਼ਰ ਟੂਰ', body: 'ਹੁਣ ਤੁਸੀਂ ਜਾਣਦੇ ਹੋ ਕਿ ਹਰ ਟੈਬ ਕੀ ਕਰਦੀ ਹੈ — ਇੱਥੇ ਕੀਬੋਰਡ ਸ਼ਾਰਟਕੱਟ, ਕਿਲ ਸਵਿੱਚ, ਐਲੀਮੈਂਟ ਪਿੱਕਰ ਅਤੇ OS-ਪੱਧਰ ਏਕੀਕਰਨ ਹਨ ਜੋ GetPower ਨੂੰ ਉਡਾਉਂਦੇ ਹਨ। ਲਗਭਗ 30 ਸੈਕੰਡ।' },
        { title: '🛑 ਐਮਰਜੈਂਸੀ ਸਟਾਪ · Ctrl+Shift+.', body: 'ਲਾਲ ਬਟਨ (ਅਤੇ ਇਸਦੀ ਹੌਟਕੀ) ਹਰ ਚੱਲ ਰਹੇ ਮੈਕਰੋ ਨੂੰ ਤੁਰੰਤ ਮਾਰ ਦਿੰਦੀ ਹੈ, ਫੋਕਸ-ਲੌਕ ਛੱਡ ਦਿੰਦੀ ਹੈ ਅਤੇ ਤੁਹਾਡੀ ਗਤੀਵਿਧੀ ਲੌਗ ਵਿੱਚ STOP ਐਂਟਰੀ ਲਿਖਦੀ ਹੈ। ਨੇਟਿਵ ਹੋਸਟ ਨਾਲ ਇਹ ਦੂਜੀ ਵਿੰਡੋ ਤੋਂ ਵੀ ਕੰਮ ਕਰਦੀ ਹੈ।' },
        { title: '🎯 ਐਲੀਮੈਂਟ ਪਿੱਕਰ · Ctrl+Shift+E', body: 'ਇਸ ਨੂੰ ਦਬਾਓ ਫਿਰ ਪੰਨੇ ਉੱਤੇ ਘੁੰਮਾਓ — ਹਰ ਐਲੀਮੈਂਟ ਨੂੰ ਰੰਗੀਨ ਰੂਪਰੇਖਾ ਮਿਲਦੀ ਹੈ, ਅਤੇ ਇੱਕ ਕਲਿੱਕ ਇਸਦੇ CSS ਸਿਲੈਕਟਰ ਨੂੰ ਸਿੱਧੇ ਬਿਲਡਰ ਵਿੱਚ ਫੜਦੀ ਹੈ। ਹੱਥ ਨਾਲ ਸਿਲੈਕਟਰ ਲਿਖਣ ਤੋਂ ਬਚਾਉਂਦਾ ਹੈ।' },
        { title: '🎬 ਮੈਕਰੋ ਰਿਕਾਰਡਰ · Ctrl+Shift+R', body: 'ਰਿਕਾਰਡਿੰਗ ਸ਼ੁਰੂ ਕਰਨ ਲਈ ਦਬਾਓ, ਪੰਨੇ ਉੱਤੇ ਵਰਕਫਲੋ ਕਰੋ, ਰੋਕਣ ਲਈ ਦੁਬਾਰਾ ਦਬਾਓ। ਹਰ ਕਲਿੱਕ, ਕੀ-ਪ੍ਰੈਸ ਅਤੇ ਫਾਰਮ-ਫਿਲ ਇੱਕ ਸੰਪਾਦਨ-ਯੋਗ, ਮੁੜ-ਚਲਾਉਣ-ਯੋਗ ਪੜਾਅ ਬਣ ਜਾਂਦੀ ਹੈ।' },
        { title: '🔒 ਵਿੰਡੋ / ਟੈਬ ਬਾਈਡਿੰਗ', body: 'ਬਿਲਡਰ ਵਿੱਚ ਤੁਸੀਂ ਇੱਕ ਮੈਕਰੋ ਨੂੰ ਇੱਕ ਖਾਸ Firefox ਟੈਬ ਜਾਂ ਵਿੰਡੋ ਨਾਲ ਜੋੜ ਸਕਦੇ ਹੋ। ਜੁੜਣ ਤੋਂ ਬਾਅਦ, ਮੈਕਰੋ ਕਿਸੇ ਹੋਰ ਚੀਜ਼ ਨੂੰ ਛੂਹਣ ਤੋਂ ਇਨਕਾਰ ਕਰਦੀ ਹੈ। ਸਿਰਫ਼ Alt+F4 ਜਾਂ ਕਿਲ ਹੌਟਕੀ ਛੱਡਦੀ ਹੈ।' },
        { title: '🖥️ ਨੇਟਿਵ ਮੈਸੇਜਿੰਗ ਹੋਸਟ', body: 'ਚੋਣਵਾਂ ਸਹਾਇਕ ਜੋ GetPower ਨੂੰ OS-ਪੱਧਰ ਹੌਟਕੀਆਂ (Firefox ਘੱਟੋ-ਘੱਟ ਹੋਣ ਉੱਤੇ ਵੀ ਕੰਮ ਕਰਦੀਆਂ ਹਨ) ਅਤੇ ਫੋਕਸ-ਲੌਕ ਦਿੰਦਾ ਹੈ ਜੋ ਜੁੜੀ ਵਿੰਡੋ ਨੂੰ ਅੱਗੇ ਲਿਆਉਂਦਾ ਹੈ ਜਦੋਂ ਤੁਸੀਂ ਭਟਕ ਜਾਂਦੇ ਹੋ। native_host/install-native-host.bat ਤੋਂ ਇੰਸਟਾਲ ਕਰੋ — ਸੈਟਿੰਗ → ਨੇਟਿਵ ਸਥਿਤੀ ਦਿਖਾਉਂਦੀ ਹੈ।' },
        { title: '⌨️ ਕਸਟਮ ਗਲੋਬਲ ਹੌਟਕੀ', body: 'ਸੈਟਿੰਗ → ਨੇਟਿਵ ਵਿੱਚ ਕੋਈ ਵੀ ਕੰਬੋ ਚੁਣੋ (ਡਿਫਾਲਟ Ctrl+Alt+Shift+K) ਅਤੇ ਹੋਸਟ Excel, Outlook ਜਾਂ ਤੁਹਾਡੇ IDE ਤੋਂ ਵੀ ਤੁਹਾਡਾ ਕਿਲ ਸਵਿੱਚ ਚਲਾਏਗਾ।' },
        { title: '🩺 ਡਾਇਗਨੋਸਟਿਕਸ ਟੈਬ', body: 'ਡਿਫਾਲਟ ਤੌਰ ਤੇ ਛੁਪੀ — ਸੈਟਿੰਗ → ਉੱਨਤ ਟੌਗਲ ਫਲਿੱਪ ਕਰੋ ਤਾਂ ਜੋ ਲਾਈਵ ਸੈਲਫ-ਟੈਸਟ ਦਿਖਾਏ ਜਾਣ: ਟੈਂਪਲੇਟ ਇੰਜਣ, OCR regex, ਨੇਟਿਵ ਹੋਸਟ ਪਿੰਗ, ਸਟੋਰੇਜ ਸੈਨਿਟੀ। ਜਦੋਂ ਕੁਝ ਠੀਕ ਨਾ ਲੱਗੇ ਤਾਂ ਵਰਤੋ।' },
        { title: '📥 ਆਯਾਤ / ਨਿਰਯਾਤ ਕੌਨਫਿਗ', body: 'ਸੈਟਿੰਗ ਦੇ ਹੇਠਾਂ → ਕੌਨਫਿਗ ਨਿਰਯਾਤ ਹਰ ਕੁੰਜੀ, ਸ਼ੀਟ ID ਅਤੇ ਟੌਗਲ ਨਾਲ JSON ਲਿਖਦਾ ਹੈ। ਨਵੀਂ ਮਸ਼ੀਨ ਉੱਤੇ ਆਯਾਤ ਕਰੋ। API ਕੁੰਜੀਆਂ ਡਿਫਾਲਟ ਛੁਪੀਆਂ ਹਨ; ਲੋੜ ਹੋਵੇ ਤਾਂ "ਸੀਕ੍ਰੇਟ ਸ਼ਾਮਲ ਕਰੋ" ਟੌਗਲ ਕਰੋ।' },
        { title: '⚡ ਪਲੱਗ ਇਨ ਕਰੋ ਅਤੇ ਚੱਲੋ', body: 'ਹੌਟਕੀਆਂ ਲਾਈਵ, ਪਿੱਕਰ ਲਾਈਵ, ਰਿਕਾਰਡਰ ਲਾਈਵ, ਕਿਲ ਸਵਿੱਚ ਲਾਈਵ। ਹੁਣ ਤੁਸੀਂ ਇੱਕ GetPower ਪਾਵਰ-ਯੂਜ਼ਰ ਹੋ। ਸੈਟਿੰਗ → ਉੱਨਤ ਤੋਂ ਕੋਈ ਵੀ ਟੂਰ ਮੁੜ ਚਲਾਓ।' }
      ]
    },
    hint: {
      header: {
        brand_t: 'Get|Power — ਪਲੱਗ ਇਨ · ਪਾਵਰ ਅੱਪ',
        brand_b: 'DANMAN Solutions ਸਕ੍ਰੈਪ, OCR, AI ਮੈਕਰੋ, Drive ਮੈਮੋਰੀ ਅਤੇ Sheets ਲਾਗਿੰਗ ਨੂੰ ਇੱਕ ਸਾਈਡਬਾਰ ਵਿੱਚ ਪੈਕ ਕਰਦਾ ਹੈ। ਪੂਰਾ ਫੀਚਰ ਟੂਰ ਵੇਖਣ ਲਈ ★ ਦਬਾਓ।',
        about_t: 'GetPower ਬਾਰੇ',
        about_b: 'DANMAN ਸੰਖੇਪ, ਪੂਰੀ ਫੀਚਰ ਸੂਚੀ ਅਤੇ v6.7 ਵਿੱਚ ਨਵਾਂ ਪੜ੍ਹੋ।',
        record_t: 'ਮੈਕਰੋ ਰਿਕਾਰਡ · Ctrl+Shift+R',
        record_b: 'ਮੌਜੂਦਾ ਪੰਨੇ ਉੱਤੇ ਕਲਿੱਕ, ਕੀਸਟ੍ਰੋਕ ਅਤੇ ਫਾਰਮ-ਫਿਲ ਫੜੋ। ਦੁਬਾਰਾ ਦਬਾਉਣ ਨਾਲ ਰੁਕ ਜਾਏਗੀ।',
        picker_t: 'ਐਲੀਮੈਂਟ ਪਿੱਕਰ · Ctrl+Shift+E',
        picker_b: 'CSS ਸਿਲੈਕਟਰ ਫੜਨ ਲਈ ਪੰਨੇ ਦੇ ਕਿਸੇ ਵੀ ਐਲੀਮੈਂਟ ਉੱਤੇ ਇਸ਼ਾਰਾ ਕਰੋ।',
        options_t: 'ਪੂਰੀ ਸੈਟਿੰਗ ਪੰਨਾ',
        options_b: 'ਚੋਣਾਂ ਟੈਬ ਖੋਲ੍ਹਦਾ ਹੈ — API ਕੁੰਜੀਆਂ, Sheets / Drive ਪ੍ਰਮਾਣ-ਪੱਤਰ, ਨੇਟਿਵ ਹੋਸਟ, ਉੱਨਤ ਟੌਗਲ।',
        kill_t: 'ਐਮਰਜੈਂਸੀ ਸਟਾਪ · Ctrl+Shift+.',
        kill_b: 'ਹਰ ਚੱਲ ਰਹੀ ਮੈਕਰੋ ਨੂੰ ਮਾਰ ਦਿੰਦੀ ਹੈ, ਫੋਕਸ-ਲੌਕ ਛੱਡਦੀ ਹੈ, ਅਤੇ ਤੁਹਾਡੀ ਗਤੀਵਿਧੀ ਲੌਗ ਵਿੱਚ STOP ਐਂਟਰੀ ਲਿਖਦੀ ਹੈ। ਨੇਟਿਵ ਹੋਸਟ ਯੋਗ ਹੋਣ ਉੱਤੇ ਦੂਜੀ ਵਿੰਡੋ ਤੋਂ ਵੀ ਕੰਮ ਕਰਦੀ ਹੈ।'
      },
      status: {
        engine_t: 'ਮੈਕਰੋ ਇੰਜਣ',
        engine_b: 'idle = ਕੋਈ ਮੈਕਰੋ ਨਹੀਂ। running = ਪੜਾਅ ਚੱਲ ਰਿਹਾ। paused = ਫੋਕਸ-ਲੌਕ ਜੁੜੀ ਵਿੰਡੋ ਦੀ ਉਡੀਕ ਕਰ ਰਹੀ ਹੈ।',
        bind_t: 'ਸਕੋਪ ਬਾਈਡਿੰਗ',
        bind_b: 'global = ਕਿਸੇ ਵੀ ਟੈਬ ਉੱਤੇ। tab = ਇੱਕ id ਨਾਲ ਜੁੜੀ। window = ਇੱਕ Firefox ਵਿੰਡੋ ਨਾਲ; ਬੰਦ ਕਰਨ ਨਾਲ ਖ਼ਤਮ।',
        native_t: 'ਨੇਟਿਵ ਹੋਸਟ',
        native_b: 'PowerShell + Win32 ਸਹਾਇਕ ਜੋ OS-ਪੱਧਰ ਕਿਲ-ਸਵਿੱਚ ਅਤੇ ਫੋਕਸ-ਲੌਕ ਯੋਗ ਕਰਦਾ ਹੈ। ਸੈਟਿੰਗ → ਨੇਟਿਵ ਹੋਸਟ ਤੋਂ ਇੰਸਟਾਲ ਕਰਨ ਤਕ ਬੰਦ ਹੈ।',
        ai_t: 'AI ਮੋਡ',
        ai_b: 'webhook = ਤੁਹਾਡੇ DANMAN Apps Script ਰਾਹੀਂ। direct = ਸੈਟਿੰਗ ਵਿੱਚ ਪਾਈਆਂ ਕੁੰਜੀਆਂ ਵਰਤਦਾ ਹੈ। both = ਆਪਣੇ ਆਪ ਫਾਲ-ਬੈਕ।',
        hotkey_t: 'ਗਲੋਬਲ ਹੌਟਕੀ',
        hotkey_b: 'ਹਰੀ ਹੋਣ ਉੱਤੇ ਨੇਟਿਵ ਹੋਸਟ Firefox ਬੈਕਗ੍ਰਾਉਂਡ ਵਿੱਚ ਹੋਣ ਉੱਤੇ ਵੀ ਤੁਹਾਡੀ ਕਿਲ ਹੌਟਕੀ ਪੋਲ ਕਰਦਾ ਹੈ।'
      },
      tab: {
        builder_t: 'ਬਿਲਡਰ', builder_b: 'ਮੈਕਰੋ ਬਣਾਉਣ ਲਈ ਪੜਾਅ ਖਿੱਚੋ। DANMAN ਪੂਰਾ ਕ੍ਰਮ ਖਰੜਾ ਬਣਾ ਸਕਦਾ ਹੈ — ਬੱਸ ਇਰਾਦਾ ਦੱਸੋ।',
        templates_t: 'ਟੈਂਪਲੇਟ', templates_b: 'ਡਾਇਨਾਮਿਕ ਕੋਡ-ਟੈਂਪਲੇਟ ਜਨਰੇਟਰ (8 ਕਿਸਮਾਂ × 4 ਭਾਸ਼ਾਵਾਂ) ਅਤੇ ਮੈਕਰੋ ਲਾਇਬ੍ਰੇਰੀ। Danny Protocol ਨਾਲ ਸਕੋਰ ਕਰੋ।',
        execute_t: 'ਚਲਾਓ', execute_b: 'ਲਾਈਵ ਪੜਾਅ ਟ੍ਰੇਸ ਨਾਲ ਕੋਈ ਵੀ ਸੁਰੱਖਿਅਤ ਮੈਕਰੋ ਚਲਾਓ। ਵਿੰਡੋ-ਬਾਈਂਡ, ਡ੍ਰਾਈ-ਰਨ, ਜਾਂ ਕਿਸੇ ਹੋਰ ਟੈਬ ਉੱਤੇ ਮੁੜ-ਚਲਾਓ।',
        scheduler_t: 'ਅਨੁਸੂਚਕ', scheduler_b: 'ਆਵਰਤੀ ਆਟੋਮੇਸ਼ਨਾਂ ਲਈ cron-ਸ਼ੈਲੀ ਟ੍ਰਿਗਰ। chrome.alarms ਰਾਹੀਂ ਬੈਕਗ੍ਰਾਉਂਡ ਵਿੱਚ ਚੱਲਦਾ ਹੈ।',
        clipboard_t: 'ਕਲਿੱਪਬੋਰਡ', clipboard_b: 'ਕਰਾਸ-ਟੈਬ ਸਿੰਕ ਨਾਲ 20 ਨਾਮ ਵਾਲੀਆਂ ਕਲਿੱਪਬੋਰਡ ਸਲੋਟਾਂ।',
        danman_t: 'DANMAN AI', danman_b: 'ਚੈਟ ਸਾਥੀ। DANMAN ਨੂੰ ਮੈਕਰੋ ਲਿਖਣ, ਪੰਨਾ ਸਾਰਾਂਸ਼, ਸਿਲੈਕਟਰ ਡੀਬੱਗ ਜਾਂ Drive ਮੈਮੋਰੀ ਪੜ੍ਹਨ ਲਈ ਕਹੋ।',
        scrape_t: 'ਸਕ੍ਰੈਪ', scrape_b: 'ਇੱਕ-ਕਲਿੱਕ ਐਕਸਟ੍ਰੈਕਟ: ਸਮੱਗਰੀ, ਸਿਰਲੇਖ, ਚਿੱਤਰ, ਸਾਰਣੀਆਂ। ਕਾਪੀ, Sheets ਨੂੰ ਪੁਸ਼, ਜਾਂ ਪੂਰਾ ਬੰਡਲ Drive / ਲੋਕਲ ZIP ਵਿੱਚ ਸੁਰੱਖਿਅਤ ਕਰੋ।',
        links_t: 'ਲਿੰਕ', links_b: 'ਹਰ ਐਂਕਰ ਦੀ ਗਿਣਤੀ ਕਰੋ, ਵਰਗੀਕ੍ਰਿਤ ਕਰੋ, ਫਿਲਟਰ ਕਰੋ, ਖੋਜੋ ਅਤੇ ਨਿਰਯਾਤ ਕਰੋ।',
        tree_t: 'ਟ੍ਰੀ (RAG)', tree_b: "ਮੌਜੂਦਾ ਸਾਈਟ ਨੂੰ ਚੁਣੀ ਡੂੰਘਾਈ ਤੱਕ ਕ੍ਰਾਲ ਕਰੋ — ਜਾਂ ਕਿਸੇ ਹੋਰ ਖੁੱਲ੍ਹੀ ਟੈਬ ਨੂੰ ਬੀਜ ਚੁਣਨ ਲਈ 'ਟੈਬਾਂ' ਦਬਾਓ।",
        forms_t: 'ਫਾਰਮ', forms_b: 'ਫਾਰਮ ਪਛਾਣੋ, ਸਿਲੈਕਟਰ ਬਣਾਓ, ਆਟੋਫਿਲ ਟੈਂਪਲੇਟ Sheets ਵਿੱਚ ਸੁਰੱਖਿਅਤ ਕਰੋ।',
        memory_t: 'ਮੈਮੋਰੀ', memory_b: 'Drive-ਸਮਰਥਿਤ ਸਥਾਈ ਮੈਮੋਰੀ: ਪ੍ਰਤੀ-ਪ੍ਰੋਜੈਕਟ ਫੋਲਡਰ, DANMAN ਸ਼ਖਸੀਅਤ, ਅੰਕੜੇ।',
        sheets_t: 'Sheets', sheets_b: 'ID ਜਾਂ URL ਰਾਹੀਂ ਕਿਸੇ ਵੀ Google ਸ਼ੀਟ ਨੂੰ ਪੜ੍ਹੋ / ਲਿਖੋ / ਜੋੜੋ।',
        ocr_t: 'OCR (ਬੈਚ)', ocr_b: 'ਪ੍ਰੀਵਿਊ ਲਈ ਇੱਕ PDF ਛੱਡੋ, ਜਾਂ ਬੈਚ ਮੋਡ ਲਈ 2+। AI-vision OCR + ਢਾਂਚਾਗਤ ਐਕਸਟ੍ਰੈਕਸ਼ਨ।',
        eject_t: 'EJECT ਪਾਈਪਲਾਈਨ', eject_b: '5-ਪੜਾਅ ਈਮੇਲ ਪਾਈਪਲਾਈਨ: ਸਕ੍ਰੈਪ → JSONify → ਜਾਂਚ → ਤੁਲਨਾ → Salesforce ਜਾਂ Sheets।',
        settings_t: 'ਸੈਟਿੰਗ', settings_b: 'API ਕੁੰਜੀਆਂ, ਪ੍ਰਮਾਣ-ਪੱਤਰ, ਸਕ੍ਰੈਪ ਸੀਮਾਵਾਂ, ਅਤੇ ਹਰ ਕੌਨਫਿਗ ਦਾ IMPORT / EXPORT।',
        diag_t: 'ਡਾਇਗਨੋਸਟਿਕਸ', diag_b: 'ਲਾਈਵ ਸੈਲਫ-ਟੈਸਟ: ਟੈਂਪਲੇਟ ਇੰਜਣ, OCR ਇਕਾਈ regex, ਨੇਟਿਵ ਹੋਸਟ ਪਿੰਗ, ਸਟੋਰੇਜ ਸੈਨਿਟੀ।'
      },
      legacy: {
        scrape_run_t: 'ਸਕ੍ਰੈਪ ਚਲਾਓ', scrape_run_b: 'ਮੌਜੂਦਾ ਪੰਨੇ ਤੋਂ ਹਰ ਟੈਕਸਟ ਬਲਾਕ, ਸਿਰਲੇਖ, ਚਿੱਤਰ ਅਤੇ ਸਾਰਣੀ ਖਿੱਚਦਾ ਹੈ।',
        scrape_copy_t: 'ਕਾਪੀ', scrape_copy_b: 'ਸਿਸਟਮ ਕਲਿੱਪਬੋਰਡ ਉੱਤੇ ਕਾਪੀ।',
        scrape_sheets_t: 'Sheets ਨੂੰ ਭੇਜੋ', scrape_sheets_b: 'ਤੁਹਾਡੀ ਸੰਰਚਿਤ Google ਸ਼ੀਟ ਵਿੱਚ ਨਵੀਂ ਕਤਾਰ ਜੋੜੋ।',
        scrape_drive_t: 'Drive ਵਿੱਚ ਸੁਰੱਖਿਅਤ', scrape_drive_b: 'HTML + JSON + ਚਿੱਤਰ Drive ਫੋਲਡਰ ਵਿੱਚ ਬੰਡਲ।',
        scrape_zip_t: 'ZIP ਵਜੋਂ ਸੁਰੱਖਿਅਤ', scrape_zip_b: 'ਸਭ ਕੁਝ ਇੱਕ ZIP ਫਾਈਲ ਵਿੱਚ ਡਾਊਨਲੋਡ।',
        links_run_t: 'ਲਿੰਕ ਕੱਢੋ', links_run_b: 'ਪੰਨੇ ਉੱਤੇ ਹਰ ਐਂਕਰ ਦੀ ਗਿਣਤੀ ਕਰੋ।',
        links_filter_t: 'ਫਿਲਟਰ', links_filter_b: 'ਸ਼੍ਰੇਣੀ ਜਾਂ ਉਪ-ਸਟ੍ਰਿੰਗ ਨਾਲ ਲਾਈਵ ਫਿਲਟਰ।',
        links_export_t: 'ਨਿਰਯਾਤ', links_export_b: 'ਵਰਗੀਕ੍ਰਿਤ ਲਿੰਕ CSV ਜਾਂ JSON ਵਜੋਂ ਸੁਰੱਖਿਅਤ।',
        tree_url_t: 'ਬੀਜ URL', tree_url_b: 'ਜਿੱਥੇ ਕ੍ਰਾਲ ਸ਼ੁਰੂ ਹੁੰਦਾ ਹੈ। ਡਿਫਾਲਟ ਮੌਜੂਦਾ ਟੈਬ।',
        tree_tabs_t: 'ਟੈਬ ਚੁਣੋ', tree_tabs_b: 'ਹਰ ਖੁੱਲ੍ਹੀ Firefox ਟੈਬ ਦਿਖਾਉਂਦਾ ਹੈ।',
        tree_depth_t: 'ਅਧਿਕਤਮ ਡੂੰਘਾਈ', tree_depth_b: 'ਕਿੰਨੀ ਡੂੰਘਾਈ ਤੱਕ ਕ੍ਰਾਲ। 1 = ਸਿਰਫ਼ ਇਹ ਪੰਨਾ। >3 ਮਹਿੰਗਾ ਹੋ ਸਕਦਾ ਹੈ।',
        tree_start_t: 'ਸ਼ੁਰੂ', tree_start_b: 'ਪੁਨਰਾਵਰਤੀ ਯਾਤਰਾ ਸ਼ੁਰੂ। ਲਾਈਵ ਅੰਕੜੇ।',
        tree_export_t: 'ਟ੍ਰੀ ਨਿਰਯਾਤ', tree_export_b: 'ਨਤੀਜਾ JSON, CSV, HTML ਜਾਂ Markdown ਵਜੋਂ ਸੁਰੱਖਿਅਤ।',
        forms_scan_t: 'ਸਕੈਨ', forms_scan_b: 'ਹਰ <form> ਅਤੇ ਇਸਦੇ ਫੀਲਡ ਪਛਾਣੋ।',
        forms_template_t: 'ਟੈਂਪਲੇਟ ਸੁਰੱਖਿਅਤ ਕਰੋ', forms_template_b: 'ਸਿਲੈਕਟਰ + ਮੁੱਲ ਮੈਪਿੰਗ Sheets ਵਿੱਚ ਥਾਪੀ।',
        forms_inject_t: 'ਇੰਜੈਕਟ', forms_inject_b: 'ਫੀਲਡ ਭਰੋ। ਇੱਕ = ਅਗਲਾ ਖਾਲੀ। ਸਾਰੇ = ਹਰ ਮੇਲ। SKIP = AI ਅੰਦਾਜ਼ਾ।',
        forms_pick_t: 'ਐਲੀਮੈਂਟ ਚੁਣੋ', forms_pick_b: 'ਵਿਜ਼ੂਅਲ ਸਿਲੈਕਟਰ।',
        memory_drive_t: 'Drive ਫੋਲਡਰ ID', memory_drive_b: 'DANMAN ਪ੍ਰੋਜੈਕਟ ਮੈਮੋਰੀ ਅਤੇ ਟ੍ਰਾਂਸਕ੍ਰਿਪਟ ਦਾ ਫੋਲਡਰ।',
        memory_enabled_t: 'ਮੈਮੋਰੀ ON/OFF', memory_enabled_b: 'ਮਾਸਟਰ ਟੌਗਲ।',
        memory_personality_t: 'ਸ਼ਖਸੀਅਤ', memory_personality_b: 'ਹਰ ਚੈਟ ਤੋਂ ਪਹਿਲਾਂ ਜੋੜਿਆ ਜਾਂਦਾ ਟੈਕਸਟ।',
        memory_export_t: 'ਕੌਨਫਿਗ ਨਿਰਯਾਤ', memory_export_b: 'ਫੋਲਡਰ ID + ਸ਼ਖਸੀਅਤ ਦਾ JSON ਡਾਊਨਲੋਡ।',
        sheets_id_t: 'ਸ਼ੀਟ ID', sheets_id_b: 'Sheets URL ਵਿੱਚ /d/ ਅਤੇ /edit ਵਿਚਕਾਰਲਾ ਲੰਬਾ ID।',
        sheets_range_t: 'ਰੇਂਜ', sheets_range_b: 'A1 ਨੋਟੇਸ਼ਨ: SheetName!A1:D।',
        sheets_read_t: 'ਪੜ੍ਹੋ', sheets_read_b: 'GET ਰੇਂਜ ਅਤੇ ਸਾਰਣੀ ਵਜੋਂ ਦਿਖਾਓ।',
        sheets_write_t: 'ਲਿਖੋ', sheets_write_b: 'ਰੇਂਜ ਬਦਲੋ। ਨਸ਼ਟ ਕਰਨ ਵਾਲਾ।',
        sheets_append_t: 'ਜੋੜੋ', sheets_append_b: 'ਆਖਰੀ ਭਰੀ ਕਤਾਰ ਤੋਂ ਬਾਅਦ ਨਵੀਆਂ ਕਤਾਰਾਂ ਜੋੜੋ।',
        eject_paste_t: 'ਈਮੇਲ ਪੇਸਟ', eject_paste_b: 'ਕੱਚਾ ਈਮੇਲ ਟੈਕਸਟ ਇੱਥੇ ਪੇਸਟ ਕਰੋ।',
        eject_run_t: 'ਪਾਈਪਲਾਈਨ ਚਲਾਓ', eject_run_b: '5 ਪੜਾਅ: ਸਕ੍ਰੈਪ → JSON → ਜਾਂਚ → ਤੁਲਨਾ → ਟ੍ਰਾਂਸਫਰ।',
        eject_transfer_t: 'ਟ੍ਰਾਂਸਫਰ', eject_transfer_b: 'ਨਤੀਜਾ Salesforce ਜਾਂ Sheets ਨੂੰ ਭੇਜੋ।',
        clip_slot_t: 'ਕਲਿੱਪਬੋਰਡ ਸਲੋਟ', clip_slot_b: '20 ਨਾਮ ਵਾਲੀਆਂ ਸਲੋਟਾਂ ਵਿੱਚੋਂ ਇੱਕ।',
        clip_poll_t: 'ਆਟੋ-ਕੈਪਚਰ', clip_poll_b: 'ਸਿਸਟਮ ਕਲਿੱਪਬੋਰਡ ਪੋਲ ਕਰੋ ਅਤੇ ਅਗਲੀ ਖਾਲੀ ਸਲੋਟ ਵਿੱਚ ਸੁਰੱਖਿਅਤ ਕਰੋ।',
        clip_export_t: 'ਨਿਰਯਾਤ', clip_export_b: 'ਸਾਰੀਆਂ ਸਲੋਟਾਂ JSON ਵਜੋਂ ਸੁਰੱਖਿਅਤ।',
        danman_send_t: 'ਭੇਜੋ', danman_send_b: 'ਆਪਣਾ ਸੁਨੇਹਾ + ਚੁਣਿਆ ਸੰਦਰਭ AI ਨੂੰ ਭੇਜੋ।',
        danman_context_t: 'ਸੰਦਰਭ ਸ਼ਾਮਲ', danman_context_b: 'ON ਉੱਤੇ ਮੌਜੂਦਾ ਪੰਨੇ ਜਾਂ Drive ਮੈਮੋਰੀ ਸ਼ਾਮਲ।',
        danman_popout_t: 'ਚੈਟ ਪੌਪ-ਆਉਟ', danman_popout_b: 'ਚੈਟ ਨੂੰ ਫਲੋਟਿੰਗ ਵਿੰਡੋ ਵਿੱਚ ਕੱਢੋ।',
        settings_export_t: 'ਕੌਨਫਿਗ ਨਿਰਯਾਤ', settings_export_b: 'ਹਰ ਸੈਟਿੰਗ ਦਾ JSON ਡਾਊਨਲੋਡ।',
        settings_import_t: 'ਕੌਨਫਿਗ ਆਯਾਤ', settings_import_b: 'ਪੁਰਾਣੇ JSON ਤੋਂ ਮੁੜ-ਬਹਾਲ।'
      },
      ui: {
        language_label: 'ਭਾਸ਼ਾ',
        language_hint_t: 'ਇੰਟਰਫੇਸ ਭਾਸ਼ਾ',
        language_hint_b: 'ਹਰ ਹਿੰਟ, ਟੂਰ ਪੜਾਅ ਅਤੇ About ਟੈਕਸਟ ਨੂੰ ਚੁਣੀ ਭਾਸ਼ਾ ਵਿੱਚ ਬਦਲਦਾ ਹੈ।',
        replay_welcome_t: 'ਜੀ ਆਇਆਂ ਟੂਰ ਮੁੜ ਚਲਾਓ',
        replay_welcome_b: '30-ਸੈਕੰਡ ਦਾ ਗਾਈਡਡ ਵਾਕਥਰੂ ਮੁੜ ਚਲਾਓ।',
        replay_power_t: 'ਪਾਵਰ-ਯੂਜ਼ਰ ਟੂਰ ਮੁੜ ਚਲਾਓ',
        replay_power_b: 'ਸ਼ਾਰਟਕੱਟ, ਕਿਲ ਸਵਿੱਚ, ਪਿੱਕਰ, ਰਿਕਾਰਡਰ ਅਤੇ OS ਏਕੀਕਰਨ ਲਈ ਦੂਜਾ ਟੂਰ।'
      }
    }
  };

  // ----- HINDI (hi) -----
  const hi = {
    brand: {
      tagline: 'अगर ज्ञान ही शक्ति है, तो यह ऐड-ऑन आपको और शक्ति पाने के लिए जोड़ देता है।',
      acronym_label: 'DANMAN =',
      acronym: 'डेटा और संख्याएँ, मेट्रिक्स और नेटवर्क',
      acronym_footer: 'हर अक्षर अपनी जगह बनाता है।',
      pitch: 'जैसे क्रिसमस की सुबह उठकर पेड़ के नीचे वह सब कुछ मिल जाए जो आपने माँगा था — और उससे भी अधिक। कॉर्पोरेट जीवन जीने वाले हर व्यक्ति के लिए अनिवार्य ऐड-ऑन।',
      marketing: 'GetPower हर ब्राउज़र टैब को एक प्रोग्राम-योग्य सतह में बदल देता है। क्लिपबोर्ड स्लॉट्स से लेकर ईमेल-टू-Salesforce पाइपलाइनों तक, एलिमेंट पिकर्स से शेड्यूल्ड क्रॉलर्स तक — DANMAN ने पूरा एंटरप्राइज़ टूलकिट एक ऐड-ऑन में पैक किया है। Drive में पर्सिस्टेंस। Sheets में लॉग। सत्रों भर मेमोरी। प्लग इन करें और शक्ति पाएँ।'
    },
    about: {
      title_prefix: '★ स्वागत है ',
      hero_subtitle_sep: ' · v',
      stats_tabs: 'शक्ति टैब्स',
      stats_templates: 'टेम्पलेट प्रकार',
      stats_langs: 'भाषाएँ',
      section_features: 'पेड़ के नीचे सब कुछ',
      footer_hover: 'किसी भी टैब, फ़ील्ड या स्थिति बिंदु पर कर्सर रखकर त्वरित संकेत पढ़ें। शांत पैनल चाहिए तो {0}सेटिंग्स → UI{1} में संकेत बंद करें।',
      ok: 'मुझे जोड़ें',
      cancel: 'बाद में',
      features: [
        'AI-सहायित चरण उत्पादन के साथ विज़ुअल मैक्रो बिल्डर',
        'इनवॉइस, स्टेटमेंट, रसीदें और स्कैन किए गए PDFs के लिए बैच OCR',
        'मल्टी-टैब चयन के साथ साइट-ट्री RAG क्रॉल',
        'एक-क्लिक पेज स्क्रैप, लिंक एक्सट्रैक्शन और फॉर्म ऑटोफिल',
        'Google Drive फ़ोल्डरों द्वारा समर्थित स्थायी मेमोरी',
        'OS-स्तरीय किल-स्विच हॉटकी के लिए नेटिव मैसेजिंग होस्ट',
        'आपकी हर कार्रवाई के लिए Google Sheets लॉगिंग',
        'हर कॉन्फ़िग, कुंजी और टेम्पलेट का आयात / निर्यात'
      ]
    },
    tour: {
      step: 'चरण',
      of: '/',
      back: '← पिछला',
      next: 'अगला →',
      skip: 'टूर छोड़ें',
      finish: '★ शक्ति पाएँ',
      welcome: [
        { title: '⚡ GetPower में स्वागत', body: 'DANMAN ने पूरा एंटरप्राइज़ टूलकिट इस 420px पैनल में पैक किया है। यह 30-सेकंड का टूर आपको पूरा परिदृश्य दिखाता है। कभी भी अगला दबाएँ — या छोड़ें और तुरंत डुबकी लगाएँ।' },
        { title: '🧱 बिल्डर', body: 'पूर्व-निर्मित चरण प्रकार (क्लिक, टाइप, प्रतीक्षा, एक्सट्रैक्ट…) को क्रम में खींचें, या जो चाहिए वह बताएँ और DANMAN AI को पूरा मैक्रो ड्राफ़्ट करने दें। सहेजें, चलाएँ, शेड्यूल करें।' },
        { title: '🤖 DANMAN AI', body: 'आपका चैट साथी। मैक्रो, पेज सारांश, इकाई एक्सट्रैक्शन — कुछ भी माँगें। यह आपकी Drive मेमोरी और सहेजे गए वर्कफ़्लो जानता है।' },
        { title: '🌲 ट्री (RAG क्रॉल)', body: 'किसी भी साइट को चुनी हुई गहराई तक क्रॉल करें — या किसी अन्य खुले Firefox टैब को बीज के रूप में चुनने के लिए "टैब्स" बटन दबाएँ। कई निर्यात फॉर्मैट।' },
        { title: '🔍 स्क्रैप', body: 'एक-क्लिक: सामग्री, शीर्षक, चित्र, तालिकाएँ। Sheets पर पुश करें, Drive फ़ोल्डर में सहेजें, या लोकल ZIP डाउनलोड करें। कोई कोडिंग नहीं।' },
        { title: '📋 फॉर्म', body: 'पेज पर हर फॉर्म पहचानें, सिलेक्टर बनाएँ, ऑटोफिल टेम्पलेट Sheets में सहेजें, फिर एक-एक करके या एक साथ मान इंजेक्ट करें। AI-skip मोड अस्पष्ट फ़ील्डों को संभालता है।' },
        { title: '🖨️ OCR (बैच)', body: 'प्रीव्यू के लिए एक PDF छोड़ें, या बैच मोड के लिए 2+। AI-vision OCR टेक्स्ट और संरचित इकाइयाँ निकालता है — इनवॉइस संख्या, कुल, तिथियाँ, ईमेल, फ़ोन।' },
        { title: '📊 Sheets', body: 'अपनी किसी भी Google शीट को पढ़ें, लिखें और जोड़ें। API के माध्यम से या आपके DANMAN webhook के माध्यम से।' },
        { title: '🧠 मेमोरी', body: 'Google Drive फ़ोल्डरों द्वारा समर्थित स्थायी प्रोजेक्ट मेमोरी। आपकी AI चैट सत्रों और डिवाइसों भर संदर्भ याद रखती है।' },
        { title: '⚙️ सेटिंग्स', body: 'API कुंजियाँ, Sheets / Drive क्रेडेंशियल, नेटिव होस्ट इंस्टॉल, और हर कॉन्फ़िग का एक-क्लिक EXPORT / IMPORT।' },
        { title: '★ आप जुड़े हैं', body: 'संकेत पढ़ने के लिए किसी भी टैब, फ़ील्ड या स्थिति बिंदु पर कर्सर रखें। सेटिंग्स → उन्नत से कभी भी यह टूर फिर से चलाएँ।' }
      ],
      power: [
        { title: '⚡ पावर-यूज़र टूर', body: 'अब आप जानते हैं कि हर टैब क्या करता है — यहाँ कीबोर्ड शॉर्टकट, किल स्विच, एलिमेंट पिकर और OS-स्तरीय एकीकरण हैं जो GetPower को उड़ान भरने देते हैं। लगभग 30 सेकंड।' },
        { title: '🛑 आपातकालीन रोक · Ctrl+Shift+.', body: 'लाल बटन (और इसकी हॉटकी) हर चल रहे मैक्रो को तुरंत मार देता है, फ़ोकस-लॉक मुक्त करता है और आपके गतिविधि लॉग में STOP प्रविष्टि लिखता है। नेटिव होस्ट स्थापित होने पर यह किसी अन्य विंडो से भी काम करता है।' },
        { title: '🎯 एलिमेंट पिकर · Ctrl+Shift+E', body: 'इस पर क्लिक करें फिर पेज पर होवर करें — हर एलिमेंट को रंगीन रूपरेखा मिलती है, और एक क्लिक उसके CSS सिलेक्टर को सीधे बिल्डर में पकड़ लेती है।' },
        { title: '🎬 मैक्रो रिकॉर्डर · Ctrl+Shift+R', body: 'रिकॉर्डिंग शुरू करने के लिए क्लिक करें, पेज पर वर्कफ़्लो करें, रोकने के लिए फिर क्लिक करें। हर क्लिक, कीप्रेस और फ़ील्ड भरना एक संपादन-योग्य चरण बन जाता है।' },
        { title: '🔒 विंडो / टैब बाइंडिंग', body: 'बिल्डर में आप मैक्रो को किसी विशेष Firefox टैब या विंडो से जोड़ सकते हैं। जुड़ने के बाद, मैक्रो किसी और चीज़ को छूने से इनकार करता है।' },
        { title: '🖥️ नेटिव मैसेजिंग होस्ट', body: 'वैकल्पिक सहायक जो GetPower को OS-स्तरीय हॉटकी (Firefox न्यूनतमीकृत होने पर भी काम करते हैं) और फ़ोकस-लॉक देता है। native_host/install-native-host.bat से इंस्टॉल करें।' },
        { title: '⌨️ कस्टम वैश्विक हॉटकी', body: 'सेटिंग्स → नेटिव में कोई भी संयोजन (डिफ़ॉल्ट Ctrl+Alt+Shift+K) चुनें और होस्ट Excel, Outlook या आपके IDE से भी आपका किल स्विच चलाएगा।' },
        { title: '🩺 निदान टैब', body: 'डिफ़ॉल्ट रूप से छिपा — सेटिंग्स → उन्नत में टॉगल पलटें ताकि लाइव सेल्फ-टेस्ट प्रदर्शित हों।' },
        { title: '📥 आयात / निर्यात कॉन्फ़िग', body: 'सेटिंग्स के नीचे → कॉन्फ़िग निर्यात हर कुंजी, शीट ID और टॉगल के साथ JSON लिखता है। नई मशीन पर आयात करें।' },
        { title: '⚡ प्लग इन करें और चलें', body: 'हॉटकी सक्रिय, पिकर सक्रिय, रिकॉर्डर सक्रिय, किल स्विच सक्रिय। अब आप GetPower पावर-यूज़र हैं।' }
      ]
    },
    hint: {
      header: {
        brand_t: 'Get|Power — प्लग इन · पावर अप',
        brand_b: 'DANMAN Solutions स्क्रैप, OCR, AI मैक्रो, Drive मेमोरी और Sheets लॉगिंग को एक साइडबार में पैक करता है। पूरा फीचर टूर देखने के लिए ★ क्लिक करें।',
        about_t: 'GetPower के बारे में',
        about_b: 'DANMAN संक्षिप्त नाम, पूरी फीचर सूची और v6.7 में नया पढ़ें।',
        record_t: 'मैक्रो रिकॉर्ड · Ctrl+Shift+R',
        record_b: 'मौजूदा पेज पर क्लिक, कीस्ट्रोक और फॉर्म-फिल कैप्चर करें।',
        picker_t: 'एलिमेंट पिकर · Ctrl+Shift+E',
        picker_b: 'CSS सिलेक्टर पकड़ने के लिए पेज के किसी भी एलिमेंट पर इंगित करें।',
        options_t: 'पूर्ण सेटिंग्स पेज',
        options_b: 'विकल्प टैब खोलता है — API कुंजियाँ, Sheets / Drive क्रेडेंशियल, नेटिव होस्ट, उन्नत टॉगल।',
        kill_t: 'आपातकालीन रोक · Ctrl+Shift+.',
        kill_b: 'हर चल रहे मैक्रो को मारता है और गतिविधि लॉग में STOP लिखता है।'
      },
      status: {
        engine_t: 'मैक्रो इंजन',
        engine_b: 'idle = कोई मैक्रो नहीं। running = चरण उड़ान में। paused = फ़ोकस-लॉक प्रतीक्षा कर रहा है।',
        bind_t: 'दायरा बाइंडिंग',
        bind_b: 'global = किसी भी टैब पर। tab = एक id से जुड़ा। window = एक Firefox विंडो से जुड़ा।',
        native_t: 'नेटिव होस्ट',
        native_b: 'PowerShell + Win32 सहायक जो OS-स्तरीय किल-स्विच और फ़ोकस-लॉक सक्षम करता है।',
        ai_t: 'AI मोड',
        ai_b: 'webhook = आपके DANMAN Apps Script के माध्यम से। direct = सेटिंग्स में चिपकाई गई कुंजियाँ।',
        hotkey_t: 'वैश्विक हॉटकी',
        hotkey_b: 'हरा होने पर नेटिव होस्ट आपकी किल हॉटकी की निगरानी करता है।'
      },
      tab: {
        builder_t: 'बिल्डर', builder_b: 'मैक्रो बनाने के लिए चरण खींचें। DANMAN पूरा क्रम ड्राफ़्ट कर सकता है।',
        templates_t: 'टेम्पलेट', templates_b: 'डायनामिक कोड-टेम्पलेट जनरेटर (8 प्रकार × 4 भाषाएँ) और मैक्रो लाइब्रेरी।',
        execute_t: 'चलाएँ', execute_b: 'लाइव चरण ट्रेस के साथ कोई भी सहेजा गया मैक्रो चलाएँ।',
        scheduler_t: 'शेड्यूलर', scheduler_b: 'आवर्ती ऑटोमेशन के लिए cron-शैली ट्रिगर।',
        clipboard_t: 'क्लिपबोर्ड', clipboard_b: '20 नामित क्लिपबोर्ड स्लॉट क्रॉस-टैब सिंक के साथ।',
        danman_t: 'DANMAN AI', danman_b: 'चैट साथी। DANMAN से मैक्रो लिखने, सारांश देने या सिलेक्टर डीबग करने के लिए कहें।',
        scrape_t: 'स्क्रैप', scrape_b: 'एक-क्लिक एक्सट्रैक्ट: सामग्री, शीर्षक, छवियाँ, तालिकाएँ।',
        links_t: 'लिंक', links_b: 'पेज पर हर एंकर की गणना करें, वर्गीकृत करें, फ़िल्टर करें और निर्यात करें।',
        tree_t: 'ट्री (RAG)', tree_b: 'मौजूदा साइट को चुनी गहराई तक क्रॉल करें।',
        forms_t: 'फॉर्म', forms_b: 'फॉर्म पहचानें, सिलेक्टर बनाएँ, ऑटोफिल टेम्पलेट Sheets में सहेजें।',
        memory_t: 'मेमोरी', memory_b: 'Drive-समर्थित स्थायी मेमोरी।',
        sheets_t: 'Sheets', sheets_b: 'ID या URL द्वारा किसी भी Google शीट को पढ़ें / लिखें / जोड़ें।',
        ocr_t: 'OCR (बैच)', ocr_b: 'प्रीव्यू के लिए एक PDF छोड़ें, या बैच के लिए 2+।',
        eject_t: 'EJECT पाइपलाइन', eject_b: '5-चरण ईमेल पाइपलाइन।',
        settings_t: 'सेटिंग्स', settings_b: 'API कुंजियाँ, क्रेडेंशियल, सीमाएँ, और हर कॉन्फ़िग का IMPORT / EXPORT।',
        diag_t: 'निदान', diag_b: 'लाइव सेल्फ-टेस्ट: टेम्पलेट इंजन, OCR regex, नेटिव होस्ट पिंग।'
      },
      legacy: {
        scrape_run_t: 'स्क्रैप चलाएँ', scrape_run_b: 'मौजूदा पेज से सारी सामग्री खींचता है।',
        scrape_copy_t: 'कॉपी', scrape_copy_b: 'सिस्टम क्लिपबोर्ड पर कॉपी।',
        scrape_sheets_t: 'Sheets पर भेजें', scrape_sheets_b: 'आपकी Google शीट में नई पंक्ति जोड़ें।',
        scrape_drive_t: 'Drive में सहेजें', scrape_drive_b: 'Drive फ़ोल्डर में बंडल करें।',
        scrape_zip_t: 'ZIP में सहेजें', scrape_zip_b: 'सब कुछ एक ZIP में डाउनलोड करें।',
        links_run_t: 'लिंक निकालें', links_run_b: 'पेज पर हर एंकर की गणना करें।',
        links_filter_t: 'फ़िल्टर', links_filter_b: 'श्रेणी या सबस्ट्रिंग द्वारा लाइव फ़िल्टर।',
        links_export_t: 'निर्यात', links_export_b: 'CSV या JSON के रूप में सहेजें।',
        tree_url_t: 'बीज URL', tree_url_b: 'क्रॉल कहाँ से शुरू होगा।',
        tree_tabs_t: 'टैब चयनकर्ता', tree_tabs_b: 'हर खुली Firefox टैब दिखाता है।',
        tree_depth_t: 'अधिकतम गहराई', tree_depth_b: 'कितने क्लिक गहरा।',
        tree_start_t: 'शुरू करें', tree_start_b: 'पुनरावर्ती क्रॉल शुरू।',
        tree_export_t: 'ट्री निर्यात', tree_export_b: 'JSON, CSV, HTML या Markdown में सहेजें।',
        forms_scan_t: 'स्कैन', forms_scan_b: 'हर <form> पहचानें।',
        forms_template_t: 'टेम्पलेट सहेजें', forms_template_b: 'मैपिंग Sheets में सहेजें।',
        forms_inject_t: 'इंजेक्ट', forms_inject_b: 'फ़ील्ड भरें।',
        forms_pick_t: 'एलिमेंट चुनें', forms_pick_b: 'विज़ुअल सिलेक्टर।',
        memory_drive_t: 'Drive फ़ोल्डर ID', memory_drive_b: 'DANMAN मेमोरी का फ़ोल्डर।',
        memory_enabled_t: 'मेमोरी ON/OFF', memory_enabled_b: 'मास्टर टॉगल।',
        memory_personality_t: 'व्यक्तित्व', memory_personality_b: 'AI चैट से पहले जोड़ा गया टेक्स्ट।',
        memory_export_t: 'कॉन्फ़िग निर्यात', memory_export_b: 'फ़ोल्डर ID + व्यक्तित्व का JSON।',
        sheets_id_t: 'शीट ID', sheets_id_b: 'URL में /d/ और /edit के बीच का लंबा ID।',
        sheets_range_t: 'रेंज', sheets_range_b: 'A1 नोटेशन।',
        sheets_read_t: 'पढ़ें', sheets_read_b: 'रेंज को तालिका के रूप में दिखाएँ।',
        sheets_write_t: 'लिखें', sheets_write_b: 'रेंज बदलें। विनाशकारी।',
        sheets_append_t: 'जोड़ें', sheets_append_b: 'अंतिम भरी पंक्ति के बाद जोड़ें।',
        eject_paste_t: 'ईमेल पेस्ट', eject_paste_b: 'कच्चा ईमेल यहाँ पेस्ट करें।',
        eject_run_t: 'पाइपलाइन चलाएँ', eject_run_b: '5 चरण।',
        eject_transfer_t: 'स्थानांतरण', eject_transfer_b: 'परिणाम Salesforce या Sheets को।',
        clip_slot_t: 'क्लिपबोर्ड स्लॉट', clip_slot_b: '20 नामित स्लॉट में से एक।',
        clip_poll_t: 'ऑटो-कैप्चर', clip_poll_b: 'सिस्टम क्लिपबोर्ड मॉनिटर।',
        clip_export_t: 'निर्यात', clip_export_b: 'सभी स्लॉट JSON में।',
        danman_send_t: 'भेजें', danman_send_b: 'संदेश + संदर्भ AI को भेजें।',
        danman_context_t: 'संदर्भ शामिल', danman_context_b: 'ON पर पेज या मेमोरी जोड़ी जाती है।',
        danman_popout_t: 'चैट पॉप-आउट', danman_popout_b: 'फ़्लोटिंग विंडो में निकालें।',
        settings_export_t: 'कॉन्फ़िग निर्यात', settings_export_b: 'सभी सेटिंग्स का JSON।',
        settings_import_t: 'कॉन्फ़िग आयात', settings_import_b: 'पहले निर्यात किए गए JSON से बहाल।'
      },
      ui: {
        language_label: 'भाषा',
        language_hint_t: 'इंटरफ़ेस भाषा',
        language_hint_b: 'हर संकेत, टूर चरण और About टेक्स्ट को चुनी हुई भाषा में बदलता है।',
        replay_welcome_t: 'स्वागत टूर पुनः चलाएँ',
        replay_welcome_b: '30-सेकंड का गाइडेड वॉकथ्रू पुनः चलाएँ।',
        replay_power_t: 'पावर-यूज़र टूर पुनः चलाएँ',
        replay_power_b: 'शॉर्टकट, किल स्विच, पिकर, रिकॉर्डर और OS एकीकरण के लिए दूसरा टूर।'
      }
    }
  };

  // ----- KOREAN (ko) -----
  const ko = {
    brand: {
      tagline: '지식이 곧 힘이라면, 이 부가기능은 당신을 더 큰 POWER에 연결합니다.',
      acronym_label: 'DANMAN =',
      acronym: '데이터와 숫자, 측정값과 네트워크',
      acronym_footer: '모든 글자가 제 몫을 합니다.',
      pitch: '크리스마스 아침에 일어나 트리 아래에서 원했던 모든 것을 — 그리고 그 이상을 — 찾는 것과 같습니다. 회사 생활을 하는 모든 사람에게 필수적인 부가기능입니다.',
      marketing: 'GetPower는 모든 브라우저 탭을 프로그래밍 가능한 표면으로 바꿉니다. 클립보드 슬롯에서 이메일-Salesforce 파이프라인까지, 요소 선택기에서 예약된 크롤러까지 — DANMAN이 하나의 부가기능에 전체 엔터프라이즈 도구함을 담았습니다. Drive의 영속성. Sheets의 로그. 세션 간 기억. 연결하고 Power를 얻으세요.'
    },
    about: {
      title_prefix: '★ 환영합니다, ',
      hero_subtitle_sep: ' · v',
      stats_tabs: '파워 탭',
      stats_templates: '템플릿 유형',
      stats_langs: '언어',
      section_features: '트리 아래의 모든 것',
      footer_hover: '아무 탭, 필드, 상태 표시에 커서를 올리면 간단한 힌트가 나타납니다. 조용한 패널을 원하면 {0}설정 → UI{1}에서 힌트를 끄세요.',
      ok: '연결해 주세요',
      cancel: '나중에',
      features: [
        'AI 지원 단계 생성 기능이 있는 시각적 매크로 빌더',
        '청구서, 명세서, 영수증, 스캔된 PDF용 일괄 OCR',
        '다중 탭 선택이 가능한 사이트 트리 RAG 크롤링',
        '원클릭 페이지 스크랩, 링크 추출, 폼 자동 입력',
        'Google Drive 폴더로 지원되는 영구 메모리',
        'OS 전역 킬 스위치 단축키용 네이티브 메시징 호스트',
        '모든 작업에 대한 Google Sheets 로깅',
        '모든 설정, 키, 템플릿의 가져오기 / 내보내기'
      ]
    },
    tour: {
      step: '단계',
      of: '/',
      back: '← 이전',
      next: '다음 →',
      skip: '둘러보기 건너뛰기',
      finish: '★ Power 얻기',
      welcome: [
        { title: '⚡ GetPower에 오신 것을 환영합니다', body: 'DANMAN이 전체 엔터프라이즈 도구함을 이 420px 패널에 담았습니다. 이 30초 둘러보기가 전체 구성을 보여줍니다. 언제든 다음을 누르거나 건너뛰어 바로 시작하세요.' },
        { title: '🧱 빌더', body: '미리 만들어진 단계 유형(클릭, 입력, 대기, 추출…)을 시퀀스로 끌어다 놓거나 원하는 것을 설명하고 DANMAN AI가 전체 매크로를 작성하게 하세요. 저장, 실행, 예약하세요.' },
        { title: '🤖 DANMAN AI', body: '당신의 채팅 동반자. 매크로, 페이지 요약, 엔티티 추출 등 무엇이든 요청하세요. Drive 메모리와 저장된 워크플로를 알고 있습니다.' },
        { title: '🌲 트리 (RAG 크롤링)', body: '원하는 깊이까지 모든 사이트를 크롤링하거나 — "탭" 버튼을 눌러 열려 있는 다른 Firefox 탭에서 시작하세요. 다양한 내보내기 형식을 포함합니다.' },
        { title: '🔍 스크랩', body: '원클릭 추출: 콘텐츠, 제목, 이미지, 표. Sheets로 푸시하고, Drive 폴더에 저장하거나, 로컬 ZIP으로 다운로드하세요. 코딩 불필요.' },
        { title: '📋 폼', body: '페이지의 모든 폼을 감지하고, 선택자를 생성하고, 자동 입력 템플릿을 Sheets에 저장한 다음, 값을 하나씩 또는 한꺼번에 주입하세요. AI-skip 모드는 모호한 필드를 처리합니다.' },
        { title: '🖨️ OCR (일괄)', body: 'PDF 하나를 떨어뜨려 미리보기 모드, 또는 2+개를 떨어뜨려 일괄 모드로 들어가세요. AI 비전 OCR이 텍스트와 구조화된 엔티티 — 청구서 번호, 합계, 날짜, 이메일, 전화번호를 추출합니다.' },
        { title: '📊 Sheets', body: '소유한 모든 Google 시트를 읽고, 쓰고, 추가하세요. API를 통해 또는 일일 한도를 적용하기 위해 DANMAN webhook을 통해.' },
        { title: '🧠 메모리', body: 'Google Drive 폴더로 지원되는 영구 프로젝트 메모리. AI 채팅이 세션과 기기 간 컨텍스트를 기억합니다.' },
        { title: '⚙️ 설정', body: 'API 키, Sheets / Drive 자격 증명, 네이티브 호스트 설치, 그리고 모든 설정의 원클릭 EXPORT / IMPORT.' },
        { title: '★ 연결되었습니다', body: '아무 탭, 필드, 상태 표시에 커서를 올리면 힌트가 나타납니다. 설정 → 고급에서 언제든 이 둘러보기를 다시 재생하세요. 이제 GetPower로 가세요.' }
      ],
      power: [
        { title: '⚡ 고급 사용자 둘러보기', body: '이제 각 탭이 무엇을 하는지 아십니다 — 여기에 키보드 단축키, 킬 스위치, 요소 선택기, 그리고 GetPower를 비상하게 하는 OS 수준 통합이 있습니다. 약 30초.' },
        { title: '🛑 비상 정지 · Ctrl+Shift+.', body: '빨간 버튼(과 단축키)은 실행 중인 모든 매크로를 즉시 종료하고, 포커스 잠금을 해제하며, 활동 로그에 STOP 항목을 기록합니다. 네이티브 호스트가 설치되어 있으면 다른 창에서도 작동합니다.' },
        { title: '🎯 요소 선택기 · Ctrl+Shift+E', body: '이것을 클릭한 다음 페이지 위로 마우스를 가져가세요 — 모든 요소가 색깔 윤곽선을 받고, 클릭하면 CSS 선택자가 빌더에 바로 캡처됩니다.' },
        { title: '🎬 매크로 녹화 · Ctrl+Shift+R', body: '녹화를 시작하려면 클릭하고, 페이지에서 워크플로를 수행한 다음, 다시 클릭하여 중지하세요. 모든 클릭, 키 누름, 폼 채우기가 편집 가능하고 재생 가능한 빌더 단계가 됩니다.' },
        { title: '🔒 창 / 탭 바인딩', body: '빌더에서 매크로를 특정 Firefox 탭이나 창에 고정할 수 있습니다. 바인딩되면 매크로는 다른 곳을 건드리지 않습니다. Alt+F4 또는 킬 단축키만 해제합니다.' },
        { title: '🖥️ 네이티브 메시징 호스트', body: 'GetPower에 OS 수준 단축키(Firefox가 최소화되어 있을 때도 작동)와 바인딩된 창을 전면으로 가져오는 포커스 잠금을 제공하는 선택적 도우미. native_host/install-native-host.bat에서 설치하세요.' },
        { title: '⌨️ 사용자 정의 전역 단축키', body: '설정 → 네이티브에서 원하는 조합(기본 Ctrl+Alt+Shift+K)을 선택하면 호스트가 Excel, Outlook 또는 IDE에서도 킬 스위치를 실행합니다.' },
        { title: '🩺 진단 탭', body: '기본적으로 숨겨져 있음 — 설정 → 고급 토글을 켜면 실시간 자체 테스트가 표시됩니다: 템플릿 엔진, OCR 정규식, 네이티브 호스트 핑, 저장소 상태.' },
        { title: '📥 설정 가져오기 / 내보내기', body: '설정 하단 → 설정 내보내기는 모든 키, 시트 ID, 토글이 포함된 JSON을 씁니다. 새 컴퓨터에 가져와 즉시 동기화하세요. API 키는 기본적으로 마스킹됩니다.' },
        { title: '⚡ 연결하고 시작하세요', body: '단축키 활성, 선택기 활성, 녹화기 활성, 킬 스위치 활성. 이제 GetPower 고급 사용자입니다.' }
      ]
    },
    hint: {
      header: {
        brand_t: 'Get|Power — 연결 · 전원',
        brand_b: 'DANMAN Solutions는 스크랩, OCR, AI 매크로, Drive 메모리, Sheets 로깅을 하나의 사이드바에 담았습니다. 전체 기능 둘러보기를 보려면 ★을 클릭하세요.',
        about_t: 'GetPower 정보',
        about_b: 'DANMAN 약자, 전체 기능 목록, v6.7의 새로운 점을 읽으세요.',
        record_t: '매크로 녹화 · Ctrl+Shift+R',
        record_b: '현재 페이지의 클릭, 키 입력, 폼 작성을 캡처합니다.',
        picker_t: '요소 선택기 · Ctrl+Shift+E',
        picker_b: '페이지의 아무 요소를 가리켜 CSS 선택자를 얻으세요.',
        options_t: '전체 설정 페이지',
        options_b: '옵션 탭을 엽니다 — API 키, Sheets / Drive 자격 증명, 네이티브 호스트, 고급 토글.',
        kill_t: '비상 정지 · Ctrl+Shift+.',
        kill_b: '실행 중인 모든 매크로를 종료하고 활동 로그에 STOP을 기록합니다.'
      },
      status: {
        engine_t: '매크로 엔진',
        engine_b: 'idle = 매크로 없음. running = 단계 실행 중. paused = 포커스 잠금이 바인딩된 창을 기다림.',
        bind_t: '범위 바인딩',
        bind_b: 'global = 모든 탭. tab = 하나의 id에 고정. window = 하나의 Firefox 창에 고정.',
        native_t: '네이티브 호스트',
        native_b: 'OS 수준 킬 스위치와 포커스 잠금을 활성화하는 PowerShell + Win32 도우미.',
        ai_t: 'AI 모드',
        ai_b: 'webhook = DANMAN Apps Script를 통해. direct = 설정의 키 사용. both = 자동 폴백.',
        hotkey_t: '전역 단축키',
        hotkey_b: '녹색일 때 네이티브 호스트가 백그라운드에서도 킬 단축키를 폴링합니다.'
      },
      tab: {
        builder_t: '빌더', builder_b: '매크로 생성을 위해 단계를 끌어다 놓으세요. DANMAN이 전체 시퀀스를 작성할 수 있습니다.',
        templates_t: '템플릿', templates_b: '동적 코드 템플릿 생성기(8 유형 × 4 언어)와 매크로 라이브러리.',
        execute_t: '실행', execute_b: '실시간 단계 추적으로 저장된 매크로를 실행하세요.',
        scheduler_t: '스케줄러', scheduler_b: '반복 자동화를 위한 cron 스타일 트리거.',
        clipboard_t: '클립보드', clipboard_b: '탭 간 동기화되는 20개의 명명된 클립보드 슬롯.',
        danman_t: 'DANMAN AI', danman_b: '채팅 동반자. DANMAN에게 매크로 작성, 페이지 요약, 선택자 디버깅, Drive 메모리 읽기를 요청하세요.',
        scrape_t: '스크랩', scrape_b: '원클릭 추출: 콘텐츠, 제목, 이미지, 표. 복사하거나 Sheets로 푸시하거나 Drive / 로컬 ZIP에 저장.',
        links_t: '링크', links_b: '페이지의 모든 앵커를 열거하고 분류, 필터, 검색, 내보내기.',
        tree_t: '트리 (RAG)', tree_b: "현재 사이트를 선택한 깊이까지 크롤링하거나 '탭'을 클릭하여 다른 열린 브라우저 탭을 시드로 선택하세요.",
        forms_t: '폼', forms_b: '폼을 감지하고 선택자를 생성하며 자동 입력 템플릿을 Sheets에 저장합니다.',
        memory_t: '메모리', memory_b: 'Drive 지원 영구 메모리: 프로젝트별 폴더, DANMAN 성격, 통계.',
        sheets_t: 'Sheets', sheets_b: 'ID 또는 URL로 모든 Google 시트를 읽기 / 쓰기 / 추가.',
        ocr_t: 'OCR (일괄)', ocr_b: 'PDF 하나로 미리보기, 2+개로 일괄 모드. AI 비전 OCR + 구조화된 추출.',
        eject_t: 'EJECT 파이프라인', eject_b: '5단계 이메일 처리 파이프라인.',
        settings_t: '설정', settings_b: 'API 키, 자격 증명, 스크랩 제한, 그리고 모든 설정의 IMPORT / EXPORT.',
        diag_t: '진단', diag_b: '실시간 자체 테스트: 템플릿 엔진, OCR 정규식, 네이티브 호스트 핑, 저장소 상태.'
      },
      legacy: {
        scrape_run_t: '스크랩 실행', scrape_run_b: '현재 페이지에서 모든 텍스트 블록, 제목, 이미지, 표를 가져옵니다.',
        scrape_copy_t: '복사', scrape_copy_b: '시스템 클립보드에 복사.',
        scrape_sheets_t: 'Sheets로 푸시', scrape_sheets_b: '구성된 Google 시트에 새 행으로 추가.',
        scrape_drive_t: 'Drive에 저장', scrape_drive_b: 'HTML + JSON + 이미지를 Drive 폴더에 묶기.',
        scrape_zip_t: 'ZIP으로 저장', scrape_zip_b: '모든 것을 단일 ZIP으로 다운로드.',
        links_run_t: '링크 추출', links_run_b: '활성 페이지의 모든 앵커 열거.',
        links_filter_t: '필터', links_filter_b: '카테고리 또는 부분 문자열로 라이브 필터.',
        links_export_t: '내보내기', links_export_b: '분류된 링크를 CSV 또는 JSON으로 저장.',
        tree_url_t: '시드 URL', tree_url_b: '크롤링이 시작되는 곳. 기본값은 현재 활성 탭.',
        tree_tabs_t: '탭 선택기', tree_tabs_b: '열려 있는 모든 Firefox 탭을 표시.',
        tree_depth_t: '최대 깊이', tree_depth_b: '얼마나 깊이 클릭할지. 1 = 같은 페이지만.',
        tree_start_t: '크롤링 시작', tree_start_b: '재귀 워크 시작. 실시간 통계.',
        tree_export_t: '트리 내보내기', tree_export_b: 'JSON, CSV, HTML 또는 Markdown으로 저장.',
        forms_scan_t: '폼 스캔', forms_scan_b: '페이지의 모든 <form>과 필드 감지.',
        forms_template_t: '템플릿 저장', forms_template_b: '선택자 + 값 매핑을 Sheets에 저장.',
        forms_inject_t: '값 주입', forms_inject_b: '일치하는 필드 채우기.',
        forms_pick_t: '요소 선택', forms_pick_b: '시각적 요소 선택기.',
        memory_drive_t: 'Drive 폴더 ID', memory_drive_b: 'DANMAN이 메모리와 OCR을 영속화하는 폴더.',
        memory_enabled_t: '메모리 ON/OFF', memory_enabled_b: '마스터 토글.',
        memory_personality_t: '성격', memory_personality_b: '모든 DANMAN AI 대화 앞에 추가되는 텍스트.',
        memory_export_t: '설정 내보내기', memory_export_b: '폴더 ID + 성격을 포함한 JSON 다운로드.',
        sheets_id_t: '스프레드시트 ID', sheets_id_b: 'URL의 /d/와 /edit 사이의 긴 ID.',
        sheets_range_t: '범위', sheets_range_b: 'A1 표기법.',
        sheets_read_t: '읽기', sheets_read_b: '범위를 가져와 테이블로 렌더링.',
        sheets_write_t: '쓰기', sheets_write_b: '범위 내용을 교체. 파괴적.',
        sheets_append_t: '추가', sheets_append_b: '마지막 채워진 행 뒤에 새 행 추가.',
        eject_paste_t: '이메일 붙여넣기', eject_paste_b: '원시 이메일 텍스트를 여기에 붙여넣으세요.',
        eject_run_t: '파이프라인 실행', eject_run_b: '5단계 처리.',
        eject_transfer_t: '전송', eject_transfer_b: '검증된 결과를 Salesforce 또는 Sheets로.',
        clip_slot_t: '클립보드 슬롯', clip_slot_b: '20개의 명명된 슬롯 중 하나.',
        clip_poll_t: '자동 캡처', clip_poll_b: '시스템 클립보드 폴링.',
        clip_export_t: '슬롯 내보내기', clip_export_b: '모든 슬롯을 JSON으로 저장.',
        danman_send_t: 'DANMAN에 보내기', danman_send_b: '메시지 + 선택된 컨텍스트를 AI에 보냅니다.',
        danman_context_t: '컨텍스트 포함', danman_context_b: 'ON일 때 현재 페이지 또는 Drive 메모리 첨부.',
        danman_popout_t: '채팅 팝아웃', danman_popout_b: '채팅을 떠 있는 창으로 분리.',
        settings_export_t: '설정 내보내기', settings_export_b: '모든 설정의 JSON 다운로드.',
        settings_import_t: '설정 가져오기', settings_import_b: '이전에 내보낸 JSON에서 복원.'
      },
      ui: {
        language_label: '언어',
        language_hint_t: '인터페이스 언어',
        language_hint_b: '모든 힌트, 둘러보기 단계, About 텍스트를 선택한 언어로 전환합니다.',
        replay_welcome_t: '환영 둘러보기 재생',
        replay_welcome_b: '30초 가이드 둘러보기를 다시 실행합니다.',
        replay_power_t: '고급 사용자 둘러보기 재생',
        replay_power_b: '단축키, 킬 스위치, 선택기, 녹화기, OS 통합을 위한 두 번째 둘러보기.'
      }
    }
  };

  // -----------------------------------------------------------------------
  // Dictionary registry
  // -----------------------------------------------------------------------
  const PACKS = { en, fr, es, zh, ar, pa, hi, ko };

  // -----------------------------------------------------------------------
  // Engine
  // -----------------------------------------------------------------------
  let currentLang = 'en';

  function _deepGet(obj, path) {
    if (!obj) return undefined;
    const parts = String(path).split('.');
    let v = obj;
    for (const p of parts) {
      if (v == null) return undefined;
      v = v[p];
    }
    return v;
  }

  function t(path) {
    const pack = PACKS[currentLang] || PACKS.en;
    let v = _deepGet(pack, path);
    if (v == null) v = _deepGet(PACKS.en, path);
    if (v == null) return path;
    if (typeof v !== 'string') return v; // arrays / objects returned as-is
    // Positional placeholders {0}, {1}, ...
    if (arguments.length > 1) {
      for (let i = 1; i < arguments.length; i++) {
        v = v.split('{' + (i - 1) + '}').join(String(arguments[i]));
      }
    }
    return v;
  }

  function list(path) {
    const v = t(path);
    if (Array.isArray(v)) return v;
    return [];
  }

  function setLanguage(code) {
    if (!PACKS[code]) code = 'en';
    if (code === currentLang) return code;
    currentLang = code;
    try { document.documentElement.lang = code; } catch (_) {}
    try { document.body.dir = RTL_SET.has(code) ? 'rtl' : 'ltr'; document.documentElement.dir = document.body.dir; } catch (_) {}
    try { document.documentElement.classList.toggle('dms-rtl', RTL_SET.has(code)); } catch (_) {}
    document.dispatchEvent(new CustomEvent('dms:language-changed', { detail: { lang: code, rtl: RTL_SET.has(code) } }));
    return code;
  }

  function isRtl() { return RTL_SET.has(currentLang); }

  // Refresh every static `data-hint` attribute on the page that uses a path
  // marker `i18n:hint.tab.builder.title|hint.tab.builder.body`. This is for
  // the small set of elements written into sidebar.html directly — the legacy
  // hint injector uses programmatic set() calls instead.
  function applyMarkup(root) {
    const r = root || document;
    r.querySelectorAll('[data-i18n-hint]').forEach(el => {
      const spec = el.getAttribute('data-i18n-hint');
      if (!spec) return;
      // spec format: "titleKey|bodyKey"
      const ix = spec.indexOf('|');
      const tk = ix >= 0 ? spec.slice(0, ix) : spec;
      const bk = ix >= 0 ? spec.slice(ix + 1) : '';
      el.setAttribute('data-hint', t(tk) + '||' + (bk ? t(bk) : ''));
    });
    r.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (!k) return;
      el.textContent = t(k);
    });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------
  window.DMS_I18n = {
    t,
    list,
    setLanguage,
    applyMarkup,
    isRtl,
    get lang() { return currentLang; },
    langs: LANG_META.slice()
  };

  // Re-apply marked-up i18n attributes on every language change
  document.addEventListener('dms:language-changed', () => { applyMarkup(); });
})();
