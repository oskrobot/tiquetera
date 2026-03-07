import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../../constants/tokens';

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Centro de demo</Text>
      <Text style={styles.subtitle}>Usa estas rutas para validar el flujo completo de la tiquetera.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Flujo recomendado</Text>
        <Text style={styles.item}>1. Actualiza tu nombre en Home.</Text>
        <Text style={styles.item}>2. Genera QR temporal en Mi QR.</Text>
        <Text style={styles.item}>3. Escanéalo y confirma desde Staff.</Text>
      </View>

      <View style={styles.links}>
        <Link href="/(tabs)" style={styles.link}>Ir a Home</Link>
        <Link href="/(tabs)/qr" style={styles.link}>Ir a Mi QR</Link>
        <Link href="/(tabs)/staff" style={styles.link}>Ir a Staff</Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: tokens.spacing.lg, gap: tokens.spacing.lg, backgroundColor: '#f9fafb' },
  title: { fontSize: 24, fontWeight: '800', color: tokens.colors.text },
  subtitle: { color: tokens.colors.mutedText },
  card: { backgroundColor: tokens.colors.white, borderRadius: tokens.radius.lg, padding: tokens.spacing.lg, gap: tokens.spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  item: { color: tokens.colors.text },
  links: { gap: tokens.spacing.sm },
  link: { color: tokens.colors.primary, fontWeight: '700' },
});
