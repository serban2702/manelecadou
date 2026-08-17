import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt.guard';
import { AdminGuard } from '../../common/admin.guard';
import { EXPERIENCE_CATALOG } from './catalog';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/experiences')
export class AdminExperiencesController {
  @Get()
  catalog() {
    return EXPERIENCE_CATALOG;
  }
}
