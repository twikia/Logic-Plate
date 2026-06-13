'use client';

import { fetchPhotoUrlsForPlaces } from '@/lib/restaurantPhotos';
import {
  formatDistance,
  formatRestaurantCostLabel,
  oneLineSummary,
  pickPhotoUrl,
  type RestaurantPick,
} from '@/lib/restaurantDisplay';
import { getSupabaseBrowserClient, getSupabaseConfigError } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SessionRow = {
  id: string;
  code: string;
  status: string;
  expires_at: string;
  picks: unknown;
};

const DIETARY: { id: string; label: string; emoji: string }[] = [
  { id: 'vegetarian', label: 'Vegetarian', emoji: '🌱' },
  { id: 'vegan', label: 'Vegan', emoji: '🌿' },
  { id: 'halal', label: 'Halal', emoji: '☪️' },
  { id: 'kosher', label: 'Kosher', emoji: '✡️' },
  { id: 'gluten_free', label: 'Gluten-free', emoji: '🌾' },
  { id: 'dairy_free', label: 'Dairy-free', emoji: '🥛' },
  { id: 'nut_free', label: 'Nut allergy', emoji: '🥜' },
];

function normCode(raw: string) {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function responseStorageKey(sessionId: string) {
  return `pb_vote_response_${sessionId}`;
}

export default function VoteByCodePage() {
  const params = useParams();
  const codeParam = typeof params.code === 'string' ? params.code : '';
  const code = normCode(codeParam);
  const configError = getSupabaseConfigError();

  const supabase = useMemo(() => (configError ? null : getSupabaseBrowserClient()), [configError]);

  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [step, setStep] = useState(0);
  const [dietary, setDietary] = useState<string[]>([]);
  const [energy, setEnergy] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [responseCount, setResponseCount] = useState(0);
  const [picks, setPicks] = useState<RestaurantPick[]>([]);
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [hasVoted, setHasVoted] = useState(false);
  const [votedForId, setVotedForId] = useState<string | null>(null);
  const [voteErr, setVoteErr] = useState<string | null>(null);
  const [responseErr, setResponseErr] = useState<string | null>(null);
  const [winnerPlace, setWinnerPlace] = useState<RestaurantPick | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const hasAutoEnded = useRef(false);

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadSession = useCallback(async () => {
    if (!supabase) return;
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
    const storedResponseId =
      typeof window !== 'undefined'
        ? window.sessionStorage.getItem(responseStorageKey(data.id))
        : null;
    if (storedResponseId) setResponseId(storedResponseId);
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
    if (!supabase || picks.length === 0) return;
    let cancelled = false;
    void (async () => {
      const cached = await fetchPhotoUrlsForPlaces(
        supabase,
        picks.map((p) => p.id)
      );
      if (!cancelled) setPhotoUrls(cached);
    })();
    return () => {
      cancelled = true;
    };
  }, [picks, supabase]);

  useEffect(() => {
    if (!supabase) return;
    void loadSession();
  }, [loadSession, supabase]);

  useEffect(() => {
    if (!session?.expires_at) return;
    const ms = new Date(session.expires_at).getTime() - Date.now();
    if (ms <= 0) return;
    const t = window.setTimeout(() => {
      setErr('This session has timed out.');
    }, ms);
    return () => clearTimeout(t);
  }, [session?.expires_at]);

  useEffect(() => {
    if (!supabase || !session?.id) return;
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
          if (row.status === 'expired') setErr('The host ended this session.');
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [session?.id, supabase]);

  useEffect(() => {
    if (!supabase || !session?.id || step < 4) return;
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
    if (!supabase || !session?.id || step !== 4) return;
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

  const totalVotesCast = useMemo(
    () => Object.values(tallies).reduce((a, b) => a + b, 0),
    [tallies]
  );

  useEffect(() => {
    if (!supabase || !session?.id) return;
    if (!hasAutoEnded.current && responseCount > 0 && totalVotesCast >= responseCount) {
      hasAutoEnded.current = true;
      void supabase.from('group_sessions').update({ status: 'complete' }).eq('id', session.id);
    }
  }, [responseCount, session?.id, supabase, totalVotesCast]);

  const toggleDiet = (id: string) => {
    if (id === 'none') setDietary([]);
    else setDietary((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const submitResponse = async (priority: string) => {
    if (!supabase || !session || !energy || !mood) return;
    const { data, error } = await supabase
      .from('group_responses')
      .insert({
        session_id: session.id,
        voter_name: 'Guest',
        energy_level: energy,
        food_mood: mood,
        priority,
        dietary_vetoes: dietary,
      })
      .select('id')
      .single();
    if (error) {
      const { data: latest } = await supabase
        .from('group_sessions')
        .select('status')
        .eq('id', session.id)
        .maybeSingle();
      if (latest?.status === 'voting') {
        setResponseErr(null);
        setStep(4);
        return;
      }
      setResponseErr(
        `${error.message}${error.code ? ` (${error.code})` : ''}. Answers can only be submitted while the host is still collecting responses.`
      );
      return;
    }
    const nextResponseId = (data?.id as string) ?? null;
    setResponseErr(null);
    setResponseId(nextResponseId);
    if (nextResponseId && typeof window !== 'undefined') {
      window.sessionStorage.setItem(responseStorageKey(session.id), nextResponseId);
    }
    setStep(4);
  };

  const castVote = async (placeId: string) => {
    if (!supabase || !session || hasVoted) return;
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
    setVotedForId(placeId);
  };

  useEffect(() => {
    if (!supabase || step !== 5 || !session?.id) return;
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
      const winner = topId ? list.find((p) => p.id === topId) ?? null : list[0] ?? null;
      setWinnerPlace(winner);
      const urls = await fetchPhotoUrlsForPlaces(
        supabase,
        list.map((p) => p.id)
      );
      setPhotoUrls(urls);
    })();
  }, [session?.id, step, supabase]);

  const STEPS = ['Dietary', 'Energy', 'Craving', 'Priority'];

  if (configError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-zinc-950 to-slate-900 text-white flex items-center justify-center p-6">
        <p className="text-center text-lg max-w-md text-zinc-400">{configError}</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-zinc-950 to-slate-900 text-white flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <p className="text-5xl">🔒</p>
          <p className="text-xl font-bold">{err}</p>
          <p className="text-zinc-500 text-sm">This session is no longer active.</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-zinc-950 to-slate-900 text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-2 border-sky-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-zinc-400">Loading session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-zinc-950 to-slate-900 text-zinc-100">
      {/* Steps 0–3: question screens */}
      {step < 4 ? (
        <div className="min-h-screen flex flex-col">
          {/* Step indicator */}
          <div className="flex items-center justify-between px-6 pt-8 pb-4">
            <button
              type="button"
              onClick={() => step > 0 ? setStep(step - 1) : undefined}
              className={`text-sky-400 font-semibold text-sm ${step === 0 ? 'invisible' : ''}`}>
              ← Back
            </button>
            <div className="flex gap-2 items-center">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all ${
                    i <= step
                      ? 'bg-sky-500'
                      : 'bg-zinc-700'
                  } ${i === step ? 'w-6' : 'w-2'}`}
                />
              ))}
            </div>
            <span className="text-zinc-500 text-sm font-semibold">{step + 1}/{STEPS.length}</span>
          </div>

          {/* Step content */}
          <div className="flex-1 flex flex-col px-5 pb-24 max-w-lg mx-auto w-full">
            {step === 0 ? (
              <>
                <h1 className="text-3xl font-extrabold mt-4 mb-2">Any dietary needs?</h1>
                <p className="text-zinc-400 mb-6">Select all that apply</p>
                <button
                  type="button"
                  onClick={() => toggleDiet('none')}
                  className={`flex items-center gap-3 w-full min-h-[60px] rounded-2xl border-2 px-4 mb-3 transition-all ${
                    dietary.length === 0
                      ? 'bg-sky-500/15 border-sky-500 text-white'
                      : 'bg-zinc-900/60 border-zinc-700/60 text-zinc-300'
                  }`}>
                  <span className="text-2xl">✅</span>
                  <span className="font-semibold text-lg flex-1 text-left">None — I eat anything</span>
                  {dietary.length === 0 ? <span className="text-sky-400 font-bold">✓</span> : null}
                </button>
                {DIETARY.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDiet(d.id)}
                    className={`flex items-center gap-3 w-full min-h-[60px] rounded-2xl border-2 px-4 mb-3 transition-all ${
                      dietary.includes(d.id)
                        ? 'bg-sky-500/15 border-sky-500 text-white'
                        : 'bg-zinc-900/60 border-zinc-700/60 text-zinc-300'
                    }`}>
                    <span className="text-2xl">{d.emoji}</span>
                    <span className="font-semibold text-lg flex-1 text-left">{d.label}</span>
                    {dietary.includes(d.id) ? <span className="text-sky-400 font-bold">✓</span> : null}
                  </button>
                ))}
              </>
            ) : null}

            {step === 1 ? (
              <>
                <h1 className="text-3xl font-extrabold mt-4 mb-2">How are you feeling?</h1>
                <p className="text-zinc-400 mb-6">Pick your vibe tonight</p>
                {(
                  [
                    ['low_key', '😴', 'Low key', 'Chill and relaxed'],
                    ['pretty_good', '😊', 'Pretty good', "Feeling decent"],
                    ['lets_go', '🔥', "Let's go", 'Ready for anything'],
                  ] as const
                ).map(([id, em, lab, sub]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setEnergy(id);
                      setStep(2);
                    }}
                    className="flex items-center gap-4 w-full min-h-[72px] rounded-2xl bg-zinc-900/60 border-2 border-zinc-700/60 hover:border-sky-500/60 hover:bg-zinc-800/60 px-5 mb-3 text-left transition-all">
                    <span className="text-3xl">{em}</span>
                    <div>
                      <div className="font-bold text-xl">{lab}</div>
                      <div className="text-zinc-500 text-sm">{sub}</div>
                    </div>
                    <span className="ml-auto text-zinc-600 text-xl">›</span>
                  </button>
                ))}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h1 className="text-3xl font-extrabold mt-4 mb-2">What sounds good?</h1>
                <p className="text-zinc-400 mb-6">Pick a craving</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
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
                      className="min-h-[110px] rounded-2xl bg-zinc-900/60 border-2 border-zinc-700/60 hover:border-sky-500/60 hover:bg-zinc-800/60 p-4 text-left flex flex-col justify-end transition-all">
                      <div className="text-3xl mb-2">{em}</div>
                      <div className="font-bold text-base">{lab}</div>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMood('surprise');
                    setStep(3);
                  }}
                  className="flex items-center gap-4 w-full min-h-[72px] rounded-2xl bg-zinc-900/60 border-2 border-zinc-700/60 hover:border-sky-500/60 px-5 text-left transition-all">
                  <span className="text-3xl">🤷</span>
                  <span className="font-bold text-xl">Surprise me</span>
                  <span className="ml-auto text-zinc-600 text-xl">›</span>
                </button>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <h1 className="text-3xl font-extrabold mt-4 mb-2">Tonight I care most about:</h1>
                <p className="text-zinc-400 mb-6">This shapes your picks</p>
                {responseErr ? (
                  <p className="text-red-400 text-sm mb-4 p-3 bg-red-900/20 rounded-xl" role="alert">
                    {responseErr}
                  </p>
                ) : null}
                {(
                  [
                    ['affordable', '💸', 'Keeping it affordable', 'Budget-friendly spots'],
                    ['close', '📍', 'Something close by', 'Minimize travel time'],
                    ['quality', '⭐', 'Somewhere really good', 'Worth the trip'],
                    ['new', '🎲', 'Trying something new', 'Explore the unknown'],
                  ] as const
                ).map(([id, em, lab, sub]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => void submitResponse(id)}
                    className="flex items-center gap-4 w-full min-h-[72px] rounded-2xl bg-zinc-900/60 border-2 border-zinc-700/60 hover:border-sky-500/60 hover:bg-zinc-800/60 px-5 mb-3 text-left transition-all">
                    <span className="text-3xl">{em}</span>
                    <div>
                      <div className="font-bold text-xl">{lab}</div>
                      <div className="text-zinc-500 text-sm">{sub}</div>
                    </div>
                    <span className="ml-auto text-zinc-600 text-xl">›</span>
                  </button>
                ))}
              </>
            ) : null}
          </div>

          {/* Floating Next button (step 0 only) */}
          {step === 0 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="fixed bottom-6 right-6 bg-sky-500 text-zinc-950 font-extrabold text-lg px-7 py-4 rounded-full shadow-xl shadow-sky-500/30 hover:bg-sky-400 transition-all z-50">
              Next →
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Step 4: Waiting */}
      {step === 4 && session.status === 'collecting' ? (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="w-20 h-20 rounded-full bg-sky-500/15 border-2 border-sky-500/40 flex items-center justify-center mb-6">
            <span className="text-4xl font-bold text-sky-400">✓</span>
          </div>
          <h2 className="text-3xl font-extrabold mb-2">You&apos;re in!</h2>
          <p className="text-zinc-400 mb-8">Your preferences have been saved</p>
          <div className="bg-zinc-900/60 rounded-2xl px-12 py-6 mb-6">
            <p className="text-5xl font-extrabold text-sky-400">{responseCount}</p>
            <p className="text-zinc-400 mt-1">{responseCount === 1 ? 'person ready' : 'people ready'}</p>
          </div>
          <div className="w-full max-w-xs h-2 bg-zinc-800 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-sky-500 transition-all duration-500"
              style={{ width: `${Math.min(100, (responseCount / Math.max(2, responseCount)) * 100)}%` }}
            />
          </div>
          <p className="text-zinc-500 text-sm max-w-xs">
            {"Waiting for the host to start the vote…"}
          </p>
          <div className="mt-8 w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        </div>
      ) : null}

      {/* Step 4: Voting */}
      {step === 4 && session.status === 'voting' ? (
        <div className="max-w-lg mx-auto px-4 py-8">
          <h1 className="text-2xl font-extrabold mb-1">Pick your favorite</h1>
          <p className="text-zinc-400 text-sm mb-6">
            {hasVoted ? 'Your vote is in ✓' : 'Tap a card to expand · tap the box to vote'}
          </p>
          {voteErr ? (
            <p className="text-red-400 text-sm mb-4 p-3 bg-red-900/20 rounded-xl" role="alert">
              {voteErr}
            </p>
          ) : null}
          <div className="space-y-3">
            {picks.map((r) => {
              const v = tallies[r.id] ?? 0;
              const maxT = Math.max(...Object.values(tallies), 1);
              const w = Math.round((v / maxT) * 100);
              const photo = pickPhotoUrl(r, photoUrls[r.id] ?? null);
              const cost = formatRestaurantCostLabel(r);
              const dist =
                typeof r.distanceMeters === 'number' ? formatDistance(r.distanceMeters) : '';
              const metaParts = [
                typeof r.rating === 'number' ? `${r.rating.toFixed(1)} ★` : '',
                dist,
                cost,
              ].filter(Boolean);
              const isExpanded = expandedCards.has(r.id);
              const isVotedFor = votedForId === r.id;
              const summary = oneLineSummary(r);
              return (
                <div
                  key={r.id}
                  onClick={() => toggleCard(r.id)}
                  className={`rounded-2xl bg-zinc-900/70 border-2 p-4 cursor-pointer transition-all ${
                    isExpanded ? 'border-sky-500/50' : 'border-zinc-800/80 hover:border-zinc-700'
                  }`}>
                  <div className="flex gap-3 items-center">
                    {photo ? (
                      <img
                        src={photo}
                        alt=""
                        className="w-16 h-16 rounded-xl object-cover shrink-0 bg-zinc-800"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-zinc-800 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-base leading-snug">{r.displayName?.text ?? 'Restaurant'}</div>
                      {metaParts.length > 0 ? (
                        <p className="text-zinc-400 text-sm mt-0.5">{metaParts.join('  ·  ')}</p>
                      ) : null}
                      <p className="text-sky-400 text-xs font-semibold mt-1">
                        {isExpanded ? 'Less ▲' : 'Details ▾'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={hasVoted}
                      onClick={(e) => { e.stopPropagation(); void castVote(r.id); }}
                      className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                        isVotedFor
                          ? 'border-sky-500 bg-sky-500/20'
                          : hasVoted
                          ? 'border-zinc-700 bg-transparent cursor-not-allowed'
                          : 'border-zinc-600 bg-transparent hover:border-sky-500 cursor-pointer'
                      }`}>
                      {isVotedFor ? <span className="text-sky-400 font-bold text-base">✓</span> : null}
                    </button>
                  </div>
                  {isExpanded ? (
                    <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-3">
                      {summary ? (
                        <p className="text-zinc-300 text-sm leading-relaxed">{summary}</p>
                      ) : null}
                      {typeof r.groupScore === 'number' ? (
                        <p className="text-sky-400 font-semibold text-sm">Group match {r.groupScore}</p>
                      ) : null}
                      <div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky-500 transition-all duration-500"
                            style={{ width: `${w}%` }}
                          />
                        </div>
                        <p className="text-zinc-500 text-xs mt-1.5">{v} {v === 1 ? 'vote' : 'votes'}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Step 5: Winner */}
      {step === 5 && winnerPlace ? (
        <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10 text-center max-w-lg mx-auto">
          <p className="text-6xl mb-4">🎉</p>
          <h1 className="text-3xl font-extrabold mb-6">{"You're going here!"}</h1>
          <div className="w-full bg-zinc-900/70 rounded-2xl p-5 space-y-3 mb-6">
            {pickPhotoUrl(winnerPlace, photoUrls[winnerPlace.id] ?? null) ? (
              <img
                src={pickPhotoUrl(winnerPlace, photoUrls[winnerPlace.id] ?? null) ?? ''}
                alt=""
                className="w-full rounded-xl object-cover aspect-[16/9] bg-zinc-800"
              />
            ) : null}
            <h2 className="text-2xl font-bold">{winnerPlace.displayName?.text}</h2>
            {oneLineSummary(winnerPlace) ? (
              <p className="text-zinc-400 text-sm">{oneLineSummary(winnerPlace)}</p>
            ) : null}
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {typeof winnerPlace.distanceMeters === 'number' ? (
                <span className="bg-zinc-800 text-zinc-300 text-sm font-semibold px-3 py-1.5 rounded-full">
                  📍 {formatDistance(winnerPlace.distanceMeters)}
                </span>
              ) : null}
              {formatRestaurantCostLabel(winnerPlace) ? (
                <span className="bg-zinc-800 text-zinc-300 text-sm font-semibold px-3 py-1.5 rounded-full">
                  💸 {formatRestaurantCostLabel(winnerPlace)}
                </span>
              ) : null}
            </div>
          </div>
          <a
            className="w-full bg-sky-500 text-zinc-950 font-extrabold text-lg py-4 rounded-2xl text-center hover:bg-sky-400 transition-all"
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
        <div className="min-h-screen flex items-center justify-center text-zinc-400">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 rounded-full border-2 border-sky-500 border-t-transparent animate-spin mx-auto" />
            <p>Loading results…</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
