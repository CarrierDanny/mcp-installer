// options/options-api-test.js — Test AI keys from the options page (no background worker required)
(function (global) {
  'use strict';

  const CLAUDE_ALIASES = {
    'claude-opus-4-6': 'claude-opus-4-5-20251101',
    'claude-sonnet-4-6': 'claude-sonnet-4-5-20250929'
  };

  async function readJson(resp) {
    const raw = await resp.text();
    if (!raw) return { data: null, raw: '' };
    try {
      return { data: JSON.parse(raw), raw };
    } catch (e) {
      return { data: null, raw };
    }
  }

  async function testClaude(apiKey, model) {
    let modelId = model || 'claude-sonnet-4-5-20250929';
    const body = {
      model: modelId,
      max_tokens: 32,
      messages: [{ role: 'user', content: 'Respond with exactly the word connected.' }]
    };
    async function post(m) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({ ...body, model: m })
      });
      const { data, raw } = await readJson(resp);
      return { resp, data, raw, model: m };
    }
    let attempt = await post(modelId);
    if (!attempt.resp.ok) {
      const fallback = CLAUDE_ALIASES[modelId];
      if (fallback && fallback !== modelId) attempt = await post(fallback);
    }
    if (!attempt.resp.ok) {
      throw new Error(attempt.data?.error?.message || `Claude API error: ${attempt.resp.status}`);
    }
    return { success: true, response: attempt.data?.content?.[0]?.text || 'connected' };
  }

  async function testOpenai(apiKey, model) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Respond with exactly the word connected.' }]
      })
    });
    const { data, raw } = await readJson(resp);
    if (!resp.ok) throw new Error(data?.error?.message || `OpenAI API error: ${resp.status} ${raw.slice(0, 120)}`);
    return { success: true, response: data?.choices?.[0]?.message?.content || 'connected' };
  }

  async function testGemini(apiKey, model) {
    const modelId = model || 'gemini-2.5-flash';
    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(modelId) +
        ':generateContent?key=' +
        encodeURIComponent(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Respond with exactly the word connected.' }] }],
          generationConfig: { maxOutputTokens: 32 }
        })
      }
    );
    const { data, raw } = await readJson(resp);
    if (!resp.ok) throw new Error(data?.error?.message || `Gemini API error: ${resp.status} ${raw.slice(0, 120)}`);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned no content');
    return { success: true, response: text };
  }

  async function testFirecrawl(apiKey) {
    const resp = await fetch('https://api.firecrawl.dev/v1/team/token-usage', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + apiKey }
    });
    const { data, raw } = await readJson(resp);
    if (!resp.ok) throw new Error(data?.error || `Firecrawl API error: ${resp.status} ${raw.slice(0, 120)}`);
    if (data && data.success === false) throw new Error(data.error || 'Firecrawl authentication failed');
    return { success: true, response: 'connected' };
  }

  async function testConnection(payload) {
    const provider = payload.provider;
    const apiKey = (payload.apiKey || '').trim();
    const model = payload.model;
    if (!apiKey) throw new Error('No API key provided');
    if (provider === 'firecrawl') return testFirecrawl(apiKey);
    if (provider === 'claude') return testClaude(apiKey, model);
    if (provider === 'openai') return testOpenai(apiKey, model);
    if (provider === 'gemini') return testGemini(apiKey, model);
    throw new Error('Unknown provider: ' + provider);
  }

  global.OptionsApiTest = { testConnection };
})(typeof globalThis !== 'undefined' ? globalThis : window);
