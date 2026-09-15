// core/model-catalog.js — single source of truth for the AI model catalog.
// Loaded by: background (manifest, before background/core/config.js),
// options/options.html, and sidebar/sidebar.html — so the background config,
// the options page, and the OCR tab all read the same list instead of
// carrying hard-coded copies that drift.
(function () {
  'use strict';

  var AVAILABLE_MODELS = {
    claude: [
      { id: 'claude-fable-5', name: 'Claude Fable 5 (Frontier)', tier: 'best' },
      { id: 'claude-opus-5', name: 'Claude Opus 5 (Latest)', tier: 'best' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5 (Latest)', tier: 'balanced' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (Fast)', tier: 'fast' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', tier: 'best' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', tier: 'best' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', tier: 'balanced' },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', tier: 'balanced' },
      { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', tier: 'best' }
    ],
    gemini: [
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (Latest)', tier: 'balanced' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview)', tier: 'best' },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite (Fast)', tier: 'fast' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tier: 'best' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tier: 'balanced' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', tier: 'fast' }
    ],
    openai: [
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol (Latest)', tier: 'best' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra (Balanced)', tier: 'balanced' },
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna (Fast)', tier: 'fast' },
      { id: 'o3', name: 'o3', tier: 'best' },
      { id: 'o4-mini', name: 'o4-mini', tier: 'balanced' },
      { id: 'gpt-4o', name: 'GPT-4o', tier: 'best' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', tier: 'fast' }
    ]
  };

  var MODEL_LIMITS = {
    'claude-fable-5':               { context: 1000000, maxOutput: 128000, cost: '$$$' },
    'claude-opus-5':                { context: 1000000, maxOutput: 128000, cost: '$$$' },
    'claude-sonnet-5':              { context: 1000000, maxOutput: 128000, cost: '$$' },
    'claude-haiku-4-5-20251001':    { context: 200000,  maxOutput: 64000,  cost: '$' },
    'claude-opus-4-8':              { context: 1000000, maxOutput: 128000, cost: '$$$' },
    'claude-opus-4-6':              { context: 1000000, maxOutput: 128000, cost: '$$$' },
    'claude-sonnet-4-6':            { context: 1000000, maxOutput: 128000, cost: '$$' },
    'claude-sonnet-4-5-20250929':   { context: 200000,  maxOutput: 64000,  cost: '$$' },
    'claude-opus-4-5-20251101':     { context: 200000,  maxOutput: 64000,  cost: '$$$' },
    'gemini-3.5-flash':             { context: 1048576, maxOutput: 65536,  cost: '$$' },
    'gemini-3.1-pro-preview':       { context: 1048576, maxOutput: 65536,  cost: '$$$' },
    'gemini-3.1-flash-lite':        { context: 1048576, maxOutput: 65536,  cost: '$' },
    'gemini-2.5-pro':               { context: 1048576, maxOutput: 65536,  cost: '$$$' },
    'gemini-2.5-flash':             { context: 1048576, maxOutput: 65536,  cost: '$$' },
    'gemini-2.5-flash-lite':        { context: 1048576, maxOutput: 65536,  cost: '$' },
    'gpt-5.6-sol':                  { context: 400000,  maxOutput: 128000, cost: '$$$' },
    'gpt-5.6-terra':                { context: 400000,  maxOutput: 128000, cost: '$$' },
    'gpt-5.6-luna':                 { context: 400000,  maxOutput: 128000, cost: '$' },
    'o3':                           { context: 200000,  maxOutput: 100000, cost: '$$$' },
    'o4-mini':                      { context: 200000,  maxOutput: 100000, cost: '$$' },
    'gpt-4o':                       { context: 128000,  maxOutput: 16384,  cost: '$$$' },
    'gpt-4o-mini':                  { context: 128000,  maxOutput: 16384,  cost: '$' }
  };

  /** Map UI / future model ids to Anthropic API ids when the API rejects an alias. */
  var CLAUDE_MODEL_ALIASES = {
    'claude-haiku-4-5': 'claude-haiku-4-5-20251001'
  };

  function resolveModelId(provider, modelId) {
    if (!modelId) return modelId;
    if (provider === 'claude' && CLAUDE_MODEL_ALIASES[modelId]) {
      return CLAUDE_MODEL_ALIASES[modelId];
    }
    return modelId;
  }

  globalThis.DMS_MODEL_CATALOG = {
    AVAILABLE_MODELS: AVAILABLE_MODELS,
    MODEL_LIMITS: MODEL_LIMITS,
    CLAUDE_MODEL_ALIASES: CLAUDE_MODEL_ALIASES,
    resolveModelId: resolveModelId
  };
})();
