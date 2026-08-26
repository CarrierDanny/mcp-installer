# DANMAN Bridge kit

Make ANY Google Apps Script project callable from the GetPower DANMAN
extension — with connection testing, a shared secret, and self-describing
tool discovery (the extension's Bridge tab renders whatever tools your
project declares as runnable forms, automatically).

## Wire protocol

The extension POSTs JSON to your Web App `/exec` URL:

```json
{ "bridge": "danman", "secret": "…", "action": "<tool|ping|describe>", "args": { } }
```

Responses: `{ "ok": true, "result": … }` or `{ "ok": false, "error": "…" }`.
`describe` returns `{ ok, service, version, auth, caps, tools[] }` — `tools`
drive the extension's auto-generated forms; `caps` maps standard capability
verbs (`chat`, `memory.save`, `memory.search`, `memory.overview`,
`capture`, `transcribe`) onto tool names so the extension can route its
built-in features (Recall tab, Bridge-RAG chat, attachment saving) at your
backend with zero extra configuration.

## Files

| File | Purpose |
|---|---|
| `DANMAN_Bridge.gs` | The core: secret check, ping/describe, dispatcher. Required everywhere. |
| `Bridge_ConfigSync.gs` | **Unified setup.** `get_config` / `sync_config` returns Drive folder ID, Sheets ID, API keys, and other Script Properties so the extension only needs Webhook URL + Secret. |
| `Bridge_GrowTelliGence.gs` | Tool registry for GrowTelliGence (delegates to its native gp_* router). |
| `Bridge_CopilotWorkbench.gs` | Exposes Copilot Workbench's chat proxy, transcription, embeddings, vision OCR, memory sync (previously `google.script.run`-only) — and closes its open webhook. |
| `Bridge_EnterpriseSuite.gs` | Exposes Enterprise Suite's live SOQL, voicemail transcription, Carrier warranty lookup, case analysis, screenshot→SOQL. |
| `Bridge_Drive.gs` | **Drive tools so the memory folder works with just a Folder ID.** Add to any backend (merges with the files above). The backend does all Drive reads/writes as the deploying user — no OAuth token in the extension, nothing that expires. This is the recommended way to set up memory. |

## Easiest full setup (recommended)

1. Copy `DANMAN_Bridge.gs` + `Bridge_ConfigSync.gs` (+ optional `Bridge_Drive.gs`) into a GAS project.
2. Script Properties → set `BRIDGE_SECRET`, `SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, and any API keys / `GAS_UI_URL`.
3. Deploy as Web App (Execute as **Me**, Anyone).
4. Extension → Settings / Quick Connect → paste `/exec` URL + secret → **Sync from Webhook**.
5. Optional: open the **GAS** sidebar tab to embed your HTML console (`GAS_UI_URL` or the same `/exec` if `doGet` serves HTML).

## Easiest memory setup

A browser extension has no standing Google credential, so it can't touch
Drive alone. `Bridge_Drive.gs` solves this cleanly: your backend does the
Drive work as you.

1. Copy `DANMAN_Bridge.gs` + `Bridge_Drive.gs` into a GAS project (an empty
   one is fine, or any backend you already run — the tools merge in).
2. Set `BRIDGE_SECRET`, deploy as Web App (Execute as **Me**, Anyone).
   Approve the Drive scope prompt the first time.
3. Extension → Bridge tab → Add the `/exec` URL + secret, dialect
   **"DANMAN Bridge kit"** → Test → **Discover** (Drive tools appear).
4. Memory tab (or the toolbar popup) → paste your Folder ID → Initialize.
   The extension auto-routes Drive through the bridge; subfolders
   (projects, chats, uploads, rag, transcripts) are created for you. Done —
   no token, nothing to refresh.

## Install (any project)

1. Copy `DANMAN_Bridge.gs` in. If the project already has a `doPost`, DELETE
   the fallback `doPost` block at the bottom of `DANMAN_Bridge.gs` and insert
   the 4-line wiring snippet (in the file header) at the top of the existing
   `doPost`. Each `Bridge_*.gs` file's header repeats the exact snippet
   adapted to that backend's real `doPost`.
2. Copy the matching `Bridge_*.gs` file — or write your own
   `danmanBridgeTools_()` (commented sample at the bottom of
   `DANMAN_Bridge.gs`). One registry per project.
3. Project Settings → Script Properties → add `BRIDGE_SECRET` with a strong
   value. Without it the bridge runs OPEN (anyone with the URL can call it)
   and `describe` reports `auth:"open"`.
4. Deploy → New deployment → Web App (Execute as **Me**, access **Anyone**).
   Redeploy after edits.

## Extension side

Bridge tab → **+ Add** → paste the `/exec` URL, the secret, dialect
**"DANMAN Bridge kit"** → **Test** → **Discover**. Discovered tools appear as
forms; the routing matrix lets you point each built-in capability (chat,
memory, capture…) at whichever backend should serve it.

## Security notes

- A deployment URL is itself a credential — treat it like one, and set
  `BRIDGE_SECRET` anyway.
- Copilot Workbench's stock `doPost` is unauthenticated; the wiring in
  `Bridge_CopilotWorkbench.gs` shows how to gate its existing vault routes
  behind the same secret.
- Enterprise Suite's `15_Integration.js:386` contains a leaked literal
  OpenAI key — remove it and rotate the key before deploying.
