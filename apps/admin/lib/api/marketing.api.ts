import { http } from '../http/client';

export type TemplateCategory = 'marketing' | 'transactional';

export interface MarketingTemplateMeta {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  sendable: boolean;
  supports: {
    promoCode?: boolean;
    recipientName?: boolean;
    customHeadline?: boolean;
    customBody?: boolean;
  };
}

export type CampaignAudience = 'all' | 'payers' | 'nonpayers' | 'single';
export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'failed';

export interface MarketingCampaign {
  id: string;
  siteId: string | null;
  name: string;
  templateId: string;
  audience: CampaignAudience;
  promoCodeId: string | null;
  promoCodeSnapshot: string | null;
  overrides: Record<string, unknown> | null;
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdByEmail: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

export type RuleTrigger = 'nonpayer' | 'payer';

export interface MarketingRule {
  id: string;
  siteId: string | null;
  name: string;
  trigger: RuleTrigger;
  daysAfter: number;
  templateId: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  validDays: number;
  active: boolean;
  totalSent: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AudienceCounts {
  all: number;
  payers: number;
  nonpayers: number;
}

export interface TemplatePreview {
  subject: string;
  html: string;
}

export interface CreateCampaignInput {
  name: string;
  templateId: string;
  audience: CampaignAudience;
  promoCodeId?: string | null;
  overrides?: Record<string, unknown> | null;
}

export interface CreateRuleInput {
  name: string;
  trigger: RuleTrigger;
  daysAfter: number;
  templateId: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  validDays: number;
  active?: boolean;
}

export class MarketingApi {
  static templates(): Promise<MarketingTemplateMeta[]> {
    return http.get('/admin/marketing/templates');
  }
  static preview(templateId: string, overrides?: Record<string, unknown>): Promise<TemplatePreview> {
    return http.post('/admin/marketing/templates/preview', { templateId, overrides });
  }
  static audience(): Promise<AudienceCounts> {
    return http.get('/admin/marketing/audience');
  }

  static campaigns(): Promise<MarketingCampaign[]> {
    return http.get('/admin/marketing/campaigns');
  }
  static campaign(id: string): Promise<MarketingCampaign> {
    return http.get(`/admin/marketing/campaigns/${id}`);
  }
  static createCampaign(input: CreateCampaignInput): Promise<MarketingCampaign> {
    return http.post('/admin/marketing/campaigns', input);
  }

  static rules(): Promise<MarketingRule[]> {
    return http.get('/admin/marketing/rules');
  }
  static createRule(input: CreateRuleInput): Promise<MarketingRule> {
    return http.post('/admin/marketing/rules', input);
  }
  static updateRule(id: string, patch: Partial<CreateRuleInput>): Promise<MarketingRule> {
    return http.patch(`/admin/marketing/rules/${id}`, patch);
  }
  static deleteRule(id: string): Promise<{ ok: true }> {
    return http.delete(`/admin/marketing/rules/${id}`);
  }
  static runRule(id: string): Promise<{ sent: number; eligible: number }> {
    return http.post(`/admin/marketing/rules/${id}/run`);
  }
  static runAll(): Promise<{ rules: number; totalSent: number }> {
    return http.post('/admin/marketing/rules/run-all');
  }
}
