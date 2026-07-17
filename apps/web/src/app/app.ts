import { Component, OnInit, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from './core/api.service';
import { DryRunStateService } from './core/dry-run-state.service';
import { PurgeQueueService } from './core/purge-queue.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatListModule, MatIconModule, MatProgressBarModule, MatTooltipModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  readonly dryRunState = inject(DryRunStateService);
  readonly theme = inject(ThemeService);
  readonly purge = inject(PurgeQueueService);
  private readonly api = inject(ApiService);

  /** e.g. "main · dc193c0" from a CI image, "dev" when running locally. */
  readonly version = signal('');

  readonly themeIcons = { auto: 'brightness_auto', light: 'light_mode', dark: 'dark_mode' } as const;
  readonly themeLabels = { auto: 'System theme', light: 'Light theme', dark: 'Dark theme' } as const;

  // Below this the sidenav becomes an overlay drawer behind a hamburger bar.
  readonly isMobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 899px)')
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  readonly navOpen = signal(false);

  closeNavOnMobile(): void {
    if (this.isMobile()) this.navOpen.set(false);
  }

  ngOnInit(): void {
    this.api.health().subscribe((h) => {
      this.version.set(h.build ? `${h.version} · ${h.build}` : h.version);
    });
    this.dryRunState.refresh();
    // Keep the banner honest even if settings change in another tab.
    setInterval(() => this.dryRunState.refresh(), 60_000);
  }

  readonly nav = [
    { path: '/dashboard', icon: 'space_dashboard', label: 'Dashboard' },
    { path: '/recommendations', icon: 'recommend', label: 'Recommendations' },
    { path: '/rules', icon: 'rule', label: 'Rules' },
    { path: '/recycle-bin', icon: 'delete_outline', label: 'Recycle Bin' },
    { path: '/activity', icon: 'history', label: 'Activity' },
    { path: '/maintenance', icon: 'cleaning_services', label: 'Maintenance' },
    { path: '/settings', icon: 'settings', label: 'Settings' },
  ];
}
