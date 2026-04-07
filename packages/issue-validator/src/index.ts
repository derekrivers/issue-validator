import { z } from 'zod';

export const IssueInputSchema = z
  .object({
    title: z.string().trim().min(1, 'title is required'),
    summary: z.string().trim().min(1, 'summary is required'),
    acceptanceCriteria: z.array(z.string().trim().min(1)).default([]),
    affectedPaths: z.array(z.string().trim().min(1)).default([]),
    requestedCapabilities: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

export type IssueInput = z.infer<typeof IssueInputSchema>;

export const ValidationResultSchema = z
  .object({
    valid: z.boolean(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    normalizedInput: IssueInputSchema.optional(),
  })
  .strict();

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

type IssueValidator = (input: IssueInput) => Pick<ValidationResult, 'errors' | 'warnings'>;

const MIN_TITLE_LENGTH = 10;
const MAX_TITLE_LENGTH = 200;

const TITLE_TOO_SHORT_ERROR = `title-length: title must be at least ${MIN_TITLE_LENGTH} characters long`;
const TITLE_TOO_LONG_ERROR = `title-length: title must be at most ${MAX_TITLE_LENGTH} characters long`;
const GENERIC_TITLE_ERROR = 'generic-title: title is too generic to be actionable';
const BROAD_SCOPE_WARNING =
  'scope-signal: issue may be too broad for a single actionable task';

const BLOCKED_GENERIC_TITLE_PATTERNS = [
  /^fix(?:\s+this)?$/i,
  /^bug$/i,
  /^help$/i,
  /^issue$/i,
  /^problem$/i,
  /^update$/i,
  /^misc(?:ellaneous)?$/i,
  /^todo$/i,
];

const BROAD_SCOPE_PATTERNS = [
  /\bend-to-end\b/i,
  /\boverhaul\b/i,
  /\brefactor everything\b/i,
  /\brewrite\b/i,
  /\bentire system\b/i,
  /\bwhole codebase\b/i,
  /\ball(?:\s+of)?\s+the\s+things\b/i,
  /\bcomplete(?:ly)?\b/i,
  /\bfrom scratch\b/i,
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

const validateScopeSignals: IssueValidator = (input) => {
  const searchableBody = [input.summary, ...input.acceptanceCriteria].join('\n');

  return {
    errors: [],
    warnings: BROAD_SCOPE_PATTERNS.some((pattern) => pattern.test(searchableBody))
      ? [BROAD_SCOPE_WARNING]
      : [],
  };
};

const ISSUE_VALIDATORS: IssueValidator[] = [
  validateTitleLength,
  validateGenericTitle,
  validateScopeSignals,
];

export const validateIssue = (input: IssueInput): ValidationResult => {
  const parsedInput = IssueInputSchema.safeParse(input);

  if (!parsedInput.success) {
    return {
      valid: false,
      errors: parsedInput.error.issues.map(formatIssue),
      warnings: [],
    };
  }

  const normalizedInput = parsedInput.data;
  const { errors, warnings } = createValidationResult(
    ISSUE_VALIDATORS.map((validator) => validator(normalizedInput)),
  );

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedInput,
  };
};
