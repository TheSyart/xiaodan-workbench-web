import { describe, expect, it } from 'vitest';
import {
  contentProfileInputSchema,
  createProjectSchema,
  createScriptSchema,
  financeTransactionInputSchema,
  saveScriptContentSchema
} from '../src/index.js';

describe('public contracts', () => {
  it('requires a complete profile for a content series', () => {
    expect(() => createProjectSchema.parse({ name: '小单日谈', type: 'content_series' })).toThrow();
    expect(
      createProjectSchema.parse({
        name: '小单日谈',
        type: 'content_series',
        contentProfile: {
          audience: 'AI 初学者',
          topicScope: '通俗 AI 科普',
          toneGuidelines: '直接、自然',
          structureTemplate: '问题—比喻—结论',
          forbiddenPhrases: ['赋能'],
          targetDurationSeconds: 180,
          cadenceWeekdays: [1, 3, 5]
        }
      }).type
    ).toBe('content_series');
  });

  it('validates weekdays and RMB integer amounts', () => {
    expect(() => contentProfileInputSchema.parse({
      audience: 'a', topicScope: 'b', toneGuidelines: 'c', structureTemplate: 'd',
      forbiddenPhrases: [], targetDurationSeconds: 60, cadenceWeekdays: [0]
    })).toThrow();
    expect(() => financeTransactionInputSchema.parse({
      kind: 'expense', amountMinor: 0, categoryId: 'food', occurredAt: new Date().toISOString()
    })).toThrow();
  });

  it('preserves valid script metadata and rejects invalid dates', () => {
    expect(createScriptSchema.parse({ title: '第一期', plannedDate: '2026-09-01' }).plannedDate).toBe('2026-09-01');
    expect(() => createScriptSchema.parse({ title: '第一期', plannedDate: '2026-13-44' })).toThrow();
  });

  it('accepts exact markdown up to 2 MiB and rejects larger text', () => {
    const exact = 'a'.repeat(2 * 1024 * 1024);
    expect(saveScriptContentSchema.parse({ contentMarkdown: exact }).contentMarkdown).toBe(exact);
    expect(() => saveScriptContentSchema.parse({ contentMarkdown: `${exact}a` })).toThrow();
  });
});

