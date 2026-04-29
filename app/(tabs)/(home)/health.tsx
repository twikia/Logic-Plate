import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View, } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/context/ThemeContext';


export default function HealthScreen() {
  const { theme } = useAppTheme();

  return (
    <LinearGradient colors={theme.gradient} style={styles.background}>
      <Stack.Screen
        options={{
          title: 'Choose by Health',
          headerStyle: { backgroundColor: theme.cardBackground },

          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          headerBackTitle: 'Back',
        }}
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={[styles.text, { color: theme.text }]}>Coming Soon!</Text>
        </View>
      </SafeAreaView>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
