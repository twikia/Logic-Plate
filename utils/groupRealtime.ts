import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/core/supabaseClient';

export function subscribeToSessionResponses(
  sessionId: string,
  onNewResponse: (response: Record<string, unknown>) => void
): RealtimeChannel {
  return supabase
    .channel(`responses:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'group_responses',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => onNewResponse(payload.new as Record<string, unknown>)
    )
    .subscribe();
}

export function subscribeToSessionVotes(
  sessionId: string,
  onNewVote: (vote: Record<string, unknown>) => void
): RealtimeChannel {
  return supabase
    .channel(`votes:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'group_votes',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => onNewVote(payload.new as Record<string, unknown>)
    )
    .subscribe();
}

export function subscribeToSessionStatus(
  sessionId: string,
  onStatusChange: (status: string) => void
): RealtimeChannel {
  return supabase
    .channel(`session:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'group_sessions',
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        const row = payload.new as { status?: string };
        if (typeof row.status === 'string') onStatusChange(row.status);
      }
    )
    .subscribe();
}
