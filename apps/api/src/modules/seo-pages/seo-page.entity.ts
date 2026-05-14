import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Pagini SEO de tip „articol" — landing pages indexabile pe Google, fiecare
 * țintind un keyword specific (ex: „manea cadou de zi de naștere"). Conținutul
 * e generat cu OpenAI per site, ținând cont de locale, brand, preț, ocazii.
 *
 * Servite la `/articole/<slug>` pe domeniul site-ului. NU sunt cloaking —
 * userul vede AGAINST conținutul real, plus CTA-uri spre /studio.
 */
@Entity({ name: 'seo_pages' })
@Index(['siteId', 'slug'], { unique: true })
export class SeoPage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  siteId!: string;

  /** Slug URL (ex: `manea-cadou-zi-nastere`). Identifică template-ul. */
  @Column({ type: 'varchar', length: 120 })
  slug!: string;

  /** Categoria de keyword (folosit pentru breadcrumbs și hub). */
  @Column({ type: 'varchar', length: 32, default: 'general' })
  category!: string;

  /** Locale-ul în care s-a generat conținutul (mereu = site.locale). */
  @Column({ type: 'varchar', length: 8 })
  locale!: string;

  /** <title> al paginii (60–70 chars). */
  @Column({ type: 'varchar', length: 200 })
  title!: string;

  /** Meta description (150–160 chars). */
  @Column({ type: 'varchar', length: 320 })
  metaDescription!: string;

  /** Titlul principal H1 (variantă mai lungă/punchier decât <title>). */
  @Column({ type: 'varchar', length: 200 })
  h1!: string;

  /** Conținut Markdown — randerizat pe pagina publică. */
  @Column({ type: 'text' })
  contentMd!: string;

  /** Snippet scurt (pentru meta OG description + hub cards). */
  @Column({ type: 'varchar', length: 320, nullable: true })
  excerpt!: string | null;

  /** Generat manual sau cu AI? `ai` = OpenAI generat, `manual` = editat în admin. */
  @Column({ type: 'varchar', length: 16, default: 'ai' })
  source!: 'ai' | 'manual';

  /** Dacă false, pagina nu se afișează public (draft / unpublished). */
  @Column({ type: 'boolean', default: true })
  published!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
