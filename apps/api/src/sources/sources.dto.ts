import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class CreateSourceDto {
  @ApiProperty({ example: 'Living-room Plex' })
  @IsString()
  name: string;

  @ApiProperty({
    description:
      'Provider type. See GET /api/v1/sources/provider-types for supported values.',
    example: 'plex',
    enum: ['plex', 'jellyfin'],
  })
  @IsIn(['plex', 'jellyfin'])
  type: string;

  @ApiProperty({ example: 'http://192.168.1.10:32400' })
  @IsUrl({ require_tld: false, require_protocol: true })
  baseUrl: string;

  @ApiProperty({
    description:
      'Plex: an X-Plex-Token. Jellyfin: an admin API key (Dashboard → API Keys) so play state can be aggregated across users.',
  })
  @IsString()
  token: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Library ids to skip during scans.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  excludedLibraryIds?: string[];
}

export class UpdateSourceDto extends CreateSourceDto {}

export class ConnectionTestResultDto {
  @ApiProperty()
  ok: boolean;

  @ApiProperty({ example: 'Connected' })
  message: string;

  @ApiPropertyOptional()
  serverName?: string;

  @ApiPropertyOptional()
  version?: string;
}

export class ProviderTypeDto {
  @ApiProperty({ example: 'plex' })
  type: string;

  @ApiProperty({ example: 'Plex' })
  displayName: string;

  @ApiProperty({
    description:
      'What this provider can report; rules degrade gracefully around gaps.',
    example: { perUserHistory: true, labels: true, multiVersion: true },
  })
  capabilities: Record<string, boolean>;
}

export class RemoteLibraryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ['movie', 'show'] })
  mediaType: string;
}
