import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SettingsService } from '../settings/settings.service';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as accessible without the X-Api-Key header (e.g. images used in <img> tags). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Optional API-key protection. Off by default (unraid apps are LAN-facing);
 * when a key is set in security settings every request must send it in the
 * X-Api-Key header.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly settings: SettingsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const { apiKey } = await this.settings.get('security');
    if (!apiKey) return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (req.header('x-api-key') === apiKey) return true;
    throw new UnauthorizedException('Missing or invalid X-Api-Key header');
  }
}
