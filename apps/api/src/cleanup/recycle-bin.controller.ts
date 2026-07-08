import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CleanupService } from './cleanup.service';

@ApiTags('recycle-bin')
@Controller('recycle-bin')
export class RecycleBinController {
  constructor(private readonly cleanup: CleanupService) {}

  @Get()
  @ApiOperation({
    summary: 'List recycle bin entries',
    description:
      'Approved deletions wait here until their retention window lapses. Anything still binned can be restored to its original location.',
  })
  list() {
    return this.cleanup.listBin();
  }

  @Post(':id/restore')
  @ApiOperation({
    summary: 'Restore an entry: move its files back to their original paths',
  })
  async restore(@Param('id', ParseIntPipe) id: number) {
    await this.cleanup.restore(id);
    return { restored: true };
  }

  @Post(':id/purge')
  @ApiOperation({
    summary: 'Permanently delete an entry now, without waiting for retention',
  })
  async purge(@Param('id', ParseIntPipe) id: number) {
    await this.cleanup.purge(id);
    return { purged: true };
  }
}
