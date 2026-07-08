import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'mp.theme';

/**
 * All color tokens are CSS light-dark() pairs, so forcing `color-scheme` on
 * <html> is the entire theming mechanism. index.html applies the stored
 * preference before Angular boots to avoid a flash of the wrong theme.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.stored());

  cycle(): void {
    const order: ThemeMode[] = ['auto', 'light', 'dark'];
    const next = order[(order.indexOf(this.mode()) + 1) % order.length];
    this.mode.set(next);
    localStorage.setItem(STORAGE_KEY, next);
    this.apply(next);
  }

  private stored(): ThemeMode {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  }

  private apply(mode: ThemeMode): void {
    document.documentElement.style.colorScheme = mode === 'auto' ? 'light dark' : mode;
  }
}
