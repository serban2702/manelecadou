import { Controller, Get, Module } from '@nestjs/common';

// Răspundem și pe /health și pe /api/health: sondele externe
// (Caddy, uptime monitors) nu mai produc 404 → warn în error_logs.
@Controller(['health', 'api/health'])
class HealthController {
  @Get()
  ok() {
    return { status: 'ok', service: 'manelecadou-api', ts: new Date().toISOString() };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
