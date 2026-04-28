import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSearchRadius, setSearchRadius } from '../core/userSettings';

const STEPS = [1000, 1500, 2000, 2500, 3000, 4000, 5000];
const LABELS: Record<number, string> = {
  1000: '1 km', 1500: '1.5 km', 2000: '2 km',
  2500: '2.5 km', 3000: '3 km', 4000: '4 km', 5000: '5 km',
};

export default function SettingsScreen() {
  const router = useRouter();
  const [radius, setRadius] = useState(2000);

  useEffect(() => {
    getSearchRadius().then(setRadius);
  }, []);

  const selectRadius = async (val: number) => {
    setRadius(val);
    await setSearchRadius(val);
  };

  return (
    <LinearGradient colors={['#422046', '#FF9A6F']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.bg}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Search Radius</Text>
          <Text style={styles.sectionSub}>How far to search for restaurants</Text>

          <View style={styles.stepsRow}>
            {STEPS.map((step) => (
              <TouchableOpacity
                key={step}
                style={[styles.stepBtn, radius === step && styles.stepBtnActive]}
                onPress={() => selectRadius(step)}
              >
                <Text style={[styles.stepLabel, radius === step && styles.stepLabelActive]}>
                  {LABELS[step]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.radiusDisplay}>
            <Ionicons name="location" size={20} color="#F9A06F" />
            <Text style={styles.radiusValue}>Currently searching within {LABELS[radius]}</Text>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  section: {
    margin: 16, backgroundColor: 'rgba(30,15,30,0.5)',
    borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  sectionSub: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 },
  stepsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stepBtn: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  stepBtnActive: {
    backgroundColor: '#F97352',
    borderColor: '#F97352',
  },
  stepLabel: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  stepLabelActive: { color: '#FFFFFF' },
  radiusDisplay: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 20, backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12, padding: 12,
  },
  radiusValue: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
});
