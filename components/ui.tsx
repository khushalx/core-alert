import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '@/constants/theme';
import { LogoMark } from '@/components/LogoMark';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';
import { initials } from '@/utils/format';

export function Screen({ children }: PropsWithChildren) {
  return <SafeAreaView style={styles.screen} edges={['top']}>{children}</SafeAreaView>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: object }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function AppHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { state } = useApp();
  const { profile } = useAuth();
  return (
    <View style={styles.header}>
      <View style={styles.headerIdentity}>
        <LogoMark size={38} />
        <View style={styles.headerText}>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
          <Text style={styles.headerTitle}>{title ?? 'Core Alert'}</Text>
        </View>
      </View>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(profile?.full_name || state.profile.fullName || 'Core Alert')}</Text>
      </View>
    </View>
  );
}

type StatusTone = 'success' | 'danger' | 'warning' | 'neutral' | 'info';

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  return (
    <View style={[styles.badge, badgeStyles[tone]]}>
      <Text style={[styles.badgeText, badgeTextStyles[tone]]}>{label}</Text>
    </View>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type ButtonProps = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
};

export function Button({
  label,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const iconColor = variant === 'primary' || variant === 'danger' ? colors.white : colors.navy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      style={(pressState) => [
        styles.button,
        buttonStyles[variant],
        (disabled || loading) && styles.buttonDisabled,
        pressState.pressed && styles.buttonPressed,
        typeof style === 'function' ? style(pressState) : style,
      ]}
      {...props}>
      {loading ? <ActivityIndicator color={iconColor} /> : null}
      {!loading && icon ? <Ionicons name={icon} size={19} color={iconColor} /> : null}
      <Text style={[styles.buttonText, buttonTextStyles[variant]]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <Card style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.navy} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action}
    </Card>
  );
}

export function LoadingState({ label = 'Loading Core Alert…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.navy} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function Toast() {
  const { toast, storageError } = useApp();
  const message = toast?.message ?? storageError;
  if (!message) return null;
  return (
    <View style={styles.toastContainer}>
      <View style={styles.toast}>
        <Ionicons name={storageError && !toast ? 'warning' : 'checkmark-circle'} size={20} color={colors.white} />
        <Text style={styles.toastText}>{message}</Text>
      </View>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  success: { backgroundColor: colors.greenSoft },
  danger: { backgroundColor: colors.redSoft },
  warning: { backgroundColor: colors.amberSoft },
  neutral: { backgroundColor: colors.background },
  info: { backgroundColor: '#EEF4FF' },
});

const badgeTextStyles = StyleSheet.create({
  success: { color: '#067647' },
  danger: { color: colors.redDark },
  warning: { color: '#B54708' },
  neutral: { color: colors.textSecondary },
  info: { color: '#3538CD' },
});

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: colors.navy, borderColor: colors.navy },
  secondary: { backgroundColor: colors.white, borderColor: colors.borderStrong },
  danger: { backgroundColor: colors.red, borderColor: colors.red },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
});

const buttonTextStyles = StyleSheet.create({
  primary: { color: colors.white },
  secondary: { color: colors.navy },
  danger: { color: colors.white },
  ghost: { color: colors.navy },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.large,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerText: { marginLeft: spacing.sm, flex: 1 },
  headerSubtitle: { color: colors.textSecondary, fontSize: 12, marginBottom: 2 },
  headerTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '700' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8EEF4',
    borderWidth: 1,
    borderColor: '#CCD8E3',
  },
  avatarText: { color: colors.navy, fontSize: 13, fontWeight: '800' },
  badge: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  sectionAction: { color: colors.navy, fontSize: 14, fontWeight: '700' },
  button: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  emptyCard: { alignItems: 'center', paddingVertical: 36 },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#E8EEF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
  emptyMessage: {
    maxWidth: 280,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 18,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.textSecondary, fontSize: 14 },
  toastContainer: {
    pointerEvents: 'none',
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 102,
    alignItems: 'center',
    zIndex: 100,
  },
  toast: {
    maxWidth: 440,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.navy,
    borderRadius: 14,
  },
  toastText: { color: colors.white, fontSize: 13, lineHeight: 18, fontWeight: '600', flexShrink: 1 },
});
