/** Numele cozii BullMQ folosite atât de processor cât și de service.
 *  Extras într-un fișier separat pentru a evita circular import între
 *  generations.service.ts și generations.processor.ts. */
export const GENERATIONS_QUEUE = 'generations';
