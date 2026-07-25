import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { AppHeader, Button, Card, Screen, StatusBadge } from '@/components/ui';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { useHardwareTrigger } from '@/hooks/useHardwareTrigger';
import { hardwareTriggerService } from '@/services/hardwareTriggerService';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';
import { useConnected } from '@/store/ConnectedContext';
import { greeting } from '@/utils/format';
import { hardwareStatusLabel, hardwareStatusTone } from '@/utils/hardwareTrigger';

export default function HomeScreen() {
  const { state, location, startSosTest, showToast } = useApp();
  const { profile } = useAuth();
  const { guardians, incomingRequests, guardianAlert, connection } = useConnected();
  const hardware = useHardwareTrigger();
  const [detailsVisible, setDetailsVisible] = useState(false);
  const activeGuardians = guardians.filter((guardian) => guardian.status === 'accepted' && guardian.guardian_user_id).length;
  const locationReady = location.permission === 'granted';

  const runSos = async () => {
    const started = await startSosTest();
    if (!started) showToast('An SOS is already running');
  };

  return (
    <Screen>
      <AppHeader subtitle={greeting()} title={profile?.full_name || state.profile.fullName || 'Core Alert user'} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {guardianAlert ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/guardian-incident/[id]', params: { id: guardianAlert.incident.id } })}
            style={({ pressed }) => [styles.incomingCard, pressed && styles.pressed]}>
            <View style={styles.incomingIcon}><Ionicons name="warning" size={24} color={colors.white} /></View>
            <View style={styles.incomingCopy}>
              <Text style={styles.incomingEyebrow}>{guardianAlert.incident.is_demo ? 'DEMO ALERT' : 'SOS ALERT'}</Text>
              <Text style={styles.incomingTitle}>{guardianAlert.owner?.full_name ?? 'Protected user'} needs your response</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.white} />
          </Pressable>
        ) : incomingRequests.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/guardian-requests')} style={({ pressed }) => [styles.requestNotice, pressed && styles.pressed]}>
            <View style={styles.noticeIcon}><Ionicons name="person-add-outline" size={18} color={colors.blueBright} /></View>
            <Text style={styles.requestNoticeText}>{incomingRequests.length} guardian request{incomingRequests.length === 1 ? '' : 's'} waiting</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}

        <Card style={styles.protectionCard}>
          <View style={styles.protectionTop}>
            <View style={styles.shieldWrap}>
              <Ionicons name="shield-checkmark" size={23} color={colors.green} />
              <View style={styles.onlineDot} />
            </View>
            <View style={styles.protectionCopy}>
              <View style={styles.titleLine}>
                <Text style={styles.protectionTitle}>Protection active</Text>
                {state.preferences.demoModeEnabled ? <StatusBadge label="Demo" tone="info" /> : null}
              </View>
              <Text style={styles.protectionText}>{connection === 'connected' ? 'Safety network connected' : 'Reconnecting safety network'}</Text>
            </View>
            <StatusBadge label={connection === 'connected' ? 'Ready' : 'Offline'} tone={connection === 'connected' ? 'success' : 'warning'} />
          </View>
          <View style={styles.statusGrid}>
            <MiniStatus icon="people" value={`${activeGuardians}`} label="Guardians" ready={activeGuardians > 0} />
            <View style={styles.statusDivider} />
            <MiniStatus icon="navigate" value={locationReady ? 'On' : 'Off'} label="Location" ready={locationReady} />
          </View>
        </Card>

        <EmergencyAction
          demo={state.preferences.demoModeEnabled}
          onPress={() => void runSos()}
        />

        <Card style={styles.shortcutCard}>
          <View style={styles.shortcutTop}>
            <View style={styles.shortcutHeading}>
              <View style={styles.volumeIcon}><Ionicons name="volume-low" size={20} color={colors.blueBright} /></View>
              <View>
                <Text style={styles.shortcutTitle}>Emergency shortcut</Text>
                <Text style={styles.shortcutText}>Press volume down 5 times</Text>
              </View>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setDetailsVisible(true)} hitSlop={8}>
              <StatusBadge label={hardwareStatusLabel(hardware.status)} tone={hardwareStatusTone(hardware.status)} />
            </Pressable>
          </View>
          <View style={styles.pressRow} accessibilityLabel={`${hardware.pressCount} of 5 presses detected`}>
            {[0, 1, 2, 3, 4].map((index) => (
              <PressDot key={index} active={index < hardware.pressCount} number={index + 1} />
            ))}
          </View>
          <View style={styles.shortcutFooter}>
            <Text accessibilityLiveRegion="polite" style={styles.progressText}>
              {hardware.pressCount > 0 ? `${hardware.pressCount} of 5 detected` : 'Five separate presses within three seconds'}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/shortcut-tutorial')} hitSlop={8}>
              <Text style={styles.howLink}>How it works</Text>
            </Pressable>
          </View>
        </Card>

        <View style={styles.summaryGrid}>
          <SummaryCard icon="people-outline" title="Guardians" value={`${activeGuardians} ready`} ready={activeGuardians > 0} onPress={() => router.push('/(tabs)/guardians')} />
          <SummaryCard icon="location-outline" title="Location" value={locationReady ? 'Available' : 'Needs access'} ready={locationReady} onPress={() => router.push('/location-details')} />
        </View>
        <Text style={styles.safetyNote}>Core Alert alerts configured guardians. It does not automatically dispatch police or emergency services.</Text>
      </ScrollView>

      <BottomSheet visible={detailsVisible} title="Shortcut details" onClose={() => setDetailsVisible(false)}>
        <View style={styles.detailRows}>
          <DetailRow label="Platform support" value={Platform.OS === 'android' ? 'Android installed app' : 'Android only'} />
          <DetailRow label="Native protection" value={hardware.nativeModuleAvailable ? 'Installed' : 'Required'} />
          <DetailRow label="Trigger availability" value={hardwareStatusLabel(hardware.status)} />
          <DetailRow label="Five-press window" value={`${hardwareTriggerService.windowMs / 1000} seconds`} />
        </View>
        <View style={styles.limitNote}>
          <Ionicons name="information-circle-outline" size={18} color={colors.blueBright} />
          <Text style={styles.limitText}>With Accessibility protection enabled, the shortcut can work while Core Alert is backgrounded, removed from recents, or the phone is locked where Android permits. It cannot work after manual Force stop.</Text>
        </View>
        <Button label="Practice shortcut" variant="secondary" onPress={() => { setDetailsVisible(false); router.push('/shortcut-tutorial'); }} style={styles.sheetButton} />
      </BottomSheet>
    </Screen>
  );
}

