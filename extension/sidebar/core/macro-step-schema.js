// sidebar/core/macro-step-schema.js — Engine-compatible macro steps (GetPower v46)
// Preserves existing `macros` storage: normalize on run/save, denormalize for editor UI.
(function (global) {
  'use strict';

  var ENGINE_TYPES = [
    'click', 'screenClick', 'type', 'select', 'wait', 'upload', 'extract', 'navigate', 'scroll', 'hover',
    'keypress', 'screenshot', 'copy', 'paste', 'switchTab', 'mouseMove'
  ];

  var STEP_TYPES = [
    { type: 'click', label: 'Selector click', fields: ['selector', 'button', 'pauseOnMissing'], pickSelector: true },
    { type: 'screenClick', label: 'Screen click', fields: ['x', 'y', 'coordMode', 'screenAction', 'button', 'scrollLines', 'waitMs'], pickScreen: true },
    { type: 'mouseMove', label: 'Mouse move', fields: ['x', 'y', 'coordMode'], pickScreen: true },
    { type: 'type', label: 'Type', fields: ['selector', 'text', 'clear'], pickSelector: true },
    { type: 'select', label: 'Select option', fields: ['selector', 'value', 'pauseOnMissing'], pickSelector: true },
    { type: 'hover', label: 'Hover', fields: ['selector'], pickSelector: true },
    { type: 'scroll', label: 'Scroll', fields: ['selector', 'scrollMode', 'value'], pickSelector: true },
    { type: 'upload', label: 'Upload', fields: ['selector', 'filePath'], pickSelector: true },
    { type: 'extract', label: 'Extract', fields: ['selector', 'variable', 'extractType', 'attribute'], pickSelector: true },
    { type: 'wait', label: 'Wait', fields: ['waitType', 'value', 'selector', 'timeout'] },
    { type: 'navigate', label: 'Navigate', fields: ['value'] },
    { type: 'keypress', label: 'Keypress', fields: ['key', 'selector'] },
    { type: 'copy', label: 'Copy (Ctrl+C)', fields: [] },
    { type: 'paste', label: 'Paste (Ctrl+V)', fields: [] },
    { type: 'switchTab', label: 'Switch tab', fields: ['tabMatch', 'value'] },
    { type: 'screenshot', label: 'Screenshot', fields: ['captureMode', 'selector', 'value', 'x', 'y', 'width', 'height', 'coordMode', 'pauseOnMissing'] }
  ];

  function stepTypeDef(t) {
    for (var i = 0; i < STEP_TYPES.length; i++) {
      if (STEP_TYPES[i].type === t) return STEP_TYPES[i];
    }
    return null;
  }

  function cloneStep(s) {
    return JSON.parse(JSON.stringify(s || {}));
  }

  /** UI / legacy sidebar → engine runner shape */
  function normalizeStep(step) {
    if (!step || !step.type) return step;
    var s = cloneStep(step);
    var t = s.type;

    if (t === 'type') {
      if (s.text == null && s.value != null) s.text = s.value;
      delete s.value;
      if (s.clear == null) s.clear = true;
    }
    if (t === 'wait') {
      if (!s.waitType) {
        if (s.ms != null) {
          s.waitType = 'time';
          s.value = String(s.ms);
        } else {
          s.waitType = 'time';
          s.value = s.value != null ? String(s.value) : '1000';
        }
      }
      delete s.ms;
    }
    if (t === 'extract') {
      if (s.variable == null && s.name != null) s.variable = s.name;
      delete s.name;
      if (!s.extractType) s.extractType = 'text';
    }
    if (t === 'navigate') {
      if (s.value == null && s.url != null) s.value = s.url;
    }
    if (t === 'upload') {
      if (s.filePath == null && s.value != null) s.filePath = s.value;
      delete s.value;
    }
    if (t === 'keypress' && s.key == null && s.value != null) s.key = s.value;
    if (t === 'click') {
      if (!s.button) s.button = 'left';
      if (s.pauseOnMissing == null) s.pauseOnMissing = true;
    }
    if (t === 'select') {
      if (s.value == null && s.text != null) s.value = s.text;
      if (s.pauseOnMissing == null) s.pauseOnMissing = true;
    }
    if (t === 'screenClick') {
      if (!s.screenAction) s.screenAction = 'click';
      if (!s.button) s.button = 'left';
      if (s.scrollLines == null) s.scrollLines = 3;
      if (s.waitMs == null) s.waitMs = 1000;
      if (!s.coordMode) s.coordMode = 'precise';
      delete s.selector;
    }
    if (t === 'mouseMove') {
      if (!s.coordMode) s.coordMode = 'precise';
      delete s.selector;
    }
    if (t === 'screenshot') {
      if (!s.captureMode) s.captureMode = s.selector ? 'selector' : 'viewport';
      if (s.pauseOnMissing == null && s.captureMode === 'selector') s.pauseOnMissing = true;
    }
    if (t === 'switchTab' && !s.tabMatch) s.tabMatch = 'title';

    return s;
  }

  /** Engine shape → editor fields (backward compatible with old saved macros) */
  function denormalizeStep(step) {
    if (!step || !step.type) return step;
    var s = cloneStep(step);
    var t = s.type;

    if (t === 'type') {
      if (s.value == null && s.text != null) s.value = s.text;
    }
    if (t === 'wait') {
      if (s.waitType === 'time' && s.value != null) s.ms = parseInt(s.value, 10) || 0;
      else if (s.ms == null) s.ms = 1000;
    }
    if (t === 'extract') {
      if (s.name == null && s.variable != null) s.name = s.variable;
    }
    if (t === 'upload') {
      if (s.value == null && s.filePath != null) s.value = s.filePath;
    }

    return s;
  }

  function normalizeSteps(steps) {
    return (steps || []).map(normalizeStep);
  }

  function denormalizeSteps(steps) {
    return (steps || []).map(denormalizeStep);
  }

  function normalizeWorkflow(workflow) {
    var w = workflow || {};
    return {
      id: w.id,
      name: w.name || '',
      steps: normalizeSteps(w.steps),
      variables: w.variables || {}
    };
  }

  function summarizeStep(step) {
    var s = denormalizeStep(step);
    var t = s.type || '?';
    if (t === 'wait') return (s.waitType || 'time') + ' ' + (s.value || s.ms || 0);
    if (t === 'type') return (s.selector || '?') + '  "' + String(s.text || s.value || '').slice(0, 40) + '"';
    if (t === 'select') return (s.selector || '?') + '  = ' + String(s.value || '').slice(0, 40);
    if (t === 'upload') return (s.selector || '?') + '  ' + (s.filePath || s.value || '');
    if (t === 'extract') return (s.selector || '?') + '  -> ' + (s.variable || s.name || 'value');
    if (t === 'navigate') return s.value || s.url || '';
    if (t === 'keypress') return s.key || '';
    if (t === 'copy') return 'Copy selection';
    if (t === 'paste') return 'Paste clipboard';
    if (t === 'switchTab') return (s.tabMatch || 'title') + ': ' + (s.value || '');
    if (t === 'screenClick') {
      var coords = '(' + (s.x != null ? s.x : '?') + ',' + (s.y != null ? s.y : '?') + ')';
      var act = s.screenAction || 'click';
      if (act === 'scrollUp') return 'scroll up ' + (s.scrollLines || 3) + ' lines ' + coords;
      if (act === 'scrollDown') return 'scroll down ' + (s.scrollLines || 3) + ' lines ' + coords;
      if (act === 'hover') return 'hover ' + (s.waitMs || 1000) + 'ms ' + coords;
      return (s.button || 'left') + ' click ' + (s.coordMode || 'precise') + ' ' + coords;
    }
    if (t === 'mouseMove') {
      return 'move → (' + (s.x != null ? s.x : '?') + ',' + (s.y != null ? s.y : '?') + ')';
    }
    if (t === 'click') {
      var btn = s.button && s.button !== 'left' ? ' [' + s.button + ']' : '';
      return (s.selector || '(pick on page)') + btn;
    }
    if (t === 'screenshot') {
      var mode = s.captureMode || (s.selector ? 'selector' : 'viewport');
      var tag = s.value ? ' "' + String(s.value).slice(0, 30) + '"' : '';
      if (mode === 'selector') return 'selector ' + (s.selector || '?') + tag;
      if (mode === 'coords' || mode === 'screen') {
        return 'coords (' + (s.x != null ? s.x : '?') + ',' + (s.y != null ? s.y : '?') + ')' + tag;
      }
      return 'viewport' + tag + ' → Drive/DANMAN_Screenshots';
    }
    return s.selector || '(no selector)';
  }

  global.MacroStepSchema = {
    ENGINE_TYPES: ENGINE_TYPES,
    STEP_TYPES: STEP_TYPES,
    stepTypeDef: stepTypeDef,
    normalizeStep: normalizeStep,
    denormalizeStep: denormalizeStep,
    normalizeSteps: normalizeSteps,
    denormalizeSteps: denormalizeSteps,
    normalizeWorkflow: normalizeWorkflow,
    summarizeStep: summarizeStep,
    cloneStep: cloneStep
  };
})(typeof window !== 'undefined' ? window : self);
