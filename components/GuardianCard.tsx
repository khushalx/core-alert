import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, StatusBadge } from '@/components/ui';
import { colors } from '@/constants/theme';
import type { GuardianRelationship } from '@/types/cloud';
import { initials } from '@/utils/format';

export function GuardianCard({ guardian, onPress }: { guardian: GuardianRelationship; onPress: () => void }) {
  const status = guardian.status === 'accepted'
    ? 'Ready'
    : guardian.status === 'declined'
      ? 'Declined'
      : guardian.guardian_email
        ? 'Invitation pending'
        : 'Not linked';
  const tone = guardian.status === 'accepted' ? 'success' : guardian.status === 'declined' ? 'danger' : 'warning';
  return (
    <Card style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${guardian.guardian_name} details`} onPress={onPress} style={({ pressed }) => [styles.mainAction, pressed && styles.pressed]}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(guardian.guardian_name)}</Text></View>
        <View style={styles.copy}>
          <View style={styles.nameRow}><Text style={styles.name}>{guardian.guardian_name}</Text>{guardian.is_primary ? <StatusBadge label="Primary" tone="info" /> : null}</View>
          <Text style={styles.relationship}>{guardian.relationship || 'Trusted contact'}</Text>
          <View style={styles.badges}><StatusBadge label={status} tone={tone} /><StatusBadge label={guardian.guardian_user_id ? 'Linked' : 'Contact only'} tone="neutral" /></View>
        </View>
        <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12, padding: 0, overflow: 'hidden' },
  mainAction: { flexDirection: 'row', alignItems: 'center', padding: 16 }, pressed: { opacity: 0.65, backgroundColor: colors.background },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E8EEF4', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.navy, fontSize: 13, fontWeight: '800' },
  copy: { flex: 1, marginHorizontal: 12 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }, name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  relationship: { color: colors.textSecondary, fontSize: 12, marginTop: 3 }, badges: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
});
