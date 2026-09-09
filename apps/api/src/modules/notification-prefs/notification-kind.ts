/**
 * Sursele de notificare push pe care un admin le poate porni sau opri separat.
 *
 * Fișier fără dependențe (fără NestJS, fără TypeORM) ca să poată fi importat și
 * din teste, și din serviciile care trimit push, fără să tragă modulul întreg.
 */
export type NotificationKind =
  /** Plată primită sau eșuată. */
  | 'payment'
  /** Vizitatorul a ajuns pe ultimul pas al formularului de comandă (Plată). */
  | 'final_step'
  /** Mesaj nou de la client în chat. Filtrat suplimentar prin `chatMode`. */
  | 'chat_message'
  /** Comandă finalizată sau generare eșuată. */
  | 'generation'
  /**
   * Client care a plătit dar nu primește nimic: generare nepornită după plată,
   * modificare plătită care n-a demarat. Alertă care cere intervenție manuală.
   */
  | 'stalled_delivery'
  /** Alerte de la agentul AI: escaladări, cap de mesaje, buclă. */
  | 'ai_alert';

export const NOTIFICATION_KINDS: NotificationKind[] = [
  'payment',
  'final_step',
  'chat_message',
  'generation',
  'stalled_delivery',
  'ai_alert',
];

/**
 * Cât de mult vrea adminul să fie deranjat de mesajele din chat.
 *  - `all`       — orice mesaj de la orice client
 *  - `paid_only` — doar de la cine are cel puțin o plată reușită
 *  - `off`       — niciun mesaj
 *
 * Chatul are trei stări în loc de un simplu pornit/oprit fiindcă e sursa cu cel
 * mai mare volum: la un site activ, „toate mesajele" pe telefon devine repede
 * inutilizabil, dar „deloc" înseamnă să ratezi un client care a dat deja bani.
 */
export type ChatNotifyMode = 'all' | 'paid_only' | 'off';

export const CHAT_NOTIFY_MODES: ChatNotifyMode[] = ['all', 'paid_only', 'off'];

/** Preferințele efective ale unui admin, cu valorile aplicate deja. */
export interface EffectiveNotificationPrefs {
  payment: boolean;
  finalStep: boolean;
  chatMode: ChatNotifyMode;
  generation: boolean;
  stalledDelivery: boolean;
  aiAlert: boolean;
}

/**
 * Ce primește un admin care n-a atins niciodată ecranul de setări: tot.
 *
 * Lipsa unui rând NU înseamnă „nu vrea nimic" — înseamnă că n-a apucat să
 * aleagă. Un default pe „oprit" ar fi tăiat tăcut notificările tuturor în ziua
 * în care funcționalitatea asta a ajuns pe producție.
 */
export const DEFAULT_NOTIFICATION_PREFS: EffectiveNotificationPrefs = {
  payment: true,
  finalStep: true,
  chatMode: 'all',
  generation: true,
  stalledDelivery: true,
  aiAlert: true,
};

/**
 * Decide dacă un admin cu preferințele date vrea notificarea asta.
 *
 * `senderHasPaid` contează doar pentru `chat_message` cu modul `paid_only`, și
 * e `undefined` când apelantul n-a putut determina statusul. În cazul ăla
 * trimitem: o notificare în plus e mai ieftină decât un client plătitor ratat.
 */
export function wantsNotification(
  prefs: EffectiveNotificationPrefs,
  kind: NotificationKind,
  opts?: { senderHasPaid?: boolean },
): boolean {
  switch (kind) {
    case 'payment':
      return prefs.payment;
    case 'final_step':
      return prefs.finalStep;
    case 'generation':
      return prefs.generation;
    case 'stalled_delivery':
      return prefs.stalledDelivery;
    case 'ai_alert':
      return prefs.aiAlert;
    case 'chat_message':
      if (prefs.chatMode === 'off') return false;
      if (prefs.chatMode === 'all') return true;
      return opts?.senderHasPaid !== false;
    default:
      // Un `kind` nou, nedeclarat încă în preferințe, ajunge la toți. Greșeala
      // mai puțin costisitoare: o notificare nedorită se observă și se repară,
      // una lipsă nu se observă niciodată.
      return true;
  }
}
