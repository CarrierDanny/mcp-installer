# CHANGELOG

## 2026-09-15
- extension/content/content-main.js V003R016 — Share frame helpers with the form-fill IIFE (fixed ReferenceError on every window message); sidebar-sourced DANMAN_FLOAT_OPEN handled once
- extension/background/service-worker.js V003R018 — Chromium importScripts list mirrors manifest background.scripts (was missing model-catalog, google-ids, master-log, bridge-registry, workbench-parser, soql-engine, security)
- test/smoke-chromium.js (new) — Standalone Chromium smoke test: boots the extension, runs the hostile-page harness + legitimate flows, time-boxed
- extension/background/core/security.js V001R220 — Initial creation — trust zones, frame tokens, URL policy for the background
- extension/background/service-worker.js V002R070 — Trust-zone gate on the message router, FRAME_TOKEN_GET, webhook URL/redirect checks, crawl/rip fetch-target policy, Salesforce host check, content-zone MACRO_RUN restricted to last macro
- extension/background/core/api.js V002R013 — Gemini API key moved from query string to x-goog-api-key header
- extension/background/core/config.js V002R025 — validateEndpoints() on every config write; scraping.block_private_network setting
- extension/background/core/bridge-registry.js V002R014 — Bridge URLs must pass the endpoint policy on save and post; redirect host verified
- extension/background/core/tree-renderer.js V002R021 — Escape crawled titles/URLs before innerHTML
- extension/background/danman-gas-bridge.js V002R009 — Webhook URL policy + redirect host check on webhookCall
- extension/content/content-main.js V002R108 — isTrusted gates on trigger/hover/slot clicks; extension-origin check on every frame message; per-tab frame token on messages into frames; GPD_COPY_TO_CLIPBOARD over runtime messaging
- extension/content/clipboard-listener.js V002R046 — Extension-origin check on window messages; frame token on sendToSidebar
- extension/sidebar/sidebar.js V002R071 — Frame-token gate for parent messages (queued until token arrives); copyToClipboard over tabs.sendMessage
- extension/sidebar/danman-float-init.js V002R024 — Frame-token gate for DANMAN_PAGE_ANALYSIS
- extension/sidebar/tabs/forms-tab.js V002R015 — DANMAN_ELEMENT_PICKED read from authenticated gpd-message dispatch
- extension/sidebar/tabs/clipboard-tab.js V002R017 — Capture/state updates read from authenticated gpd-message dispatch
- extension/sidebar/tabs/eject-tab.js V002R016 — Legacy email messages read from authenticated gpd-message dispatch
- extension/options/options.js V002R056 — Escape crawled titles/URLs in tree + progress; safe export redacts every secret-bearing field
- gas-bridge-kit/DANMAN_Bridge.gs V002R027 — Fail closed: every request refused until BRIDGE_SECRET is set
- gas-bridge-kit/Bridge_CopilotWorkbench.gs V002R010 — Comment: BRIDGE_SECRET is required (no legacy-open mode)
- extension/manifest.json (no stamp — JSON) — Load background/core/security.js before the rest of the background
- test/danman-hostile-page.html (new) — Hostile-page harness: press-button checks for A1/A2/A4/A5, eavesdropping, frame navigation
