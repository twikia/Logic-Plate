import { StyleSheet, Text, View, ScrollView, Switch, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { 
  getDistanceUnit, setDistanceUnit, 
  getAudioVolume, setAudioVolume, 
  getHapticsEnabled, setHapticsEnabled,
  DistanceUnit 
} from '@/core/userSettings';

export default function GeneralSettingsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { user, profile } = useAuth();
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
    <LinearGradient colors={[theme.gradient[0], theme.gradient[1] ?? theme.cardBackground]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: theme.buttonBackground }]}
          >
            <Ionicons name="chevron-back" size={28} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>General Settings</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.accent }]}>Account</Text>
            <Pressable
              style={[
                styles.settingCard,
                { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor },
              ]}
              onPress={() => router.push('/edit-username')}
            >
              <View style={styles.settingInfo}>
                <Ionicons name="person-outline" size={24} color={theme.accent} />
                <View style={styles.textContainer}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>Username</Text>
                  <Text style={[styles.settingDescription, { color: theme.subtext }]}>
                    {profile?.username ?? 'Not set'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.accent }]}>Search Preferences</Text>
            <View style={[styles.settingCard, { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor }]}>
              <View style={styles.settingInfo}>
                <Ionicons name="navigate-circle-outline" size={24} color={theme.accent} />
                <View style={styles.textContainer}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>Distance Unit</Text>
                  <Text style={[styles.settingDescription, { color: theme.subtext }]}>How search radiuses are displayed</Text>
                </View>
              </View>
              <View style={[styles.unitToggle, { backgroundColor: theme.cardBackground }]}>
                <Pressable 
                  onPress={() => handleUnitChange('km')}
                  style={[styles.unitBtn, unit === 'km' && { backgroundColor: theme.accent }]}
                >
                  <Text style={[styles.unitText, { color: theme.subtext }, unit === 'km' && { color: theme.accentOnColor ?? '#FFFFFF' }]}>KM</Text>
                </Pressable>
                <Pressable 
                  onPress={() => handleUnitChange('mi')}
                  style={[styles.unitBtn, unit === 'mi' && { backgroundColor: theme.accent }]}
                >
                  <Text style={[styles.unitText, { color: theme.subtext }, unit === 'mi' && { color: theme.accentOnColor ?? '#FFFFFF' }]}>Miles</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.accent }]}>Audio & Feedback</Text>
            <View style={[styles.settingCard, { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor }]}>
              <View style={styles.settingInfo}>
                <Ionicons name="volume-high-outline" size={24} color={theme.accent} />
                <View style={styles.textContainer}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>App Volume</Text>
                  <Text style={[styles.settingDescription, { color: theme.subtext }]}>Volume level for UI sounds</Text>
                </View>
              </View>
              <View style={styles.volumeSteps}>
                {[0, 0.25, 0.5, 0.75, 1].map((level) => (
                  <Pressable 
                    key={level}
                    onPress={() => handleVolumeChange(level)}
                    style={[
                      styles.volumeStep,
                      { backgroundColor: theme.cardBackground },
                      volume === level && { backgroundColor: theme.accent, transform: [{ scale: 1.2 }] },
                    ]}
                  />
                ))}
              </View>
            </View>

            <View style={[styles.settingCard, { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor }]}>
              <View style={styles.settingInfo}>
                <Ionicons name="phone-portrait-outline" size={24} color={theme.accent} />
                <View style={styles.textContainer}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>Haptic Feedback</Text>
                  <Text style={[styles.settingDescription, { color: theme.subtext }]}>Vibrate on interactions</Text>
                </View>
              </View>
              <Switch 
                value={haptics} 
                onValueChange={handleHapticsToggle}
                trackColor={{ false: theme.buttonBackground, true: theme.accent }}
                thumbColor={haptics ? (theme.accentOnColor ?? '#FFFFFF') : theme.subtext}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.accent }]}>Notifications</Text>
            <View style={[styles.settingCard, { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor }]}>
              <View style={styles.settingInfo}>
                <Ionicons name="notifications-outline" size={24} color={theme.accent} />
                <View style={styles.textContainer}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>Push Notifications</Text>
                  <Text style={[styles.settingDescription, { color: theme.subtext }]}>Get updates and alerts</Text>
                </View>
              </View>
              <Switch 
                value={notifications} 
                onValueChange={setNotifications}
                trackColor={{ false: theme.buttonBackground, true: theme.accent }}
                thumbColor={notifications ? (theme.accentOnColor ?? '#FFFFFF') : theme.subtext}
              />
            </View>
          </View>

          <View style={styles.section}>
             <Text style={[styles.sectionTitle, { color: theme.accent }]}>About</Text>
             <View style={[styles.aboutCard, { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor }]}>
                <Text style={[styles.versionText, { color: theme.text }]}>Version 1.0.4 (Phase 2)</Text>
                <Text style={[styles.creditsText, { color: theme.subtext }]}>Made with ❤️ for foodies</Text>
                <Text style={[styles.aboutLabel, { color: theme.subtext }]}>User ID</Text>
                <Text style={[styles.userIdText, { color: theme.text }]} selectable>
                  {user?.id ?? '—'}
                </Text>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
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
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 5,
  },
  settingCard: {
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderWidth: 1,
  },
  aboutCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
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
  },
  settingDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  unitToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  unitText: {
    fontSize: 12,
    fontWeight: '600',
  },
  volumeSteps: {
    flexDirection: 'row',
    gap: 6,
  },
  volumeStep: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  versionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  creditsText: {
    fontSize: 12,
    marginTop: 4,
  },
  aboutLabel: {
    fontSize: 12,
    marginTop: 16,
    fontWeight: '600',
  },
  userIdText: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
});
