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

const PLACEHOLDER_WARNING =
  'Validation currently enforces the schema only; rule-based issue checks are placeholders.';

const formatIssue = (issue: z.ZodIssue): string => {
  const path = issue.path.length > 0 ? issue.path.join('.') : 'input';
  return `${path}: ${issue.message}`;
};

export const validateIssue = (input: IssueInput): ValidationResult => {
  const parsedInput = IssueInputSchema.safeParse(input);

  if (!parsedInput.success) {
    return {
      valid: false,
      errors: parsedInput.error.issues.map(formatIssue),
      warnings: [],
    };
  }

  return {
    valid: true,
    errors: [],
    warnings: [PLACEHOLDER_WARNING],
    normalizedInput: parsedInput.data,
  };
};
