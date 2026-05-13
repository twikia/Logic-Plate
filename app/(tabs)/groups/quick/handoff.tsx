import { Redirect, useLocalSearchParams } from 'expo-router';

import {
  QuickVoteHandoffScreen,
  parseQuickVoteHandoffParams,
} from '@/components/QuickVoteHandoffScreen';

export default function QuickVoteHandoffRoute() {
  const raw = useLocalSearchParams();
  const p = parseQuickVoteHandoffParams(raw as Record<string, string | string[] | undefined>);
  if (!p) return <Redirect href="/groups/quick" />;
  return <QuickVoteHandoffScreen params={p} />;
}
