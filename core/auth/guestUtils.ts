import type { User } from '@supabase/supabase-js';

export function isGuestUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const u = user as User & { is_anonymous?: boolean };
  if (u.is_anonymous === true) return true;
  const ids = user.identities;
  if (!Array.isArray(ids) || ids.length === 0) return false;
  return ids.length === 1 && ids[0]?.provider === 'anonymous';
}
