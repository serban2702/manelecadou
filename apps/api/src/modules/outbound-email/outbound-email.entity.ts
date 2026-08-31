import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Log audit pentru fiecare mail transactional trimis prin MailerService.
 *
 * Se scrie un rând ÎNAINTE de send (`status='queued'`) ca să prinzi și
 * crash-urile providerelor (timeout, abort), apoi se update-uiește la
 * `sent` (cu providerMessageId) sau `failed` (cu errorMessage).
 *
 * Decizie de scope: păstrăm `html` și `text` integral — sunt utile pentru
 * debugging și re-trimitere manuală. Cleanup la 90 zile via cron viitor
 * dacă tabelul crește prea mult (deocamdată neglijabil — câteva sute /zi).
 */
@Entity({ name: 'outbound_emails' })
export class OutboundEmail {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  /** Categorie funcțională: magic_link, gift_code, generation_done, payment_receipt, etc. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  kind!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'queued' })
  status!: 'queued' | 'sent' | 'failed';

  @Column({ type: 'varchar', length: 320 })
  to!: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  fromAddress!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  replyTo!: string | null;

  @Column({ type: 'varchar', length: 500 })
  subject!: string;

  @Column({ type: 'text', nullable: true })
  html!: string | null;

  @Column({ type: 'text', nullable: true })
  text!: string | null;

  /** smtp | powermail | noop — numele provider-ului care a procesat mesajul. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  provider!: string | null;

  /** Referința provider-ului: Message-ID RFC la SMTP, UUID-ul mesajului la PowerMail. */
  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  providerMessageId!: string | null;

  /** Note tehnice (ex: `dev: logged to console`, motiv eșec etc.). */
  @Column({ type: 'text', nullable: true })
  providerNotes!: string | null;

  /** Mesaj de eroare când `status='failed'`. */
  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  /** User trigger (dacă a fost într-un request autentificat). */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  /** ID-ul entității care a triggered email-ul (paymentId, generationId, giftCodeId...). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  relatedId!: string | null;

  /** Populat automat de OpenReplaySubscriber pentru INSERT-uri în contextul unui HTTP req. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  openReplaySessionId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /** Setat când status devine sent/failed (timpul real de finalizare). */
  @Column({ type: 'timestamptz', nullable: true })
  finalizedAt!: Date | null;
}