function EmergencyAction({ demo, onPress }: { demo: boolean; onPress: () => void }) {
  const pulse = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulse, { toValue: 0, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.34, 0.04] });
  return (
    <View style={styles.sosSection}>
      <Text style={styles.sosEyebrow}>{demo ? 'SAFE DEMONSTRATION' : 'EMERGENCY ACTION'}</Text>
      <View style={styles.sosStage}>
        <Animated.View style={[styles.sosGlow, { opacity, transform: [{ scale }] }]} />
        <View style={styles.sosOuterRing}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={demo ? 'Start Demo SOS' : 'Start SOS'}
            onPress={onPress}
            style={({ pressed }) => [styles.sosButton, pressed && styles.sosButtonPressed]}>
            <Ionicons name={demo ? 'flask' : 'alert'} size={31} color={colors.white} />
            <Text style={styles.sosLabel}>SOS</Text>
            <Text style={styles.sosSubLabel}>{demo ? 'DEMO' : 'TAP FOR HELP'}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.sosHelper}>{demo ? 'Starts a clearly labelled guardian demo alert' : 'Starts a cancellable countdown before alerting guardians'}</Text>
    </View>
  );
}

function PressDot({ active, number }: { active: boolean; number: number }) {
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!active) return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.12, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [active, scale]);
  return (
    <Animated.View style={[styles.pressIndicator, active && styles.pressIndicatorActive, { transform: [{ scale }] }]}>
      <Text style={[styles.pressNumber, active && styles.pressNumberActive]}>{number}</Text>
    </Animated.View>
  );
}

function MiniStatus({ icon, value, label, ready }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string; label: string; ready: boolean }) {
  return <View style={styles.miniStatus}><Ionicons name={icon} size={18} color={ready ? colors.green : colors.amber} /><View><Text style={styles.miniStatusValue}>{value}</Text><Text style={styles.miniStatusLabel}>{label}</Text></View></View>;
}

