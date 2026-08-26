// core/browser.js — Unified Browser API Wrapper
const B = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

const Browser = {
  isFirefox: typeof browser !== 'undefined' && !!browser.runtime,

  storage: {
    async get(keys) { return new Promise((resolve, reject) => { B.storage.local.get(keys, (r) => { if (B.runtime.lastError) reject(B.runtime.lastError); else resolve(r); }); }); },
    async set(data) { return new Promise((resolve, reject) => { B.storage.local.set(data, () => { if (B.runtime.lastError) reject(B.runtime.lastError); else resolve(); }); }); },
    async remove(keys) { return new Promise((resolve, reject) => { B.storage.local.remove(keys, () => { if (B.runtime.lastError) reject(B.runtime.lastError); else resolve(); }); }); }
  },

  runtime: {
    sendMessage(msg) { return B.runtime.sendMessage(msg); },
    /**
     * Reliable background messaging for Firefox (event background) and Chrome MV3 SW wake.
     * Uses callback API so runtime.lastError is never swallowed.
     */
    sendMessageReliable(msg, retries) {
      const maxAttempts = retries || 4;
      return new Promise((resolve, reject) => {
        let attempt = 0;
        function trySend() {
          attempt += 1;
          try {
            B.runtime.sendMessage(msg, (resp) => {
              const err = B.runtime.lastError;
              if (err) {
                const msgText = err.message || String(err);
                const retryable = /establish connection|Receiving end does not exist|message port closed/i.test(msgText);
                if (retryable && attempt < maxAttempts) {
                  return setTimeout(trySend, 280 * attempt);
                }
                return reject(new Error(msgText));
              }
              resolve(resp);
            });
          } catch (e) {
            if (attempt < maxAttempts) return setTimeout(trySend, 280 * attempt);
            reject(e);
          }
        }
        trySend();
      });
    },
    async wakeBackground() {
      try {
        await Browser.runtime.sendMessageReliable({ type: 'PING' }, 2);
        return true;
      } catch (_) {
        return false;
      }
    },
    onMessage: B.runtime.onMessage,
    getURL(path) { return B.runtime.getURL(path); },
    get id() { return B.runtime.id; }
  },

  tabs: {
    async query(opts) { return new Promise((resolve) => { B.tabs.query(opts, resolve); }); },
    async sendMessage(tabId, msg) { return B.tabs.sendMessage(tabId, msg); },
    async getCurrent() { const tabs = await this.query({ active: true, currentWindow: true }); return tabs[0]; }
  },

  contextMenus: B.contextMenus,
  commands: B.commands,
  scripting: B.scripting
};

// For Firefox which returns Promises natively, override with direct calls
if (Browser.isFirefox) {
  Browser.storage.get = (keys) => B.storage.local.get(keys);
  Browser.storage.set = (data) => B.storage.local.set(data);
  Browser.storage.remove = (keys) => B.storage.local.remove(keys);
  Browser.tabs.query = (opts) => B.tabs.query(opts);
  Browser.tabs.sendMessage = (tabId, msg) => B.tabs.sendMessage(tabId, msg);
}

if (typeof globalThis !== 'undefined') globalThis.Browser = Browser;
