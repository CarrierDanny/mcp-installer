/**
 * VERSION: V002R024
 * DATE: 2026-09-15
 * CHANGE: Frame-token gate for DANMAN_PAGE_ANALYSIS
 * HISTORY:
 *   V001R192 2026-08-26 Baseline import + Firefox messaging/clipboard fixes (unstamped)
 */
// sidebar/danman-float-init.js — logic for the floating on-page chat bubble.
// Lives in its own file because the extension-page CSP blocks inline scripts
// (the previous inline <script> in danman-float.html never executed).
const messagesDiv = document.getElementById('messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const analyzeBtn = document.getElementById('analyze-btn');
const closeBtn = document.getElementById('close-btn');
const minimizeBtn = document.getElementById('minimize-btn');
let chatHistory = [];

function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = content;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  chatHistory.push({ role, content });
  // Persist to storage
  chrome.storage.session.set({ danman_float_history: chatHistory }).catch(() => {});
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'typing';
  div.id = 'typing-indicator';
  div.textContent = 'DANMAN is thinking...';
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  sendBtn.disabled = true;

  addMessage('user', text);
  showTyping();

  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'DANMAN_CHAT',
      payload: { message: text, history: chatHistory.slice(-20) }
    });
    hideTyping();
    if (resp && resp.response) {
      addMessage('assistant', resp.response);
    } else if (resp && resp.error) {
      addMessage('system', 'Error: ' + resp.error);
    }
  } catch (e) {
    hideTyping();
    addMessage('system', 'Connection error: ' + e.message);
  }
  sendBtn.disabled = false;
  chatInput.focus();
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// Auto-resize textarea
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
});

// Close / minimize buttons communicate with parent content script
closeBtn.addEventListener('click', () => {
  window.parent.postMessage({ type: 'DANMAN_FLOAT_CLOSE' }, '*');
});

minimizeBtn.addEventListener('click', () => {
  window.parent.postMessage({ type: 'DANMAN_FLOAT_MINIMIZE' }, '*');
});

// Analyze page button
analyzeBtn.addEventListener('click', async () => {
  addMessage('system', 'Analyzing current page...');
  try {
    window.parent.postMessage({ type: 'DANMAN_FLOAT_ANALYZE' }, '*');
  } catch (e) {
    addMessage('system', 'Could not analyze page: ' + e.message);
  }
});

// Per-tab frame token (see background/core/security.js): the host page can
// postMessage into this iframe too, so only stamped messages from the parent
// are trusted.
let floatFrameToken = null;
(function fetchFrameToken(attempt) {
  let p;
  try { p = chrome.runtime.sendMessage({ type: 'FRAME_TOKEN_GET' }); } catch (err) { p = Promise.reject(err); }
  Promise.resolve(p).then((r) => {
    if (!r || !r.token) throw new Error('no frame token');
    floatFrameToken = r.token;
  }).catch(() => {
    if (attempt < 5) setTimeout(() => fetchFrameToken(attempt + 1), 400 * (attempt + 1));
  });
})(0);

// Listen for page analysis results from content script
window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return;
  if (!floatFrameToken || !event.data || event.data.__t !== floatFrameToken) return;
  if (event.data && event.data.type === 'DANMAN_PAGE_ANALYSIS') {
    const data = event.data.payload;
    const summary = 'Page: ' + (data.title || 'Unknown') + '\nURL: ' + (data.url || '') +
      '\nHeadings: ' + (data.headings || []).length +
      '\nLinks: ' + (data.links || []).length +
      '\nForms: ' + (data.forms || []).length;
    addMessage('system', summary);
    // Send to DANMAN for analysis
    chrome.runtime.sendMessage({
      type: 'DANMAN_CHAT',
      payload: {
        message: 'Analyze this page data and summarize the key information:\n\n' + JSON.stringify(data, null, 2),
        history: chatHistory.slice(-10)
      }
    }).then(resp => {
      if (resp && resp.response) addMessage('assistant', resp.response);
    }).catch(() => {});
  }
});

// Restore chat history on load
chrome.storage.session.get('danman_float_history').then(data => {
  if (data.danman_float_history) {
    chatHistory = data.danman_float_history;
    chatHistory.forEach(msg => {
      const div = document.createElement('div');
      div.className = 'msg ' + msg.role;
      div.textContent = msg.content;
      messagesDiv.appendChild(div);
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}).catch(() => {});

// Persistent float: mic STT + page sight toggle (with usage warning)
(function () {
  const micBtn = document.getElementById('mic-btn');
  const pageSight = document.getElementById('page-sight');
  let recognition = null;
  let listening = false;

  if (pageSight) {
    pageSight.addEventListener('change', function () {
      if (pageSight.checked) {
        const ok = confirm('Enable continuous page sight?\n\nDANMAN will follow page navigations and may send page text to your AI provider. This can use many tokens. Continue?');
        if (!ok) { pageSight.checked = false; return; }
      }
      chrome.runtime.sendMessage({
        type: 'DANMAN_PAGE_WATCH_TOGGLE',
        payload: { enabled: !!pageSight.checked }
      }).catch(function () {});
    });
    chrome.storage.local.get('gpd_page_watch', function (r) {
      if (r && r.gpd_page_watch && r.gpd_page_watch.enabled) pageSight.checked = true;
    });
  }

  if (micBtn) {
    micBtn.addEventListener('click', function () {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        addMessage('system', 'Speech recognition not supported here.');
        return;
      }
      if (listening && recognition) {
        recognition.stop();
        listening = false;
        micBtn.textContent = '\uD83C\uDF99';
        return;
      }
      const ok = confirm('Enable speech-to-text?\n\nMicrophone audio will be processed via the browser speech engine when available.');
      if (!ok) return;
      recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = function (ev) {
        let t = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) t += ev.results[i][0].transcript;
        }
        if (t) chatInput.value = (chatInput.value ? chatInput.value + ' ' : '') + t.trim();
      };
      recognition.onend = function () { listening = false; micBtn.textContent = '\uD83C\uDF99'; };
      recognition.start();
      listening = true;
      micBtn.textContent = '\u23F9';
    });
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local' || !changes.gpd_page_watch_latest || !pageSight || !pageSight.checked) return;
    const p = changes.gpd_page_watch_latest.newValue;
    if (!p) return;
    addMessage('system', 'Navigated: ' + (p.title || p.url || ''));
  });
})();
