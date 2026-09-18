import type { Message } from '@/lib/messages';
import { readActiveTabSelection, sendToTab } from '@/lib/messages';
import { stageHandoff } from '@/lib/handoff';
import { getSettings, settingsItem } from '@/lib/storage';

const MENU_ID = 'decode-base64-selection';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => void syncEnabledState());
  browser.runtime.onStartup.addListener(() => void syncEnabledState());
  // Keep the menu and badge in step when the switch is flipped from the popup.
  settingsItem.watch(() => void syncEnabledState());

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_ID) return;
    if (!(await getSettings()).enabled) return;

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

/**
 * Mirror the master switch into the two places it is visible outside the popup:
 * the right-click menu, and an OFF badge on the toolbar icon so the state is
 * obvious without opening anything.
 */
async function syncEnabledState() {
  const { enabled } = await getSettings();

  await browser.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  await browser.action.setBadgeBackgroundColor({ color: '#6b7583' });
  await browser.action.setTitle({
    title: enabled ? 'Base64 / JWT Decoder' : 'Base64 / JWT Decoder — off',
  });

  // removeAll first so a reload does not throw on a duplicate id.
  browser.contextMenus.removeAll(() => {
    if (!enabled) return;
    browser.contextMenus.create({
      id: MENU_ID,
      title: 'Decode Base64 / JWT',
      contexts: ['selection'],
    });
  });
}
