import { Stack } from 'expo-router';
import { useAppTheme } from '@/context/ThemeContext';

export default function IndexLayout() {
  const { theme } = useAppTheme();
  return (
    <Stack screenOptions={{
      headerShown: false,
      animation: 'slide_from_right',
      animationDuration: 95,
      detachInactiveScreens: false,
      contentStyle: { backgroundColor: '#000000' },
    }} />
  );
}
