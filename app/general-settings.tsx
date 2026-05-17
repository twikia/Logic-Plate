import { StyleSheet, Text, View, ScrollView, Switch, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { 
  getDistanceUnit, setDistanceUnit, 
  getAudioVolume, setAudioVolume, 
  getHapticsEnabled, setHapticsEnabled,
  DistanceUnit 
} from '@/core/userSettings';

export default function GeneralSettingsScreen() {
  const router = useRouter();
  const [unit, setUnit] = useState<DistanceUnit>('km');
  const [volume, setVolume] = useState(0.5);
  const [haptics, setHaptics] = useState(true);
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      const savedUnit = await getDistanceUnit();
      const savedVolume = await getAudioVolume();
      const savedHaptics = await getHapticsEnabled();
      setUnit(savedUnit);
      setVolume(savedVolume);
      setHaptics(savedHaptics);
    }
    loadSettings();
  }, []);

  const handleUnitChange = async (newUnit: DistanceUnit) => {
    setUnit(newUnit);
    await setDistanceUnit(newUnit);
    if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleHapticsToggle = async (value: boolean) => {
    setHaptics(value);
    await setHapticsEnabled(value);
    if (value) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleVolumeChange = async (level: number) => {
    setVolume(level);
    await setAudioVolume(level);
  };

  return (
    <LinearGradient colors={['#3D2B3D', '#2A1B2A']} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.title}>General Settings</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Search Preferences</Text>
            <View style={styles.settingCard}>
              <View style={styles.settingInfo}>
                <Ionicons name="navigate-circle-outline" size={24} color="#F97352" />
                <View style={styles.textContainer}>
                  <Text style={styles.settingLabel}>Distance Unit</Text>
                  <Text style={styles.settingDescription}>How search radiuses are displayed</Text>
                </View>
              </View>
              <View style={styles.unitToggle}>
                <Pressable 
                  onPress={() => handleUnitChange('km')}
                  style={[styles.unitBtn, unit === 'km' && styles.unitBtnActive]}
                >
                  <Text style={[styles.unitText, unit === 'km' && styles.unitTextActive]}>KM</Text>
                </Pressable>
                <Pressable 
                  onPress={() => handleUnitChange('mi')}
                  style={[styles.unitBtn, unit === 'mi' && styles.unitBtnActive]}
                >
                  <Text style={[styles.unitText, unit === 'mi' && styles.unitTextActive]}>Miles</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Audio & Feedback</Text>
            <View style={styles.settingCard}>
              <View style={styles.settingInfo}>
                <Ionicons name="volume-high-outline" size={24} color="#F97352" />
                <View style={styles.textContainer}>
                  <Text style={styles.settingLabel}>App Volume</Text>
                  <Text style={styles.settingDescription}>Volume level for UI sounds</Text>
                </View>
              </View>
              <View style={styles.volumeSteps}>
                {[0, 0.25, 0.5, 0.75, 1].map((level) => (
                  <Pressable 
                    key={level}
                    onPress={() => handleVolumeChange(level)}
                    style={[styles.volumeStep, volume === level && styles.volumeStepActive]}
                  />
                ))}
              </View>
            </View>

            <View style={styles.settingCard}>
              <View style={styles.settingInfo}>
                <Ionicons name="phone-portrait-outline" size={24} color="#F97352" />
                <View style={styles.textContainer}>
                  <Text style={styles.settingLabel}>Haptic Feedback</Text>
                  <Text style={styles.settingDescription}>Vibrate on interactions</Text>
                </View>
              </View>
              <Switch 
                value={haptics} 
                onValueChange={handleHapticsToggle}
                trackColor={{ false: '#5C255C', true: '#F97352' }}
                thumbColor={haptics ? '#FFFFFF' : '#B59EAA'}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <View style={styles.settingCard}>
              <View style={styles.settingInfo}>
                <Ionicons name="notifications-outline" size={24} color="#F97352" />
                <View style={styles.textContainer}>
                  <Text style={styles.settingLabel}>Push Notifications</Text>
                  <Text style={styles.settingDescription}>Get updates and alerts</Text>
                </View>
              </View>
              <Switch 
                value={notifications} 
                onValueChange={setNotifications}
                trackColor={{ false: '#5C255C', true: '#F97352' }}
                thumbColor={notifications ? '#FFFFFF' : '#B59EAA'}
              />
            </View>
          </View>

          <View style={styles.section}>
             <Text style={styles.sectionTitle}>About</Text>
             <View style={styles.settingCard}>
                <Text style={styles.versionText}>Version 1.0.4 (Phase 2)</Text>
                <Text style={styles.creditsText}>Made with ❤️ for foodies</Text>
             </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F9A06F',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 5,
  },
  settingCard: {
    backgroundColor: 'rgba(92, 37, 92, 0.4)',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  textContainer: {
    marginLeft: 15,
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  settingDescription: {
    fontSize: 12,
    color: '#B59EAA',
    marginTop: 2,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: '#3D2B3D',
    borderRadius: 12,
    padding: 4,
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  unitBtnActive: {
    backgroundColor: '#F97352',
  },
  unitText: {
    color: '#B59EAA',
    fontSize: 12,
    fontWeight: '600',
  },
  unitTextActive: {
    color: '#FFFFFF',
  },
  volumeSteps: {
    flexDirection: 'row',
    gap: 6,
  },
  volumeStep: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#5C255C',
  },
  volumeStepActive: {
    backgroundColor: '#F97352',
    transform: [{ scale: 1.2 }],
  },
  versionText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  creditsText: {
    fontSize: 12,
    color: '#B59EAA',
  }
});
