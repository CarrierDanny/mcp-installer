# GetPower DANMAN v7.5.1

Chrome/Firefox extension for scraping, AI form fill, Drive/Sheets, and Apps Script backends.

## Unified setup (recommended)

You no longer need to hand-enter Drive folder IDs, Sheets IDs, and API keys across multiple screens.

1. Deploy `gas-bridge-kit/DANMAN_Bridge.gs` + `gas-bridge-kit/Bridge_ConfigSync.gs` (+ optional `Bridge_Drive.gs`) as an Apps Script Web App (`/exec`, Execute as **Me**, Anyone).
2. Set Script Properties on the backend (`BRIDGE_SECRET` / `WEBHOOK_SECRET`, `SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, optional API keys, optional `GAS_UI_URL`).
3. Open the extension **Settings** (sidebar) or **Options → Quick Connect**.
4. Paste **Webhook_URL** + **Webhook_Secret** → **Sync from Webhook**.

Sync imports Sheets ID, Drive folder ID, API keys, and the GAS Console HTML URL automatically.

## GAS Console tab

Sidebar → **GAS** embeds your Apps Script HTML UI (`doGet` web app).

- Synced from Script Property `GAS_UI_URL` / `HTML_APP_URL` / `COPILOT_UI_URL`
- Or paste the full URL under Settings / Quick Connect

## AI models (updated)

| Provider | Defaults |
|----------|----------|
| Claude | Fable 5, Opus 5, Sonnet 5, Haiku 4.5 (+ 4.x) |
| OpenAI | GPT-5.6 Sol / Terra / Luna, o3, o4-mini, GPT-4o |
| Gemini | 3.5 Flash, 3.1 Pro preview, 3.1 Flash-Lite, 2.5 family |

## Load unpacked

1. `chrome://extensions` (or `about:debugging` on Firefox)
2. Enable developer mode → Load unpacked → select the `extension/` folder

## Gas bridge kit

See `../gas-bridge-kit/README.md`.
