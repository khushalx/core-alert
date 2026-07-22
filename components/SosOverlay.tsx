import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmationModal } from '@/components/ConfirmationModal';
import { IncidentTimeline } from '@/components/IncidentTimeline';
import { MapCard } from '@/components/MapCard';
import { Button, Card, StatusBadge } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useApp } from '@/store/AppContext';
import { useConnected } from '@/store/ConnectedContext';
import { formatCoordinates, formatTime } from '@/utils/format';

export function SosOverlay() {
  const { state } = useApp();
  return (
    <Modal
      visible={state.sosState.stage !== 'idle'}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={() => undefined}>
      {state.sosState.stage === 'countdown' ? <CountdownStage /> : null}
      {state.sosState.stage === 'active' ? <ActiveStage /> : null}
    </Modal>
  );
}

function CountdownStage() {
  const { state, activateSosTest, cancelSosTest } = useApp();
  const countdownState = state.sosState.stage === 'countdown' ? state.sosState : null;
  const [remaining, setRemaining] = useState(() => countdownState?.duration ?? 10);
  const [pulse] = useState(() => new Animated.Value(0));
  const lastHapticSecond = useRef<number | null>(null);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  useEffect(() => {
    if (!countdownState) return;
    const update = () => {
      const elapsed = (Date.now() - new Date(countdownState.startedAt).getTime()) / 1000;
      const next = Math.max(0, Math.ceil(countdownState.duration - elapsed));
      setRemaining(next);
      if (
        state.preferences.hapticsEnabled &&
        next > 0 &&
        next <= 3 &&
        lastHapticSecond.current !== next
      ) {
        lastHapticSecond.current = next;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
      }
      if (next === 0) void activateSosTest();
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [activateSosTest, countdownState, state.preferences.hapticsEnabled]);

  const outerScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.25] });
  const outerOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0] });
  const innerScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.08] });

  return (
    <SafeAreaView style={styles.countdownScreen}>
      <View style={styles.demoBadge}>
        <Ionicons name={state.preferences.demoModeEnabled ? 'flask-outline' : 'shield-outline'} size={15} color={colors.redDark} />
        <Text style={styles.demoBadgeText}>{state.preferences.demoModeEnabled ? 'DEMO SOS' : 'CONNECTED PROTOTYPE'}</Text>
      </View>
      <View style={styles.countdownContent}>
        <View style={styles.pulseArea}>
          <Animated.View
            style={[
              styles.outerRing,
              { opacity: outerOpacity, transform: [{ scale: outerScale }] },
            ]}
          />
          <Animated.View style={[styles.innerRing, { transform: [{ scale: innerScale }] }]}>
            <Text accessibilityLiveRegion="assertive" style={styles.countdownNumber}>{remaining}</Text>
            <Text style={styles.secondsLabel}>seconds</Text>
          </Animated.View>
        </View>
        <Text style={styles.countdownTitle}>SOS activating</Text>
        <Text style={styles.countdownMessage}>
          Accepted linked guardians will be assigned when the countdown ends.
        </Text>
      </View>
      <View style={styles.countdownFooter}>
        <Button label="Cancel SOS" variant="secondary" icon="close" onPress={cancelSosTest} />
        <Text style={styles.demoNote}>Emergency services are not contacted automatically.</Text>
      </View>
    </SafeAreaView>
  );
}

