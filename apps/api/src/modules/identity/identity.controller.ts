import { BadRequestException, Body, Controller, NotFoundException, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { IdentityService, type IdentifyDto } from './identity.service';

@Controller('identity')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('identify')
  async identify(@Req() req: Request, @Body() body: IdentifyDto) {
    const siteId = (req as Request & { siteId?: string }).siteId;
    if (!siteId) throw new NotFoundException('Site neconfigurat');
    const visitorId = typeof body?.visitorId === 'string' ? body.visitorId.trim() : '';
    const deviceKey = typeof body?.deviceKey === 'string' ? body.deviceKey.trim() : '';
    if (!visitorId || !deviceKey) {
      throw new BadRequestException('visitorId and deviceKey are required');
    }
    try {
      return await this.identity.identify(siteId, extractClientIp(req), body, req.headers['user-agent'] ?? null);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}

function extractClientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const list = Array.isArray(xff) ? xff[0] : xff;
    const first = list.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real) return real.trim();
  return req.ip ?? null;
}
