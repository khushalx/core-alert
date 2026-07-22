import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';

export function SettingRow({
  icon,
  title,
  subtitle,
  trailing,
  disabled,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.icon}>
        <Ionicons name={icon} size={20} color={disabled ? colors.textMuted : colors.navy} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, disabled && styles.disabled]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.65 },
  icon: { width: 40 },
  copy: { flex: 1, paddingRight: 12 },
  title: { color: colors.text, fontSize: 14, fontWeight: '600' },
  subtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  disabled: { color: colors.textMuted },
});

