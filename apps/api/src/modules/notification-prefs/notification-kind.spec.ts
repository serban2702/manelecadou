import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_KINDS,
  wantsNotification,
  type EffectiveNotificationPrefs,
  type NotificationKind,
} from './notification-kind';

const prefs = (over: Partial<EffectiveNotificationPrefs> = {}): EffectiveNotificationPrefs => ({
  ...DEFAULT_NOTIFICATION_PREFS,
  ...over,
});

describe('wantsNotification', () => {
  it('implicit lasă să treacă toate sursele', () => {
    for (const kind of NOTIFICATION_KINDS) {
      assert.equal(wantsNotification(DEFAULT_NOTIFICATION_PREFS, kind), true, kind);
    }
  });

  it('fiecare comutator taie DOAR sursa lui', () => {
    const cases: Array<[keyof EffectiveNotificationPrefs, NotificationKind]> = [
      ['payment', 'payment'],
      ['finalStep', 'final_step'],
      ['generation', 'generation'],
      ['stalledDelivery', 'stalled_delivery'],
      ['aiAlert', 'ai_alert'],
    ];
    for (const [field, kind] of cases) {
      const p = prefs({ [field]: false } as Partial<EffectiveNotificationPrefs>);
      assert.equal(wantsNotification(p, kind), false, `${field} oprit → ${kind} tăiat`);
      // Celelalte surse rămân neatinse.
      for (const other of NOTIFICATION_KINDS) {
        if (other === kind) continue;
        assert.equal(wantsNotification(p, other), true, `${field} oprit nu trebuie să taie ${other}`);
      }
    }
  });

  describe('chatMode', () => {
    it('`all` lasă orice mesaj, plătitor sau nu', () => {
      const p = prefs({ chatMode: 'all' });
      assert.equal(wantsNotification(p, 'chat_message', { senderHasPaid: false }), true);
      assert.equal(wantsNotification(p, 'chat_message', { senderHasPaid: true }), true);
      assert.equal(wantsNotification(p, 'chat_message'), true);
    });

    it('`off` taie orice mesaj, inclusiv de la cine a plătit', () => {
      const p = prefs({ chatMode: 'off' });
      assert.equal(wantsNotification(p, 'chat_message', { senderHasPaid: true }), false);
      assert.equal(wantsNotification(p, 'chat_message', { senderHasPaid: false }), false);
    });

    it('`paid_only` lasă doar plătitorii', () => {
      const p = prefs({ chatMode: 'paid_only' });
      assert.equal(wantsNotification(p, 'chat_message', { senderHasPaid: true }), true);
      assert.equal(wantsNotification(p, 'chat_message', { senderHasPaid: false }), false);
    });

    it('`paid_only` trimite când statusul de plată e necunoscut', () => {
      // Un client plătitor ratat costă mai mult decât o notificare în plus.
      const p = prefs({ chatMode: 'paid_only' });
      assert.equal(wantsNotification(p, 'chat_message', {}), true);
      assert.equal(wantsNotification(p, 'chat_message'), true);
    });

    it('nu afectează celelalte surse', () => {
      const p = prefs({ chatMode: 'off' });
      for (const kind of NOTIFICATION_KINDS) {
        if (kind === 'chat_message') continue;
        assert.equal(wantsNotification(p, kind), true, kind);
      }
    });
  });

  it('o sursă necunoscută trece — mai bine zgomot decât tăcere', () => {
    const p = prefs({ payment: false, chatMode: 'off' });
    assert.equal(wantsNotification(p, 'ceva_nou' as NotificationKind), true);
  });
});
