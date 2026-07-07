import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

let lastToastAt = 0;

/**
 * Makes a dead backend impossible to miss: any request that fails at the
 * network level (status 0 — server down, proxy broken) raises a global
 * snackbar, throttled so a page full of calls doesn't stack toasts. HTTP
 * errors with real status codes are left to the calling feature to present.
 */
export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const snack = inject(MatSnackBar);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 0 && Date.now() - lastToastAt > 5000) {
        lastToastAt = Date.now();
        snack.open(
          'Cannot reach the Media Purge API — is the server running?',
          'OK',
          { duration: 8000 },
        );
      }
      return throwError(() => err);
    }),
  );
};
