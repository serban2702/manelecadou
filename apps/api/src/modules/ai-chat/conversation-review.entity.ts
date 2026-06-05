import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Verdictul adminului pe o conversație AI. */
export type ReviewRating = 'good' | 'bad' | 'needs_work';

/** Categoria problemei semnalate (pentru ca skill-ul de îmbunătățire să grupeze). */
export type ReviewCategory =
  | 'price'       // cotare preț / upsell pachet greșit
  | 'tone'        // ton robotic / nepotrivit
  | 'package'     // alegerea / prezentarea pachetelor
  | 'flow'        // ordinea pașilor / buclă / a sărit un pas
  | 'accuracy'    // a inventat / a greșit o informație
  | 'escalation'  // a escaladat greșit sau nu a escaladat când trebuia
  | 'other';

/**
 * ConversationReview — review-ul unui admin pe o conversație AI. Capturat din chat-ul
 * admin (rating + categorie + comentariu). Consumat de skill-ul /improve-ai-chat care
 * analizează review-urile nerezolvate, implementează fix-uri în agent și marchează resolved.
 */
@Entity({ name: 'conversation_reviews' })
@Index('idx_conv_review_site_resolved', ['siteId', 'resolved'])
export class ConversationReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid' })
  conversationId!: string;

  @Column({ type: 'varchar', length: 16 })
  rating!: ReviewRating;

  @Column({ type: 'varchar', length: 24, default: 'other' })
  category!: ReviewCategory;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  /** false = în coada skill-ului de îmbunătățire; true = deja procesat/deployat. */
  @Column({ type: 'boolean', default: false })
  resolved!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  /** Adminul care a lăsat review-ul. */
  @Column({ type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  createdByEmail!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
