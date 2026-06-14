import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/core/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BackButton } from '@/components/ui/BackButton';
import { useAppTheme } from '@/context/ThemeContext';
import { subscribeToSessionStatus } from '@/utils/groupRealtime';

const DIETARY_OPTIONS: { id: string; label: string }[] = [
  { id: 'vegetarian', label: '🌱 Vegetarian' },
  { id: 'vegan', label: '🌿 Vegan' },
  { id: 'halal', label: '☪️ Halal' },
  { id: 'kosher', label: '✡️ Kosher' },
  { id: 'gluten_free', label: '🌾 Gluten-free' },
  { id: 'dairy_free', label: '🥛 Dairy-free' },
  { id: 'nut_free', label: '🥜 Nut allergy' },
];

export default function VibeQuestionsScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    sessionId?: string;
    flow?: string;
    voterName?: string;
  }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const flow = typeof params.flow === 'string' ? params.flow : 'join';

  const [step, setStep] = useState(0);
  const [dietaryVetoes, setDietaryVetoes] = useState<string[]>([]);
  const [energyLevel, setEnergyLevel] = useState<string | null>(null);
  const [foodMood, setFoodMood] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const ch = subscribeToSessionStatus(sessionId, (status) => {
      if (status === 'expired') setSessionEnded(true);
    });
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);

  const toggleDietary = (id: string) => {
    if (id === 'none') {
      setDietaryVetoes([]);
      return;
    }
    setDietaryVetoes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const finishWithPriority = useCallback(
    async (priority: string) => {
      if (!sessionId || !energyLevel || !foodMood) return;
      setSubmitting(true);
      const { data, error } = await supabase
        .from('group_responses')
        .insert({
          session_id: sessionId,
          voter_name: 'Guest',
          energy_level: energyLevel,
          food_mood: foodMood,
          priority,
          dietary_vetoes: dietaryVetoes,
        })
        .select('id')
        .single();
      setSubmitting(false);
      if (error) {
        Alert.alert(
          'Could not save your answers',
          `${error.message}${error.code ? ` (${error.code})` : ''}\n\nIf the host already started voting or the session expired, ask them to start a new group.`
        );
        return;
      }
      const responseId = data?.id as string | undefined;
      if (flow === 'passphone' || flow === 'host') {
        if (flow === 'host' && responseId) {
          await AsyncStorage.setItem(`host_response_${sessionId}`, responseId);
        }
        router.back();
      } else {
        router.replace({
          pathname: '/groups/waiting',
          params: { sessionId, responseId: responseId ?? '' },
        });
      }
    },
    [dietaryVetoes, energyLevel, flow, foodMood, router, sessionId]
  );

  if (!sessionId) {
    return null;
  }

  if (sessionEnded) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
        <View style={styles.endedInner}>
          <Text style={[styles.endedIcon, { color: theme.subtext }]}>🔒</Text>
          <Text style={[styles.endedTitle, { color: theme.text }]}>Session Ended</Text>
          <Text style={[styles.endedSub, { color: theme.subtext }]}>The host ended this session.</Text>
          <TouchableOpacity
            style={[styles.endedBtn, { backgroundColor: theme.accent }]}
            onPress={() => router.back()}>
            <Text style={[styles.endedBtnText, { color: theme.accentOnColor ?? theme.gradient[0] }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const STEPS = ['Dietary needs', 'Energy', 'Craving', 'Priority'];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <View style={styles.topBar}>
        <BackButton onPress={() => (step > 0 ? setStep(step - 1) : router.back())} />
        <View style={styles.stepDots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i <= step ? theme.accent : theme.subtext + '33',
                  width: i === step ? 20 : 8,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.stepLabel, { color: theme.subtext }]}>
          {step + 1}/{STEPS.length}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <View style={styles.stepContent}>
            <Text style={[styles.h1, { color: theme.text }]}>Any dietary needs?</Text>
            <Text style={[styles.sub, { color: theme.subtext }]}>Select all that apply</Text>
            <TouchableOpacity
              style={[
                styles.optionCard,
                {
                  backgroundColor:
                    dietaryVetoes.length === 0 ? theme.accent + '22' : theme.cardBackground,
                  borderColor:
                    dietaryVetoes.length === 0 ? theme.accent : theme.subtext + '33',
                },
              ]}
              onPress={() => toggleDietary('none')}>
              <Text style={styles.optEmoji}>✅</Text>
              <Text style={[styles.optLabel, { color: theme.text }]}>None — I eat anything</Text>
            </TouchableOpacity>
            {DIETARY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: dietaryVetoes.includes(opt.id)
                      ? theme.accent + '22'
                      : theme.cardBackground,
                    borderColor: dietaryVetoes.includes(opt.id)
                      ? theme.accent
                      : theme.subtext + '33',
                  },
                ]}
                onPress={() => toggleDietary(opt.id)}>
                <Text style={styles.optEmoji}>{opt.label.split(' ')[0]}</Text>
                <Text style={[styles.optLabel, { color: theme.text }]}>
                  {opt.label.split(' ').slice(1).join(' ')}
                </Text>
                {dietaryVetoes.includes(opt.id) ? (
                  <Text style={[styles.checkMark, { color: theme.accent }]}>✓</Text>
                ) : null}
              </TouchableOpacity>
            ))}
            <View style={{ height: 80 }} />
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.stepContent}>
            <Text style={[styles.h1, { color: theme.text }]}>How are you feeling?</Text>
            <Text style={[styles.sub, { color: theme.subtext }]}>Pick your vibe tonight</Text>
            {(
              [
                ['low_key', '😴', 'Low key'],
                ['pretty_good', '😊', 'Pretty good'],
                ['lets_go', '🔥', "Let's go"],
              ] as const
            ).map(([id, emoji, label]) => (
              <TouchableOpacity
                key={id}
                style={[styles.bigCard, { backgroundColor: theme.cardBackground, borderColor: theme.subtext + '33' }]}
                onPress={() => {
                  setEnergyLevel(id);
                  setStep(2);
                }}>
                <Text style={styles.emoji}>{emoji}</Text>
                <Text style={[styles.bigLabel, { color: theme.text }]}>{label}</Text>
                <Text style={[styles.chevron, { color: theme.subtext }]}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.stepContent}>
            <Text style={[styles.h1, { color: theme.text }]}>What sounds good?</Text>
            <Text style={[styles.sub, { color: theme.subtext }]}>Pick a craving</Text>
            <View style={styles.grid2}>
              {(
                [
                  ['warm', '🍜', 'Warm & filling'],
                  ['fresh', '🥗', 'Fresh & light'],
                  ['comfort', '🍕', 'Comfort food'],
                  ['bold', '🌮', 'Bold flavors'],
                ] as const
              ).map(([id, emoji, label]) => (
                <TouchableOpacity
                  key={id}
                  style={[styles.gridCell, { backgroundColor: theme.cardBackground, borderColor: theme.subtext + '33' }]}
                  onPress={() => {
                    setFoodMood(id);
                    setStep(3);
                  }}>
                  <Text style={styles.gridEmoji}>{emoji}</Text>
                  <Text style={[styles.gridLabel, { color: theme.text }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.bigCard, { backgroundColor: theme.cardBackground, borderColor: theme.subtext + '33', marginTop: 12 }]}
              onPress={() => {
                setFoodMood('surprise');
                setStep(3);
              }}>
              <Text style={styles.emoji}>🤷</Text>
              <Text style={[styles.bigLabel, { color: theme.text }]}>Surprise me</Text>
              <Text style={[styles.chevron, { color: theme.subtext }]}>›</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.stepContent}>
            <Text style={[styles.h1, { color: theme.text }]}>Tonight I care most about:</Text>
            <Text style={[styles.sub, { color: theme.subtext }]}>This shapes your picks</Text>
            {(
              [
                ['affordable', '💸', 'Keeping it affordable'],
                ['close', '📍', 'Something close by'],
                ['quality', '⭐', 'Somewhere really good'],
                ['new', '🎲', 'Trying something new'],
              ] as const
            ).map(([id, emoji, label]) => (
              <TouchableOpacity
                key={id}
                style={[styles.bigCard, { backgroundColor: theme.cardBackground, borderColor: theme.subtext + '33' }]}
                disabled={submitting}
                onPress={() => void finishWithPriority(id)}>
                <Text style={styles.emoji}>{emoji}</Text>
                <Text style={[styles.bigLabel, { color: theme.text }]}>{label}</Text>
                <Text style={[styles.chevron, { color: theme.subtext }]}>›</Text>
              </TouchableOpacity>
            ))}
            {submitting ? (
              <Text style={[styles.submittingText, { color: theme.subtext }]}>Submitting…</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {step === 0 ? (
        <TouchableOpacity
          style={[styles.floatingNext, { backgroundColor: theme.accent }]}
          onPress={() => setStep(1)}>
          <Text style={[styles.floatingNextText, { color: theme.accentOnColor ?? theme.gradient[0] }]}>Next →</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 8,
  },
  stepDots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  stepLabel: { fontSize: 13, fontWeight: '600' },
  scroll: { flexGrow: 1 },
  stepContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  h1: { fontSize: 26, fontWeight: '800', lineHeight: 32, marginBottom: 6 },
  sub: { fontSize: 15, marginBottom: 20 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 10,
    gap: 12,
  },
  optEmoji: { fontSize: 22 },
  optLabel: { fontSize: 16, fontWeight: '600', flex: 1 },
  checkMark: { fontSize: 18, fontWeight: '800' },
  bigCard: {
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  emoji: { fontSize: 28, width: 36, textAlign: 'center' },
  bigLabel: { fontSize: 18, fontWeight: '700', flex: 1 },
  chevron: { fontSize: 22, fontWeight: '300' },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridCell: {
    width: '47%',
    minHeight: 110,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 16,
    justifyContent: 'flex-end',
  },
  gridEmoji: { fontSize: 30, marginBottom: 10 },
  gridLabel: { fontSize: 15, fontWeight: '700' },
  submittingText: { textAlign: 'center', marginTop: 16, fontSize: 15 },
  floatingNext: {
    position: 'absolute',
    bottom: 28,
    right: 20,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 30,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  floatingNextText: { fontWeight: '800', fontSize: 17 },
  endedInner: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  endedIcon: { fontSize: 48, marginBottom: 16 },
  endedTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  endedSub: { fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 32 },
  endedBtn: { paddingVertical: 14, paddingHorizontal: 36, borderRadius: 16 },
  endedBtnText: { fontSize: 16, fontWeight: '800' },
});
