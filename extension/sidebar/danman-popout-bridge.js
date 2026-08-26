// danman-popout-bridge.js — Maps google.script.run (GAS sidebar) to extension messaging
(function () {
  'use strict';
  var B = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

  function sendBg(type, payload) {
    var msg = { type: type, payload: payload || {} };
    var maxAttempts = 4;

    function sendReliable() {
      return new Promise(function (resolve, reject) {
        var attempt = 0;
        function trySend() {
          attempt += 1;
          try {
            B.runtime.sendMessage(msg, function (resp) {
              var err = B.runtime.lastError;
              if (err) {
                var errText = err.message || String(err);
                if (/establish connection|Receiving end does not exist|message port closed/i.test(errText) && attempt < maxAttempts) {
                  return setTimeout(trySend, 300 * attempt);
                }
                return reject(new Error(errText));
              }
              if (resp && resp.error) return reject(new Error(resp.error));
              resolve(resp || {});
            });
          } catch (e) {
            if (attempt < maxAttempts) return setTimeout(trySend, 300 * attempt);
            reject(e);
          }
        }
        trySend();
      });
    }

    return sendReliable();
  }

  function createGasRunner() {
    var runner = {
      _success: null,
      _failure: null
    };
    var proxy = new Proxy(runner, {
      get: function (target, prop) {
        if (prop === 'withSuccessHandler') {
          return function (fn) {
            target._success = fn;
            return proxy;
          };
        }
        if (prop === 'withFailureHandler') {
          return function (fn) {
            target._failure = fn;
            return proxy;
          };
        }
        return function () {
          var args = Array.prototype.slice.call(arguments);
          var method = String(prop);
          var routeType = method === 'sendMessageToDANMAN' ? 'DANMAN_POPOUT_CHAT' : 'DANMAN_GAS_PROXY';
          var routePayload = method === 'sendMessageToDANMAN'
            ? (args[0] || {})
            : { method: method, args: args };

          sendBg(routeType, routePayload)
            .then(function (resp) {
              var data = resp.data !== undefined ? resp.data : resp;
              if (target._success) target._success(data);
            })
            .catch(function (err) {
              if (target._failure) target._failure(err);
            });
          return proxy;
        };
      }
    });
    return proxy;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createGasRunner();
  window.danmanSendBg = sendBg;

  window.danmanPopoutDock = function () {
    sendBg('DANMAN_POPOUT_DOCK', {}).then(function () {
      window.close();
    }).catch(function () {
      window.close();
    });
  };

  function wakeAndLoadConfig() {
    sendBg('PING', {}).catch(function () {});
    sendBg('CONFIG_LOAD', {}).then(function (cfg) {
      if (!cfg) return;
      var label = document.getElementById('model-label');
      var provider = cfg.ai_provider || 'claude';
      var model = (cfg.ai_models && cfg.ai_models[provider]) || provider;
      if (label) label.textContent = model;
    }).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    var dockBtn = document.getElementById('dock-btn');
    if (dockBtn && dockBtn.dataset.danmanBound !== '1') {
      dockBtn.dataset.danmanBound = '1';
      dockBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.danmanPopoutDock();
      });
    }
    wakeAndLoadConfig();
  });
})();
