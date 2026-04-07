import { describe, expect, it } from 'vitest';

import {
  IssueInputSchema,
  ValidationResultSchema,
  validateIssue,
} from './index.js';

const createValidIssue = (overrides: Partial<Parameters<typeof validateIssue>[0]> = {}) => ({
  title: 'Implement structured validator rules',
  summary: 'Ensure issue data is schema-checked and actionable.',
  acceptanceCriteria: ['Validator returns result objects'],
  affectedPaths: ['packages/issue-validator'],
  requestedCapabilities: ['can_run_tests'],
  ...overrides,
});

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
  it('returns a schema-valid result for a clean payload', () => {
    const result = validateIssue(createValidIssue());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.normalizedInput?.title).toBe('Implement structured validator rules');
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

  it('adds an error when the title is shorter than 10 characters', () => {
    const result = validateIssue(createValidIssue({ title: 'Too short' }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'title-length: title must be at least 10 characters long',
    );
    expect(result.warnings).toEqual([]);
  });

  it('adds an error when the title is longer than 200 characters', () => {
    const result = validateIssue(createValidIssue({ title: 'A'.repeat(201) }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'title-length: title must be at most 200 characters long',
    );
    expect(result.warnings).toEqual([]);
  });

  it('detects generic blocked titles case-insensitively', () => {
    const result = validateIssue(createValidIssue({ title: 'fIx ThIs' }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'generic-title: title is too generic to be actionable',
    );
  });

  it('adds a warning for broad-scope body signals without invalidating the issue by itself', () => {
    const result = validateIssue(
      createValidIssue({
        summary: 'We should rewrite the entire system from scratch.',
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain(
      'scope-signal: issue may be too broad for a single actionable task',
    );
  });

  it('merges multiple simultaneous findings and preserves warnings alongside errors', () => {
    const result = validateIssue(
      createValidIssue({
        title: 'TODO',
        summary: 'Complete the whole codebase overhaul from scratch.',
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'title-length: title must be at least 10 characters long',
      'generic-title: title is too generic to be actionable',
    ]);
    expect(result.warnings).toEqual([
      'scope-signal: issue may be too broad for a single actionable task',
    ]);
    expect(() => ValidationResultSchema.parse(result)).not.toThrow();
  });
});
