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
import { CalendarService, CreateCalendarEventDto, UpdateCalendarEventDto, EventNotificationPreferenceDto } from '../services/calendar.service';

@Controller('system/calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('events')
  async getEvents(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Req() req?: any,
  ) {
    const userId = (req.user as any)?.accountId;
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.calendarService.getAllEvents(start, end, userId);
  }

  @Get('events/:id')
  async getEventById(@Param('id') id: string, @Req() req?: any) {
    const userId = (req.user as any)?.accountId;
    return await this.calendarService.getEventById(id, userId);
  }

  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  async createEvent(@Body() createDto: CreateCalendarEventDto, @Req() req: any) {
    const userId = (req.user as any)?.accountId;
    return await this.calendarService.createEvent(createDto, userId);
  }

  @Put('events/:id')
  @HttpCode(HttpStatus.OK)
  async updateEvent(
    @Param('id') id: string,
    @Body() updateDto: UpdateCalendarEventDto,
    @Req() req: any,
  ) {
    const userId = (req.user as any)?.accountId;
    return await this.calendarService.updateEvent(id, updateDto, userId);
  }

  @Delete('events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEvent(@Param('id') id: string, @Req() req: any) {
    const userId = (req.user as any)?.accountId;
    await this.calendarService.deleteEvent(id, userId);
  }

  @Post('events/:id/notifications')
  @HttpCode(HttpStatus.OK)
  async setNotificationPreference(
    @Param('id') eventId: string,
    @Body() preference: EventNotificationPreferenceDto,
    @Req() req: any,
  ) {
    const userId = (req.user as any)?.accountId;
    return await this.calendarService.setNotificationPreference(eventId, userId, preference);
  }

  @Get('events/:id/notifications')
  async getNotificationPreference(
    @Param('id') eventId: string,
    @Req() req: any,
  ) {
    const userId = (req.user as any)?.accountId;
    return await this.calendarService.getNotificationPreference(eventId, userId);
  }

  @Get('notifications')
  async getUserNotifications(@Req() req: any) {
    const userId = (req.user as any)?.accountId;
    return await this.calendarService.getUserNotifications(userId);
  }
}

