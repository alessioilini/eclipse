import type { Platform } from './types';

export type WebPlatform = Platform & {
  /** The handler last passed to backButton.show (wired to the in-app back button in Task 3). */
  getBackHandler(): (() => void) | null;
};

export function createWebPlatform(win: Window): WebPlatform {
  let backHandler: (() => void) | null = null;
  return {
    kind: 'web',
    ready() {},
    user: null,
    startParam: null,
    backButton: {
      show(onClick) {
        backHandler = onClick;
      },
      hide() {
        backHandler = null;
      },
    },
    getBackHandler: () => backHandler,
    haptic() {},
    setClosingConfirmation() {},
    async share(text, url) {
      const nav = win.navigator as Partial<Navigator> | undefined;
      if (typeof nav?.share === 'function') {
        try {
          await nav.share({ text, url });
          return 'native';
        } catch {
          // Cancelled (AbortError) or refused — fall back to the clipboard.
        }
      }
      try {
        if (typeof nav?.clipboard?.writeText === 'function') {
          await nav.clipboard.writeText(text + ' ' + url);
          return 'clipboard';
        }
      } catch {
        // Clipboard denied.
      }
      return 'none';
    },
    cloud: null,
  };
}
