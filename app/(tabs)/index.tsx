import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator } from 'react-native';
import TicketBook from '../../components/TicketBook';
import { tokens } from '../../constants/tokens';
import { MAX_TOTAL } from '../../services/demo-data';
import { useHomeTicketBook } from '../../hooks/use-home-ticket-book';

export default function Home() {
  const {
    bookId,
    used,
    total,
    loading,
    refreshing,
    redemptions,
    name,
    setName,
    savingName,
    loadAll,
    redeemOne,
    renew,
    addDemoMeals,
    resetDemo,
    saveName,
  } = useHomeTicketBook();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text>Cargando tu tiquetera…</Text>
      </View>
    );
  }

  const remaining = Math.max(total - used, 0);

  return (
    <FlatList
      data={redemptions}
      keyExtractor={(item) => item.id}
      refreshing={refreshing}
      onRefresh={() => (bookId ? loadAll(bookId) : undefined)}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.container}>
          <View style={[styles.card, styles.profileCard]}>
            <Text style={styles.cardTitle}>Tu perfil</Text>
            <Text style={styles.helper}>Este nombre aparecerá al personal al confirmar un canje.</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Tu nombre" style={styles.input} />
            <Pressable onPress={saveName} disabled={savingName} style={[styles.button, styles.primaryButton, savingName && styles.disabledButton]}>
              <Text style={styles.buttonText}>{savingName ? 'Guardando…' : 'Guardar nombre'}</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.summaryTitle}>Hola, {name}</Text>
            <Text style={styles.summaryAmount}>{remaining} restantes</Text>
            <Text style={styles.helper}>Usados: {used} / {total}</Text>
          </View>

          <TicketBook name={name} total={total} used={used} />

          <View style={styles.actions}>
            <Pressable onPress={redeemOne} style={[styles.button, styles.primaryButton]}>
              <Text style={styles.buttonText}>Canjear 1 almuerzo (Home)</Text>
            </Pressable>

            <Pressable
              onPress={renew}
              disabled={!(used >= total || total >= MAX_TOTAL)}
              style={[styles.button, used >= total || total >= MAX_TOTAL ? styles.darkButton : styles.disabledButton]}
            >
              <Text style={styles.buttonText}>Renovar tiquetera</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                Alert.alert('Reiniciar demo', 'Esto borrará los canjes y pondrá usados=0. ¿Continuar?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Sí, reiniciar', style: 'destructive', onPress: () => void resetDemo() },
                ]);
              }}
              style={[styles.button, styles.dangerButton]}
            >
              <Text style={styles.buttonText}>Reiniciar demo (borra canjes)</Text>
            </Pressable>

            <Text style={styles.cardTitle}>Recargar almuerzos (demo)</Text>
            <View style={styles.row}>
              <Pressable onPress={() => addDemoMeals(5)} style={[styles.button, styles.successButton, styles.flex]}>
                <Text style={styles.buttonText}>+5</Text>
              </Pressable>
              <Pressable onPress={() => addDemoMeals(10)} style={[styles.button, styles.successButtonDark, styles.flex]}>
                <Text style={styles.buttonText}>+10</Text>
              </Pressable>
            </View>
            <Text style={styles.helper}>(Solo para pruebas; en producción se hará tras el pago)</Text>
          </View>

          <Text style={styles.sectionTitle}>Historial de canjes</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>Aún no hay canjes.</Text>}
      renderItem={({ item }) => (
        <View style={styles.historyItem}>
          <Text>Canje #{item.id.slice(0, 8)}</Text>
          <Text style={styles.historyDate}>{new Date(item.redeemed_at).toLocaleString()}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: tokens.spacing.lg, gap: tokens.spacing.lg },
  listContent: { paddingBottom: 80 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.md },
  card: { padding: tokens.spacing.lg, borderRadius: tokens.radius.lg, backgroundColor: tokens.colors.card, gap: tokens.spacing.sm },
  profileCard: { backgroundColor: tokens.colors.primarySoft },
  cardTitle: { fontSize: 16, fontWeight: '700', color: tokens.colors.text },
  summaryTitle: { fontSize: 18, fontWeight: '700', color: tokens.colors.text },
  summaryAmount: { fontSize: 28, fontWeight: '800', color: tokens.colors.text },
  helper: { fontSize: 12, color: tokens.colors.mutedText },
  input: { padding: tokens.spacing.md, backgroundColor: tokens.colors.white, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: '#c7d2fe' },
  actions: { gap: tokens.spacing.sm },
  button: { padding: tokens.spacing.md, borderRadius: tokens.radius.md, alignItems: 'center' },
  buttonText: { color: tokens.colors.white, fontWeight: '700' },
  primaryButton: { backgroundColor: tokens.colors.primary },
  darkButton: { backgroundColor: tokens.colors.dark },
  successButton: { backgroundColor: '#10b981' },
  successButtonDark: { backgroundColor: tokens.colors.success },
  dangerButton: { backgroundColor: tokens.colors.danger },
  disabledButton: { backgroundColor: '#9ca3af' },
  row: { flexDirection: 'row', gap: tokens.spacing.sm },
  flex: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: tokens.colors.text },
  empty: { opacity: 0.6, marginTop: 8, paddingHorizontal: 16 },
  historyItem: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: tokens.colors.border },
  historyDate: { opacity: 0.7, fontSize: 12 },
});
