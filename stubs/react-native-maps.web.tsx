/**
 * Web stub for react-native-maps.
 * react-native-maps has no web implementation. This stub is automatically
 * resolved by Metro/Expo on the web platform instead of the real library,
 * preventing the "Importing native-only module" build error.
 *
 * The map tab renders a simple "not available on web" placeholder on web.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const Stub = ({ children, style }: { children?: React.ReactNode; style?: any }) => (
  <View style={[styles.stub, style]}>{children}</View>
);

const MapPlaceholder = ({ style }: { style?: any }) => (
  <View style={[styles.stub, style]}>
    <Text style={styles.text}>🗺️ Map not available on web</Text>
  </View>
);

const styles = StyleSheet.create({
  stub: { flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#888', fontSize: 16 },
});

// Named exports that map.tsx uses
export default MapPlaceholder;
export const Marker = Stub;
export const Circle = Stub;
export const PROVIDER_GOOGLE = null;
export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};
