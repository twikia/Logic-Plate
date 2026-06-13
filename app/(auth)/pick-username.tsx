import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SetUsernameForm } from '@/components/auth/SetUsernameForm';

export default function PickUsernameScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.pad}>
        <SetUsernameForm
          title="Choose a username"
          subtitle="This appears below your profile picture. You can change it later in settings."
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
