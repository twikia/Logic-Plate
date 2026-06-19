import { Stack } from 'expo-router';

export default function IndexLayout() {
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
