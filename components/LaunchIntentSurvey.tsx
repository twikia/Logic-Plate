import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Dimensions } from 'react-native';
import { useAppTheme } from '@/context/ThemeContext';
import { TouchableOpacity } from '@/components/ui/soundPressable';
import { LaunchIntentCategory, setLaunchIntent, getLaunchIntent } from '@/core/launchIntent';
import { hapticSuccess } from '@/core/haptics';

const { width } = Dimensions.get('window');

export function LaunchIntentSurvey() {
  const { theme } = useAppTheme();
  const [visible, setVisible] = useState(false);
  const hour = new Date().getHours();
  const isEvening = hour >= 17 || hour < 4;

  useEffect(() => {
    // Only show if not set yet
    if (!getLaunchIntent()) {
      setVisible(true);
    }
  }, []);

  const handleSelect = (intent: LaunchIntentCategory) => {
    hapticSuccess();
    setLaunchIntent(intent);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade">
      <View style={[styles.blur, { backgroundColor: 'rgba(0,0,0,0.85)' }]}>
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor }]}>
          <Text style={[styles.title, { color: theme.text }]}>What are you looking for?</Text>
          
          <View style={styles.grid}>
            {!isEvening ? (
              <TouchableOpacity style={[styles.btn, { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor }]} onPress={() => handleSelect('cafe_drinks')}>
                <Text style={styles.emoji}>☕</Text>
                <Text style={[styles.btnText, { color: theme.text }]}>Cafe / Snack</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.btn, { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor }]} onPress={() => handleSelect('cafe_drinks')}>
                <Text style={styles.emoji}>🍸</Text>
                <Text style={[styles.btnText, { color: theme.text }]}>Drinks / Nightlife</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.btn, { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor }]} onPress={() => handleSelect('nice_meal')}>
              <Text style={styles.emoji}>🍽️</Text>
              <Text style={[styles.btnText, { color: theme.text }]}>Nice Meal</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor }]} onPress={() => handleSelect('quick_casual')}>
              <Text style={styles.emoji}>🍔</Text>
              <Text style={[styles.btnText, { color: theme.text }]}>Quick & Casual</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor }]} onPress={() => handleSelect('health_macros')}>
              <Text style={styles.emoji}>🥗</Text>
              <Text style={[styles.btnText, { color: theme.text }]}>Health & Macros</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  blur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: width - 40,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  btn: {
    width: '47%',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  emoji: {
    fontSize: 28,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
