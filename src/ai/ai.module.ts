import { Module } from '@nestjs/common';
import { OpenAIService } from './services/openai.service';
import { AIController } from './controllers/ai.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule], // Import AuthModule to provide RolesGuard dependencies
  providers: [OpenAIService],
  controllers: [AIController],
  exports: [OpenAIService],
})
export class AIModule {}
