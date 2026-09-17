import { useCallback, useEffect, useRef, useState } from 'react';
import { decode, describeResult, type DecodeResult } from './decode';
import {
  addHistory,
  clearHistory,
  getSettings,
  historyItem,
  removeHistoryEntry,
  updateSettings,
  type HistoryEntry,
  type Settings,
  DEFAULT_SETTINGS,
} from './storage';

/** Debounce so typing/pasting does not decode on every keystroke. */
const DEBOUNCE_MS = 180;
/** Only commit to history once the input settles. */
const HISTORY_MS = 900;

export function useDecoder(initial = '') {
  const [input, setInput] = useState(initial);
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Guards against an older, slower decode overwriting a newer result.
  const runId = useRef(0);
  const historyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    void getSettings().then(setSettings);
    void historyItem.getValue().then(setHistory);
    const unwatch = historyItem.watch((next) => setHistory(next ?? []));
    return () => unwatch();
  }, []);

  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      setResult(null);
      setBusy(false);
      return;
    }

    const id = ++runId.current;
    setBusy(true);

    const timer = setTimeout(async () => {
      const next = await decode(trimmed);
      if (runId.current !== id) return;
      setResult(next);
      setBusy(false);

      clearTimeout(historyTimer.current);
      historyTimer.current = setTimeout(() => {
        if (runId.current !== id) return;
        void addHistory(trimmed, describeResult(next), next.kind);
      }, HISTORY_MS);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => () => clearTimeout(historyTimer.current), []);

  const patchSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await updateSettings(patch));
  }, []);

  const removeEntry = useCallback(async (id: string) => {
    await removeHistoryEntry(id);
  }, []);

  const clearAll = useCallback(async () => {
    await clearHistory();
  }, []);

  return {
    input,
    setInput,
    result,
    busy,
    history,
    settings,
    patchSettings,
    removeEntry,
    clearAll,
  };
}
