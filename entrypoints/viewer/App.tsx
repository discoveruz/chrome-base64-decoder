import { useEffect, useState } from 'react';
import { InputBar } from '@/components/InputBar';
import { DecodeView } from '@/components/DecodeView';
import { HistoryList } from '@/components/HistoryList';
import { useDecoder } from '@/lib/use-decoder';
import { consumeHandoff } from '@/lib/handoff';
import { useTheme } from '@/lib/theme';
import './App.css';

export default function App() {
  const decoder = useDecoder();
  const { input, setInput, result, busy, history, settings, patchSettings } = decoder;
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useTheme(settings.theme);

  // The payload is handed over through session storage rather than the URL, so
  // a long token never ends up in the address bar or in history.
  useEffect(() => {
    let cancelled = false;
    void consumeHandoff().then((staged) => {
      if (!cancelled && staged) setInput(staged);
    });
    return () => {
      cancelled = true;
    };
  }, [setInput]);

  return (
    <div className={`viewer ${sidebarOpen ? '' : 'viewer-collapsed'}`}>
      <header className="viewer-head">
        <h1 className="viewer-title">
          <span aria-hidden="true">🔓</span> Base64 / JWT Decoder
        </h1>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? 'Hide history' : 'Show history'}
        </button>
      </header>

      <main className="viewer-main">
        <InputBar value={input} onChange={setInput} busy={busy} autoFocus />
        <DecodeView result={result} />
      </main>

      {sidebarOpen && (
        <aside className="viewer-side">
          <HistoryList
            entries={history}
            saveHistory={settings.saveHistory}
            onToggleSave={(next) => void patchSettings({ saveHistory: next })}
            onRestore={(entry) => setInput(entry.input)}
            onRemove={(id) => void decoder.removeEntry(id)}
            onClear={() => void decoder.clearAll()}
          />
        </aside>
      )}
    </div>
  );
}
