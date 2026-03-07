import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../../constants/tokens';
import { alertError } from '../../lib/error-utils';
import { supabase } from '../../lib/supabase';
import { ensureDemoSession } from '../../services/demo-auth';
import { ensureMembership, getDemoRestaurantId } from '../../services/demo-data';

type ConfirmData = { nonce: string; used: number; total: number; name: string };

async function bootstrapStaff() {
  const user = await ensureDemoSession('staff', true);
  const restaurantId = await getDemoRestaurantId();
  await ensureMembership(user.id, restaurantId, 'staff');
}

export default function StaffScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const scanningRef = useRef(false);
  const [scanned, setScanned] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmData | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!permission?.granted) await requestPermission();
        await bootstrapStaff();
      } catch (error) {
        alertError('Staff', error);
      }
    })();
  }, [permission, requestPermission]);

  function rearmScan(delay = 300) {
    setTimeout(() => {
      scanningRef.current = false;
      setScanned(false);
    }, delay);
  }

  const handleScan = async ({ data }: { data: string }) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanned(true);

    try {
      const parsed = JSON.parse(data);
      if (!(parsed?.t === 'redeem_token' && parsed?.nonce)) {
        Alert.alert('QR inválido', 'El código no es un token válido.');
        rearmScan();
        return;
      }

      const nonce: string = parsed.nonce;

      const { data: tok, error: tokenError } = await supabase
        .from('qr_tokens')
        .select('book_id, expires_at, used_at')
        .eq('nonce', nonce)
        .limit(1)
        .maybeSingle();

      if (tokenError || !tok) throw tokenError ?? new Error('Token no encontrado.');
      if (tok.used_at) throw new Error('Este token ya fue usado.');
      if (tok.expires_at && new Date(tok.expires_at).getTime() <= Date.now()) throw new Error('Este token expiró.');

      const { data: book, error: bookError } = await supabase
        .from('ticket_books')
        .select('id, meals_used, meals_total, user_id')
        .eq('id', tok.book_id)
        .limit(1)
        .maybeSingle();

      if (bookError || !book) throw bookError ?? new Error('No se encontró la tiquetera.');

      const remaining = (book.meals_total ?? 0) - (book.meals_used ?? 0);
      if (remaining <= 0) throw new Error('Sin saldo disponible.');

      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', book.user_id).maybeSingle();

      setConfirm({
        nonce,
        used: book.meals_used ?? 0,
        total: book.meals_total ?? 0,
        name: profile?.full_name || 'Cliente',
      });
    } catch (error) {
      alertError('Escaneo', error);
      rearmScan();
    }
  };

  const onConfirm = useCallback(async () => {
    if (!confirm || busy) return;
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc('redeem_with_token', { p_nonce: confirm.nonce });
      if (error) throw error;
      const updated = Array.isArray(data) ? data[0] : data;
      Alert.alert('Canje realizado', `Usados: ${updated.meals_used} / ${updated.meals_total}`);
    } catch (error) {
      alertError('Canje', error);
    } finally {
      setBusy(false);
      setConfirm(null);
      rearmScan();
    }
  }, [confirm, busy]);

  if (!permission) return <View style={styles.centered}><Text>Solicitando permiso…</Text></View>;
  if (!permission.granted) return <View style={styles.centered}><Text>Sin permiso de cámara.</Text></View>;

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : (res) => handleScan({ data: res.data })}
      />
      <View style={styles.overlayTop}>
        <Text style={styles.overlayLabel}>Apunta al QR del cliente</Text>
      </View>

      {confirm && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirmar canje</Text>
            <Text style={styles.modalText}>Cliente: {confirm.name}</Text>
            <Text style={styles.modalText}>Usados: {confirm.used} / {confirm.total}</Text>
            <Text style={styles.helper}>Restantes: {Math.max(confirm.total - confirm.used, 0)}</Text>

            <View style={styles.modalButtons}>
              <Pressable onPress={() => { setConfirm(null); rearmScan(200); }} style={[styles.button, styles.cancelButton]}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={onConfirm} disabled={busy} style={[styles.button, busy ? styles.disabledButton : styles.primaryButton]}>
                <Text style={styles.buttonText}>{busy ? 'Procesando…' : 'Confirmar'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlayTop: { position: 'absolute', top: 40, left: 0, right: 0, alignItems: 'center' },
  overlayLabel: { backgroundColor: 'rgba(0,0,0,0.6)', color: tokens.colors.white, padding: 8, borderRadius: 8 },
  modalOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: tokens.colors.overlay, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl,
  },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: tokens.colors.white, borderRadius: tokens.radius.lg, padding: tokens.spacing.lg, gap: tokens.spacing.sm },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalText: { fontWeight: '600' },
  helper: { color: tokens.colors.mutedText },
  modalButtons: { flexDirection: 'row', gap: tokens.spacing.sm, marginTop: tokens.spacing.sm },
  button: { flex: 1, padding: tokens.spacing.md, borderRadius: tokens.radius.md, alignItems: 'center' },
  primaryButton: { backgroundColor: tokens.colors.primary },
  disabledButton: { backgroundColor: '#9ca3af' },
  cancelButton: { backgroundColor: tokens.colors.border },
  buttonText: { color: tokens.colors.white, fontWeight: '700' },
  cancelText: { fontWeight: '700' },
});
