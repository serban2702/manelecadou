import { http } from '../http/client';

/** Cât de mult vrea adminul să fie deranjat de mesajele din chat. */
export type ChatNotifyMode = 'all' | 'paid_only' | 'off';

export interface NotificationPrefs {
  /** Plată primită sau eșuată. */
  payment: boolean;
  /** Vizitatorul a ajuns pe ultimul pas al formularului (Plată). */
  finalStep: boolean;
  chatMode: ChatNotifyMode;
  /** Comandă finalizată sau generare eșuată. */
  generation: boolean;
  /** Plată fără livrare: generare sau modificare nepornită. */
  stalledDelivery: boolean;
  /** Alerte de la Irina (escaladări, cap de mesaje). */
  aiAlert: boolean;
}

export class NotificationPrefsApi {
  static mine(): Promise<NotificationPrefs> {
    return http.get('/admin/notification-prefs');
  }
  static update(patch: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
    return http.put('/admin/notification-prefs', patch);
  }
}
