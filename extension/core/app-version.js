// core/app-version.js — single source of truth for user-visible extension version
(function (global) {
  'use strict';
  global.GPD_APP_VERSION = '7.7.0';
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : self);
