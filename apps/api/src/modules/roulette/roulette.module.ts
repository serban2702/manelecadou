import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RouletteSpin } from './roulette-spin.entity';
import { RouletteService } from './roulette.service';
import { RouletteController } from './roulette.controller';
import { PromoModule } from '../promo/promo.module';
import { AuthModule } from '../auth/auth.module';
import { SitesModule } from '../sites/sites.module';

@Module({
  imports: [TypeOrmModule.forFeature([RouletteSpin]), PromoModule, AuthModule, SitesModule],
  providers: [RouletteService],
  controllers: [RouletteController],
})
export class RouletteModule {}
