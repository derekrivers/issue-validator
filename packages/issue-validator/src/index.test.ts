import { describe, expect, it } from 'vitest';

import {
  __testUtils,
  IssueInputSchema,
  ValidationResultSchema,
  validateIssue,
} from './index.js';

const createIssue = (overrides: Partial<Parameters<typeof validateIssue>[0]> = {}) => ({
  title: 'Implement acceptance criteria validator',
  body: [
    '## Summary',
    'Add deterministic validation for issue bodies.',
    '',
    '## Acceptance Criteria',
    '- Parses a dedicated section',
    '- Requires at least three items',
    '- Reports vague items individually',
  ].join('\n'),
  labels: ['enhancement'],
  knownFingerprints: [],
  ...overrides,
});

describe('IssueInputSchema', () => {
  it('accepts a well-formed issue payload', () => {
    const parsed = IssueInputSchema.parse(createIssue());

    expect(parsed.title).toBe('Implement acceptance criteria validator');
    expect(parsed.labels).toEqual(['enhancement']);
  });

  it('rejects an invalid issue payload', () => {
    const result = IssueInputSchema.safeParse({
      title: '',
      body: '',
      labels: [],
      knownFingerprints: [],
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('acceptance criteria parser', () => {
  it('detects level 2 and 3 headings case-insensitively and stops at the next heading', () => {
    expect(
      __testUtils.extractAcceptanceCriteriaSection([
        '## ACCEPTANCE CRITERIA',
        '- First item',
        '- Second item',
        '## Notes',
        '- Ignored item',
      ].join('\n')),
    ).toEqual({
      found: true,
      items: ['First item', 'Second item'],
    });

    expect(
      __testUtils.extractAcceptanceCriteriaSection([
        '### Acceptance Criteria',
        '- Third item',
      ].join('\n')),
    ).toEqual({
      found: true,
      items: ['Third item'],
    });
  });
});

describe('validateIssue', () => {
  it('returns a schema-valid result for a clean payload', () => {
    const result = validateIssue(createIssue());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.normalizedInput?.title).toBe('Implement acceptance criteria validator');
    expect(() => ValidationResultSchema.parse(result)).not.toThrow();
  });

  it('returns validation errors for an invalid payload shape', () => {
    const result = validateIssue({
      title: '',
      body: '',
      labels: [],
      knownFingerprints: [],
    } as never);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.normalizedInput).toBeUndefined();
    expect(() => ValidationResultSchema.parse(result)).not.toThrow();
  });

  it('adds an error when the title is shorter than 10 characters', () => {
    const result = validateIssue(createIssue({ title: 'Too short' }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Title too short — minimum 10 characters');
  });

  it('adds an error when the title is longer than 200 characters', () => {
    const result = validateIssue(createIssue({ title: 'A'.repeat(201) }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Title too long — maximum 200 characters');
  });

  it('detects generic blocked titles case-insensitively', () => {
    const result = validateIssue(createIssue({ title: 'tOdO' }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Title is too generic — provide a specific description of the change',
    );
  });

  it('adds a warning for broad-scope body signals without invalidating the issue by itself', () => {
    const result = validateIssue(
      createIssue({ body: '## Acceptance Criteria\n- First item\n- Second item\n- Third item\n\nWe should rewrite the service.' }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain(
      'Issue may be too broad in scope — consider splitting into smaller tasks',
    );
  });

  it('adds an error when the acceptance criteria heading is missing', () => {
    const result = validateIssue(
      createIssue({ body: '## Summary\nMissing the required section entirely.' }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Missing Acceptance Criteria section — add a '## Acceptance Criteria' heading",
    );
  });

  it('adds an error when the acceptance criteria section has zero items', () => {
    const result = validateIssue(
      createIssue({ body: '## Acceptance Criteria\n\n## Next Section\n- Outside section' }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Acceptance Criteria must contain at least 3 items');
  });

  it('adds an error when fewer than 3 acceptance criteria items are present', () => {
    const result = validateIssue(
      createIssue({ body: '## Acceptance Criteria\n- One\n- Two' }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Acceptance Criteria must contain at least 3 items');
  });

  it('does not add an item-count error when exactly 3 acceptance criteria items are present', () => {
    const result = validateIssue(
      createIssue({ body: '### Acceptance Criteria\n- One\n- Two\n- Three' }),
    );

    expect(result.errors).not.toContain('Acceptance Criteria must contain at least 3 items');
  });

  it('adds one warning for a vague acceptance criteria item', () => {
    const result = validateIssue(
      createIssue({ body: '## Acceptance Criteria\n- It works\n- Has metrics\n- Saves state' }),
    );

    expect(result.warnings).toEqual(["Acceptance Criteria item may be too vague: 'It works'"]);
  });

  it('adds multiple warnings for multiple vague acceptance criteria items', () => {
    const result = validateIssue(
      createIssue({
        body: '## Acceptance Criteria\n- It works\n- Tests pass\n- Saves state',
      }),
    );

    expect(result.warnings).toEqual([
      "Acceptance Criteria item may be too vague: 'It works'",
      "Acceptance Criteria item may be too vague: 'Tests pass'",
    ]);
  });

  it('merges multiple simultaneous findings and preserves warnings alongside errors', () => {
    const result = validateIssue(
      createIssue({
        title: 'TODO',
        body: '## Acceptance Criteria\n- It works\n- Second item',
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Title too short — minimum 10 characters',
      'Title is too generic — provide a specific description of the change',
      'Acceptance Criteria must contain at least 3 items',
    ]);
    expect(result.warnings).toEqual(["Acceptance Criteria item may be too vague: 'It works'"]);
  });
});
