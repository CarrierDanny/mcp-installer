// sidebar/tabs/danman-tab.js — DANMAN AI Chat Tab
(function() {
  'use strict';

  const container = document.getElementById('tab-danman');
  if (!container) return;

  // ── State ──────────────────────────────────────────────────
  let chatHistory = [];
  let isLoading = false;
  let includeContext = false;
  let historyLoaded = false;
  let attachments = []; // [{ id, record (IngestRecord), status: 'busy'|'ready'|'error' }]
  let attachSeq = 0;

  // ── Styles (injected once) ─────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #tab-danman.active {
      display: flex !important;
      flex-direction: column;
      height: 100%;
      padding: 0 !important;
      overflow: hidden;
    }

    .danman-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid #334155;
      flex-shrink: 0;
    }

    .danman-header-left {
      display: flex;
      flex-direction: column;
    }

    .danman-header .tab-title {
      font-size: 15px;
      margin-bottom: 0;
    }

    .danman-header .tab-desc {
      font-size: 11px;
      margin-bottom: 0;
    }

    .danman-clear-btn {
      background: transparent;
      border: 1px solid #334155;
      color: #94a3b8;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .danman-clear-btn:hover {
      background: #1e293b;
      color: #e2e8f0;
      border-color: #475569;
    }

    /* ── Messages area ── */
    .danman-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .danman-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #64748b;
      text-align: center;
      padding: 32px 16px;
      gap: 8px;
    }

    .danman-empty .icon { font-size: 36px; }
    .danman-empty .message { font-size: 13px; }

    /* ── Chat bubble ── */
    .danman-msg {
      display: flex;
      gap: 8px;
      max-width: 92%;
      animation: fadeIn 0.2s ease;
    }

    .danman-msg.user {
      align-self: flex-end;
      flex-direction: row-reverse;
    }

    .danman-msg.assistant {
      align-self: flex-start;
    }

    .danman-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .danman-msg.assistant .danman-avatar {
      background: #0ea5e9;
      color: #fff;
      font-weight: 700;
    }

    .danman-msg.user .danman-avatar {
      background: #475569;
      color: #e2e8f0;
      font-size: 12px;
    }

    .danman-bubble {
      padding: 8px 12px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.5;
      word-break: break-word;
    }

    .danman-msg.user .danman-bubble {
      background: #164e63;
      color: #e2e8f0;
      border-top-right-radius: 4px;
    }

    .danman-msg.assistant .danman-bubble {
      background: #1e293b;
      border: 1px solid #334155;
      color: #e2e8f0;
      border-top-left-radius: 4px;
    }

    .danman-bubble .msg-time {
      display: block;
      font-size: 10px;
      color: #64748b;
      margin-top: 4px;
    }

    /* ── Markdown inside bubbles ── */
    .danman-bubble strong { font-weight: 600; color: #f1f5f9; }

    .danman-bubble code {
      background: rgba(0,0,0,0.3);
      padding: 1px 5px;
      border-radius: 4px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 12px;
    }

    .danman-bubble pre {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 8px 10px;
      margin: 6px 0;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.4;
    }

    .danman-bubble pre code {
      background: transparent;
      padding: 0;
      border-radius: 0;
    }

    .danman-bubble ul {
      margin: 4px 0;
      padding-left: 18px;
      list-style: disc;
    }

    .danman-bubble ul li {
      margin: 2px 0;
    }

    /* ── Loading indicator ── */
    .danman-loading {
      display: flex;
      gap: 8px;
      align-self: flex-start;
      max-width: 92%;
    }

    .danman-loading .danman-avatar {
      background: #0ea5e9;
      color: #fff;
      font-weight: 700;
    }

    .danman-loading .dots {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      border-top-left-radius: 4px;
      padding: 10px 16px;
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .danman-loading .dot {
      width: 6px;
      height: 6px;
      background: #64748b;
      border-radius: 50%;
      animation: danmanBounce 1.4s infinite ease-in-out both;
    }

    .danman-loading .dot:nth-child(1) { animation-delay: -0.32s; }
    .danman-loading .dot:nth-child(2) { animation-delay: -0.16s; }
    .danman-loading .dot:nth-child(3) { animation-delay: 0s; }

    @keyframes danmanBounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }

    /* ── Input area ── */
    .danman-input-area {
      flex-shrink: 0;
      border-top: 1px solid #334155;
      padding: 8px 14px 10px;
      background: #0f172a;
    }

    .danman-quick-actions {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .danman-quick-btn {
      background: #1e293b;
      color: #38bdf8;
      border: 1px solid #334155;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .danman-quick-btn:hover {
      background: #334155;
      border-color: #475569;
    }

    .danman-input-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    #danman-textarea {
      flex: 1;
      min-height: 34px;
      max-height: 96px;
      padding: 7px 12px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      color: #e2e8f0;
      font-size: 13px;
      font-family: inherit;
      line-height: 1.4;
      resize: none;
      outline: none;
      transition: border-color 0.2s ease;
      overflow-y: auto;
    }

    #danman-textarea:focus {
      border-color: #38bdf8;
    }

    #danman-textarea::placeholder {
      color: #64748b;
    }

    .danman-send-btn {
      background: #0ea5e9;
      color: #fff;
      border: none;
      width: 34px;
      height: 34px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    .danman-send-btn:hover { background: #38bdf8; }
    .danman-send-btn:active { background: #0284c7; }
    .danman-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .danman-context-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 6px;
    }

    .danman-context-row input[type="checkbox"] {
      width: 14px;
      height: 14px;
      accent-color: #0ea5e9;
      cursor: pointer;
    }

    .danman-context-row label {
      font-size: 11px;
      color: #94a3b8;
      cursor: pointer;
      margin-bottom: 0;
      user-select: none;
      -webkit-user-select: none;
    }

    .danman-attach-btn {
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
      width: 34px;
      height: 34px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      flex-shrink: 0;
      transition: all 0.2s ease;
    }
    .danman-attach-btn:hover { color: #38bdf8; border-color: #38bdf8; }

    #danman-attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .danman-att-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 100%;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 3px 8px;
      font-size: 11px;
      color: #e2e8f0;
    }
    .danman-att-chip .att-name { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .danman-att-chip .att-meta { color: #64748b; font-size: 10px; }
    .danman-att-chip.att-error { border-color: #991b1b; color: #fca5a5; }
    .danman-att-chip.att-busy { border-color: #f59e0b; }
    .danman-att-chip button {
      background: none; border: none; cursor: pointer;
      color: #94a3b8; font-size: 11px; padding: 0 2px; line-height: 1;
    }
    .danman-att-chip button:hover { color: #38bdf8; }

    .danman-input-area.att-dragover { outline: 2px dashed #38bdf8; outline-offset: -4px; border-radius: 8px; }

    .msg-save-btn {
      background: none; border: none; cursor: pointer;
      color: #64748b; font-size: 11px; padding: 2px 4px;
      float: right; margin-left: 8px;
    }
    .msg-save-btn:hover { color: #22c55e; }
    .msg-save-btn.saved { color: #22c55e; cursor: default; }
  `;
  document.head.appendChild(style);

  // ── Build DOM ──────────────────────────────────────────────
  container.innerHTML = `
    <div class="danman-header">
      <div class="danman-header-left">
        <div class="tab-title">&#9889; DANMAN Chat</div>
        <div class="tab-desc">Multimodal AI · voice · page sight <span id="danman-memory-badge" style="display:none;background:rgba(34,197,94,0.15);color:#22c55e;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:4px;">Memory Active</span></div>
      </div>
      <button id="danman-copy-reply" style="padding:4px 10px;background:#1e3a5f;color:#38bdf8;border:none;border-radius:4px;font-size:11px;cursor:pointer;" title="Copy DANMAN's last reply to clipboard">&#128203; Copy Reply</button>
      <button id="danman-popout" style="padding:4px 10px;background:#334155;color:#e2e8f0;border:none;border-radius:4px;font-size:11px;cursor:pointer;" title="Pop out persistent voice/chat window">Pop Out</button>
      <button class="danman-clear-btn" id="danman-clear-btn">Clear chat</button>
    </div>

    <div class="danman-messages" id="danman-messages">
      <div class="danman-empty" id="danman-empty">
        <div class="icon">&#9889;</div>
        <div class="message">Ask DANMAN to analyze this page,<br>extract data, or answer questions.<br><span style="font-size:11px;color:#64748b;">Enable voice / page-watch with the toggles below (usage warnings apply).</span></div>
      </div>
    </div>

    <div class="danman-input-area">
      <div class="danman-quick-actions">
        <button class="danman-quick-btn" data-prompt="Summarize this page in a few bullet points">Summarize page</button>
        <button class="danman-quick-btn" data-prompt="Extract all structured data from this page (names, emails, phones, addresses, prices, dates)">Extract data</button>
        <button class="danman-quick-btn" data-prompt="Find all contact information on this page (emails, phone numbers, social links)">Find contacts</button>
        <button class="danman-quick-btn" data-prompt="Suggest a browser automation or macro for the task I am trying to do on this page">Suggest macro</button>
      </div>
      <div class="danman-modes" style="display:flex;flex-wrap:wrap;gap:8px 12px;margin-bottom:8px;font-size:11px;color:#94a3b8;">
        <label style="display:flex;align-items:center;gap:4px;" title="Typewriter / streaming reply reveal"><input type="checkbox" id="danman-stream-check"> Stream reply</label>
        <label style="display:flex;align-items:center;gap:4px;" title="Read every page you navigate (high token use)"><input type="checkbox" id="danman-watch-check"> Page sight</label>
        <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="danman-tts-check"> Speak replies</label>
        <select id="danman-persona" style="background:#0f172a;border:1px solid #334155;color:#e2e8f0;border-radius:6px;padding:2px 6px;font-size:11px;"></select>
      </div>
      <div class="danman-voice-row" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
        <button class="btn btn-sm btn-secondary" id="danman-mic-btn" title="Hold / click to dictate">&#127908; Mic</button>
        <button class="btn btn-sm btn-secondary" id="danman-video-btn" title="Attach video for analysis">&#127909; Video</button>
        <input type="file" id="danman-video-input" accept="video/*,audio/*" style="display:none;">
        <span id="danman-voice-status" class="text-xs text-muted" style="font-size:10px;color:#64748b;"></span>
      </div>
      <div class="danman-eleven" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
        <input type="password" id="danman-eleven-key" placeholder="ElevenLabs API key (optional)" style="background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;padding:5px 8px;font-size:11px;">
        <input type="text" id="danman-eleven-agent" placeholder="ElevenLabs voice/agent ID" style="background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;padding:5px 8px;font-size:11px;">
      </div>
      <div class="danman-input-row">
        <button class="danman-attach-btn" id="danman-attach-btn" title="Attach files — zips (recursive), audio (transcribed), PDF, text, docs">&#128206;</button>
        <textarea id="danman-textarea" placeholder="Ask DANMAN anything..." rows="1"></textarea>
        <button class="danman-send-btn" id="danman-send-btn" title="Send message">&#10148;</button>
      </div>
      <input type="file" id="danman-file-input" multiple style="display:none;">
      <div id="danman-attachments"></div>
      <div class="danman-context-row">
        <input type="checkbox" id="danman-context-check">
        <label for="danman-context-check">Include page context</label>
      </div>
      <div class="danman-context-row" style="margin-top:2px;">
        <input type="checkbox" id="danman-memory-check">
        <label for="danman-memory-check">Include memory context</label>
      </div>
      <div class="danman-context-row" style="margin-top:2px;">
        <input type="checkbox" id="danman-bridge-check">
        <label for="danman-bridge-check" title="Route chat through the GAS backend — it injects vectorized Drive memory server-side, so you never re-paste project context">Bridge RAG (server memory)</label>
      </div>
      <div id="danman-memory-info" style="display:none;margin-top:6px;padding:6px 10px;background:#1e293b;border:1px solid #334155;border-radius:6px;font-size:11px;color:#94a3b8;">
        <span id="danman-memory-projects">0</span> active projects | <span id="danman-memory-tokens">0</span> context tokens
        <button id="danman-open-memory" style="float:right;background:#334155;color:#38bdf8;border:none;padding:2px 8px;border-radius:4px;font-size:10px;cursor:pointer;">Configure</button>
      </div>
    </div>
  `;

  // ── Element refs ───────────────────────────────────────────
  const messagesEl = document.getElementById('danman-messages');
  const emptyEl = document.getElementById('danman-empty');
  const textarea = document.getElementById('danman-textarea');
  const sendBtn = document.getElementById('danman-send-btn');
  const clearBtn = document.getElementById('danman-clear-btn');
  const contextCheck = document.getElementById('danman-context-check');
  const bridgeCheck = document.getElementById('danman-bridge-check');
  const attachBtn = document.getElementById('danman-attach-btn');
  const fileInput = document.getElementById('danman-file-input');
  const attachmentsEl = document.getElementById('danman-attachments');
  const inputArea = container.querySelector('.danman-input-area');

  // ── Attachments (ingest engine) ────────────────────────────
  function renderAttachments() {
    attachmentsEl.innerHTML = '';
    attachments.forEach((att) => {
      const chip = document.createElement('span');
      chip.className = 'danman-att-chip' +
        (att.status === 'error' ? ' att-error' : att.status === 'busy' ? ' att-busy' : '');
      const rec = att.record;
      const meta = att.status === 'busy' ? 'ingesting…'
        : att.status === 'error' ? (att.error || 'failed')
        : rec.kind + (rec.kind === 'zip' ? ' · ' + (window.DMS_Ingest.flatten(rec).length - 1) + ' entries' : '')
          + (rec.json && rec.json.segments ? ' · transcribed' : '');
      chip.innerHTML = '<span class="att-name"></span><span class="att-meta"></span>';
      chip.querySelector('.att-name').textContent = att.name;
      chip.querySelector('.att-meta').textContent = meta;
      if (att.status === 'ready') {
        const save = document.createElement('button');
        save.title = 'Vectorize into Drive memory (via bridge)';
        save.textContent = '💾';
        save.addEventListener('click', () => saveAttachmentToMemory(att, save));
        chip.appendChild(save);
      }
      const del = document.createElement('button');
      del.title = 'Remove attachment';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        attachments = attachments.filter((a) => a.id !== att.id);
        renderAttachments();
      });
      chip.appendChild(del);
      attachmentsEl.appendChild(chip);
    });
  }

  async function saveAttachmentToMemory(att, btnEl) {
    try {
      btnEl.disabled = true;
      const rec = att.record;
      const text = window.DMS_Ingest.summarizeForChat([rec], 100000);
      const r = await window.sendToBackground('GP_MEMORY_SAVE', { text, name: att.name, category: '' });
      if (window.Toast) Toast.success('Saved to memory: ' + (r.name || att.name) + (r.chunks ? ' (' + r.chunks + ' chunks)' : ''));
    } catch (e) {
      if (window.Toast) Toast.error('Memory save failed: ' + (e.message || e));
      btnEl.disabled = false;
    }
  }

  async function addFiles(fileList) {
    if (!window.DMS_Ingest) {
      if (window.Toast) Toast.error('Ingest engine not loaded');
      return;
    }
    for (const file of Array.from(fileList || [])) {
      const att = { id: ++attachSeq, name: file.name, status: 'busy', record: null, error: '' };
      attachments.push(att);
      renderAttachments();
      try {
        const rec = await window.DMS_Ingest.ingestFile(file);
        att.record = rec;
        if (rec.error && !rec.text && !rec.children.length) {
          att.status = 'error';
          att.error = rec.error;
        } else {
          att.status = 'ready';
        }
      } catch (e) {
        att.status = 'error';
        att.error = e.message || String(e);
      }
      renderAttachments();
    }
  }

  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  });
  inputArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    inputArea.classList.add('att-dragover');
  });
  inputArea.addEventListener('dragleave', () => inputArea.classList.remove('att-dragover'));
  inputArea.addEventListener('drop', (e) => {
    e.preventDefault();
    inputArea.classList.remove('att-dragover');
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  // ── Markdown renderer ──────────────────────────────────────
  function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    // Code blocks: ```...```
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
      return '<pre><code>' + code.trim() + '</code></pre>';
    });

    // Inline code: `...`
    html = html.replace(/`([^`\n]+?)`/g, '<code>$1</code>');

    // Bold: **...**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Unordered list items: lines starting with "- "
    // Group consecutive list items into <ul>
    html = html.replace(/((?:^|\n)- .+(?:\n- .+)*)/g, (block) => {
      const items = block.trim().split('\n').map(line => {
        return '<li>' + line.replace(/^- /, '') + '</li>';
      }).join('');
      return '<ul>' + items + '</ul>';
    });

    // Line breaks (but not inside pre blocks)
    const parts = html.split(/(<pre><code>[\s\S]*?<\/code><\/pre>)/g);
    html = parts.map((part, i) => {
      if (i % 2 === 1) return part; // inside pre block, leave alone
      return part.replace(/\n/g, '<br>');
    }).join('');

    return html;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── Render helpers ─────────────────────────────────────────
  function createMessageEl(msg) {
    const wrap = document.createElement('div');
    wrap.className = 'danman-msg ' + (msg.role === 'user' ? 'user' : 'assistant');

    const avatar = document.createElement('div');
    avatar.className = 'danman-avatar';
    avatar.textContent = msg.role === 'user' ? '&#128100;' : '';
    // Use innerHTML for the emoji/character
    avatar.innerHTML = msg.role === 'user' ? '&#128100;' : '&#9889;';

    const bubble = document.createElement('div');
    bubble.className = 'danman-bubble';
    bubble.innerHTML = renderMarkdown(msg.content)
      + '<span class="msg-time">' + formatTime(msg.timestamp) + '</span>';

    // Assistant replies get a save-to-memory action (vectorized via bridge)
    if (msg.role !== 'user' && msg.content) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'msg-save-btn';
      saveBtn.title = 'Save this reply to vectorized Drive memory';
      saveBtn.textContent = '💾 Remember';
      saveBtn.addEventListener('click', async () => {
        try {
          saveBtn.disabled = true;
          await window.sendToBackground('GP_MEMORY_SAVE', {
            text: msg.content,
            name: 'chat-reply-' + new Date(msg.timestamp || Date.now()).toISOString().slice(0, 19),
            category: ''
          });
          saveBtn.textContent = '✓ Remembered';
          saveBtn.classList.add('saved');
          if (window.Toast) Toast.success('Reply saved to memory');
        } catch (e) {
          saveBtn.disabled = false;
          if (window.Toast) Toast.error('Memory save failed: ' + (e.message || e));
        }
      });
      bubble.appendChild(saveBtn);
    }

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    return wrap;
  }

  function createLoadingEl() {
    const wrap = document.createElement('div');
    wrap.className = 'danman-loading';
    wrap.id = 'danman-loading-indicator';
    wrap.innerHTML = `
      <div class="danman-avatar">&#9889;</div>
      <div class="dots">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    `;
    return wrap;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function updateEmptyState() {
    if (emptyEl) {
      emptyEl.style.display = chatHistory.length === 0 ? 'flex' : 'none';
    }
  }

  function renderAllMessages() {
    // Remove all messages but keep the empty state element
    const children = Array.from(messagesEl.children);
    children.forEach(c => {
      if (c.id !== 'danman-empty') c.remove();
    });

    chatHistory.forEach(msg => {
      messagesEl.appendChild(createMessageEl(msg));
    });

    updateEmptyState();
    scrollToBottom();
  }

  function appendMessage(msg) {
    chatHistory.push(msg);
    messagesEl.appendChild(createMessageEl(msg));
    updateEmptyState();
    scrollToBottom();
  }

  // ── Auto-resize textarea ───────────────────────────────────
  function autoResize() {
    textarea.style.height = 'auto';
    const maxH = 96; // 4 lines approx
    textarea.style.height = Math.min(textarea.scrollHeight, maxH) + 'px';
  }

  textarea.addEventListener('input', autoResize);

  // ── Send message ───────────────────────────────────────────
  async function streamReveal(el, fullText) {
    const streamOn = document.getElementById('danman-stream-check');
    if (!streamOn || !streamOn.checked || !el) {
      el.innerHTML = renderMarkdown(fullText);
      return;
    }
    el.innerHTML = '';
    let i = 0;
    const step = Math.max(1, Math.floor(fullText.length / 80));
    await new Promise(function (resolve) {
      function tick() {
        i = Math.min(fullText.length, i + step);
        el.innerHTML = renderMarkdown(fullText.slice(0, i)) + (i < fullText.length ? '<span style="opacity:0.5;">▍</span>' : '');
        scrollToBottom();
        if (i < fullText.length) requestAnimationFrame(tick);
        else resolve();
      }
      tick();
    });
  }

  async function speakText(text) {
    const ttsOn = document.getElementById('danman-tts-check');
    if (!ttsOn || !ttsOn.checked || !text) return;
    const elevenKey = (document.getElementById('danman-eleven-key') || {}).value || '';
    const elevenAgent = (document.getElementById('danman-eleven-agent') || {}).value || '';
    if (elevenKey) {
      try {
        const r = await window.sendToBackground('ELEVENLABS_TTS', {
          apiKey: elevenKey,
          voiceId: elevenAgent,
          text: text.slice(0, 1200)
        });
        if (r && r.success && r.dataBase64) {
          const audio = new Audio('data:' + (r.mime || 'audio/mpeg') + ';base64,' + r.dataBase64);
          audio.play().catch(function () {});
          return;
        }
      } catch (_) {}
    }
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).slice(0, 1200));
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  async function sendMessage(text) {
    const readyAtts = attachments.filter((a) => a.status === 'ready');
    if ((!text || !text.trim()) && !readyAtts.length) return;
    if (isLoading) return;
    if (attachments.some((a) => a.status === 'busy')) {
      if (window.Toast) Toast.warning('Attachments are still ingesting…');
      return;
    }

    const message = (text || '').trim() || 'Analyze the attached files.';
    textarea.value = '';
    autoResize();

    // Extracted attachment content rides along as a context block
    const attachmentContext = readyAtts.length
      ? window.DMS_Ingest.summarizeForChat(readyAtts.map((a) => a.record))
      : '';
    const attNote = readyAtts.length
      ? '\n\n📎 ' + readyAtts.map((a) => a.name).join(', ')
      : '';
    attachments = [];
    renderAttachments();

    // Add user message
    const userMsg = {
      role: 'user',
      content: message + attNote,
      timestamp: Date.now()
    };
    appendMessage(userMsg);

    // Show loading
    isLoading = true;
    sendBtn.disabled = true;
    const loadingEl = createLoadingEl();
    messagesEl.appendChild(loadingEl);
    scrollToBottom();

    try {
      const personaSel = document.getElementById('danman-persona');
      const personaId = personaSel ? personaSel.value : 'auto';
      const personaSys = (typeof GPD_DanmanPersonas !== 'undefined')
        ? GPD_DanmanPersonas.systemFor(personaId)
        : '';
      const result = await window.sendToBackground('DANMAN_CHAT', {
        message,
        includeContext: contextCheck.checked,
        includeMemory: memoryCheck ? memoryCheck.checked : false,
        attachmentContext,
        bridgeRag: bridgeCheck ? bridgeCheck.checked : false,
        persona: personaId,
        systemOverride: personaSys,
        streaming: !!(document.getElementById('danman-stream-check') || {}).checked
      });

      // Remove loading indicator
      const indicator = document.getElementById('danman-loading-indicator');
      if (indicator) indicator.remove();

      const replyText = (result && result.response) ? result.response : 'No response received.';
      const assistantMsg = {
        role: 'assistant',
        content: replyText,
        timestamp: Date.now()
      };
      // Append then stream-reveal the bubble body
      appendMessage(assistantMsg);
      const bubbles = messagesEl.querySelectorAll('.danman-msg.assistant .danman-bubble');
      const lastBubble = bubbles[bubbles.length - 1];
      if (lastBubble) {
        // strip timestamp child temporarily for streaming
        const timeEl = lastBubble.querySelector('.msg-time');
        await streamReveal(lastBubble, replyText);
        if (timeEl) lastBubble.appendChild(timeEl);
      }
      await speakText(replyText);
      try {
        if (typeof GPD_ProgressiveLearn !== 'undefined' && GPD_ProgressiveLearn.record) {
          GPD_ProgressiveLearn.record('chat:send', personaId);
        }
      } catch (_) {}

    } catch (err) {
      // Remove loading indicator
      const indicator = document.getElementById('danman-loading-indicator');
      if (indicator) indicator.remove();

      const errorMsg = {
        role: 'assistant',
        content: '**Error:** ' + (err.message || 'Failed to get response. Please try again.'),
        timestamp: Date.now()
      };
      appendMessage(errorMsg);

      if (window.Toast) Toast.error('Chat request failed');
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
      textarea.focus();
    }
  }

  // ── Event listeners ────────────────────────────────────────

  // Send button
  sendBtn.addEventListener('click', () => {
    sendMessage(textarea.value);
  });

  // Enter sends, Shift+Enter for newline
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(textarea.value);
    }
  });

  // Quick action buttons
  container.querySelectorAll('.danman-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sendMessage(btn.dataset.prompt);
    });
  });

  // Clear chat
  clearBtn.addEventListener('click', async () => {
    if (chatHistory.length === 0) return;
    try {
      await window.sendToBackground('DANMAN_CLEAR_HISTORY', {});
    } catch (_) { /* ignore */ }
    chatHistory = [];
    renderAllMessages();
    if (window.Toast) Toast.info('Chat cleared');
  });

  // Pop out button
  const popoutBtn = document.getElementById('danman-popout');
  if (popoutBtn) {
    popoutBtn.addEventListener('click', () => {
      const B = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
      B.runtime.sendMessage({ type: 'DANMAN_POPOUT_OPEN' }).catch(function (err) {
        console.error('[DANMAN] Popout open failed:', err);
        if (window.Toast) window.Toast.error('Could not open popout — reload extension in about:debugging');
      });
    });
  }

  // Copy Last Reply button — copies DANMAN's most recent reply to clipboard
  const copyReplyBtn = document.getElementById('danman-copy-reply');
  if (copyReplyBtn) {
    copyReplyBtn.addEventListener('click', async () => {
      // Find the last assistant message in chat history
      const lastReply = [...chatHistory].reverse().find(m => m.role === 'assistant');
      if (!lastReply) {
        if (window.Toast) Toast.info('No reply to copy yet');
        return;
      }
      try {
        await navigator.clipboard.writeText(lastReply.content);
        copyReplyBtn.textContent = '\u2705 Copied!';
        if (window.Toast) Toast.success('Reply copied to clipboard');
        setTimeout(() => { copyReplyBtn.textContent = '\ud83d\udccb Copy Reply'; }, 2000);
      } catch (e) {
        // Fallback for Firefox which may block clipboard in iframes
        const textarea = document.createElement('textarea');
        textarea.value = lastReply.content;
        textarea.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copyReplyBtn.textContent = '\u2705 Copied!';
        if (window.Toast) Toast.success('Reply copied to clipboard');
        setTimeout(() => { copyReplyBtn.textContent = '\ud83d\udccb Copy Reply'; }, 2000);
      }
    });
  }

  // Context checkbox state
  contextCheck.addEventListener('change', () => {
    includeContext = contextCheck.checked;
  });

  // ── Memory integration ────────────────────────────────────
  const memoryCheck = document.getElementById('danman-memory-check');
  const memoryBadge = document.getElementById('danman-memory-badge');
  const memoryInfo = document.getElementById('danman-memory-info');
  const memoryProjectsEl = document.getElementById('danman-memory-projects');
  const memoryTokensEl = document.getElementById('danman-memory-tokens');
  const openMemoryBtn = document.getElementById('danman-open-memory');

  async function checkMemoryStatus() {
    try {
      const config = await window.sendToBackground('CONFIG_LOAD', {});
      if (config && config.memory && config.memory.enabled) {
        memoryBadge.style.display = 'inline';
        memoryCheck.checked = true;
        memoryInfo.style.display = 'block';
        // Load stats
        try {
          const stats = await window.sendToBackground('MEMORY_GET_STATS', {});
          if (stats) {
            memoryProjectsEl.textContent = stats.activeProjects || 0;
            memoryTokensEl.textContent = stats.estimatedTokens || 0;
          }
        } catch (_) {}
      } else {
        memoryBadge.style.display = 'none';
        memoryCheck.checked = false;
        memoryInfo.style.display = 'none';
      }
    } catch (_) {}
  }

  if (memoryCheck) {
    memoryCheck.addEventListener('change', async () => {
      try {
        const config = await window.sendToBackground('CONFIG_LOAD', {});
        if (!config.memory?.folder_id && memoryCheck.checked) {
          memoryCheck.checked = false;
          if (window.Toast) Toast.warning('Configure memory first in the Memory tab');
          return;
        }
        config.memory = config.memory || {};
        config.memory.enabled = memoryCheck.checked;
        await window.sendToBackground('CONFIG_SAVE', config);
        memoryBadge.style.display = memoryCheck.checked ? 'inline' : 'none';
        memoryInfo.style.display = memoryCheck.checked ? 'block' : 'none';
        if (memoryCheck.checked) {
          if (window.Toast) Toast.success('Memory context enabled');
          checkMemoryStatus();
        } else {
          if (window.Toast) Toast.info('Memory context disabled');
        }
      } catch (e) {
        if (window.Toast) Toast.error('Failed to update memory setting');
      }
    });
  }

  if (openMemoryBtn) {
    openMemoryBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('tab-activated', { detail: { tab: 'memory' } }));
      // Switch to memory tab
      const memTab = document.querySelector('#tab-bar .tab[data-tab="memory"]');
      if (memTab) memTab.click();
    });
  }

  // ── Load history on tab activation ─────────────────────────
  async function loadHistory() {
    try {
      const result = await window.sendToBackground('DANMAN_GET_HISTORY', {});
      if (result && result.history && Array.isArray(result.history)) {
        chatHistory = result.history;
        renderAllMessages();
      }
    } catch (_) { /* ignore — background may not have handler yet */ }
    historyLoaded = true;
  }

  window.addEventListener('tab-activated', (e) => {
    if (e.detail && e.detail.tab === 'danman') {
      loadHistory();
      checkMemoryStatus();
      setTimeout(() => textarea.focus(), 100);
    }
  });

  // Cross-tab handoff: other tabs (e.g. OCR) can dispatch
  // `danman:chat-compose` to seed the chat input with text.
  window.addEventListener('danman:chat-compose', (ev) => {
    const detail = (ev && ev.detail != null) ? String(ev.detail) : '';
    if (!detail || !textarea) return;
    textarea.value = (textarea.value || '')
      + (textarea.value ? '\n\n' : '')
      + detail;
    autoResize();
    textarea.focus();
  });

  // Initial load if tab is already active
  if (container.classList.contains('active')) {
    loadHistory();
    checkMemoryStatus();
  }

  // ── Multimodal / personas / usage guards ───────────────────
  (function initMultimodalControls() {
    const personaSel = document.getElementById('danman-persona');
    if (personaSel && typeof GPD_DanmanPersonas !== 'undefined') {
      GPD_DanmanPersonas.list.forEach(function (p) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        personaSel.appendChild(opt);
      });
    }

    const guard = (typeof GPD_UsageGuard !== 'undefined') ? GPD_UsageGuard : null;
    if (guard) {
      guard.bindToggle(document.getElementById('danman-stream-check'), 'stream');
      guard.bindToggle(document.getElementById('danman-watch-check'), 'page_watch', function (on) {
        window.sendToBackground('DANMAN_PAGE_WATCH_TOGGLE', { enabled: on }).catch(function () {});
        const st = document.getElementById('danman-voice-status');
        if (st) st.textContent = on ? 'Page sight ON — context follows navigation' : '';
      });
      guard.bindToggle(document.getElementById('danman-tts-check'), 'tts_elevenlabs');
      // Re-bind expensive context toggles with warnings
      if (contextCheck) {
        contextCheck.addEventListener('change', function () {
          if (contextCheck.checked && guard && !guard.confirmMode('include_context')) {
            contextCheck.checked = false;
            includeContext = false;
            return;
          }
          includeContext = contextCheck.checked;
        }, true);
      }
      if (bridgeCheck) {
        bridgeCheck.addEventListener('change', function (e) {
          if (bridgeCheck.checked && guard && !guard.confirmMode('bridge_rag')) {
            e.stopImmediatePropagation();
            bridgeCheck.checked = false;
          }
        }, true);
      }
      if (memoryCheck) {
        memoryCheck.addEventListener('change', function (e) {
          if (memoryCheck.checked && guard && !guard.confirmMode('include_memory')) {
            e.stopImmediatePropagation();
            memoryCheck.checked = false;
          }
        }, true);
      }
    }

    // Load saved ElevenLabs + chat prefs
    window.sendToBackground('CONFIG_LOAD', {}).then(function (cfg) {
      if (!cfg) return;
      const ek = document.getElementById('danman-eleven-key');
      const ea = document.getElementById('danman-eleven-agent');
      if (ek && cfg.api_keys && cfg.api_keys.elevenlabs) {
        ek.placeholder = '•••• ElevenLabs key saved — leave blank to keep';
      }
      if (ea && cfg.elevenlabs) {
        ea.value = cfg.elevenlabs.voice_id || cfg.elevenlabs.agent_id || '';
      }
      if (personaSel && cfg.danman_chat && cfg.danman_chat.persona) {
        personaSel.value = cfg.danman_chat.persona;
      }
    }).catch(function () {});

    function saveElevenPrefs() {
      const ek = (document.getElementById('danman-eleven-key') || {}).value || '';
      const ea = (document.getElementById('danman-eleven-agent') || {}).value || '';
      const persona = (document.getElementById('danman-persona') || {}).value || 'auto';
      const payload = {
        danman_chat: {
          streaming: !!(document.getElementById('danman-stream-check') || {}).checked,
          page_watch: !!(document.getElementById('danman-watch-check') || {}).checked,
          tts: !!(document.getElementById('danman-tts-check') || {}).checked,
          persona: persona
        },
        elevenlabs: { voice_id: ea, agent_id: ea }
      };
      if (ek.trim()) payload.api_keys = { elevenlabs: ek.trim() };
      window.sendToBackground('CONFIG_SAVE', payload).catch(function () {});
    }
    ['danman-eleven-key', 'danman-eleven-agent', 'danman-persona'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', saveElevenPrefs);
    });

    // Speech-to-text (Web Speech API)
    const micBtn = document.getElementById('danman-mic-btn');
    const voiceStatus = document.getElementById('danman-voice-status');
    let recognition = null;
    let listening = false;
    if (micBtn) {
      micBtn.addEventListener('click', function () {
        if (guard && !listening && !guard.confirmMode('stt')) return;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
          if (window.Toast) Toast.warning('Speech recognition not supported in this browser');
          return;
        }
        if (listening && recognition) {
          recognition.stop();
          listening = false;
          micBtn.textContent = '🎤 Mic';
          if (voiceStatus) voiceStatus.textContent = '';
          return;
        }
        recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.onresult = function (ev) {
          let finalText = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript;
          }
          if (finalText) {
            textarea.value = (textarea.value ? textarea.value + ' ' : '') + finalText.trim();
            autoResize();
          }
        };
        recognition.onerror = function (ev) {
          if (voiceStatus) voiceStatus.textContent = 'STT error: ' + (ev.error || 'unknown');
          listening = false;
          micBtn.textContent = '🎤 Mic';
        };
        recognition.onend = function () {
          listening = false;
          micBtn.textContent = '🎤 Mic';
        };
        recognition.start();
        listening = true;
        micBtn.textContent = '⏹ Stop';
        if (voiceStatus) voiceStatus.textContent = 'Listening…';
      });
    }

    // Video / audio analyze
    const videoBtn = document.getElementById('danman-video-btn');
    const videoInput = document.getElementById('danman-video-input');
    if (videoBtn && videoInput) {
      videoBtn.addEventListener('click', function () {
        if (guard && !guard.confirmMode('video_analyze')) return;
        videoInput.click();
      });
      videoInput.addEventListener('change', async function () {
        const file = videoInput.files && videoInput.files[0];
        videoInput.value = '';
        if (!file) return;
        if (voiceStatus) voiceStatus.textContent = 'Ingesting ' + file.name + '…';
        try {
          if (window.DMS_Ingest && window.DMS_Ingest.ingestFiles) {
            await ingestFiles([file]);
            if (voiceStatus) voiceStatus.textContent = 'Ready — ask about the media or send';
          } else {
            // Fallback: attach as data URL note
            const reader = new FileReader();
            reader.onload = function () {
              sendMessage('Analyze this media file (' + file.name + ', ' + file.type + '). Transcribe speech if audio is present and summarize key visual events if video.');
            };
            reader.readAsDataURL(file);
          }
        } catch (e) {
          if (voiceStatus) voiceStatus.textContent = 'Media ingest failed: ' + (e.message || e);
        }
      });
    }

    // Pop out with usage warning for persistent voice session
    if (popoutBtn) {
      popoutBtn.addEventListener('click', function (e) {
        if (guard && !guard.confirmMode('voice_session')) {
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      }, true);
    }
  })();

  console.log('[DANMAN] DANMAN chat tab loaded (multimodal v7.7.0)');
})();
