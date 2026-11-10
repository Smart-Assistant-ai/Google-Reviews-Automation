import { DRAFT_TARGET_BYTES } from '@replypilot/shared';
import { describe, expect, it } from 'vitest';
import { analyze, detectLanguage } from '../../src/modules/reviews/analysis';
import { draftFromTemplate } from '../../src/modules/reviews/template-drafter';
import { SEED_REVIEWS, SIMULATED_POOL } from '../../src/providers/gbp/fixtures';

const voice = (overrides: object = {}) => ({
  tone: 'warm' as const,
  languageMode: 'match' as const,
  signOff: null,
  ownerName: null,
  ...overrides,
});

describe('language detection', () => {
  it('detects Spanish and English', () => {
    expect(detectLanguage('¡El personal fue muy amable!')).toBe('es');
    expect(detectLanguage('La ubicación es perfecta')).toBe('es');
    expect(detectLanguage('Great service and a very personal touch')).toBe('en');
  });

  it('detects plain Spanish without accents or punctuation', () => {
    expect(detectLanguage('El personal es amable y atento')).toBe('es');
    expect(detectLanguage('Todo limpio y buen servicio pero muy caro')).toBe('es');
  });

  it('keeps English near-misses as English', () => {
    expect(detectLanguage('The personal service in El Paso was amiable and attentive')).toBe('en');
    expect(detectLanguage('Visited Las Vegas, then Los Angeles and Buena Vista')).toBe('en');
  });

  it('classifies every sample review correctly', () => {
    const spanish = /[áéíóúñ¡¿]|\b(Excelente|Nos|Estaba|Tuvimos)\b/;
    for (const review of [...SEED_REVIEWS, ...SIMULATED_POOL].filter((r) => r.text)) {
      expect(detectLanguage(review.text!), review.text).toBe(
        spanish.test(review.text!) ? 'es' : 'en',
      );
    }
  });
});

describe('analysis', () => {
  it('maps stars to sentiment and finds topics that fit any business', () => {
    const result = analyze({ starRating: 2, comment: 'Waited 40 minutes and the place was dirty' });
    expect(result.sentiment).toBe('negative');
    expect(result.topics).toEqual(expect.arrayContaining(['wait time', 'cleanliness']));
  });

  it('handles a rating with no text', () => {
    const result = analyze({ starRating: 5, comment: null });
    expect(result.language).toBe('en');
    expect(result.topics).toEqual([]);
  });
});

describe('offline drafts', () => {
  it('avoid repeating recent openers and add the sign-off', () => {
    const review = { reviewerName: 'David Kim', starRating: 5, comment: 'Lovely team' };
    const analysis = analyze(review);
    const first = draftFromTemplate({
      review,
      analysis,
      voice: voice({ signOff: '– The Team' }),
      recentReplies: [],
    });
    const second = draftFromTemplate({
      review,
      analysis,
      voice: voice({ signOff: '– The Team' }),
      recentReplies: [first],
    });
    expect(first).toContain('David');
    expect(first.endsWith('– The Team')).toBe(true);
    expect(first.slice(0, 25)).not.toBe(second.slice(0, 25));
  });

  it('never offer incentives', () => {
    const review = { reviewerName: 'Jason', starRating: 1, comment: 'Dirty and slow' };
    expect(draftFromTemplate({ review, analysis: analyze(review), voice: voice() })).not.toMatch(
      /discount|coupon|free/i,
    );
  });

  it('only praise topics that deserve it', () => {
    const review = {
      reviewerName: 'Ashley',
      starRating: 4,
      comment: 'Great, slightly pricey but worth it',
    };
    const draft = draftFromTemplate({
      review,
      analysis: { language: 'en', sentiment: 'positive', topics: ['price & billing'] },
      voice: voice(),
    });
    expect(draft).not.toMatch(/price|billing/);
  });

  it('answer Spanish reviews in Spanish, in the right mood', () => {
    const review = {
      reviewerName: 'Miguel Herrera',
      starRating: 2,
      comment: 'Estaba sucio y nadie nos respondió.',
    };
    const analysis = analyze(review);
    expect(analysis.language).toBe('es');
    expect(draftFromTemplate({ review, analysis, voice: voice() })).toMatch(
      /^Lo sentimos mucho, Miguel/,
    );
  });

  it('stay under the size target for every sample, in every tone', () => {
    for (const seed of SEED_REVIEWS) {
      const review = {
        reviewerName: seed.name,
        starRating: seed.stars,
        comment: seed.text ?? null,
      };
      for (const tone of ['warm', 'professional', 'playful'] as const) {
        const draft = draftFromTemplate({
          review,
          analysis: analyze(review),
          voice: voice({ tone }),
        });
        expect(Buffer.byteLength(draft)).toBeLessThan(DRAFT_TARGET_BYTES);
      }
    }
  });
});
