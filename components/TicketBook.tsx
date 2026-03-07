import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../constants/tokens';

export type TicketBookProps = {
  name: string;
  total: number;
  used: number;
  onSelect?: (n: number) => void;
};

export default function TicketBook({ name, total, used, onSelect }: TicketBookProps) {
  const numbers = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>Tiquetera</Text>
      <Text style={styles.subtitle}>Nombre: <Text style={styles.subtitleStrong}>{name}</Text></Text>
      <Text style={styles.helper}>Almuerzos restantes: {Math.max(total - used, 0)} / {total}</Text>

      <View style={styles.grid}>
        {numbers.map((n) => {
          const consumed = n <= used;
          return (
            <Pressable
              key={n}
              accessibilityLabel={`Número ${n} ${consumed ? 'consumido' : 'disponible'}`}
              accessibilityRole="button"
              style={[styles.circle, consumed && styles.circleConsumed]}
              onPress={() => onSelect?.(n)}
            >
              <Text style={[styles.num, consumed && styles.numConsumed]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: tokens.spacing.lg,
    padding: tokens.spacing.lg,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 6, color: tokens.colors.text },
  subtitle: { fontSize: 16, marginBottom: 8, color: tokens.colors.text },
  subtitleStrong: { fontWeight: '600' },
  helper: { fontSize: 14, color: tokens.colors.mutedText, marginBottom: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  circle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: tokens.colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleConsumed: {
    backgroundColor: tokens.colors.dark,
    borderColor: tokens.colors.dark,
  },
  num: { fontSize: 16, fontWeight: '600', color: tokens.colors.dark },
  numConsumed: { color: tokens.colors.white, textDecorationLine: 'line-through' },
});
