import { supabase } from './supabaseClient';

export type AppIssueSeverity = 'info' | 'warn' | 'error';

export type AppIssueInput = {
  kind: string;
  message: string;
  severity?: AppIssueSeverity;
  source?: string;
  detail?: Record<string, unknown>;
  cellId?: string | null;
  userId?: string | null;
};

/** Fire-and-forget issue telemetry via edge function. Never throws. */
export function logAppIssue(input: AppIssueInput): void {
  void (async () => {
    try {
      await supabase.functions.invoke('log-app-issue', {
        body: {
          kind: input.kind,
          message: input.message,
          severity: input.severity ?? 'error',
          source: input.source ?? 'client',
          detail: input.detail ?? {},
          cellId: input.cellId ?? null,
          userId: input.userId ?? null,
        },
        headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
      });
    } catch {
      // never disrupt the app for telemetry
    }
  })();
}
