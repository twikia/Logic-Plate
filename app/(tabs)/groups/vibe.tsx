import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/core/supabaseClient';
import { useAppTheme } from '@/context/ThemeContext';

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
  const initialName = typeof params.voterName === 'string' ? params.voterName : '';

  const [step, setStep] = useState(0);
  const [guestName, setGuestName] = useState(initialName);
  const [dietaryVetoes, setDietaryVetoes] = useState<string[]>([]);
  const [energyLevel, setEnergyLevel] = useState<string | null>(null);
  const [foodMood, setFoodMood] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      const voterName = guestName.trim() || 'Guest';
      const { data, error } = await supabase
        .from('group_responses')
        .insert({
          session_id: sessionId,
          voter_name: voterName,
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
      if (flow === 'passphone') {
        router.back();
      } else {
        router.replace({
          pathname: '/groups/waiting',
          params: { sessionId, responseId: responseId ?? '' },
        });
      }
    },
    [dietaryVetoes, energyLevel, flow, foodMood, guestName, router, sessionId]
  );

  if (!sessionId) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>Back</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {step === 0 ? (
          <>
            <Text style={[styles.h1, { color: theme.text }]}>Any hard dietary needs?</Text>
            <Text style={[styles.sub, { color: theme.subtext }]}>(tap all that apply)</Text>
            <TextInput
              style={[
                styles.nameIn,
                { color: theme.text, borderColor: theme.subtext + '44', backgroundColor: theme.cardBackground },
              ]}
              placeholder="Your name (optional)"
              placeholderTextColor={theme.subtext}
              value={guestName}
              onChangeText={setGuestName}
            />
            <TouchableOpacity
              style={[styles.card, { backgroundColor: theme.cardBackground }]}
              onPress={() => toggleDietary('none')}>
              <Text style={[styles.cardText, { color: theme.text }]}>None — I eat anything</Text>
            </TouchableOpacity>
            {DIETARY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: dietaryVetoes.includes(opt.id) ? theme.accent : theme.cardBackground,
                  },
                ]}
                onPress={() => toggleDietary(opt.id)}>
                <Text style={[styles.cardText, { color: theme.text }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.next, { backgroundColor: theme.accent }]}
              onPress={() => setStep(1)}>
              <Text style={[styles.nextText, { color: theme.text }]}>Next →</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={[styles.h1, { color: theme.text }]}>How are you feeling tonight?</Text>
            {(
              [
                ['low_key', '😴', 'Low key'],
                ['pretty_good', '😊', 'Pretty good'],
                ['lets_go', '🔥', "Let's go"],
              ] as const
            ).map(([id, emoji, label]) => (
              <TouchableOpacity
                key={id}
                style={[styles.bigCard, { backgroundColor: theme.cardBackground }]}
                onPress={() => {
                  setEnergyLevel(id);
                  setStep(2);
                }}>
                <Text style={styles.emoji}>{emoji}</Text>
                <Text style={[styles.bigLabel, { color: theme.text }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={[styles.h1, { color: theme.text }]}>What sounds good?</Text>
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
                  style={[styles.gridCell, { backgroundColor: theme.cardBackground }]}
                  onPress={() => {
                    setFoodMood(id);
                    setStep(3);
                  }}>
                  <Text style={styles.emojiSm}>{emoji}</Text>
                  <Text style={[styles.gridLabel, { color: theme.text }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.bigCard, { backgroundColor: theme.cardBackground, marginTop: 12 }]}
              onPress={() => {
                setFoodMood('surprise');
                setStep(3);
              }}>
              <Text style={styles.emoji}>🤷</Text>
              <Text style={[styles.bigLabel, { color: theme.text }]}>Surprise me</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={[styles.h1, { color: theme.text }]}>Tonight I care most about:</Text>
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
                style={[styles.bigCard, { backgroundColor: theme.cardBackground }]}
                disabled={submitting}
                onPress={() => void finishWithPriority(id)}>
                <Text style={styles.emoji}>{emoji}</Text>
                <Text style={[styles.bigLabel, { color: theme.text }]}>{label}</Text>
              </TouchableOpacity>
            ))}
            {submitting ? <Text style={{ color: theme.subtext, marginTop: 12 }}>Submitting…</Text> : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 48 },
  h1: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  sub: { fontSize: 15, marginBottom: 12 },
  nameIn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
  },
  card: { paddingVertical: 16, paddingHorizontal: 14, borderRadius: 14, marginBottom: 10 },
  cardText: { fontSize: 16, fontWeight: '600' },
  next: { marginTop: 20, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  nextText: { fontSize: 17, fontWeight: '800' },
  bigCard: {
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emoji: { fontSize: 28 },
  bigLabel: { fontSize: 18, fontWeight: '700', flex: 1 },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  gridCell: {
    width: '47%',
    minHeight: 100,
    borderRadius: 16,
    padding: 14,
    justifyContent: 'center',
  },
  emojiSm: { fontSize: 24, marginBottom: 8 },
  gridLabel: { fontSize: 15, fontWeight: '700' },
});
