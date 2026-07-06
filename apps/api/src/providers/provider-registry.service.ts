import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaServerProvider } from './media-server-provider.interface';

/**
 * Maps MediaSource.type to a provider implementation. Adding a new media
 * server means one provider class plus a register() call — nothing else.
 */
@Injectable()
export class ProviderRegistry {
  private readonly providers = new Map<string, MediaServerProvider>();

  register(provider: MediaServerProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: string): MediaServerProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new NotFoundException(`No media server provider registered for type '${type}'`);
    }
    return provider;
  }

  list(): MediaServerProvider[] {
    return [...this.providers.values()];
  }
}
