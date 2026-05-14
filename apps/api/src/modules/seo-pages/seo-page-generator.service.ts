import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { buildChatParams } from '../../openai/openai-params.helper';
import type { Site } from '../sites/site.entity';
import type { SeoSlugTemplate } from './seo-page-templates';

const LOCALE_NAME: Record<string, string> = {
  ro: 'Romanian',
  bg: 'Bulgarian',
  sr: 'Serbian',
  tr: 'Turkish',
  el: 'Greek',
  hr: 'Croatian',
  sl: 'Slovenian',
  bs: 'Bosnian',
};

export interface GeneratedSeoPage {
  title: string;
  metaDescription: string;
  h1: string;
  excerpt: string;
  contentMd: string;
}

/**
 * Generează conținut SEO long-form pentru o pagină dată, cu OpenAI.
 *
 * Prompt-ul include:
 *   - locale-ul site-ului (forțează limba)
 *   - brand-ul + tagline
 *   - prețul + valuta site-ului (pentru CTA-uri în text)
 *   - keyword-ul primar + intent-ul utilizatorului
 *   - structura standard (intro, 3 H2-uri, listă, FAQ, CTA final)
 *
 * Output: JSON cu { title, metaDescription, h1, excerpt, contentMd }.
 */
@Injectable()
export class SeoPageGeneratorService {
  private readonly logger = new Logger('SeoPageGenerator');

  constructor(private readonly settings: SettingsService) {}

  async generate(site: Site, template: SeoSlugTemplate): Promise<GeneratedSeoPage | null> {
    const apiKey = await this.settings.get('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY missing — SEO page generation skipped');
      return null;
    }

    const system = this.systemPrompt(site, template);
    const user = this.userPrompt(site, template);

    try {
      const raw = await this.openaiChat(apiKey, system, user);
      const parsed = this.parseOutput(raw);
      if (!parsed) {
        this.logger.warn(`Generator returned unparseable JSON for slug=${template.slug}`);
        return null;
      }
      return parsed;
    } catch (err) {
      this.logger.error(`Generator failed for slug=${template.slug}: ${(err as Error).message}`);
      return null;
    }
  }

  private systemPrompt(site: Site, template: SeoSlugTemplate): string {
    const lang = LOCALE_NAME[site.locale] ?? 'Romanian';
    const brand = site.name || 'Manele Cadou';
    const priceText = `${(site.basePriceCents / 100).toFixed(2)} ${site.currency}`;
    return [
      `You are an SEO content writer specialized in personalized AI music gift services (manele / Balkan music).`,
      `You write engaging, conversion-focused landing page content in ${lang}.`,
      ``,
      `BRAND CONTEXT:`,
      `- Service: ${brand} — generates personalized AI manele songs as gifts`,
      `- Price: ${priceText} per song (90 seconds, 2 versions)`,
      `- Locale: ${lang}`,
      `- Style: conversational, warm, slightly cheeky (manea flavor), trustworthy`,
      ``,
      `OUTPUT RULES:`,
      `- Output ONLY a single valid JSON object with keys: title, metaDescription, h1, excerpt, contentMd.`,
      `- NO markdown code fences around the JSON.`,
      `- title: 55-65 characters, includes primary keyword, ends with brand or location hint.`,
      `- metaDescription: 140-160 characters, includes primary keyword + CTA.`,
      `- h1: 50-80 characters, more emotional/punchy than title (uses primary keyword variant).`,
      `- excerpt: 1 sentence, 120-180 characters — hook for cards/listings.`,
      `- contentMd: 500-700 words of pure Markdown. Structure:`,
      `  1. Intro paragraph (2-3 sentences, hook the reader, mention price as positive).`,
      `  2. H2 "## Why this works" (or culturally adapted phrasing) + 1-2 paragraphs.`,
      `  3. H2 "## How to make one in 2 minutes" + ordered list of 3-4 steps.`,
      `  4. H2 with a specific angle for the keyword (e.g. for "manea nuntă" → "## Specific advice for weddings") + 2 paragraphs.`,
      `  5. Mini-FAQ (3 questions) using "**Q:** ..." then "**A:** ..." pattern.`,
      `  6. Closing CTA paragraph encouraging the user to start at /studio with the exact price ${priceText}.`,
      ``,
      `KEYWORD RULES:`,
      `- Use the primary keyword in: title, h1, FIRST sentence of intro, ONE H2 heading.`,
      `- Use natural variations 3-5 times in body. Never keyword-stuff.`,
      `- Sound human, not robotic. Vary sentence length.`,
      ``,
      `CULTURAL RULES (CRITICAL):`,
      `- For ${lang}, use the LOCAL music vocabulary: chalga (Bulgarian), turbofolk (Serbian), arabesk (Turkish), laiko/skyladiko (Greek), manele (Romanian).`,
      `- Use names, occasions, customs typical to the country (e.g. wedding traditions, name-day customs).`,
      `- Currency in CTAs: ${site.currency} (exact symbol/abbreviation as used in ${lang}).`,
      `- Avoid translating slang literally from Romanian. Use NATIVE ${lang} colloquial flavor.`,
      ``,
      `Tone: trustworthy + a little playful. Avoid AI-cliché phrases ("In today's world…", "imagine if…", "embark on a journey").`,
    ].join('\n');
  }

  private userPrompt(site: Site, template: SeoSlugTemplate): string {
    const parts: string[] = [
      `Primary keyword: "${template.primaryKeyword}"`,
      `Category: ${template.category}`,
      `Slug (for /articole/<slug>): ${template.slug}`,
      `Intent: ${template.intent}`,
    ];
    if (template.occasionId) parts.push(`Occasion ID on site: ${template.occasionId}`);
    if (template.voiceId) parts.push(`Voice ID on site: ${template.voiceId}`);
    if (template.styleId) parts.push(`Music style ID on site: ${template.styleId}`);
    parts.push(`Brand: ${site.name}`);
    parts.push(`Locale: ${site.locale} (${LOCALE_NAME[site.locale] ?? 'Romanian'})`);
    parts.push(`Price: ${(site.basePriceCents / 100).toFixed(2)} ${site.currency}`);
    parts.push(`Studio URL (for CTAs): /studio`);
    parts.push(``);
    parts.push(`Generate the JSON object now.`);
    return parts.join('\n');
  }

  private parseOutput(raw: string): GeneratedSeoPage | null {
    let text = raw.trim();
    // strip fences if model included them
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/```\s*$/i, '');
    try {
      const obj = JSON.parse(text);
      if (
        typeof obj.title === 'string' &&
        typeof obj.metaDescription === 'string' &&
        typeof obj.h1 === 'string' &&
        typeof obj.contentMd === 'string'
      ) {
        return {
          title: obj.title.slice(0, 200),
          metaDescription: obj.metaDescription.slice(0, 320),
          h1: obj.h1.slice(0, 200),
          excerpt: (obj.excerpt ?? obj.metaDescription).slice(0, 320),
          contentMd: obj.contentMd,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async openaiChat(apiKey: string, system: string, user: string): Promise<string> {
    const model = (await this.settings.get('OPENAI_MODEL')) || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        buildChatParams({
          model,
          temperature: 0.7,
          maxTokens: 2400,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          responseFormat: { type: 'json_object' },
        }),
      ),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return json.choices[0]?.message?.content?.trim() ?? '';
  }
}
