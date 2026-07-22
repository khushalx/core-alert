import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useHardwareTrigger } from '@/hooks/useHardwareTrigger';
import { hardwareTriggerService } from '@/services/hardwareTriggerService';

export default function ShortcutTutorialScreen() {
  const hardware = useHardwareTrigger();
  const detected = hardware.lastSequenceResult === 'Shortcut detected successfully';

  useEffect(() => {
    hardwareTriggerService.setContext({ practiceMode: true });
    hardwareTriggerService.reset('Practice mode started', true);
    void hardwareTriggerService.verifyAndAttach();
    return () => {
      hardwareTriggerService.setContext({ practiceMode: false });
      hardwareTriggerService.reset('Practice mode ended', true);
    };
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <StatusBadge label="Practice mode" tone="success" />
          <Text style={styles.title}>Use the shortcut discreetly</Text>
          <Text style={styles.subtitle}>No alert will be activated.</Text>
        </View>

        <Card style={styles.stepsCard}>
          <Step number="1" title="Keep protection enabled" text="Core Alert must be open and active in this foreground prototype." />
          <Step number="2" title="Press volume down five times" text="Complete five separate presses within three seconds." />
          <Step number="3" title="Cancel accidental alerts" text="Use the visible countdown before an SOS test becomes active." last />
        </Card>

        <Card style={styles.practiceCard}>
          <View style={styles.practiceHeader}>
            <View>
              <Text style={styles.practiceTitle}>Practice area</Text>
              <Text style={styles.practiceHint}>{Platform.OS === 'android' ? 'Use the physical button or test input.' : 'Android prototype only — use the test input.'}</Text>
            </View>
            <Ionicons name="volume-low-outline" size={24} color={colors.navy} />
          </View>
          <View style={styles.dots}>
            {[0, 1, 2, 3, 4].map((index) => <View key={index} style={[styles.dot, (detected || index < hardware.pressCount) && styles.dotActive]} />)}
          </View>
          <Text accessibilityLiveRegion="polite" style={[styles.result, detected && styles.resultSuccess]}>
            {detected ? 'Shortcut detected successfully' : `${hardware.pressCount} of 5 presses`}
          </Text>
          <Button label="Simulate one volume-down press" variant="secondary" icon="volume-low-outline" onPress={() => hardwareTriggerService.emitSimulatedPress()} />
          <Text style={styles.testNote}>Test input only. It never changes your phone volume.</Text>
        </Card>

        <Button label="Exit practice" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ number, title, text, last }: { number: string; title: string; text: string; last?: boolean }) {
  return <View style={[styles.step, !last && styles.stepBorder]}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View><View style={styles.stepCopy}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepText}>{text}</Text></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: 16, paddingBottom: 32 },
  intro: { alignItems: 'flex-start', gap: 7 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 4 },
  subtitle: { color: colors.green, fontSize: 13, fontWeight: '700' },
  stepsCard: { paddingVertical: 4 },
  step: { flexDirection: 'row', paddingVertical: 15 },
  stepBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  stepNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  stepCopy: { flex: 1, marginLeft: 12 },
  stepTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  stepText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3 },
  practiceCard: { gap: 14 },
  practiceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  practiceTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  practiceHint: { color: colors.textSecondary, fontSize: 11, marginTop: 4, maxWidth: 270 },
  dots: { flexDirection: 'row', gap: 10 },
  dot: { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.green },
  result: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  resultSuccess: { color: colors.green },
  testNote: { color: colors.textMuted, fontSize: 10, textAlign: 'center' },
});
