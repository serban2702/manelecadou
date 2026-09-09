import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { AdminGuard } from '../../common/admin.guard';
import { AuthedRequestUser, CurrentUser } from '../../common/decorators';
import { NotificationPrefsService } from './notification-prefs.service';
import { CHAT_NOTIFY_MODES, type ChatNotifyMode } from './notification-kind';

class UpdatePrefsDto {
  @IsBoolean() @IsOptional()
  payment?: boolean;

  @IsBoolean() @IsOptional()
  finalStep?: boolean;

  @IsIn(CHAT_NOTIFY_MODES) @IsOptional()
  chatMode?: ChatNotifyMode;

  @IsBoolean() @IsOptional()
  generation?: boolean;

  @IsBoolean() @IsOptional()
  stalledDelivery?: boolean;

  @IsBoolean() @IsOptional()
  aiAlert?: boolean;
}

/**
 * Preferințele proprii ale adminului autentificat. Nu există rută pentru
 * preferințele altcuiva: fiecare își alege singur ce primește pe telefon.
 */
@UseGuards(AdminGuard)
@Controller('admin/notification-prefs')
export class NotificationPrefsController {
  constructor(private readonly svc: NotificationPrefsService) {}

  @Get()
  async mine(@CurrentUser() user: AuthedRequestUser) {
    return this.svc.get(user.id);
  }

  @Put()
  async update(@CurrentUser() user: AuthedRequestUser, @Body() dto: UpdatePrefsDto) {
    return this.svc.update(user.id, dto);
  }
}
