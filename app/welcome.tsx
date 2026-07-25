import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoMark } from '@/components/LogoMark';
import { Button } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/store/AuthContext';

export default function WelcomeScreen() {
  const { configured } = useAuth();
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <LogoMark size={230} lockup />
        <Text style={styles.tagline}>EVERY SECOND COUNTS.</Text>
        <Text style={styles.title}>Protection when every moment matters.</Text>
        <Text style={styles.subtitle}>Connect with the people you trust and share an active SOS in real time.</Text>
      </View>
      <View style={styles.actions}>
        {!configured ? <Text style={styles.setup}>Add your Supabase URL and public anonymous key to `.env` before creating an account.</Text> : null}
        <Button label="Create account" onPress={() => router.push('/sign-up')} disabled={!configured} />
        <Button label="Sign in" variant="secondary" onPress={() => router.push('/sign-in')} disabled={!configured} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.xl },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tagline: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 2.4, marginTop: 4 },
  title: { color: colors.text, fontSize: 31, lineHeight: 38, fontWeight: '800', textAlign: 'center', maxWidth: 360, marginTop: 12 },
  subtitle: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 350, marginTop: 13 },
  actions: { gap: 10, paddingBottom: 12 },
  setup: { color: colors.amber, backgroundColor: colors.amberSoft, padding: 12, borderRadius: 12, fontSize: 12, lineHeight: 18, textAlign: 'center', marginBottom: 4 },
});
