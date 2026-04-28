import { StyleSheet, Text, View, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function HomeScreen() {
  return (
    <LinearGradient colors={['#5C255C', '#F9A06F']} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.pageTitle}>Home</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Minimalistic Starting Point</Text>
          <Text style={styles.cardSubtitle}>Your central hub for restaurant discovery.</Text>
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
    paddingTop: 50, // Space for transparent header
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  card: {
    flex: 1,
    backgroundColor: '#3D2B3D',
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 35, // Heavily rounded
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 16,
    color: '#B59EAA',
  },
});
