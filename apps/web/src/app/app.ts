import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatListModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
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
