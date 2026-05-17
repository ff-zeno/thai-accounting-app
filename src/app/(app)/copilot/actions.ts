"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import {
  executeCopilotTool,
  executeCopilotPrompt,
} from "@/lib/db/queries/copilot-tools";
import { registeredCopilotToolSchema } from "@/lib/copilot/tool-registry";
import type { RequiredRole } from "@/lib/copilot/tool-registry";

function stringField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function copilotRoleFromMembership(role: string | null | undefined): RequiredRole {
  if (role === "owner" || role === "admin") return "owner";
  if (role === "accountant") return "accountant";
  return "staff";
}

export async function runCopilotToolAction(formData: FormData) {
  const { orgId, userId, role } = await requireOrgAdmin();
  const query = stringField(formData, "query");
  const targetAccountCode = stringField(formData, "targetAccountCode");
  const confirmationText = stringField(formData, "confirmationText");
  const periodYear = stringField(formData, "periodYear");
  const periodMonth = stringField(formData, "periodMonth");

  try {
    const toolName = registeredCopilotToolSchema.parse(stringField(formData, "toolName"));
    const rawInput =
      toolName === "get_tax_position"
        ? { periodYear, periodMonth }
        : toolName === "list_open_exceptions"
          ? {}
          : toolName === "create_accountant_review_task"
            ? { summary: query, severity: "p2" }
            : toolName === "apply_recode_documents"
              ? { query, targetAccountCode, confirmationText, limit: 10 }
            : toolName === "preview_recode_documents"
              ? { query, targetAccountCode, limit: 10 }
              : { query, limit: 10 };

    await executeCopilotTool({
      orgId,
      userId,
      actorRole: copilotRoleFromMembership(role),
      toolName,
      rawInput,
    });
    revalidatePath("/copilot");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Copilot tool failed",
    };
  }
}

export async function runCopilotPromptAction(formData: FormData) {
  const { orgId, userId, role } = await requireOrgAdmin();
  try {
    await executeCopilotPrompt({
      orgId,
      userId,
      actorRole: copilotRoleFromMembership(role),
      prompt: stringField(formData, "prompt"),
    });
    revalidatePath("/copilot");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Copilot prompt failed",
    };
  }
}