function SummaryCard({ icon, title, value, ready, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; value: string; ready: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.summaryCard, pressed && styles.pressed]}>
      <View style={styles.summaryIcon}><Ionicons name={icon} size={21} color={colors.blueBright} /></View>
      <Text style={styles.summaryTitle}>{title}</Text>
      <View style={styles.summaryStatus}><View style={[styles.summaryDot, { backgroundColor: ready ? colors.green : colors.amber }]} /><Text style={styles.summaryValue}>{value}</Text></View>
      <Ionicons name="chevron-forward" size={17} color={colors.textMuted} style={styles.summaryChevron} />
    </Pressable>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 34, gap: 16 },
  incomingCard: { minHeight: 78, borderRadius: radii.large, backgroundColor: colors.red, borderWidth: 1, borderColor: colors.redDark, padding: 14, flexDirection: 'row', alignItems: 'center', ...shadows.emergency },
  incomingIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  incomingCopy: { flex: 1, marginHorizontal: 12 },
  incomingEyebrow: { color: '#FFD8DC', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  incomingTitle: { color: colors.white, fontSize: 15, lineHeight: 20, fontWeight: '800', marginTop: 3 },
  requestNotice: { minHeight: 58, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  noticeIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  requestNoticeText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
  protectionCard: { padding: 16, borderColor: '#174A3A' },
  protectionTop: { flexDirection: 'row', alignItems: 'center' },
  shieldWrap: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', right: 4, bottom: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green, borderWidth: 2, borderColor: colors.surface },
  protectionCopy: { flex: 1, marginHorizontal: 11 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  protectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  protectionText: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  statusGrid: { flexDirection: 'row', alignItems: 'center', marginTop: 15, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  statusDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: 20 },
  miniStatus: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  miniStatusValue: { color: colors.text, fontSize: 13, fontWeight: '800' },
  miniStatusLabel: { color: colors.textMuted, fontSize: 10, marginTop: 1 },
  sosSection: { alignItems: 'center', paddingVertical: 8 },
  sosEyebrow: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginBottom: 4 },
  sosStage: { width: 236, height: 236, alignItems: 'center', justifyContent: 'center' },
  sosGlow: { position: 'absolute', width: 205, height: 205, borderRadius: 103, backgroundColor: colors.red },
  sosOuterRing: { width: 190, height: 190, borderRadius: 95, borderWidth: 1, borderColor: 'rgba(255,89,104,0.65)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(242,61,79,0.08)' },
  sosButton: { width: 158, height: 158, borderRadius: 79, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.red, borderWidth: 7, borderColor: '#48131C', ...shadows.emergency },
  sosButtonPressed: { transform: [{ scale: 0.96 }], backgroundColor: '#D92F42' },
  sosLabel: { color: colors.white, fontSize: 42, lineHeight: 46, fontWeight: '900', letterSpacing: 1.5 },
  sosSubLabel: { color: '#FFD8DC', fontSize: 8, fontWeight: '800', letterSpacing: 1.1, marginTop: 2 },
  sosHelper: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 300, marginTop: -2 },
  shortcutCard: { padding: 16 },
  shortcutTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  shortcutHeading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  volumeIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  shortcutTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  shortcutText: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  pressRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  pressIndicator: { flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  pressIndicatorActive: { backgroundColor: colors.red, borderColor: colors.redDark },
  pressNumber: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  pressNumberActive: { color: colors.white },
  shortcutFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 },
  progressText: { color: colors.textMuted, fontSize: 10, flex: 1 },
  howLink: { color: colors.blueBright, fontSize: 11, fontWeight: '700' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  summaryGrid: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, minHeight: 126, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, backgroundColor: colors.surface, padding: 14, ...shadows.card },
  summaryIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 10 },
  summaryStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  summaryDot: { width: 7, height: 7, borderRadius: 4 },
  summaryValue: { color: colors.textSecondary, fontSize: 10, flexShrink: 1 },
  summaryChevron: { position: 'absolute', top: 17, right: 13 },
  safetyNote: { color: colors.textMuted, fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 12 },
  detailRows: { gap: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { color: colors.textSecondary, fontSize: 12 },
  detailValue: { color: colors.text, fontSize: 12, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  limitNote: { flexDirection: 'row', gap: 9, backgroundColor: colors.blueSoft, borderRadius: 12, padding: 12, marginTop: 16 },
  limitText: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, flex: 1 },
  sheetButton: { marginTop: 16, marginBottom: 8 },
});
