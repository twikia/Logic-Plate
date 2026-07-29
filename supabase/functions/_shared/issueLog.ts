type IssueSeverity = "info" | "warn" | "error";

export type IssueLogInput = {
  source: string;
  kind: string;
  message: string;
  severity?: IssueSeverity;
  detail?: Record<string, unknown>;
  cellId?: string | null;
  userId?: string | null;
};

type SupabaseLike = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
};

/** Fire-and-forget insert into app_issue_logs. Never throws. */
export async function logIssue(
  supabase: SupabaseLike,
  input: IssueLogInput,
): Promise<void> {
  try {
    const { error } = await supabase.from("app_issue_logs").insert({
      source: input.source,
      kind: input.kind,
      severity: input.severity ?? "error",
      message: input.message,
      detail: input.detail ?? {},
      cell_id: input.cellId ?? null,
      user_id: input.userId ?? null,
    });
    if (error) {
      console.warn(`[issueLog] insert failed: ${error.message}`);
    }
  } catch (err) {
    console.warn("[issueLog] insert threw:", err);
  }
}

export function pct(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((1000 * numerator) / denominator) / 10;
}
