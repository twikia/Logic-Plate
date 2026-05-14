'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type SessionRow = {
  id: string;
  code: string;
  status: string;
  expires_at: string;
  picks: unknown;
};

type RestaurantPick = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  gemini_summary?: string;
  aiOverview?: { summaryGoodBad?: string };
  groupScore?: number;
};

const DIETARY: { id: string; label: string }[] = [
  { id: 'vegetarian', label: '🌱 Vegetarian' },
  { id: 'vegan', label: '🌿 Vegan' },
  { id: 'halal', label: '☪️ Halal' },
  { id: 'kosher', label: '✡️ Kosher' },
  { id: 'gluten_free', label: '🌾 Gluten-free' },
  { id: 'dairy_free', label: '🥛 Dairy-free' },
  { id: 'nut_free', label: '🥜 Nut allergy' },
];

function normCode(raw: string) {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function oneLine(r: RestaurantPick) {
  const raw = r.gemini_summary ?? r.aiOverview?.summaryGoodBad ?? '';
  const line = raw.split('\n')[0]?.trim() ?? '';
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

export default function VoteByCodePage() {
  const params = useParams();
  const codeParam = typeof params.code === 'string' ? params.code : '';
  const code = normCode(codeParam);

  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [dietary, setDietary] = useState<string[]>([]);
  const [energy, setEnergy] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [responseCount, setResponseCount] = useState(0);
  const [picks, setPicks] = useState<RestaurantPick[]>([]);
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [hasVoted, setHasVoted] = useState(false);
  const [voteErr, setVoteErr] = useState<string | null>(null);
  const [responseErr, setResponseErr] = useState<string | null>(null);
  const [winnerPlace, setWinnerPlace] = useState<RestaurantPick | null>(null);

  const loadSession = useCallback(async () => {
    if (!code || code.length !== 6) {
      setErr('Invalid voting link.');
      return;
    }
    const { data, error } = await supabase
      .from('group_sessions')
      .select('id, code, status, expires_at, picks')
      .eq('code', code)
      .maybeSingle();
    if (error || !data) {
      setErr('Session not found.');
      return;
    }
    const exp = new Date(data.expires_at).getTime();
    if (exp <= Date.now() || data.status === 'expired') {
      setErr('This session has expired.');
      return;
    }
    setSession(data as SessionRow);
    if (data.status === 'voting') {
      const list = Array.isArray(data.picks) ? (data.picks as RestaurantPick[]) : [];
      setPicks(list);
      setStep(4);
    } else if (data.status === 'complete') {
      setStep(5);
    } else {
      setStep(0);
    }
    setErr(null);
  }, [code, supabase]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!session?.id) return;
    const ch = supabase
      .channel(`sess:${session.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          const row = payload.new as SessionRow;
          setSession((prev) => (prev ? { ...prev, ...row } : row));
          if (row.status === 'voting') {
            const list = Array.isArray(row.picks) ? (row.picks as RestaurantPick[]) : [];
            setPicks(list);
            setStep(4);
          }
          if (row.status === 'complete') setStep(5);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [session?.id, supabase]);

  useEffect(() => {
    if (!session?.id || step < 4) return;
    const refreshVotes = async () => {
      const { data } = await supabase
        .from('group_votes')
        .select('place_id')
        .eq('session_id', session.id);
      const next: Record<string, number> = {};
      (data ?? []).forEach((v: { place_id: string }) => {
        next[v.place_id] = (next[v.place_id] ?? 0) + 1;
      });
      setTallies(next);
    };
    void refreshVotes();
    const ch = supabase
      .channel(`votesw:${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_votes',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          const pid = (payload.new as { place_id?: string }).place_id;
          if (!pid) return;
          setTallies((prev) => ({ ...prev, [pid]: (prev[pid] ?? 0) + 1 }));
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [session?.id, session, step, supabase]);

  useEffect(() => {
    if (!session?.id || step !== 4) return;
    const refreshCount = async () => {
      const { count } = await supabase
        .from('group_responses')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session.id);
      setResponseCount(count ?? 0);
    };
    void refreshCount();
    const ch = supabase
      .channel(`respc:${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_responses',
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          void refreshCount();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [session?.id, session, step, supabase]);

  const toggleDiet = (id: string) => {
    if (id === 'none') setDietary([]);
    else setDietary((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const submitResponse = async (priority: string) => {
    if (!session || !energy || !mood) return;
    const { data, error } = await supabase
      .from('group_responses')
      .insert({
        session_id: session.id,
        voter_name: name.trim() || 'Guest',
        energy_level: energy,
        food_mood: mood,
        priority,
        dietary_vetoes: dietary,
      })
      .select('id')
      .single();
    if (error) {
      setResponseErr(
        `${error.message}${error.code ? ` (${error.code})` : ''}. Answers can only be submitted while the host is still collecting responses.`
      );
      return;
    }
    setResponseErr(null);
    setResponseId((data?.id as string) ?? null);
    setStep(4);
  };

  const castVote = async (placeId: string) => {
    if (!session || hasVoted) return;
    const { error } = await supabase.from('group_votes').insert({
      session_id: session.id,
      place_id: placeId,
      voter_response_id: responseId,
    });
    if (error) {
      setVoteErr(
        `${error.message}${error.code ? ` (${error.code})` : ''}. Votes are only accepted after the host starts the round (session status voting).`
      );
      return;
    }
    setVoteErr(null);
    setHasVoted(true);
  };

  useEffect(() => {
    if (step !== 5 || !session?.id) return;
    (async () => {
      const { data: sess } = await supabase
        .from('group_sessions')
        .select('picks')
        .eq('id', session.id)
        .single();
      const list = Array.isArray(sess?.picks) ? (sess?.picks as RestaurantPick[]) : [];
      const { data: votes } = await supabase
        .from('group_votes')
        .select('place_id')
        .eq('session_id', session.id);
      const next: Record<string, number> = {};
      (votes ?? []).forEach((v: { place_id: string }) => {
        next[v.place_id] = (next[v.place_id] ?? 0) + 1;
      });
      setTallies(next);
      const topId = Object.entries(next).sort((a, b) => b[1] - a[1])[0]?.[0];
      setWinnerPlace(topId ? list.find((p) => p.id === topId) ?? null : list[0] ?? null);
    })();
  }, [session?.id, step, supabase]);

  if (err) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
        <p className="text-center text-lg">{err}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8 max-w-lg mx-auto">
      {step === 0 ? (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Any hard dietary needs?</h1>
          <p className="text-zinc-400">(tap all that apply)</p>
          <input
            className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="Your name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            onClick={() => toggleDiet('none')}
            className="w-full min-h-[56px] rounded-full bg-zinc-900 border border-zinc-700 px-4 text-left text-lg">
            None — I eat anything
          </button>
          {DIETARY.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => toggleDiet(d.id)}
              className={`w-full min-h-[56px] rounded-full border px-4 text-left text-lg ${
                dietary.includes(d.id)
                  ? 'bg-sky-500 border-sky-400 text-zinc-950 font-semibold'
                  : 'bg-zinc-900 border-zinc-700'
              }`}>
              {d.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setStep(1)}
            className="w-full mt-4 min-h-[56px] rounded-full bg-sky-500 text-zinc-950 font-bold text-lg">
            Next →
          </button>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold mb-4">How are you feeling tonight?</h1>
          {(
            [
              ['low_key', '😴', 'Low key'],
              ['pretty_good', '😊', 'Pretty good'],
              ['lets_go', '🔥', "Let's go"],
            ] as const
          ).map(([id, em, lab]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setEnergy(id);
                setStep(2);
              }}
              className="w-full min-h-[56px] rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center gap-3 px-4 text-xl">
              <span>{em}</span>
              <span className="font-semibold">{lab}</span>
            </button>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold mb-4">What sounds good?</h1>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['warm', '🍜', 'Warm & filling'],
                ['fresh', '🥗', 'Fresh & light'],
                ['comfort', '🍕', 'Comfort food'],
                ['bold', '🌮', 'Bold flavors'],
              ] as const
            ).map(([id, em, lab]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMood(id);
                  setStep(3);
                }}
                className="min-h-[100px] rounded-2xl bg-zinc-900 border border-zinc-700 p-3 text-left">
                <div className="text-2xl mb-1">{em}</div>
                <div className="font-semibold">{lab}</div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setMood('surprise');
              setStep(3);
            }}
            className="w-full min-h-[56px] rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center gap-3 px-4 text-xl mt-2">
            <span>🤷</span>
            <span className="font-semibold">Surprise me</span>
          </button>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold mb-4">Tonight I care most about:</h1>
          {responseErr ? (
            <p className="text-red-400 text-sm mb-2" role="alert">
              {responseErr}
            </p>
          ) : null}
          {(
            [
              ['affordable', '💸', 'Keeping it affordable'],
              ['close', '📍', 'Something close by'],
              ['quality', '⭐', 'Somewhere really good'],
              ['new', '🎲', 'Trying something new'],
            ] as const
          ).map(([id, em, lab]) => (
            <button
              key={id}
              type="button"
              onClick={() => void submitResponse(id)}
              className="w-full min-h-[56px] rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center gap-3 px-4 text-xl">
              <span>{em}</span>
              <span className="font-semibold">{lab}</span>
            </button>
          ))}
        </div>
      ) : null}

      {step === 4 && session.status === 'collecting' ? (
        <div className="text-center space-y-6 py-8">
          <p className="text-3xl">✓</p>
          <h2 className="text-2xl font-bold">Vote in!</h2>
          <p className="text-zinc-400">Waiting for everyone…</p>
          <p className="text-lg">{responseCount} responded</p>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-all"
              style={{ width: `${Math.min(100, (responseCount / Math.max(2, responseCount)) * 100)}%` }}
            />
          </div>
          <p className="text-zinc-500">{"The host will start the vote when everyone's ready"}</p>
        </div>
      ) : null}

      {step === 4 && session.status === 'voting' ? (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Pick your favorite</h1>
          {voteErr ? (
            <p className="text-red-400 text-sm" role="alert">
              {voteErr}
            </p>
          ) : null}
          {picks.map((r) => {
            const v = tallies[r.id] ?? 0;
            const maxT = Math.max(...Object.values(tallies), 1);
            const w = Math.round((v / maxT) * 100);
            return (
              <div key={r.id} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
                <div className="font-bold text-lg">{r.displayName?.text ?? 'Restaurant'}</div>
                <p className="text-zinc-400 text-sm">{oneLine(r) || ' '}</p>
                {typeof r.groupScore === 'number' ? (
                  <p className="text-sky-400 font-semibold">Group match {r.groupScore}</p>
                ) : null}
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500" style={{ width: `${w}%` }} />
                </div>
                <p className="text-zinc-500 text-sm">{v} votes</p>
                <button
                  type="button"
                  disabled={hasVoted}
                  onClick={() => void castVote(r.id)}
                  className={`w-full min-h-[48px] rounded-full font-bold ${
                    hasVoted ? 'bg-zinc-800 text-zinc-500' : 'bg-sky-500 text-zinc-950'
                  }`}>
                  Vote for this →
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {step === 5 && winnerPlace ? (
        <div className="space-y-4 text-center py-6">
          <h1 className="text-2xl font-bold">{"You're going here 🎉"}</h1>
          <h2 className="text-xl font-semibold">{winnerPlace.displayName?.text}</h2>
          <p className="text-zinc-400">{oneLine(winnerPlace)}</p>
          {winnerPlace.formattedAddress ? (
            <p className="text-zinc-500 text-sm">{winnerPlace.formattedAddress}</p>
          ) : null}
          <a
            className="inline-block mt-4 min-h-[48px] leading-[48px] px-6 rounded-full bg-sky-500 text-zinc-950 font-bold"
            href={
              typeof winnerPlace.location?.latitude === 'number' &&
              typeof winnerPlace.location?.longitude === 'number'
                ? `https://maps.google.com/?q=${winnerPlace.location.latitude},${winnerPlace.location.longitude}`
                : '#'
            }>
            Open in Maps
          </a>
        </div>
      ) : null}

      {step === 5 && !winnerPlace ? (
        <div className="text-center py-12 text-zinc-400">Loading results…</div>
      ) : null}
    </div>
  );
}
