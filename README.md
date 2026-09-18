# Base64 / JWT Decoder

A Chrome extension that decodes base64 from a page selection or a paste, and renders the
result as a pretty, browsable JSON tree.

Everything is decoded locally in the browser. Nothing is ever sent anywhere.

## What it does

**Decoding.** Paste a value or select it on a page. The decoder works through a pipeline and
tells you what it did, as a row of chips above the result (`base64url · gunzipped · UTF-8`):

- standard base64 **and** base64url (`-`/`_`), with or without `=` padding
- surrounding quotes, a `Bearer ` prefix, a `data:…;base64,` prefix, and line wrapping are all stripped
- percent-encoded input is unwrapped first, then re-decoded
- gzip and zlib payloads are decompressed transparently via `DecompressionStream`
- input that is *already* JSON is simply formatted, so it doubles as a JSON pretty-printer
- non-UTF-8 output falls back to a hex dump with an ASCII gutter, and names the format when
  the magic bytes are recognisable (PNG, PDF, ZIP, …)
- failures explain themselves — you get the offending characters, not "invalid input"

**JWTs** are detected automatically and split into header, payload and signature. Registered
time claims (`exp`, `iat`, `nbf`, `auth_time`) are shown as both a local timestamp and a
relative one ("expired 3 hours ago"), with a validity badge derived from `exp`/`nbf`.

> The signature is **not** verified — that would need the issuer's key. The panel says so.
> Never trust a decoded token for authorization.

**JSON tree.** Collapsible, syntax-coloured, with filter-as-you-type, expand/collapse all,
and copy buttons for pretty JSON, minified JSON, any single value, or a value's JSON path
(`$.data.user[0].id`). Base64 nested *inside* a JSON string value gets a `⤷` button that
decodes it in place — useful for encoded claims and `state` parameters.

## Three ways in

| | |
| --- | --- |
| **Toolbar / `Alt+Shift+D`** | Opens the popup, pre-filled with the current page selection. |
| **Right-click a selection** | "Decode Base64 / JWT" opens the result in a full tab. |
| **Floating bubble** | A 🔓 button appears next to any selection that looks like base64. Click it for an inline result card. |

With **Instant decode** on, the bubble step is skipped entirely: select something that looks
like base64 and the decoded card opens by itself. It waits for the mouse button to come up, so
it never fires mid-drag, and it still ignores ordinary prose. Off by default — opening a dialog
on every selection is a big change to someone else's page, so it should be a deliberate choice.

Large payloads can be pushed from the popup or the bubble into a full browser tab with
**Open in tab**. The value is handed over through session storage, so tokens never appear in
the URL or in browser history.

Rebind the shortcut at `chrome://extensions/shortcuts`.

## Settings and privacy

A master **On/Off switch** sits in the popup header. Switched off, the extension does nothing
to any page — no bubble, no instant decode, no right-click entry, no reading your selection —
and the toolbar icon carries an `OFF` badge so the state is visible without opening anything.
The popup still decodes whatever you paste into it, since opening it is an explicit request.
The switch takes effect immediately in tabs that are already open.

In the popup's ⚙ tab:

- **Theme** — System, Light, Dark, or **B&W**. System follows the OS; the other three override
  it in both directions. The choice applies to the popup, the full tab, and the in-page card.
- **Floating bubble** — turn the in-page bubble off without uninstalling. This is the master
  switch: with it off, instant decode does nothing either.
- **Instant decode** — decode on selection, with no click.
- **Read page selection on open** — auto-fill the popup from the page.
- **Save decode history** — the last 50 decodes are kept in `browser.storage.local`, on this
  machine only. Turn it off if you decode sensitive tokens; **Clear** wipes it immediately.

The **B&W** theme is genuinely monochrome — every colour resolves to greyscale. Because hue
normally does real work here, it is replaced rather than dropped: JSON value types separate by
weight and style (bold keys, underlined booleans, italic null), and an expired JWT badge
inverts to white-on-black so it stays as unmissable as the red one.

The extension requests access to all sites because the floating bubble needs a content script
that watches selections everywhere. Turning the bubble off stops it doing anything, but Chrome
still shows the permission at install time — that is inherent to an always-on selection watcher.

## Development

```bash
npm install
npm run dev        # launches a browser with the extension loaded, with HMR
npm run compile    # tsc --noEmit
npm test           # unit tests for the decode engine
npm run build      # production build -> .output/chrome-mv3
npm run zip        # packaged for the Web Store
```

Built with [WXT](https://wxt.dev) + React. `npm run dev:firefox` / `build:firefox` produce a
Firefox build from the same source.

### Layout

```
lib/          decode engine — pure TypeScript, no browser APIs, unit-tested
  base64.ts     base64/base64url <-> bytes
  jwt.ts        JWT split + claim humanization
  decode.ts     the pipeline and DecodeResult union
  json-utils.ts JSON helpers, nested-base64 detection
  storage.ts    settings + history        (the only lib/ module using browser APIs)
  handoff.ts    session-scoped payload handoff between surfaces
  theme.ts      applies the theme via a data-theme attribute
components/   JsonTree, JwtPanel, HexDump, DecodeView, HistoryList, InputBar
entrypoints/
  background.ts   context menu, message routing, opens the viewer tab
  content/        selection watcher + shadow-root bubble
  popup/          main UI
  viewer/         full-tab view (viewer.html)
```

The decode engine is kept free of `browser.*` on purpose: that is what lets `lib/decode.test.ts`
run in plain Node with no extension mocks.

Two notes for anyone extending this:

- `handoff.ts` is separate from `storage.ts` because `chrome.storage.session` is undefined in
  content scripts. Importing it there throws on every page load.
- `base64.ts` already has `bytesToBase64`, so adding an encode direction is a UI change only.
