import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

export const ICONS = [
  '🍕', '🍔', '🌮', '🍣', '🍩', '🥑', '🥞', '🍜', '🍓', '🍦'
];

let memoryProfileIcon: string | null = null;

export function useProfileIcon() {
  const [icon, setIcon] = useState(() => memoryProfileIcon ?? ICONS[0]);

  useEffect(() => {
    AsyncStorage.getItem('profile_icon').then(val => {
      if (val) {
        memoryProfileIcon = val;
        setIcon(val);
      }
    });

    const subscription = DeviceEventEmitter.addListener('onProfileIconChange', (newIcon: string) => {
      memoryProfileIcon = newIcon;
      setIcon(newIcon);
    });

    return () => subscription.remove();
  }, []);

  const changeIcon = async (newIcon: string) => {
    memoryProfileIcon = newIcon;
    setIcon(newIcon);
    await AsyncStorage.setItem('profile_icon', newIcon);
    DeviceEventEmitter.emit('onProfileIconChange', newIcon);
  };

  return { icon, changeIcon, icons: ICONS };
}
