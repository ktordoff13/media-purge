import { Module, OnModuleInit } from '@nestjs/common';
import { ProviderRegistry } from './provider-registry.service';
import { PlexProvider } from './plex/plex.provider';
import { JellyfinProvider } from './jellyfin/jellyfin.provider';

@Module({
  providers: [ProviderRegistry, PlexProvider, JellyfinProvider],
  exports: [ProviderRegistry],
})
export class ProvidersModule implements OnModuleInit {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly plex: PlexProvider,
    private readonly jellyfin: JellyfinProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.plex);
    this.registry.register(this.jellyfin);
  }
}
