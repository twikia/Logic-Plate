import { SafeAreaView } from 'react-native-safe-area-context';
import {  StyleSheet, Text, View,  } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { useAppTheme } from '@/context/ThemeContext';


export default function SocialScreen() {
  const { theme } = useAppTheme();

  return (
    <LinearGradient colors={theme.gradient} style={styles.background}>
      <TopProfileButton />
      <SafeAreaView style={styles.safeArea}>
        <Text style={[styles.pageTitle, { color: theme.text }]}>Social</Text>
        <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Friend Groups</Text>
          <Text style={[styles.cardSubtitle, { color: theme.subtext }]}>Vote on where to eat tonight and check leaderboards.</Text>
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
    paddingTop: 50,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2B422A',
    textAlign: 'center',
    marginBottom: 20,
  },
  card: {
    flex: 1,
    backgroundColor: '#FDF8F5',
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 35,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2B422A',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 16,
    color: '#8E837D',
  },
});
