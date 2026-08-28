import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  friendlyLyriaError,
  isLyriaQuotaError,
  NonRetryableGenerationError,
  rawGoogleError,
} from './lyria.service';

describe('Lyria error messages', () => {
  it('maps Google free-tier quota dumps to a Romanian billing hint', () => {
    const raw =
      'You exceeded your current quota, please check your plan and billing details. ' +
      'For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. ' +
      '* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, ' +
      'limit: 0, model: lyria-3-pro *';
    assert.equal(isLyriaQuotaError(raw), true);
    const msg = friendlyLyriaError(raw);
    assert.match(msg, /nu are plan gratuit/i);
    assert.match(msg, /Pay as you go/i);
    assert.doesNotMatch(msg, /generate_content_free_tier_requests/);
  });

  it('maps the input-token free-tier dump the same way', () => {
    const raw =
      'You exceeded your current quota, please check your plan and billing details. ' +
      '* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, ' +
      'limit: 0, model: lyria-3-pro * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, ' +
      'limit: 0, model: lyria-3-pro Please retry in 47.491284531s.';
    const msg = friendlyLyriaError(raw);
    assert.match(msg, /nu are plan gratuit/i);
    assert.doesNotMatch(msg, /Please retry/);
  });

  it('keeps unrelated Google errors intact', () => {
    assert.equal(friendlyLyriaError('Lyria n-a întors audio'), 'Lyria n-a întors audio');
  });

  it('reads error.message from the Google JSON envelope', () => {
    assert.match(
      rawGoogleError({ error: { message: 'quota exceeded', status: 'RESOURCE_EXHAUSTED' } }),
      /quota exceeded/,
    );
  });

  it('marks quota failures as non-retryable', () => {
    const err = new NonRetryableGenerationError('cota');
    assert.equal(err.nonRetryable, true);
  });
});
