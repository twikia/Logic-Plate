import { Stack } from 'expo-router';

export default function AuthGroupLayout() {
  return (
    <Stack
      initialRouteName="login"
      screenOptions={{ headerShown: false, animation: 'fade' }}
    />
  );
}
