import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import {
  MessagingService,
  CreateConversationDto,
  CreateMessageDto,
  UpdateMessageDto,
} from '../services/messaging.service';

@Controller('messaging')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('conversations')
  async getConversations(@Req() req: any) {
    const userId = (req.user as any)?.accountId;
    return await this.messagingService.getUserConversations(userId);
  }

  @Get('conversations/:id')
  async getConversationById(@Param('id') id: string, @Req() req: any) {
    const userId = (req.user as any)?.accountId;
    return await this.messagingService.getConversationById(id, userId);
  }

  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  async createConversation(@Body() createDto: CreateConversationDto, @Req() req: any) {
    const userId = (req.user as any)?.accountId;
    return await this.messagingService.createConversation(createDto, userId);
  }

  @Post('conversations/class/:classId')
  @HttpCode(HttpStatus.CREATED)
  async createClassConversation(@Param('classId') classId: string, @Req() req: any) {
    const userId = (req.user as any)?.accountId;
    return await this.messagingService.createClassConversation(parseInt(classId, 10), userId);
  }

  @Post('conversations/school-wide')
  @HttpCode(HttpStatus.CREATED)
  async createSchoolWideConversation(@Req() req: any) {
    const userId = (req.user as any)?.accountId;
    return await this.messagingService.createSchoolWideConversation(userId);
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Req() req?: any,
  ) {
    const userId = (req.user as any)?.accountId;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    return await this.messagingService.getMessages(id, userId, limitNum, offsetNum);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Param('id') id: string,
    @Body() createDto: CreateMessageDto,
    @Req() req: any,
  ) {
    const userId = (req.user as any)?.accountId;
    return await this.messagingService.sendMessage(id, createDto, userId);
  }

  @Put('messages/:id')
  @HttpCode(HttpStatus.OK)
  async updateMessage(
    @Param('id') id: string,
    @Body() updateDto: UpdateMessageDto,
    @Req() req: any,
  ) {
    const userId = (req.user as any)?.accountId;
    return await this.messagingService.updateMessage(id, updateDto, userId);
  }

  @Delete('messages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMessage(@Param('id') id: string, @Req() req: any) {
    const userId = (req.user as any)?.accountId;
    await this.messagingService.deleteMessage(id, userId);
  }

  @Post('messages/:id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(@Param('id') id: string, @Req() req: any) {
    const userId = (req.user as any)?.accountId;
    await this.messagingService.markAsRead(id, userId);
  }

  @Get('conversations/:id/unread-count')
  async getUnreadCount(@Param('id') id: string, @Req() req: any) {
    const userId = (req.user as any)?.accountId;
    return { count: await this.messagingService.getUnreadCount(id, userId) };
  }
}

