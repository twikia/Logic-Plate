import { Stack } from 'expo-router';
import { useAppTheme } from '@/context/ThemeContext';

export default function AuthGroupLayout() {
  const { theme } = useAppTheme();
  return (
    <Stack
      initialRouteName="login"
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 100,
        contentStyle: { backgroundColor: theme.gradient[0] },
      }}
    />
  );
}
