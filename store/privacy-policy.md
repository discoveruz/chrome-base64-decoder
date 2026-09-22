# Privacy Policy — Base64 / JWT Decoder

Effective date: 22 September 2026

Base64 / JWT Decoder ("the extension") is a Chrome extension that decodes base64, base64url and JWT strings. This policy explains what the extension does with your data. In short, it all stays on your computer.

## What the extension handles

- **Text you select on a web page or paste into the popup.** The extension reads this text only to decode it and show you the result. It checks your selections to decide whether to show the decode button, and does nothing else with page content.
- **Your settings**, such as theme, on/off switch, instant decode and history on/off.
- **Decode history**, if you leave it switched on. This is a list of your 50 most recent decodes. Each entry holds the input text (up to 20,000 characters), a short preview of the result, its type (for example JSON or JWT) and the time. It does **not** record the website, page address or page title.

## Where it is stored

Everything is processed locally, inside your browser.

- Settings and history are saved in Chrome's local extension storage, on your device only.
- When you use "Open in tab", the value is passed to the new tab through Chrome's session storage. It is deleted as soon as the tab reads it, and in any case when you close the browser.

## What the extension does not do

- It does not send any data to the developer or to anyone else. It makes no network requests.
- It has no analytics, tracking, advertising or remote code.
- It does not sell, share or transfer your data to third parties.
- It does not read your clipboard. It only writes to it when you click a Copy button.
- It does not collect names, email addresses, passwords, payment details, location or browsing history.

## Permissions and why they are needed

| Permission | Why |
| --- | --- |
| Access to all websites | Shows the decode button next to base64 text you select on any page. |
| activeTab, scripting | Reads your current selection when you open the popup or use the right-click menu. |
| contextMenus | Adds "Decode Base64 / JWT" to the right-click menu. |
| storage | Saves your settings and local history. |
| clipboardWrite | Copies decoded results when you click Copy. |

## Your control

- Turn off **Save decode history** in the popup's settings, or click **Clear** to delete it at once.
- Use the **On/Off switch** in the popup to stop the extension from interacting with web pages.
- Uninstalling the extension removes all of its stored data from your browser.

## Children

The extension is a developer tool. It is not directed at children and collects no personal information from anyone.

## Changes to this policy

If this policy changes, the updated version will be published at this address with a new effective date.

## Contact

For questions about this policy, use the contact details on the extension's Chrome Web Store listing.
