import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type InvoiceStatus = 'issued' | 'failed';

/** Snapshot al clientului folosit la emitere (editabil în preview). */
export interface InvoiceClientSnapshot {
  name?: string;
  vatCode?: string;
  regCom?: string;
  address?: string;
  city?: string;
  county?: string;
  country?: string;
  email?: string;
  isTaxPayer?: boolean;
}

/** Snapshot al liniei de produs/serviciu facturate. */
export interface InvoiceProductSnapshot {
  name: string;
  measuringUnit: string;
  quantity: number;
  /** Preț unitar în RON (cu zecimale), TVA inclus (neplătitor → 0%). */
  price: number;
}

/**
 * O factură SmartBill emisă pentru o plată. Idempotent prin `paymentId` unic:
 * o plată poate avea o singură factură emisă cu succes. Dacă emiterea eșuează,
 * rândul rămâne cu status='failed' și poate fi re-încercat (se suprascrie).
 */
@Entity({ name: 'invoices' })
@Index('idx_invoice_payment', ['paymentId'], { unique: true })
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid' })
  paymentId!: string;

  @Column({ type: 'varchar', length: 16, default: 'issued' })
  status!: InvoiceStatus;

  /** Seria SmartBill (ex. „MNL"). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  series!: string | null;

  /** Numărul atribuit de SmartBill în cadrul seriei. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  number!: string | null;

  /** CIF-ul firmei emitente la momentul emiterii. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  companyVatCode!: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  clientSnapshot!: InvoiceClientSnapshot;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  productSnapshot!: InvoiceProductSnapshot;

  /** Suma facturată în bani (cents) — copiată din plată. */
  @Column({ type: 'integer', default: 0 })
  amountCents!: number;

  @Column({ type: 'varchar', length: 8, default: 'RON' })
  currency!: string;

  /** Tip plată folosit pe încasarea embedded (ex. „Card"). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  paymentType!: string | null;

  /** Calea locală a PDF-ului descărcat (sub UPLOADS_DIR/invoices/). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  pdfPath!: string | null;

  /** Răspunsul brut SmartBill (pentru debug). */
  @Column({ type: 'jsonb', nullable: true })
  smartbillResponse!: unknown | null;

  /** Mesajul de eroare la status='failed'. */
  @Column({ type: 'text', nullable: true })
  errorText!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  issuedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
