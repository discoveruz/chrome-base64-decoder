import { useCallback, useEffect, useState } from 'react';
import { InputBar } from '@/components/InputBar';
import { DecodeView } from '@/components/DecodeView';
import { HistoryList } from '@/components/HistoryList';
import { useDecoder } from '@/lib/use-decoder';
import { readActiveTabSelection } from '@/lib/messages';
import { consumeHandoff, stageHandoff } from '@/lib/handoff';
import { THEME_LABELS, useTheme } from '@/lib/theme';
import type { Theme } from '@/lib/storage';
import './App.css';

type Tab = 'decode' | 'history' | 'settings';

export default function App() {
  const decoder = useDecoder();
  const { input, setInput, result, busy, history, settings, patchSettings } = decoder;
  const [tab, setTab] = useState<Tab>('decode');
  const [selectionNote, setSelectionNote] = useState<string | null>(null);

  useTheme(settings.theme);

  const readSelection = useCallback(
    async (silent = false) => {
      const text = await readActiveTabSelection();
      if (text.trim()) {
        setInput(text);
        setSelectionNote(null);
        setTab('decode');
      } else if (!silent) {
        setSelectionNote('No text selected on this page.');
      }
      return text;
    },
    [setInput],
  );

  // On open: a staged handoff wins over the live selection, then the selection.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const staged = await consumeHandoff();
      if (cancelled) return;
      if (staged) {
        setInput(staged);
        return;
      }
      if (settings.enabled && settings.autoReadSelection) void readSelection(true);
    })();
    return () => {
      cancelled = true;
    };
    // Read once, after settings load.
  }, [settings.enabled, settings.autoReadSelection, readSelection, setInput]);

  const openInTab = useCallback(async () => {
    const url = await stageHandoff(input);
    await browser.tabs.create({ url });
    window.close();
  }, [input]);

  return (
    <div className="popup">
      <header className="popup-head">
        <span className="popup-title">
          <span aria-hidden="true">🔓</span> Base64 / JWT
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          className={`popup-power ${settings.enabled ? 'is-on' : 'is-off'}`}
          onClick={() => void patchSettings({ enabled: !settings.enabled })}
          title={
            settings.enabled
              ? 'Active on pages — click to turn off'
              : 'Off — click to turn back on'
          }
        >
          <span className="popup-power-track"><span className="popup-power-knob" /></span>
          {settings.enabled ? 'On' : 'Off'}
        </button>
        <nav className="popup-tabs">
          {(['decode', 'history', 'settings'] as Tab[]).map((name) => (
            <button
              key={name}
              type="button"
              className={`popup-tab ${tab === name ? 'is-active' : ''}`}
              onClick={() => setTab(name)}
            >
              {name === 'decode' ? 'Decode' : name === 'history' ? 'History' : '⚙'}
            </button>
          ))}
        </nav>
      </header>

      {!settings.enabled && (
        <div className="popup-off-banner">
          Page features are off — no bubble, instant decode or right-click menu. You can still
          paste here.
        </div>
      )}

      {tab === 'decode' && (
        <>
          <InputBar
            value={input}
            onChange={(value) => {
              setSelectionNote(null);
              setInput(value);
            }}
            onReadSelection={() => void readSelection()}
            busy={busy}
            autoFocus
          />
          {selectionNote && <div className="popup-note">{selectionNote}</div>}
          <DecodeView
            result={result}
            actions={
              result && result.kind !== 'error' ? (
                <button type="button" className="btn btn-ghost" onClick={() => void openInTab()}>
                  ⧉ Open in tab
                </button>
              ) : null
            }
          />
        </>
      )}

      {tab === 'history' && (
        <HistoryList
          entries={history}
          saveHistory={settings.saveHistory}
          onToggleSave={(next) => void patchSettings({ saveHistory: next })}
          onRestore={(entry) => {
            setInput(entry.input);
            setTab('decode');
          }}
          onRemove={(id) => void decoder.removeEntry(id)}
          onClear={() => void decoder.clearAll()}
        />
      )}

      {tab === 'settings' && (
        <div className="popup-settings">
          <ThemePicker
            value={settings.theme}
            onChange={(next) => void patchSettings({ theme: next })}
          />
          <Toggle
            label="Floating bubble on selections"
            hint="Shows a 🔓 button when you select base64-looking text on a page."
            checked={settings.bubbleEnabled}
            disabled={!settings.enabled}
            disabledHint="The extension is switched off."
            onChange={(next) => void patchSettings({ bubbleEnabled: next })}
          />
          <Toggle
            label="Instant decode"
            hint="Skip the 🔓 button — decode and open the result the moment you select something that looks like base64."
            checked={settings.instantDecode}
            disabled={!settings.enabled || !settings.bubbleEnabled}
            disabledHint={settings.enabled ? 'Requires the floating bubble.' : 'The extension is switched off.'}
            indent
            onChange={(next) => void patchSettings({ instantDecode: next })}
          />
          <Toggle
            label="Read page selection on open"
            hint="Auto-fills this popup with whatever is selected on the page."
            checked={settings.autoReadSelection}
            disabled={!settings.enabled}
            disabledHint="The extension is switched off."
            onChange={(next) => void patchSettings({ autoReadSelection: next })}
          />
          <Toggle
            label="Save decode history"
            hint="Stored locally in this browser only. Turn off if you decode sensitive tokens."
            checked={settings.saveHistory}
            onChange={(next) => void patchSettings({ saveHistory: next })}
          />
          <p className="popup-settings-note muted">
            Change the keyboard shortcut at <code>chrome://extensions/shortcuts</code>.
          </p>
        </div>
      )}

      <footer className="popup-foot muted">Decoding happens locally — nothing leaves your browser.</footer>
    </div>
  );
}

function ThemePicker({ value, onChange }: { value: Theme; onChange: (next: Theme) => void }) {
  return (
    <div className="popup-theme">
      <span className="popup-toggle-label">Theme</span>
      <div className="popup-segmented" role="radiogroup" aria-label="Theme">
        {THEME_LABELS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={`popup-segment ${value === option.value ? 'is-active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
  disabledHint,
  indent = false,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  disabledHint?: string;
  indent?: boolean;
}) {
  return (
    <label className={`popup-toggle ${indent ? 'is-indented' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="popup-toggle-label">{label}</span>
        <span className="popup-toggle-hint muted">{disabled && disabledHint ? disabledHint : hint}</span>
      </span>
    </label>
  );
}
