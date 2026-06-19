import AsyncStorage from '@react-native-async-storage/async-storage';

const INTRO_SEEN_KEY = 'app_intro_seen_v1';

export async function isAppIntroRequired(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INTRO_SEEN_KEY)) !== '1';
  } catch {
    return true;
  }
}

export async function markAppIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    //
  }
}

export async function resetAppIntro(): Promise<void> {
  try {
    await AsyncStorage.removeItem(INTRO_SEEN_KEY);
  } catch {
    //
  }
}
