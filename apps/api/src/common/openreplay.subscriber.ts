import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from 'typeorm';
import { ErrorLog } from '../modules/errors/error-log.entity';
import { Generation } from '../modules/generations/generation.entity';
import { Payment } from '../modules/payments/payment.entity';
import { OutboundEmail } from '../modules/outbound-email/outbound-email.entity';
import { getOpenReplaySessionId } from './openreplay-context';

/**
 * La INSERT pe entități care au `openReplaySessionId`, completează automat
 * câmpul din AsyncLocalStorage (populat de OpenReplayMiddleware). Astfel,
 * orice eroare / plată / generation creată în contextul unui request HTTP
 * primește session-id-ul OpenReplay fără modificări la call-site.
 *
 * Nu suprascrie valori setate explicit (call-site poate avea preferință).
 */
@Injectable()
@EventSubscriber()
export class OpenReplaySubscriber implements EntitySubscriberInterface {
  constructor(@InjectDataSource() dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  beforeInsert(event: InsertEvent<unknown>): void {
    const target = event.metadata.target;
    if (
      target !== Payment &&
      target !== Generation &&
      target !== ErrorLog &&
      target !== OutboundEmail
    ) {
      return;
    }
    const ent = event.entity as
      | { openReplaySessionId?: string | null }
      | undefined;
    if (!ent) return;
    if (ent.openReplaySessionId) return; // respect explicit override
    const sid = getOpenReplaySessionId();
    if (sid) ent.openReplaySessionId = sid;
  }
}
