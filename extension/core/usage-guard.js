// core/usage-guard.js — Confirm before enabling high-token / paid API modes
(function (global) {
  'use strict';

  var WARNINGS = {
    stream: {
      title: 'Enable streaming responses?',
      body: 'Streaming keeps the model connection open and can increase billed output tokens as text is generated live. Continue?'
    },
    page_watch: {
      title: 'Enable continuous page sight?',
      body: 'DANMAN will read each page you navigate and may send page text/DOM summaries to your AI provider. This can use a large number of tokens per navigation. Continue?'
    },
    bridge_rag: {
      title: 'Enable Bridge RAG?',
      body: 'Server-side memory injection adds retrieved context to every chat turn and increases token usage. Continue?'
    },
    include_context: {
      title: 'Include live page context?',
      body: 'Page HTML/text will be sent with each message. Large pages use more input tokens. Continue?'
    },
    include_memory: {
      title: 'Include Drive memory context?',
      body: 'Project memory files will be injected into the prompt and count toward input tokens. Continue?'
    },
    tts_elevenlabs: {
      title: 'Enable ElevenLabs voice?',
      body: 'Text-to-speech calls your ElevenLabs API and is billed separately from chat tokens. Continue?'
    },
    stt: {
      title: 'Enable speech-to-text?',
      body: 'Microphone audio may be sent to your STT provider (browser SpeechRecognition or OpenAI Whisper). Continue?'
    },
    video_analyze: {
      title: 'Analyze video?',
      body: 'Video frames / transcripts are sent to the vision/chat model and can exhaust prepaid tokens quickly on long clips. Continue?'
    },
    voice_session: {
      title: 'Start persistent voice session?',
      body: 'A popped-out voice chat keeps STT/TTS and page-watch active across tabs. This can rack up API usage continuously until you stop it. Continue?'
    }
  };

  function confirmMode(modeKey, custom) {
    var meta = WARNINGS[modeKey] || {
      title: 'Enable this mode?',
      body: custom || 'This feature may increase API / token usage. Continue?'
    };
    var msg = meta.title + '\n\n' + meta.body +
      '\n\nTip: turn it off when finished. Prepaid monthly API budgets can drain quickly with continuous modes.';
    var ok = false;
    try {
      ok = window.confirm(msg);
    } catch (_) {
      ok = false;
    }
    try {
      if (typeof window !== 'undefined' && window.sendToBackground) {
        window.sendToBackground('LOG_ACTION', {
          action: 'USAGE_GUARD',
          detail: (ok ? 'accepted' : 'declined') + ':' + modeKey,
          data: { mode: modeKey, accepted: ok }
        }).catch(function () {});
      }
    } catch (_) {}
    return ok;
  }

  function bindToggle(checkbox, modeKey, onEnable) {
    if (!checkbox) return;
    checkbox.addEventListener('change', function () {
      if (!checkbox.checked) {
        if (typeof onEnable === 'function') onEnable(false);
        return;
      }
      if (!confirmMode(modeKey)) {
        checkbox.checked = false;
        return;
      }
      if (typeof onEnable === 'function') onEnable(true);
    });
  }

  global.GPD_UsageGuard = {
    WARNINGS: WARNINGS,
    confirmMode: confirmMode,
    bindToggle: bindToggle
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : self);
