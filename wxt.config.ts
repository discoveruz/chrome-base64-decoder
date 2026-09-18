import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Base64 / JWT Decoder',
    description:
      'Decode base64, base64url and JWTs from a page selection or a paste, with a pretty JSON tree view.',
    permissions: ['storage', 'contextMenus', 'activeTab', 'scripting', 'clipboardWrite'],
    // The top-level `icons` key only covers chrome://extensions and the store.
    // The toolbar button reads action.default_icon — without it Chrome draws a
    // blank placeholder there.
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    commands: {
      // _execute_action opens the popup natively. chrome.action.openPopup() is
      // version-gated, so this avoids that whole class of problem.
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+D' },
        description: 'Decode the current selection',
      },
    },
  },
});
