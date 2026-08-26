// danman-popout-bridge.js — Maps google.script.run (GAS sidebar) to extension messaging
(function () {
  'use strict';
  var B = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

  // One send attempt, normalized to a Promise.
  //
  // Firefox's `browser.runtime.sendMessage` is (message, options) -> Promise:
  // it has no callback parameter and no `browser.runtime.lastError`. The old
  // callback-only implementation therefore never resolved on Firefox *and*
  // dropped the returned Promise, which the Browser Console reports as an
  // unhandled "ExtensionError: Could not establish connection. Receiving end
  // does not exist." every time the popout sent a chat message. Prefer the
  // Promise form; fall back to callbacks only for engines that return a
  // non-thenable.
  function sendOnce(msg) {
    return new Promise(function (resolve, reject) {
      var maybe;
      try {
        maybe = B.runtime.sendMessage(msg);
      } catch (e) {
        reject(e);
        return;
      }
      if (maybe && typeof maybe.then === 'function') {
        maybe.then(resolve, function (e) {
          reject(e instanceof Error ? e : new Error((e && e.message) || String(e)));
        });
        return;
      }
      try {
        B.runtime.sendMessage(msg, function (resp) {
          var err = B.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          resolve(resp);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function sendBg(type, payload) {
    var msg = { type: type, payload: payload || {} };
    var maxAttempts = 4;

    function sendReliable() {
      return new Promise(function (resolve, reject) {
        var attempt = 0;
        function trySend() {
          attempt += 1;
          sendOnce(msg).then(function (resp) {
            if (resp && resp.error) return reject(new Error(resp.error));
            resolve(resp || {});
          }, function (err) {
            var errText = (err && err.message) || String(err);
            if (/establish connection|Receiving end does not exist|message port closed/i.test(errText) && attempt < maxAttempts) {
              return setTimeout(trySend, 300 * attempt);
            }
            reject(err instanceof Error ? err : new Error(errText));
          });
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
