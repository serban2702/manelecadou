import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';

/**
 * Endpoint de callback pentru Suno.
 * Acceptă POST-ul Suno la finalul generării. Acum doar log-uim — polling-ul
 * provider-ului citește oricum starea reală via record-info. Returnăm 200
 * să nu cauzăm CALLBACK_EXCEPTION pe partea Suno.
 */
@Controller('suno')
export class SunoController {
  private readonly logger = new Logger('SunoCallback');

  @Post('callback')
  @HttpCode(200)
  async callback(@Body() body: any) {
    const taskId = body?.data?.task_id;
    const callbackType = body?.data?.callbackType;
    const tracks = body?.data?.data?.length ?? 0;
    this.logger.log(
      `callback taskId=${taskId} type=${callbackType} tracks=${tracks} code=${body?.code}`,
    );
    return { ok: true };
  }
}
