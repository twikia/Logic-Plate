import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SetUsernameForm } from '@/components/auth/SetUsernameForm';

export default function PickUsernameScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.pad}>
        <SetUsernameForm
          title={t('auth.chooseUsername')}
          subtitle={t('auth.usernameSubtitle')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#2a1f2e',
  },
  pad: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
});
