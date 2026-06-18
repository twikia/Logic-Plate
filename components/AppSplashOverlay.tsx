import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

const SPLASH_BG = '#161640';

export function AppSplashOverlay() {
  return (
    <View style={styles.container} pointerEvents="none">
      <Image
        source={require('@/assets/images/splash-icon.png')}
        style={styles.icon}
        resizeMode="contain"
      />
      <ActivityIndicator size="large" color="#ffffff" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 200,
    height: 200,
  },
  spinner: {
    marginTop: 32,
  },
});
