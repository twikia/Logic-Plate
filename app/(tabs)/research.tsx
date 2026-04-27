import { StyleSheet, Text, View } from 'react-native';

export default function ResearchScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Research</Text>
      <Text style={styles.subtitle}>Ask Gemini about restaurants and comparisons</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#362436', // Sunset Blush card background
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 16,
    color: '#B59EAA', // Sunset Blush secondary text
    marginTop: 8,
  },
});
