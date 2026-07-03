import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Profilul de facturare persistent al unui client, cheiat pe `(siteId, email)`.
 *
 * De ce există: până acum datele de facturare (nume, CUI, adresă, județ...) se
 * recalculau la fiecare emitere din Stripe/DB și se „înghețau" doar pe factura
 * emisă. Editările din modalul de emitere se pierdeau. Cu acest tabel, editezi
 * o dată datele unui client → se aplică AUTOMAT la toate facturile lui viitoare
 * (vezi `InvoicesService.defaultClientFor`). Facturile deja emise NU se ating —
 * `Invoice.clientSnapshot` rămâne documentul fiscal invariant.
 *
 * Identitatea = emailul normalizat (lowercase). Per site, fiindcă firma emitentă
 * (SmartBill) diferă de la un site la altul.
 */
@Entity({ name: 'billing_customers' })
@Index('idx_billing_customer_site_email', ['siteId', 'email'], { unique: true })
export class BillingCustomer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  /** Emailul cumpărătorului, normalizat lowercase — identitatea clientului. */
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  /** Nume / denumire (persoană fizică sau firmă). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  /** CUI (firmă) sau CNP (persoană fizică). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  vatCode!: string | null;

  /** Nr. Reg. Comerțului (firme). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  regCom!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  city!: string | null;

  /** Județ, în denumirea cerută de SmartBill. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  county!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  phone!: string | null;

  /** Plătitor de TVA? (default false — firma noastră e neplătitoare). */
  @Column({ type: 'boolean', default: false })
  isTaxPayer!: boolean;

  /** Notițe interne (nu apar pe factură). */
  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
