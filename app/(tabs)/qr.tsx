import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useQrToken } from '../../hooks/use-qr-token';
import { tokens } from '../../constants/tokens';

export default function MyQR() {
  const { bookId, nonce, expiresAt, secondsRemaining, loading, issuing, issueToken } = useQrToken();

  if (loading || !bookId) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text>Preparando tu QR…</Text>
      </View>
    );
  }

  const payload = nonce ? JSON.stringify({ t: 'redeem_token', nonce }) : '{}';
  const isExpired = secondsRemaining <= 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mi QR de tiquetera</Text>
      {nonce ? <QRCode value={payload} size={220} /> : <ActivityIndicator />}

      {!!expiresAt && (
        <Text style={styles.helper}>
          {isExpired ? 'Expirado. Genera uno nuevo.' : `Vence en ${secondsRemaining}s (${new Date(expiresAt).toLocaleTimeString()})`}
        </Text>
      )}

      <Pressable
        onPress={() => issueToken(bookId)}
        disabled={issuing}
        style={[styles.button, issuing ? styles.disabled : styles.primary]}
      >
        <Text style={styles.buttonText}>{issuing ? 'Generando…' : 'Actualizar QR'}</Text>
      </Pressable>

      <Text style={styles.helper}>El QR se renueva automáticamente antes de expirar.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.md, padding: tokens.spacing.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.md },
  title: { fontSize: 18, fontWeight: '600', color: tokens.colors.text },
  helper: { color: tokens.colors.mutedText, fontSize: 12, textAlign: 'center' },
  button: { padding: tokens.spacing.md, borderRadius: tokens.radius.md },
  primary: { backgroundColor: tokens.colors.primary },
  disabled: { backgroundColor: '#9ca3af' },
  buttonText: { color: tokens.colors.white, fontWeight: '700' },
});
