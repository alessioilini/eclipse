export type CloudStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type HapticKind = 'light' | 'medium' | 'success' | 'error';
/** `cancelled`: the user closed the native share sheet — not a failure, no fallback. */
export type ShareResult = 'telegram' | 'native' | 'clipboard' | 'cancelled' | 'none';

export type Platform = {
  kind: 'telegram' | 'web';
  /** Telegram: WebApp.ready() + expand(); web: nothing. */
  ready(): void;
  user: { id: string; firstName: string } | null;
  startParam: string | null;
  backButton: { show(onClick: () => void): void; hide(): void };
  haptic(kind: HapticKind): void;
  share(text: string, url: string): Promise<ShareResult>;
  cloud: CloudStorage | null;
  /** Telegram: enable/disableClosingConfirmation; web: nothing. */
  setClosingConfirmation(on: boolean): void;
};
