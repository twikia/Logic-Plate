import { Stack } from 'expo-router';
import { useAppTheme } from '@/context/ThemeContext';

export default function QuickVoteLayout() {
  const { theme } = useAppTheme();
  return (
    <Stack screenOptions={{
      headerShown: false,
      animation: 'slide_from_right',
      animationDuration: 280,
      contentStyle: { backgroundColor: theme.gradient[0] },
    }} />
  );
}
