/**
 * The only module in lib/ that touches browser APIs.
 *
 * Kept separate from decode.ts on purpose: it is what lets the decode engine
 * be unit-tested with no extension mocks at all.
 */

import { storage } from '#imports';
import { truncate } from './json-utils';
import type { DecodeResult } from './decode';

/**
 * 'system' follows the OS. 'mono' is a high-contrast black-and-white palette
 * that carries meaning through weight and inversion instead of hue.
 */
export type Theme = 'system' | 'light' | 'dark' | 'mono';

export interface Settings {
  /** Show the floating bubble on base64-looking selections. */
  bubbleEnabled: boolean;
  /** Skip the bubble button and open the decoded card straight away. */
  instantDecode: boolean;
  /** Persist decoded values to history. */
  saveHistory: boolean;
  /** Auto-read the page selection when the popup opens. */
  autoReadSelection: boolean;
  theme: Theme;
}

export interface HistoryEntry {
  id: string;
  /** The raw input, capped — enough to re-decode from the history list. */
  input: string;
  /** Short human summary shown in the list. */
  preview: string;
  kind: DecodeResult['kind'];
  at: number;
}

export const DEFAULT_SETTINGS: Settings = {
  bubbleEnabled: true,
  // Off by default: popping a dialog open on every selection is a big
  // behavioural change to someone else's page, so it should be chosen.
  instantDecode: false,
  saveHistory: true,
  autoReadSelection: true,
  theme: 'system',
};

export const HISTORY_LIMIT = 50;
/** Cap stored input so history cannot grow without bound on huge payloads. */
export const HISTORY_INPUT_CAP = 20_000;

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export const historyItem = storage.defineItem<HistoryEntry[]>('local:history', {
  fallback: [],
});

export async function getSettings(): Promise<Settings> {
  // Merge over defaults so a settings object written by an older version does
  // not leave newly-added keys undefined.
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await settingsItem.setValue(next);
  return next;
}

export async function addHistory(input: string, preview: string, kind: DecodeResult['kind']) {
  const settings = await getSettings();
  if (!settings.saveHistory) return;
  if (kind === 'error') return;

  const existing = await historyItem.getValue();
  const stored = truncate(input.trim(), HISTORY_INPUT_CAP);

  // Collapse consecutive duplicates rather than filling the list with repeats
  // of whatever the user is currently iterating on.
  const deduped = existing.filter((entry) => entry.input !== stored);

  const entry: HistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    input: stored,
    preview,
    kind,
    at: Date.now(),
  };

  await historyItem.setValue([entry, ...deduped].slice(0, HISTORY_LIMIT));
}

export async function clearHistory() {
  await historyItem.setValue([]);
}

export async function removeHistoryEntry(id: string) {
  const existing = await historyItem.getValue();
  await historyItem.setValue(existing.filter((entry) => entry.id !== id));
}
