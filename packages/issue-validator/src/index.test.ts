import { describe, expect, it } from 'vitest';

import {
  IssueInputSchema,
  ValidationResultSchema,
  validateIssue,
} from './index.js';

describe('IssueInputSchema', () => {
  it('accepts a well-formed issue payload', () => {
    const parsed = IssueInputSchema.parse({
      title: 'Establish scaffolding',
      summary: 'Create the package structure for the validator.',
      acceptanceCriteria: ['Root config exists', 'Package exports validateIssue'],
      affectedPaths: ['packages/issue-validator/src/index.ts'],
      requestedCapabilities: ['can_write_code'],
    });

    expect(parsed.title).toBe('Establish scaffolding');
    expect(parsed.acceptanceCriteria).toHaveLength(2);
  });

  it('rejects an invalid issue payload', () => {
    const result = IssueInputSchema.safeParse({
      title: '',
      summary: '',
      acceptanceCriteria: [''],
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('validateIssue', () => {
  it('returns a schema-valid result for a valid payload', () => {
    const result = validateIssue({
      title: 'Validate issue payloads',
      summary: 'Ensure issue data is schema-checked.',
      acceptanceCriteria: ['Validator returns result objects'],
      affectedPaths: ['packages/issue-validator'],
      requestedCapabilities: ['can_run_tests'],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.normalizedInput?.title).toBe('Validate issue payloads');
    expect(() => ValidationResultSchema.parse(result)).not.toThrow();
  });

  it('returns validation errors for an invalid payload shape', () => {
    const result = validateIssue({
      title: '',
      summary: '',
      acceptanceCriteria: [''],
      affectedPaths: [],
      requestedCapabilities: [],
    } as never);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.normalizedInput).toBeUndefined();
    expect(() => ValidationResultSchema.parse(result)).not.toThrow();
  });
});
