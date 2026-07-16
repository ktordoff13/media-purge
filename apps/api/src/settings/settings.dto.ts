import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class GeneralSettingsDto {
  @ApiProperty({
    description:
      'Safety switch: when true, approvals and purges are simulated and logged but no file is touched. Defaults to true on fresh installs.',
    example: true,
  })
  @IsBoolean()
  dryRun: boolean;

  @ApiProperty({
    description:
      'Directory (inside this container) where deleted files are parked before purge.',
    example: '/recycle-bin',
  })
  @IsString()
  recycleBinDir: string;

  @ApiProperty({
    description:
      'Days a recycle-bin entry is kept before the retention job purges it.',
    example: 30,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  retentionDays: number;

  @ApiPropertyOptional({
    description:
      'Cron expression for scheduled scans (standard 5-field cron), or null to disable.',
    example: '0 3 * * 0',
    nullable: true,
    type: String,
  })
  @Transform(({ value }) => (value === '' ? null : (value as string | null)))
  @IsOptional()
  @IsString()
  scanCron: string | null;
}

export class PathMappingDto {
  @ApiProperty({
    description: 'Path prefix as the media server reports it.',
    example: '/data/media',
  })
  @IsString()
  from: string;

  @ApiProperty({
    description: 'Equivalent path prefix inside this container.',
    example: '/media',
  })
  @IsString()
  to: string;
}

export class PathMappingsDto {
  @ApiProperty({ type: [PathMappingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PathMappingDto)
  mappings: PathMappingDto[];
}

export class ArrSettingsDto {
  @ApiProperty({
    description: 'Whether deletions should go through this service.',
  })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ example: 'http://192.168.1.10:7878' })
  @IsString()
  baseUrl: string;

  @ApiProperty({
    description: 'API key from Settings → General in Radarr/Sonarr.',
  })
  @IsString()
  apiKey: string;

  @ApiProperty({
    description:
      'Delete the entry from Radarr/Sonarr on approval instead of just unmonitoring it. Files are never touched by the *arr; you must re-add the entry manually if you restore.',
  })
  @IsBoolean()
  removeOnApproval: boolean;
}

export class MaintenanceSettingsDto {
  @ApiProperty({
    description:
      'Map of media source id → appdata directory mounted into this container. Enables filesystem cleanups (e.g. Plex PhotoTranscoder cache) for that source.',
    example: {
      '1': '/plex-appdata/Library/Application Support/Plex Media Server',
    },
  })
  @IsObject()
  appdataPaths: Record<string, string>;
}

export class AiSettingsDto {
  @ApiProperty({
    description:
      'Enable the local AI advisor. Purely-for-fun regret notes on recommendations; never affects scores or deletions.',
  })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    description:
      'OpenAI-compatible server, e.g. Ollama. /v1 is appended automatically.',
    example: 'http://localhost:11434',
  })
  @IsString()
  baseUrl: string;

  @ApiProperty({
    description: 'Model name as the server knows it.',
    example: 'llama3.1',
  })
  @IsString()
  model: string;
}

export class SecuritySettingsDto {
  @ApiPropertyOptional({
    description:
      'When set, every API request must carry this value in the X-Api-Key header.',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  apiKey: string | null;
}
