import { StyleSheet, Text, View } from 'react-native';

export default function TrackingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Macro & Finance Tracking</Text>
      <Text style={styles.subtitle}>Log your daily calories and spending</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDF8F5', // Melon Fresh cream background
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2B422A', // Forest Green text
  },
  subtitle: {
    fontSize: 16,
    color: '#8E837D', // Muted brown text
    marginTop: 8,
  },
});
