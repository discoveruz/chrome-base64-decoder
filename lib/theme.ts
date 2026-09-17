import { useEffect } from 'react';
import type { Theme } from './storage';

export const THEME_LABELS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'mono', label: 'B&W' },
];

/**
 * 'system' leaves the attribute off entirely so the prefers-color-scheme rules
 * in tokens.css stay in charge. Every other theme stamps the element, and those
 * rules are written to beat the media query in both directions.
 */
export function applyTheme(theme: Theme, root: HTMLElement) {
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/** For extension pages (popup, viewer), which theme the whole document. */
export function useTheme(theme: Theme) {
  useEffect(() => {
    applyTheme(theme, document.documentElement);
  }, [theme]);
}
