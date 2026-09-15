// core/storage.js — Session & Data Storage Helpers
const Storage = {
  // Session data
  async getSession(sessionId) {
    const key = `gpd_session_${sessionId}`;
    const result = await Browser.storage.get(key);
    return result[key] || null;
  },
  async saveSession(sessionId, data) {
    const key = `gpd_session_${sessionId}`;
    await Browser.storage.set({ [key]: { ...data, updatedAt: new Date().toISOString() } });
  },

  // Generic key-value
  async getData(key) {
    const result = await Browser.storage.get(key);
    return result[key] || null;
  },
  async setData(key, value) {
    await Browser.storage.set({ [key]: value });
  },
  async removeData(key) {
    await Browser.storage.remove(key);
  },

  // Chat history
  async getChatHistory(sessionId) {
    return (await this.getData(`gpd_chat_${sessionId}`)) || [];
  },
  async saveChatMessage(sessionId, message) {
    const history = await this.getChatHistory(sessionId);
    history.push({ ...message, timestamp: new Date().toISOString() });
    if (history.length > 200) history.splice(0, history.length - 200);
    await this.setData(`gpd_chat_${sessionId}`, history);
    return history;
  },

  // EJECT history
  async getEjectHistory() {
    return (await this.getData('gpd_eject_history')) || [];
  },
  async saveEjectRecord(record) {
    const history = await this.getEjectHistory();
    history.unshift(record);
    if (history.length > 200) history.splice(200);
    await this.setData('gpd_eject_history', history);
  },
  async clearEjectHistory() {
    await this.setData('gpd_eject_history', []);
  },

  // Scrape results
  async saveScrapeResult(sessionId, result) {
    const results = (await this.getData(`gpd_scrape_${sessionId}`)) || [];
    results.push(result);
    await this.setData(`gpd_scrape_${sessionId}`, results);
  },
  async getScrapeResults(sessionId) {
    return (await this.getData(`gpd_scrape_${sessionId}`)) || [];
  }
};

if (typeof globalThis !== 'undefined') globalThis.Storage = Storage;
