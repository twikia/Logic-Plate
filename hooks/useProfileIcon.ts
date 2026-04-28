import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

export const ICONS = [
  '🍕', '🍔', '🌮', '🍣', '🍩', '🥑', '🥞', '🍜', '🍓', '🍦'
];

export function useProfileIcon() {
  const [icon, setIcon] = useState(ICONS[0]);

  useEffect(() => {
    AsyncStorage.getItem('profile_icon').then(val => {
      if (val) setIcon(val);
    });

    const subscription = DeviceEventEmitter.addListener('onProfileIconChange', (newIcon) => {
      setIcon(newIcon);
    });

    return () => subscription.remove();
  }, []);

  const changeIcon = async (newIcon: string) => {
    setIcon(newIcon);
    await AsyncStorage.setItem('profile_icon', newIcon);
    DeviceEventEmitter.emit('onProfileIconChange', newIcon);
  };

  return { icon, changeIcon, icons: ICONS };
}
