import { CameraView, useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { supabase } from "../../lib/supabase";

async function signInStaff() {
  const email = "staff@tiquetera.com";
  const password = "Demo1234!";

  await supabase.auth.signOut();

  const { data: inData } = await supabase.auth.signInWithPassword({ email, password });
  let user = inData?.user;
  if (!user) {
    await supabase.auth.signUp({ email, password });
    const { data: after } = await supabase.auth.signInWithPassword({ email, password });
    user = after?.user ?? null;
  }
  if (!user) { Alert.alert("Auth", "No fue posible iniciar sesión de staff."); return null; }

  const { data: rest } = await supabase
    .from("restaurants").select("id")
    .eq("name", "Restaurante Demo").order("created_at", { ascending: false })
    .limit(1).maybeSingle();

  if (rest?.id) {
    const { data: exists } = await supabase
      .from("memberships").select("user_id")
      .eq("user_id", user.id).eq("restaurant_id", rest.id).limit(1);
    if (!exists || exists.length === 0) {
      await supabase.from("memberships").insert([{ user_id: user.id, restaurant_id: rest.id, role: "staff" }]);
    }
  }
  return user;
}

type ConfirmData = { nonce: string; bookId: string; used: number; total: number };

export default function StaffScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const scanningRef = useRef(false);
  const [scanned, setScanned] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmData | null>(null);
  const [busy, setBusy] = useState(false);
  const alertOpenRef = useRef(false);

  useEffect(() => {
    (async () => {
      if (!permission?.granted) await requestPermission();
      await signInStaff();
    })();
  }, [permission, requestPermission]);

  const openAlertOnce = (title: string, msg: string) => {
    if (alertOpenRef.current) return;
    alertOpenRef.current = true;
    Alert.alert(title, msg, [{ text: "OK", onPress: () => (alertOpenRef.current = false) }]);
  };

  // 👉 Helper: rearmar el escaneo tras un error/early-return
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
      if (!(parsed?.t === "redeem_token" && parsed?.nonce)) {
        openAlertOnce("QR inválido", "El código no es un token válido.");
        rearmScan();
        return;
      }

      const nonce: string = parsed.nonce;

      // 1) Leer token
      const { data: tok, error: tErr } = await supabase
        .from("qr_tokens")
        .select("book_id, expires_at, used_at")
        .eq("nonce", nonce)
        .limit(1)
        .maybeSingle();
      if (tErr || !tok) {
        openAlertOnce("Token", tErr?.message ?? "Token no encontrado o no autorizado.");
        rearmScan();
        return;
      }
      if (tok.used_at) {
        openAlertOnce("Token", "Este token ya fue usado.");
        rearmScan();
        return;
      }
      if (tok.expires_at && new Date(tok.expires_at).getTime() <= Date.now()) {
        openAlertOnce("Token", "Este token expiró.");
        rearmScan();
        return;
      }

      // 2) Leer libro para mostrar saldo
      const { data: book, error: bErr } = await supabase
        .from("ticket_books")
        .select("id, meals_used, meals_total")
        .eq("id", tok.book_id)
        .limit(1)
        .maybeSingle();
      if (bErr || !book) {
        openAlertOnce("DB", bErr?.message ?? "No se encontró la tiquetera.");
        rearmScan();
        return;
      }

      const remaining = (book.meals_total ?? 0) - (book.meals_used ?? 0);
      if (remaining <= 0) {
        openAlertOnce("Tiquetera", "Sin saldo disponible.");
        rearmScan();
        return;
      }

      // 3) Abrir confirmación (NO rearmar: se rearmará tras confirmar/cancelar)
      setConfirm({ nonce, bookId: book.id, used: book.meals_used ?? 0, total: book.meals_total ?? 0 });
    } catch {
      openAlertOnce("QR inválido", "No se pudo leer el contenido del código.");
      rearmScan();
    }
  };

  const onCancel = () => {
    setConfirm(null);
    rearmScan(200);
  };

  const onConfirm = useCallback(async () => {
    if (!confirm || busy) return;
    try {
      setBusy(true);

      const { data, error } = await supabase.rpc("redeem_with_token", { p_nonce: confirm.nonce });
      if (error) { openAlertOnce("DB", error.message); return; }

      const updated = Array.isArray(data) ? data[0] : data;
      openAlertOnce("Canje realizado", `Usados: ${updated.meals_used} / ${updated.meals_total}`);
    } catch (e: any) {
      openAlertOnce("Error", e?.message ?? String(e));
    } finally {
      setBusy(false);
      setConfirm(null);
      rearmScan(300);
    }
  }, [confirm, busy]);

  if (!permission) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text>Solicitando permiso…</Text></View>;
  }
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Text style={{ textAlign: "center", marginBottom: 8 }}>Sin permiso de cámara.</Text>
        <Text style={{ textAlign: "center", opacity: 0.7 }}>Activa la cámara para esta app.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : (res) => handleScan({ data: res.data })}
      />
      <View style={{ position: "absolute", top: 40, left: 0, right: 0, alignItems: "center" }}>
        <Text style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff", padding: 8, borderRadius: 8 }}>
          Apunta al QR del cliente
        </Text>
      </View>

      {confirm && (
        <View style={{
          position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 20
        }}>
          <View style={{ width: "100%", maxWidth: 380, backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: "700" }}>Confirmar canje</Text>
            <Text>Usados: {confirm.used} / {confirm.total}</Text>
            <Text style={{ opacity: 0.7 }}>Restantes: {Math.max(confirm.total - confirm.used, 0)}</Text>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Pressable
                onPress={onCancel}
                style={{ flex: 1, padding: 12, backgroundColor: "#e5e7eb", borderRadius: 12, alignItems: "center" }}
              >
                <Text style={{ fontWeight: "700" }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                disabled={busy}
                style={{
                  flex: 1, padding: 12,
                  backgroundColor: busy ? "#9ca3af" : "#2563eb",
                  borderRadius: 12, alignItems: "center"
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>{busy ? "Procesando…" : "Confirmar"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