function ActiveStage() {
  const { state, location, endSosTest } = useApp();
  const { connection, guardians, incidentGuardians } = useConnected();
  const [endVisible, setEndVisible] = useState(false);
  const [callVisible, setCallVisible] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [ending, setEnding] = useState(false);
  const [acknowledgement] = useState(() => new Animated.Value(0));
  const activeState = state.sosState.stage === 'active' ? state.sosState : null;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    Animated.timing(acknowledgement, {
      toValue: 1,
      duration: 550,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [acknowledgement]);

  const elapsed = useMemo(() => {
    if (!activeState) return '0:00';
    const seconds = Math.max(0, Math.floor(((now ?? new Date(activeState.startedAt).getTime()) - new Date(activeState.startedAt).getTime()) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }, [activeState, now]);

  if (!activeState) return null;
  const assignedCount = incidentGuardians.length;
  const deliveredCount = incidentGuardians.filter((item) => item.delivery_status === 'delivered').length;
  const acknowledged = incidentGuardians.filter((item) => item.acknowledgement_status === 'responding' || item.acknowledgement_status === 'cannot_respond').length;
  const respondingNames = incidentGuardians
    .filter((item) => item.acknowledgement_status === 'responding')
    .map((item) => guardians.find((guardian) => guardian.guardian_user_id === item.guardian_user_id)?.guardian_name)
    .filter((name): name is string => Boolean(name));

  return (
    <SafeAreaView style={styles.activeScreen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.activeContent} showsVerticalScrollIndicator={false}>
        <View style={styles.activeHeader}>
          <View style={styles.liveDot} />
          <View style={styles.activeHeaderCopy}>
            <Text style={styles.activeEyebrow}>{activeState.isDemo ? 'DEMO SOS' : 'CONNECTED PROTOTYPE'}</Text>
            <Text style={styles.activeTitle}>SOS active</Text>
          </View>
          <Text style={styles.elapsed}>{elapsed}</Text>
        </View>

        <Card style={styles.liveCard}>
          <LiveRow icon="navigate" title="Live location" value={activeState.locationStatus === 'sharing' ? 'Sharing with assigned guardians' : activeState.locationStatus === 'reconnecting' ? 'Reconnecting and queuing updates' : 'Location unavailable'} ready={activeState.locationStatus === 'sharing'} />
          <View style={styles.liveDivider} />
          <Animated.View style={{ opacity: acknowledgement, transform: [{ translateY: acknowledgement.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }] }}>
            <LiveRow icon="people" title="Guardian response" value={`${assignedCount} assigned • ${deliveredCount} delivered • ${acknowledged} replied`} ready={acknowledged > 0} />
          </Animated.View>
          <View style={styles.liveDivider} />
          <LiveRow icon="time-outline" title="Started" value={formatTime(activeState.startedAt)} />
        </Card>

        {respondingNames.length > 0 ? <Text style={styles.mockFootnote}>{respondingNames.join(', ')} responding</Text> : null}
        <Text style={styles.mockFootnote}>Emergency services not contacted automatically. {connection !== 'connected' ? `Connection: ${connection}.` : ''}</Text>
        {activeState.issues.map((issue) => <Text key={issue} style={styles.issueText}>• {issue}</Text>)}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsVisible }}
          onPress={() => setDetailsVisible((current) => !current)}
          style={({ pressed }) => [styles.detailsToggle, pressed && styles.detailsPressed]}>
          <View style={styles.detailsToggleIcon}><Ionicons name="list-outline" size={20} color={colors.navy} /></View>
          <Text style={styles.detailsToggleText}>{detailsVisible ? 'Hide incident details' : 'View incident details'}</Text>
          <Ionicons name={detailsVisible ? 'chevron-up' : 'chevron-down'} size={19} color={colors.textMuted} />
        </Pressable>

        {detailsVisible ? (
          <View style={styles.detailsContent}>
            <MapCard
              coordinates={location.coordinates}
              incidentCoordinates={activeState.incidentCoordinates}
              height={190}
              label="Current live location"
            />
            <Card>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>Technical details</Text>
                <StatusBadge label={activeState.isDemo ? 'Demo SOS' : 'Prototype SOS'} tone="danger" />
              </View>
              <DetailRow label="Incident coordinates" value={formatCoordinates(activeState.incidentCoordinates)} />
              <DetailRow label="Current coordinates" value={formatCoordinates(location.coordinates)} />
              <DetailRow label="Realtime connection" value={connection} />
              <DetailRow label="Incident record" value={activeState.incidentId ? 'Stored in Supabase' : 'Unavailable'} />
            </Card>
            <Card>
              <Text style={styles.cardTitle}>Response timeline</Text>
              <View style={styles.timelineSpacing}>
                <IncidentTimeline
                  active
                  items={[
                    'SOS activated',
                    'Incident location captured',
                    `${assignedCount} linked guardians assigned`,
                    activeState.locationStatus === 'sharing' ? 'Live location sharing active' : 'Location sharing needs attention',
                  ]}
                />
              </View>
            </Card>
            <Button label="Emergency calling information" variant="secondary" icon="call-outline" onPress={() => setCallVisible(true)} />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.activeFooter}>
        <Button label="I am safe — end SOS" variant="primary" icon="shield-checkmark-outline" loading={ending} onPress={() => setEndVisible(true)} />
      </View>

      <ConfirmationModal
        visible={endVisible}
        title="End this SOS?"
        message="Live location sharing will stop and the completed incident will remain in cloud history."
        confirmLabel="End SOS"
        onCancel={() => setEndVisible(false)}
        onConfirm={() => {
          setEndVisible(false);
          setEnding(true);
          void endSosTest().finally(() => setEnding(false));
        }}
      />
      <ConfirmationModal
        visible={callVisible}
        title="Emergency calling is not active"
        message="Core Alert will connect emergency calling in a later phase. This prototype will not place a real call. If you are in danger, use your phone's dialler and contact official emergency services now."
        confirmLabel="Understood"
        cancelLabel="Close"
        onCancel={() => setCallVisible(false)}
        onConfirm={() => setCallVisible(false)}
      />
    </SafeAreaView>
  );
}

function LiveRow({ icon, title, value, ready }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  value: string;
  ready?: boolean;
}) {
  return (
    <View style={styles.liveRow}>
      <View style={[styles.liveIcon, ready && styles.liveIconReady]}>
        <Ionicons name={icon} size={20} color={ready ? colors.green : colors.navy} />
      </View>
      <View style={styles.liveCopy}>
        <Text style={styles.liveTitle}>{title}</Text>
        <Text style={styles.liveValue}>{value}</Text>
      </View>
      <View style={[styles.liveStatusDot, ready && styles.liveStatusReady]} />
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  countdownScreen: { flex: 1, backgroundColor: colors.redSoft, padding: spacing.lg },
  demoBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#FECDCA',
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  demoBadgeText: { color: colors.redDark, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  countdownContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pulseArea: { width: 230, height: 230, alignItems: 'center', justifyContent: 'center' },
  outerRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: colors.red,
    backgroundColor: 'rgba(240,68,68,0.08)',
  },
  innerRing: {
    width: 164,
    height: 164,
    borderRadius: 82,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 9,
    borderColor: '#FFD6D6',
  },
  countdownNumber: { color: colors.white, fontSize: 68, lineHeight: 72, fontWeight: '800', fontVariant: ['tabular-nums'] },
  secondsLabel: { color: '#FFE8E8', fontSize: 13, fontWeight: '600' },
  countdownTitle: { color: colors.text, fontSize: 27, fontWeight: '800', marginTop: 18 },
  countdownMessage: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 330,
    marginTop: 8,
  },
  countdownFooter: { gap: 12 },
  demoNote: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  activeScreen: { flex: 1, backgroundColor: colors.background },
  activeContent: { padding: spacing.lg, gap: 14, paddingBottom: 116 },
  activeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  liveDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.red, marginRight: 11 },
  activeHeaderCopy: { flex: 1 },
  activeEyebrow: { color: colors.redDark, fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  activeTitle: { color: colors.text, fontSize: 23, fontWeight: '800', marginTop: 2 },
  elapsed: { color: colors.navy, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  liveCard: { paddingVertical: 8 },
  liveRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center' },
  liveIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8EEF4' },
  liveIconReady: { backgroundColor: colors.greenSoft },
  liveCopy: { flex: 1, marginLeft: 11 },
  liveTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  liveValue: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  liveStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  liveStatusReady: { backgroundColor: colors.green },
  liveDivider: { height: 1, backgroundColor: colors.border, marginLeft: 51 },
  mockFootnote: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  issueText: { color: '#B54708', backgroundColor: colors.amberSoft, borderRadius: 10, padding: 10, fontSize: 11, lineHeight: 17 },
  detailsToggle: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, backgroundColor: colors.white, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border },
  detailsPressed: { opacity: 0.7 },
  detailsToggleIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#E8EEF4', alignItems: 'center', justifyContent: 'center' },
  detailsToggleText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700', marginLeft: 10 },
  detailsContent: { gap: 12 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  detailRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { color: colors.textSecondary, fontSize: 11 },
  detailValue: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 4 },
  timelineSpacing: { marginTop: 14 },
  activeFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingTop: 12, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
});
