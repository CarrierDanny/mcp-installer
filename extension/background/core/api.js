// core/api.js — Multi-AI Provider Client
async function readResponseBody(resp) {
  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  const raw = await resp.text();
  if (!raw) return { data: null, raw: '', contentType };

  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return { data: JSON.parse(raw), raw, contentType };
    } catch (err) {
      throw new Error(`Invalid JSON response (${contentType || 'unknown content type'}): ${err.message}`);
    }
  }

  return { data: null, raw, contentType };
}

function summarizeNonJsonResponse(providerLabel, contentType, raw) {
  const snippet = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  const typeLabel = contentType || 'unknown content type';
  return `${providerLabel} returned a non-JSON response (${typeLabel}). ${snippet || 'Empty response body.'}`;
}

const AIClient = {
  async chat(messages, options = {}) {
    const config = await ConfigManager.load();
    const provider = options.provider || config.ai_provider;
    const apiKey = options.apiKey || config.api_keys?.[provider];
    if (!apiKey) throw new Error(`No API key configured for ${provider}. Go to Settings to add one.`);

    let model = options.model || config.ai_models?.[provider];
    if (typeof resolveModelId === 'function') {
      model = resolveModelId(provider, model);
    }
    const maxTokens = options.max_tokens || 2000;

    switch (provider) {
      case 'claude': return this._claude(messages, apiKey, model, maxTokens, provider);
      case 'gemini': return this._gemini(messages, apiKey, model, maxTokens);
      case 'openai': return this._openai(messages, apiKey, model, maxTokens);
      default: throw new Error(`Unknown AI provider: ${provider}`);
    }
  },

  async _claude(messages, apiKey, model, maxTokens, provider) {
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMsgs = messages.filter(m => m.role !== 'system');
    const body = {
      model,
      max_tokens: maxTokens,
      system: systemMsg,
      messages: userMsgs.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
    };

    async function postOnce(modelId) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({ ...body, model: modelId })
      });
      const { data, raw, contentType } = await readResponseBody(resp);
      return { resp, data, raw, contentType, modelId };
    }

    let attempt = await postOnce(model);
    if (!attempt.resp.ok) {
      const errMsg = attempt.data?.error?.message || '';
      const modelBad = /model|not_found|invalid/i.test(errMsg) || attempt.resp.status === 404;
      const aliases = (typeof CLAUDE_MODEL_ALIASES !== 'undefined') ? CLAUDE_MODEL_ALIASES : {};
      const fallback = aliases[model];
      if (modelBad && fallback && fallback !== model) {
        attempt = await postOnce(fallback);
        model = fallback;
      }
    }

    const { resp, data, raw, contentType } = attempt;
    if (!resp.ok) {
      const hint = !apiKey ? ' — add your Anthropic API key in extension Settings' : '';
      throw new Error((data?.error?.message || summarizeNonJsonResponse('Claude', contentType, raw) || `Claude API error: ${resp.status}`) + hint);
    }
    if (!data) {
      throw new Error(summarizeNonJsonResponse('Claude', contentType, raw));
    }
    return data.content?.[0]?.text || '';
  },

  async _gemini(messages, apiKey, model, maxTokens) {
    const systemInstruction = messages.find(m => m.role === 'system');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    const body = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens }
    };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
    }
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      }
    );
    const { data, raw, contentType } = await readResponseBody(resp);
    if (!resp.ok) {
      throw new Error(data?.error?.message || summarizeNonJsonResponse('Gemini', contentType, raw) || `Gemini API error: ${resp.status}`);
    }
    if (!data) {
      throw new Error(summarizeNonJsonResponse('Gemini', contentType, raw));
    }
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Gemini returned no content');
    }
    return data.candidates[0].content.parts[0].text;
  },

  async _openai(messages, apiKey, model, maxTokens) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      })
    });
    const { data, raw, contentType } = await readResponseBody(resp);
    if (!resp.ok) {
      throw new Error(data?.error?.message || summarizeNonJsonResponse('OpenAI', contentType, raw) || `OpenAI API error: ${resp.status}`);
    }
    if (!data) {
      throw new Error(summarizeNonJsonResponse('OpenAI', contentType, raw));
    }
    return data.choices[0].message.content;
  },

  // Firecrawl scraping (optional premium scraper)
  async firecrawlScrape(url, apiKey, options = {}) {
    const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'links'],
        onlyMainContent: options.onlyMainContent !== false,
        blockAds: options.blockAds !== false,
        ...options
      })
    });
    const { data, raw, contentType } = await readResponseBody(resp);
    if (!resp.ok) {
      throw new Error(data?.error || summarizeNonJsonResponse('Firecrawl', contentType, raw) || `Firecrawl error: ${resp.status}`);
    }
    if (!data) {
      throw new Error(summarizeNonJsonResponse('Firecrawl', contentType, raw));
    }
    return data;
  },

  async testFirecrawl(apiKey) {
    const resp = await fetch('https://api.firecrawl.dev/v1/team/token-usage', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    const { data, raw, contentType } = await readResponseBody(resp);
    if (!resp.ok) {
      throw new Error(data?.error || summarizeNonJsonResponse('Firecrawl', contentType, raw) || `Firecrawl API error: ${resp.status}`);
    }
    if (!data) {
      throw new Error(summarizeNonJsonResponse('Firecrawl', contentType, raw));
    }
    if (data.success === false) {
      throw new Error(data.error || 'Firecrawl authentication failed');
    }
    return { success: true, data };
  },

  async testConnection(payload) {
    // Accept either a string (legacy) or object { provider, apiKey, model }
    const provider = (typeof payload === 'string') ? payload : payload.provider;
    const apiKey = (typeof payload === 'string') ? null : payload.apiKey;
    const model = (typeof payload === 'string') ? null : payload.model;
    try {
      if (provider === 'firecrawl') {
        const key = apiKey || (await ConfigManager.load()).api_keys?.firecrawl;
        if (!key) throw new Error('No Firecrawl API key provided');
        await this.testFirecrawl(key);
        return { success: true, response: 'connected' };
      }
      const result = await this.chat(
        [{ role: 'user', content: 'Respond with exactly the word "connected".' }],
        { provider, apiKey, model, max_tokens: 50 }
      );
      return { success: true, response: String(result).trim() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
};

if (typeof globalThis !== 'undefined') globalThis.AIClient = AIClient;
