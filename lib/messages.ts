/**
 * Typed message contract between the background worker, the content script and
 * the extension pages.
 */

export type Message =
  /** Page -> content script: hand me the current selection. */
  | { type: 'GET_SELECTION' }
  /** Background -> content script: the user invoked decode on this tab. */
  | { type: 'DECODE_SELECTION' }
  /** Content script / page -> background: open this payload in the viewer tab. */
  | { type: 'OPEN_IN_TAB'; input: string };

export interface SelectionResponse {
  text: string;
}

export async function sendToTab<T>(tabId: number, message: Message): Promise<T | null> {
  try {
    return (await browser.tabs.sendMessage(tabId, message)) as T;
  } catch {
    // No content script on this tab — the caller decides how to recover.
    return null;
  }
}

/** Read the active tab's selection, falling back to injection. */
export async function readActiveTabSelection(): Promise<string> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return '';

  const viaMessage = await sendToTab<SelectionResponse>(tab.id, { type: 'GET_SELECTION' });
  if (viaMessage?.text) return viaMessage.text;

  // The content script is absent on tabs that were already open when the
  // extension was installed or reloaded. activeTab lets us inject on demand;
  // without this the popup silently comes up empty.
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? '',
    });
    return (result?.result as string) ?? '';
  } catch {
    // Restricted page (chrome://, the Web Store, a PDF viewer). Nothing to read.
    return '';
  }
}
