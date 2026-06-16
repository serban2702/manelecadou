import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/admin.guard';
import { SunoCreditMonitorService } from './suno-credit-monitor.service';
import { WingoNotifyService } from './wingo-notify.service';

/**
 * Endpoint-uri admin pentru monitorul de credite Suno:
 *   GET  /api/admin/suno-credits        → starea curentă + dacă Wingo e configurat
 *   POST /api/admin/suno-credits/check  → forțează o verificare acum (poate alerta)
 *   POST /api/admin/suno-credits/test   → trimite o notificare de test pe Wingo
 */
@UseGuards(AdminGuard)
@Controller('admin/suno-credits')
export class SunoCreditsController {
  constructor(
    private readonly monitor: SunoCreditMonitorService,
    private readonly wingo: WingoNotifyService,
  ) {}

  @Get()
  async status() {
    const [state, wingoConfigured] = await Promise.all([
      this.monitor.getState(),
      this.wingo.isConfigured(),
    ]);
    return { state, wingoConfigured };
  }

  @Post('check')
  async check() {
    return this.monitor.runCheck();
  }

  @Post('test')
  async test() {
    return this.wingo.send({
      title: '🔔 Test alertă credite Suno',
      body: 'Notificare de test din manelecadou. Dacă o vezi, canalul Wingo funcționează.',
      priority: 'normal',
      data: { kind: 'suno_credit_test' },
    });
  }
}
