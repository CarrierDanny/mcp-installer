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
     * One send attempt, normalized to a Promise across engines.
     *
     * Firefox's `browser.runtime.sendMessage` takes (message, options) and
     * returns a Promise — it has no callback parameter and no
     * `browser.runtime.lastError`. Passing a callback there means the callback
     * never fires AND the returned Promise is dropped, which surfaces in the
     * Browser Console as an unhandled "ExtensionError: Could not establish
     * connection. Receiving end does not exist." So: try the Promise form
     * first, and only fall back to the callback form when the engine returns
     * something that is not thenable (Chrome MV2-style callbacks).
     */
    sendMessageOnce(msg) {
      return new Promise((resolve, reject) => {
        let maybe;
        try {
          maybe = B.runtime.sendMessage(msg);
        } catch (e) {
          return reject(e);
        }
        if (maybe && typeof maybe.then === 'function') {
          maybe.then(resolve, (e) => reject(e instanceof Error ? e : new Error((e && e.message) || String(e))));
          return;
        }
        try {
          B.runtime.sendMessage(msg, (resp) => {
            const err = B.runtime.lastError;
            if (err) return reject(new Error(err.message || String(err)));
            resolve(resp);
          });
        } catch (e) {
          reject(e);
        }
      });
    },

    /**
     * Reliable background messaging for Firefox (event background) and Chrome MV3 SW wake.
     * Retries only the connection-class failures that a sleeping background produces.
     */
    sendMessageReliable(msg, retries) {
      const maxAttempts = retries || 4;
      return new Promise((resolve, reject) => {
        let attempt = 0;
        function trySend() {
          attempt += 1;
          Browser.runtime.sendMessageOnce(msg).then(resolve, (err) => {
            const msgText = (err && err.message) || String(err);
            const retryable = /establish connection|Receiving end does not exist|message port closed/i.test(msgText);
            if (retryable && attempt < maxAttempts) {
              return setTimeout(trySend, 280 * attempt);
            }
            reject(err instanceof Error ? err : new Error(msgText));
          });
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
