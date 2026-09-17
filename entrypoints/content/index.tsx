import ReactDOM from 'react-dom/client';
import { Bubble } from './Bubble';
import { DEFAULT_SETTINGS, getSettings, settingsItem, type Settings } from '@/lib/storage';
import { applyTheme } from '@/lib/theme';
import { looksDecodable } from '@/lib/json-utils';
import type { Message } from '@/lib/messages';
import './style.css';

const DEBOUNCE_MS = 200;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  // Required for createShadowRootUi — keeps our CSS inside the shadow root so
  // the page cannot restyle us and we cannot restyle the page.
  cssInjectionMode: 'ui',

  async main(ctx) {
    let settings: Settings = await getSettings();

    let root: ReactDOM.Root | null = null;
    let container: HTMLElement | null = null;

    const ui = await createShadowRootUi(ctx, {
      name: 'b64-decoder-ui',
      position: 'overlay',
      anchor: 'body',
      onMount(host) {
        container = document.createElement('div');
        container.className = 'b64-root';
        applyTheme(settings.theme, container);
        host.append(container);
        root = ReactDOM.createRoot(container);
        return root;
      },
      onRemove(mounted) {
        mounted?.unmount();
        root = null;
        container = null;
      },
    });

    ui.mount();

    settingsItem.watch((next) => {
      // The stored object may predate a new key, so merge over the defaults.
      settings = { ...DEFAULT_SETTINGS, ...next };
      if (container) applyTheme(settings.theme, container);
      if (!settings.bubbleEnabled) hide();
      else render();
    });

    let current: { text: string; rect: DOMRect } | null = null;

    function render() {
      if (!root) return;
      root.render(
        current ? (
          <Bubble
            key={current.text}
            text={current.text}
            rect={current.rect}
            instant={settings.instantDecode}
            onDismiss={hide}
            onOpenInTab={(input) => {
              void browser.runtime.sendMessage({ type: 'OPEN_IN_TAB', input } satisfies Message);
              hide();
            }}
          />
        ) : null,
      );
    }

    function hide() {
      if (current === null) return;
      current = null;
      render();
    }

    function readSelection(): { text: string; rect: DOMRect } | null {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
      const text = selection.toString().trim();
      if (!text) return null;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return null;
      return { text, rect };
    }

    function offer() {
      if (!settings.bubbleEnabled) return;
      const selection = readSelection();
      // Only offer the bubble when the selection actually looks decodable —
      // otherwise it pops up on ordinary prose and becomes noise.
      if (!selection || !looksDecodable(selection.text)) {
        hide();
        return;
      }
      current = selection;
      render();
    }

    // Instant mode opens a dialog rather than a small button, so it must not
    // fire mid-drag: wait for the mouse to come up before showing anything.
    let pointerDown = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    ctx.addEventListener(document, 'mousedown', () => {
      pointerDown = true;
    });

    ctx.addEventListener(document, 'mouseup', () => {
      if (!pointerDown) return;
      pointerDown = false;
      if (settings.instantDecode) {
        clearTimeout(timer);
        timer = setTimeout(offer, DEBOUNCE_MS);
      }
    });

    ctx.addEventListener(document, 'selectionchange', () => {
      clearTimeout(timer);
      // Drag in progress and instant mode on: the mouseup handler takes it.
      if (pointerDown && settings.instantDecode) return;
      timer = setTimeout(offer, DEBOUNCE_MS);
    });

    // Scrolling moves the anchor out from under the bubble; simplest correct
    // behaviour is to dismiss rather than chase it.
    ctx.addEventListener(window, 'scroll', hide, { capture: true, passive: true } as never);
    ctx.addEventListener(window, 'resize', hide);

    browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
      if (message.type === 'GET_SELECTION' || message.type === 'DECODE_SELECTION') {
        const selection = readSelection();
        if (message.type === 'DECODE_SELECTION' && selection) {
          current = selection;
          render();
        }
        sendResponse({ text: selection?.text ?? '' });
        return true;
      }
      return undefined;
    });
  },
});
