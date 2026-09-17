import type { Message } from '@/lib/messages';
import { readActiveTabSelection, sendToTab } from '@/lib/messages';
import { stageHandoff } from '@/lib/handoff';

const MENU_ID = 'decode-base64-selection';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    // removeAll first so a reload does not throw on a duplicate id.
    browser.contextMenus.removeAll(() => {
      browser.contextMenus.create({
        id: MENU_ID,
        title: 'Decode Base64 / JWT',
        contexts: ['selection'],
      });
    });
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_ID) return;

    // Prefer the live selection over info.selectionText: Chrome truncates
    // selectionText, and long tokens are exactly what we are here to decode.
    let text = '';
    if (tab?.id) {
      const response = await sendToTab<{ text: string }>(tab.id, { type: 'DECODE_SELECTION' });
      text = response?.text ?? '';
    }
    if (!text) text = await readActiveTabSelection();
    if (!text) text = info.selectionText ?? '';
    if (!text.trim()) return;

    await openViewer(text);
  });

  browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    if (message.type === 'OPEN_IN_TAB') {
      void openViewer(message.input).then(() => sendResponse({ ok: true }));
      return true; // keep the channel open for the async response
    }
    return undefined;
  });
});

async function openViewer(input: string) {
  const url = await stageHandoff(input);
  await browser.tabs.create({ url });
}
