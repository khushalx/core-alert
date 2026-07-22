import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';

type LogoMarkProps = {
  size?: number;
  inverse?: boolean;
};

export function LogoMark({ size = 42, inverse = false }: LogoMarkProps) {
  const backgroundColor = inverse ? colors.white : colors.navy;
  const iconColor = inverse ? colors.navy : colors.white;
  return (
    <View
      accessibilityLabel="Core Alert temporary shield mark"
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size * 0.3, backgroundColor },
      ]}>
      <Ionicons name="shield-checkmark" size={size * 0.58} color={iconColor} />
      <View
        style={[
          styles.pin,
          {
            width: size * 0.2,
            height: size * 0.2,
            borderRadius: size * 0.1,
            right: size * 0.11,
            bottom: size * 0.08,
          },
        ]}>
        <Ionicons name="location" size={size * 0.13} color={colors.white} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  pin: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: colors.white,
  },
});

