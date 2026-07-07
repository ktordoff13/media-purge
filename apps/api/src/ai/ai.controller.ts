import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiAdvisorService } from './ai-advisor.service';

@ApiTags('integrations')
@Controller('integrations/ai')
export class AiController {
  constructor(private readonly ai: AiAdvisorService) {}

  @Post('test')
  @ApiOperation({ summary: 'Test the local AI server connection and model availability' })
  test() {
    return this.ai.testConnection();
  }

  @Post('advise')
  @ApiOperation({
    summary: 'Run a "you might regret this" advisory pass over open recommendations',
    description:
      'Runs in the background against the latest scan. Notes are display-only fun — they never change scores or trigger any action. Requires the AI advisor to be enabled in settings.',
  })
  advise() {
    return this.ai.advise();
  }
}
