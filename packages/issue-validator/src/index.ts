import { z } from 'zod';

export const IssueInputSchema = z
  .object({
    title: z.string().trim().min(1, 'title is required'),
    body: z.string().trim().min(1, 'body is required'),
    labels: z.array(z.string().trim().min(1)).default([]),
    knownFingerprints: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

export type IssueInput = z.infer<typeof IssueInputSchema>;

export const ValidationResultSchema = z
  .object({
    valid: z.boolean(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    fingerprint: z.string(),
    normalizedInput: IssueInputSchema.optional(),
  })
  .strict();

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

type IssueValidator = (input: IssueInput) => Pick<ValidationResult, 'errors' | 'warnings'>;

type AcceptanceCriteriaSection = {
  found: boolean;
  items: string[];
};

const MIN_TITLE_LENGTH = 10;
const MAX_TITLE_LENGTH = 200;
const MIN_ACCEPTANCE_CRITERIA_ITEMS = 3;

const TITLE_TOO_SHORT_ERROR = 'Title too short — minimum 10 characters';
const TITLE_TOO_LONG_ERROR = 'Title too long — maximum 200 characters';
const GENERIC_TITLE_ERROR =
  'Title is too generic — provide a specific description of the change';
const BROAD_SCOPE_WARNING =
  'Issue may be too broad in scope — consider splitting into smaller tasks';
const MISSING_ACCEPTANCE_CRITERIA_ERROR =
  "Missing Acceptance Criteria section — add a '## Acceptance Criteria' heading";
const ACCEPTANCE_CRITERIA_COUNT_ERROR =
  'Acceptance Criteria must contain at least 3 items';

const BLOCKED_GENERIC_TITLE_PATTERNS = [
  /^fix bug$/i,
  /^update$/i,
  /^changes$/i,
  /^misc$/i,
  /^refactor$/i,
  /^cleanup$/i,
  /^wip$/i,
  /^todo$/i,
  /^test$/i,
];

const BROAD_SCOPE_PATTERNS = [
  /\brefactor everything\b/i,
  /\brewrite\b/i,
  /\bmigrate all\b/i,
  /\boverhaul\b/i,
  /\brework the entire\b/i,
];

const VAGUE_ACCEPTANCE_CRITERIA_PATTERNS = [
  /\bit works\b/i,
  /\blooks good\b/i,
  /\bno errors\b/i,
  /\btests pass\b/i,
  /\beverything works\b/i,
];

const formatIssue = (issue: z.ZodIssue): string => {
  const path = issue.path.length > 0 ? issue.path.join('.') : 'input';
  return `${path}: ${issue.message}`;
};

const createValidationResult = (
  issues: Array<Pick<ValidationResult, 'errors' | 'warnings'>>,
): Pick<ValidationResult, 'errors' | 'warnings'> => ({
  errors: issues.flatMap((issue) => issue.errors),
  warnings: issues.flatMap((issue) => issue.warnings),
});

const buildFingerprint = (input: Pick<IssueInput, 'title' | 'body'>): string => {
  const normalized = `${input.title}\n${input.body}`.trim().toLowerCase();
  const state = new Uint32Array([
    0x243f6a88,
    0x85a308d3,
    0x13198a2e,
    0x03707344,
    0xa4093822,
    0x299f31d0,
    0x082efa98,
    0xec4e6c89,
  ]);

  for (let index = 0; index < normalized.length; index += 1) {
    const codePoint = normalized.charCodeAt(index);
    const slot = index % state.length;
    state[slot] = Math.imul(state[slot] ^ codePoint, 2654435761) >>> 0;
    state[(slot + 3) % state.length] =
      (state[(slot + 3) % state.length] + ((codePoint << (slot % 8)) >>> 0)) >>> 0;
  }

  return Array.from(state, (part) => part.toString(16).padStart(8, '0')).join('');
};

const extractAcceptanceCriteriaSection = (body: string): AcceptanceCriteriaSection => {
  const lines = body.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^###?\s+acceptance criteria\s*$/i.test(line.trim()));

  if (headingIndex === -1) {
    return { found: false, items: [] };
  }

  const items: string[] = [];

  for (const line of lines.slice(headingIndex + 1)) {
    const trimmedLine = line.trim();

    if (/^#{1,6}\s+/.test(trimmedLine)) {
      break;
    }

    if (trimmedLine.startsWith('- ')) {
      items.push(trimmedLine.slice(2).trim());
    }
  }

  return { found: true, items };
};

const validateTitleLength: IssueValidator = (input) => {
  if (input.title.length < MIN_TITLE_LENGTH) {
    return { errors: [TITLE_TOO_SHORT_ERROR], warnings: [] };
  }

  if (input.title.length > MAX_TITLE_LENGTH) {
    return { errors: [TITLE_TOO_LONG_ERROR], warnings: [] };
  }

  return { errors: [], warnings: [] };
};

const validateGenericTitle: IssueValidator = (input) => ({
  errors: BLOCKED_GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(input.title))
    ? [GENERIC_TITLE_ERROR]
    : [],
  warnings: [],
});

const validateScopeSignals: IssueValidator = (input) => ({
  errors: [],
  warnings: BROAD_SCOPE_PATTERNS.some((pattern) => pattern.test(input.body))
    ? [BROAD_SCOPE_WARNING]
    : [],
});

const validateAcceptanceCriteria: IssueValidator = (input) => {
  const section = extractAcceptanceCriteriaSection(input.body);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!section.found) {
    errors.push(MISSING_ACCEPTANCE_CRITERIA_ERROR);
    return { errors, warnings };
  }

  if (section.items.length < MIN_ACCEPTANCE_CRITERIA_ITEMS) {
    errors.push(ACCEPTANCE_CRITERIA_COUNT_ERROR);
  }

  for (const item of section.items) {
    if (VAGUE_ACCEPTANCE_CRITERIA_PATTERNS.some((pattern) => pattern.test(item))) {
      warnings.push(`Acceptance Criteria item may be too vague: '${item}'`);
    }
  }

  return { errors, warnings };
};

const ISSUE_VALIDATORS: IssueValidator[] = [
  validateTitleLength,
  validateGenericTitle,
  validateScopeSignals,
  validateAcceptanceCriteria,
];

export const validateIssue = (input: IssueInput): ValidationResult => {
  const parsedInput = IssueInputSchema.safeParse(input);

  if (!parsedInput.success) {
    return {
      valid: false,
      errors: parsedInput.error.issues.map(formatIssue),
      warnings: [],
      fingerprint: '',
    };
  }

  const normalizedInput = parsedInput.data;
  const fingerprint = buildFingerprint(normalizedInput);

  const { errors, warnings } = createValidationResult(
    ISSUE_VALIDATORS.map((validator) => validator(normalizedInput)),
  );

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fingerprint,
    normalizedInput,
  };
};

export const __testUtils = {
  extractAcceptanceCriteriaSection,
};
