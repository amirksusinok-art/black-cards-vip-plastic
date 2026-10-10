declare global {
  interface Window {
    Telegram?: {
      WebApp?: any;
    };
  }
}

export const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;

export function initTelegramApp() {
  if (!tg) return;

  try {
    tg.ready();
    tg.expand();

    if (tg.isVersionAtLeast && tg.isVersionAtLeast('8.0')) {
      tg.requestFullscreen?.();
    }

    tg.enableClosingConfirmation?.();

    // Set header & background colors to luxury near-black
    if (tg.setHeaderColor) tg.setHeaderColor('#08090C');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#08090C');
  } catch (err) {
    console.warn('Telegram WebApp initialization error:', err);
  }
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') {
  try {
    tg?.HapticFeedback?.impactOccurred(style);
  } catch {
    // ignore
  }
}

export function hapticNotification(type: 'error' | 'success' | 'warning') {
  try {
    tg?.HapticFeedback?.notificationOccurred(type);
  } catch {
    // ignore
  }
}

export function hapticSelection() {
  try {
    tg?.HapticFeedback?.selectionChanged();
  } catch {
    // ignore
  }
}

export function getTelegramInitData(): string {
  if (tg?.initData) return tg.initData;
  return '';
}
