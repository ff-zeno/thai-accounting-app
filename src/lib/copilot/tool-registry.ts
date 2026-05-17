import { z } from "zod";

export type ToolRisk = "read" | "draft" | "write" | "bulk_write" | "filing_impact";
export type RequiredRole = "owner" | "accountant" | "staff";

export interface ToolContext {
  orgId: string;
  userId: string;
  role: RequiredRole;
}

export interface AccountingTool<I, O> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  requiredRole: RequiredRole;
  risk: ToolRisk;
  previewRequired: boolean;
  execute(input: I, ctx: ToolContext): Promise<O>;
}

export const searchInputSchema = z.object({
  query: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const emptyInputSchema = z.object({});

export const taxPositionInputSchema = z.object({
  periodYear: z.coerce.number().int().min(2000).max(2100),
  periodMonth: z.coerce.number().int().min(1).max(12),
});

export const previewRecodeDocumentsInputSchema = z.object({
  query: z.string().trim().min(1).max(120),
  targetAccountCode: z.string().trim().min(3).max(20),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const createReviewTaskInputSchema = z.object({
  summary: z.string().trim().min(1).max(240),
  severity: z.enum(["info", "p2", "p1", "p0"]).default("p2"),
  entityType: z.string().trim().min(1).max(80).default("copilot_review_task"),
  notes: z.string().trim().max(1000).optional(),
});

export const applyRecodeDocumentsInputSchema = z.object({
  query: z.string().trim().min(1).max(120),
  targetAccountCode: z.string().trim().min(3).max(20),
  confirmationText: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const genericRowsOutputSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
});

export const summaryOutputSchema = z.object({
  summary: z.record(z.string(), z.unknown()),
});

export const registeredCopilotToolSchema = z.enum([
  "search_documents",
  "search_vendors",
  "search_accounts",
  "list_open_exceptions",
  "get_tax_position",
  "preview_recode_documents",
  "create_accountant_review_task",
  "apply_recode_documents",
]);

export type RegisteredCopilotTool = z.infer<typeof registeredCopilotToolSchema>;
