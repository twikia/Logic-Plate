import { Stack } from 'expo-router';
import { useAppTheme } from '@/context/ThemeContext';

export default function GroupsLayout() {
  const { theme } = useAppTheme();
  return (
    <Stack screenOptions={{
      headerShown: false,
      animation: 'slide_from_right',
      animationDuration: 140,
      detachInactiveScreens: false,
      contentStyle: { backgroundColor: theme.gradient[0] },
    }} />
  );
}
