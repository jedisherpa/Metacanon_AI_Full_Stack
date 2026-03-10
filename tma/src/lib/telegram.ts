/**
 * Telegram Mini App SDK helpers.
 * Wraps the global Telegram.WebApp object with type safety.
 */

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  close: () => void;
  initData: string;
  initDataUnsafe: {
    start_param?: string;
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
      photo_url?: string;
    };
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
    setText: (text: string) => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  openTelegramLink: (url: string) => void;
  showPopup: (params: {
    title?: string;
    message: string;
    buttons?: Array<{ id: string; type?: string; text?: string }>;
  }, callback?: (buttonId: string) => void) => void;
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
};

export function getTelegramApp(): TelegramWebApp | null {
  if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
    return (window as any).Telegram.WebApp as TelegramWebApp;
  }
  return null;
}

/**
 * Trigger haptic feedback based on the hapticTrigger field from API responses.
 */
export function triggerHaptic(trigger: string | null | undefined): void {
  const tg = getTelegramApp();
  if (!tg || !trigger) return;

  switch (trigger) {
    case 'impact_light':
      tg.HapticFeedback.impactOccurred('light');
      break;
    case 'impact_medium':
      tg.HapticFeedback.impactOccurred('medium');
      break;
    case 'impact_heavy':
      tg.HapticFeedback.impactOccurred('heavy');
      break;
    case 'notification_success':
      tg.HapticFeedback.notificationOccurred('success');
      break;
    case 'notification_warning':
      tg.HapticFeedback.notificationOccurred('warning');
      break;
    case 'notification_error':
      tg.HapticFeedback.notificationOccurred('error');
      break;
    case 'selection':
      tg.HapticFeedback.selectionChanged();
      break;
    default:
      break;
  }
}

/**
 * Initialize the Telegram Mini App.
 * Call this once at app startup.
 */
export function initTelegramApp(): void {
  const tg = getTelegramApp();
  if (!tg) return;
  tg.ready();
  tg.expand();
}

export function getTelegramUser() {
  return getTelegramApp()?.initDataUnsafe?.user ?? null;
}

export function getColorScheme(): 'light' | 'dark' {
  return getTelegramApp()?.colorScheme ?? 'dark';
}

function getWindowParam(keys: string[]): string | null {
  if (typeof window === 'undefined') return null;

  const searchParams = new URLSearchParams(window.location.search);
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) return value;
  }

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!hash) return null;

  const hashParams = new URLSearchParams(hash);
  for (const key of keys) {
    const value = hashParams.get(key);
    if (value) return value;
  }

  return null;
}

export function getTelegramStartParam(): string | null {
  const tg = getTelegramApp();
  if (tg?.initDataUnsafe?.start_param) return tg.initDataUnsafe.start_param;
  return getWindowParam(['tgWebAppStartParam', 'startapp', 'start_param', 'command']);
}
