import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { colors } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.code}>404</Text>
      <Text style={styles.title}>This screen is not available</Text>
      <Text style={styles.message}>Return to your Core Alert home screen to continue.</Text>
      <Button label="Go home" onPress={() => router.replace('/(tabs)')} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24, gap: 10 },
  code: { color: colors.red, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  message: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 12 },
});
