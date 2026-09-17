/**
 * Payload handoff between surfaces (bubble -> tab, popup -> tab).
 *
 * Deliberately separate from storage.ts: this uses `session:`, and
 * chrome.storage.session is restricted to trusted contexts — it is undefined
 * in content scripts. Importing it there throws "Access to storage is not
 * allowed from this context" on every page load, so the content script must
 * never pull this module in. It asks the background to stage a handoff instead.
 */

import { storage } from '#imports';

const handoffItem = storage.defineItem<string | null>('session:handoff', {
  fallback: null,
});

/** Stash a payload and return the viewer URL that will pick it up. */
export async function stageHandoff(input: string): Promise<string> {
  await handoffItem.setValue(input);
  return browser.runtime.getURL('/viewer.html');
}

/** Read and clear the staged payload, so a refresh does not resurrect it. */
export async function consumeHandoff(): Promise<string | null> {
  const value = await handoffItem.getValue();
  if (value !== null) await handoffItem.setValue(null);
  return value;
}
