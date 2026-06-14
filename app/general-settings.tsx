import { StyleSheet, Text, View, ScrollView, Switch, Pressable, Modal, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { 
  getDistanceUnit, setDistanceUnit, 
  getSfxVolume, getMusicVolume,
  getHapticsEnabled, setHapticsEnabled,
  getLanguage, setLanguage,
  DistanceUnit 
} from '@/core/userSettings';
import { setSfxVolumeLevel, setMusicVolumeLevel } from '@/core/audioService';
import { hapticLight, hapticSuccess, hapticSelection, refreshHapticsCache } from '@/core/haptics';
import i18n, { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, type SupportedLanguage } from '@/i18n';

export default function GeneralSettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const { user, profile } = useAuth();
  const [unit, setUnit] = useState<DistanceUnit>('km');
  const [sfxVolume, setSfxVolumeState] = useState(0.5);
  const [musicVolume, setMusicVolumeState] = useState(0.5);
  const [haptics, setHaptics] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [language, setLanguageState] = useState<SupportedLanguage>('en');
  const [showLangPicker, setShowLangPicker] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const savedUnit = await getDistanceUnit();
      const savedSfxVolume = await getSfxVolume();
      const savedMusicVolume = await getMusicVolume();
      const savedHaptics = await getHapticsEnabled();
      const savedLang = await getLanguage();
      setUnit(savedUnit);
      setSfxVolumeState(savedSfxVolume);
      setMusicVolumeState(savedMusicVolume);
      setHaptics(savedHaptics);
      if (savedLang && SUPPORTED_LANGUAGES.includes(savedLang as SupportedLanguage)) {
        setLanguageState(savedLang as SupportedLanguage);
      } else {
        setLanguageState((i18n.language as SupportedLanguage) ?? 'en');
      }
    }
    loadSettings();
  }, []);

  const handleUnitChange = async (newUnit: DistanceUnit) => {
    setUnit(newUnit);
    await setDistanceUnit(newUnit);
    hapticLight();
  };

  const handleHapticsToggle = async (value: boolean) => {
    setHaptics(value);
    await setHapticsEnabled(value);
    refreshHapticsCache();
    if (value) hapticSuccess();
  };

  const handleSfxVolumeChange = async (level: number) => {
    setSfxVolumeState(level);
    await setSfxVolumeLevel(level);
    hapticLight();
  };

  const handleMusicVolumeChange = async (level: number) => {
    setMusicVolumeState(level);
    await setMusicVolumeLevel(level);
    hapticLight();
  };

  const handleLanguageSelect = async (lang: SupportedLanguage) => {
    setLanguageState(lang);
    await setLanguage(lang);
    await i18n.changeLanguage(lang);
    setShowLangPicker(false);
    hapticSelection();
  };

  return (
    <LinearGradient colors={[theme.gradient[0], theme.gradient[1] ?? theme.cardBackground]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => { hapticLight(); router.back(); }}
            style={[styles.backButton, { backgroundColor: theme.buttonBackground }]}
          >
            <Ionicons name="chevron-back" size={28} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>{t('settings.title')}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Account */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.accent }]}>{t('settings.accountSection')}</Text>
            <Pressable
              style={[styles.settingCard, { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor }]}
              onPress={() => { hapticLight(); router.push('/edit-username'); }}
            >
              <View style={styles.settingInfo}>
                <Ionicons name="person-outline" size={24} color={theme.accent} />
                <View style={styles.textContainer}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>{t('settings.username')}</Text>
                  <Text style={[styles.settingDescription, { color: theme.subtext }]}>
                    {profile?.username ?? t('settings.notSet')}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
            </Pressable>
          </View>

          {/* Search Preferences */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.accent }]}>{t('settings.searchPrefsSection')}</Text>
            <View style={[styles.settingCard, { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor }]}>
              <View style={styles.settingInfo}>
                <Ionicons name="navigate-circle-outline" size={24} color={theme.accent} />
                <View style={styles.textContainer}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>{t('settings.distanceUnit')}</Text>
                  <Text style={[styles.settingDescription, { color: theme.subtext }]}>{t('settings.distanceUnitDesc')}</Text>
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

          {/* Audio & Feedback */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.accent }]}>{t('settings.audioSection')}</Text>
            <View style={[styles.settingCard, { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor }]}>
              <View style={styles.settingInfo}>
                <Ionicons name="musical-notes-outline" size={24} color={theme.accent} />
                <View style={styles.textContainer}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>{t('settings.sfxVolume')}</Text>
                  <Text style={[styles.settingDescription, { color: theme.subtext }]}>{t('settings.sfxVolumeDesc')}</Text>
                </View>
              </View>
              <View style={styles.volumeSteps}>
                {[0, 0.25, 0.5, 0.75, 1].map((level) => (
                  <Pressable 
                    key={level}
                    onPress={() => handleSfxVolumeChange(level)}
                    style={[
                      styles.volumeStep,
                      { backgroundColor: theme.cardBackground },
                      sfxVolume === level && { backgroundColor: theme.accent, transform: [{ scale: 1.2 }] },
                    ]}
                  />
                ))}
              </View>
            </View>

            <View style={[styles.settingCard, { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor }]}>
              <View style={styles.settingInfo}>
                <Ionicons name="volume-high-outline" size={24} color={theme.accent} />
                <View style={styles.textContainer}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>{t('settings.musicVolume')}</Text>
                  <Text style={[styles.settingDescription, { color: theme.subtext }]}>{t('settings.musicVolumeDesc')}</Text>
                </View>
              </View>
              <View style={styles.volumeSteps}>
                {[0, 0.25, 0.5, 0.75, 1].map((level) => (
                  <Pressable 
                    key={level}
                    onPress={() => handleMusicVolumeChange(level)}
                    style={[
                      styles.volumeStep,
                      { backgroundColor: theme.cardBackground },
                      musicVolume === level && { backgroundColor: theme.accent, transform: [{ scale: 1.2 }] },
                    ]}
                  />
                ))}
              </View>
            </View>

            <View style={[styles.settingCard, { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor }]}>
              <View style={styles.settingInfo}>
                <Ionicons name="phone-portrait-outline" size={24} color={theme.accent} />
                <View style={styles.textContainer}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>{t('settings.hapticFeedback')}</Text>
                  <Text style={[styles.settingDescription, { color: theme.subtext }]}>{t('settings.hapticFeedbackDesc')}</Text>
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

          {/* Language */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.accent }]}>{t('settings.languageSection')}</Text>
            <Pressable
              style={[styles.settingCard, { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor }]}
              onPress={() => { hapticLight(); setShowLangPicker(true); }}
            >
              <View style={styles.settingInfo}>
                <Ionicons name="language-outline" size={24} color={theme.accent} />
                <View style={styles.textContainer}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>{t('settings.language')}</Text>
                  <Text style={[styles.settingDescription, { color: theme.subtext }]}>{t('settings.languageDesc')}</Text>
                </View>
              </View>
              <View style={styles.langCurrent}>
                <Text style={[styles.langCurrentText, { color: theme.accent }]}>{LANGUAGE_NAMES[language]}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
              </View>
            </Pressable>
          </View>

          {/* Notifications */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.accent }]}>{t('settings.notificationsSection')}</Text>
            <View style={[styles.settingCard, { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor }]}>
              <View style={styles.settingInfo}>
                <Ionicons name="notifications-outline" size={24} color={theme.accent} />
                <View style={styles.textContainer}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>{t('settings.pushNotifications')}</Text>
                  <Text style={[styles.settingDescription, { color: theme.subtext }]}>{t('settings.pushNotificationsDesc')}</Text>
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

          {/* About */}
          <View style={styles.section}>
             <Text style={[styles.sectionTitle, { color: theme.accent }]}>{t('settings.aboutSection')}</Text>
             <View style={[styles.aboutCard, { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor }]}>
                <Text style={[styles.versionText, { color: theme.text }]}>{t('settings.version')}</Text>
                <Text style={[styles.creditsText, { color: theme.subtext }]}>{t('settings.credits')}</Text>
                <Text style={[styles.aboutLabel, { color: theme.subtext }]}>{t('settings.userId')}</Text>
                <Text style={[styles.userIdText, { color: theme.text }]} selectable>
                  {user?.id ?? '\u2014'}
                </Text>
             </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Language picker modal */}
      <Modal
        visible={showLangPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLangPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowLangPicker(false)}>
          <View style={[styles.modalBox, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('settings.language')}</Text>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[
                  styles.langOption,
                  { borderColor: theme.cardBorderColor },
                  language === lang && { backgroundColor: theme.accent + '22', borderColor: theme.accent },
                ]}
                onPress={() => handleLanguageSelect(lang)}
              >
                <Text style={[styles.langOptionText, { color: theme.text }, language === lang && { color: theme.accent, fontWeight: '700' }]}>
                  {LANGUAGE_NAMES[lang]}
                </Text>
                {language === lang && (
                  <Ionicons name="checkmark" size={18} color={theme.accent} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
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
  title: { fontSize: 20, fontWeight: 'bold' },
  scrollContent: { padding: 20 },
  section: { marginBottom: 30 },
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
  textContainer: { marginLeft: 15, flex: 1 },
  settingLabel: { fontSize: 16, fontWeight: '600' },
  settingDescription: { fontSize: 12, marginTop: 2 },
  unitToggle: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  unitBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  unitText: { fontSize: 12, fontWeight: '600' },
  volumeSteps: { flexDirection: 'row', gap: 6 },
  volumeStep: { width: 12, height: 12, borderRadius: 6 },
  langCurrent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  langCurrentText: { fontSize: 14, fontWeight: '600' },
  versionText: { fontSize: 14, fontWeight: '600' },
  creditsText: { fontSize: 12, marginTop: 4 },
  aboutLabel: { fontSize: 12, marginTop: 16, fontWeight: '600' },
  userIdText: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    width: '78%',
    borderRadius: 20,
    padding: 24,
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  langOptionText: { fontSize: 16 },
});
