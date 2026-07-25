import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { LogoMark } from '@/components/LogoMark';
import { Screen } from '@/components/ui';
import { colors } from '@/constants/theme';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';

export default function IndexScreen() {
  const { hydrated } = useApp();
  const { configured, loading, session } = useAuth();
  if (!hydrated || loading) {
    return (
      <Screen>
        <View style={styles.splash}>
          <View style={styles.logoGlow}><LogoMark size={250} lockup /></View>
          <Text style={styles.tagline}>EVERY SECOND COUNTS.</Text>
          <View style={styles.loadingLine}><View style={styles.loadingFill} /></View>
        </View>
      </Screen>
    );
  }
  if (!configured || !session) return <Redirect href="/welcome" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.black, padding: 28 },
  logoGlow: { shadowColor: colors.red, shadowOpacity: 0.32, shadowRadius: 30, elevation: 12 },
  tagline: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 3, marginTop: 4 },
  loadingLine: { width: 76, height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.border, marginTop: 30 },
  loadingFill: { width: '62%', height: '100%', backgroundColor: colors.red, borderRadius: 2 },
});
