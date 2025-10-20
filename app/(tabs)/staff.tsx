// app/(tabs)/staff.tsx
import { CameraView, useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { supabase } from "../../lib/supabase";

/** Inicia sesión como STAFF y garantiza membership en "Restaurante Demo" */
async function signInStaff() {
  const email = "staff@tiquetera.com";
  const password = "Demo1234!";

  // login → si no existe, signup + login
  const { data: inData } = await supabase.auth.signInWithPassword({ email, password });
  let user = inData?.user;
  if (!user) {
    await supabase.auth.signUp({ email, password });
    const { data: after } = await supabase.auth.signInWithPassword({ email, password });
    user = after?.user ?? null;
  }
  if (!user) {
    Alert.alert("Auth", "No fue posible iniciar sesión de staff.");
    return null;
  }

  // restaurante demo (tolerante)
  const { data: rest, error: restErr } = await supabase
    .from("restaurants")
    .select("id")
    .eq("name", "Restaurante Demo")
    .limit(1)
    .maybeSingle();
  if (restErr || !rest?.id) {
    Alert.alert("DB", restErr?.message ?? "Falta restaurante Demo");
    return user; // seguimos logueados, pero sin membership
  }

  // asegurar membership staff (upsert evita duplicados; requiere policy de UPDATE)
  const { error: memErr } = await supabase
    .from("memberships")
    .upsert({ user_id: user.id, restaurant_id: rest.id, role: "staff" });
  if (memErr) Alert.alert("DB", memErr.message);

  return user;
}

export default function StaffScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Evitar lecturas y alerts duplicados
  const scanningRef = useRef(false);
  const alertOpenRef = useRef(false);

  // Pedir permiso cámara + login staff al entrar
  useEffect(() => {
    (async () => {
      if (!permission?.granted) await requestPermission();
      await signInStaff();
    })();
  }, [permission, requestPermission]);

  const redeemByBookId = useCallback(async (bookId: string) => {
    try {
      // 1) leer ticket_book (tolerante)
      const { data: book, error: bErr } = await supabase
        .from("ticket_books")
        .select("*")
        .eq("id", bookId)
        .limit(1)
        .maybeSingle();
      if (bErr || !book) {
        if (!alertOpenRef.current) {
          alertOpenRef.current = true;
          Alert.alert("DB", bErr?.message ?? "No se encontró la tiquetera", [
            { text: "OK", onPress: () => (alertOpenRef.current = false) },
          ]);
        }
        return;
      }

      const remaining = book.meals_total - book.meals_used;
      if (remaining <= 0) {
        if (!alertOpenRef.current) {
          alertOpenRef.current = true;
          Alert.alert("Tiquetera", "Sin saldo disponible.", [
            { text: "OK", onPress: () => (alertOpenRef.current = false) },
          ]);
        }
        return;
      }

      // 2) staff actual
      const s = await supabase.auth.getSession();
      const staffUserId = s.data.session?.user?.id ?? null;

      // 3) registrar canje (RLS permite staff/admin del mismo restaurante)
      const { error: rErr } = await supabase
        .from("redemptions")
        .insert([{ ticket_book_id: bookId, staff_user_id: staffUserId }]);
      if (rErr) {
        if (!alertOpenRef.current) {
          alertOpenRef.current = true;
          Alert.alert("DB", rErr.message, [
            { text: "OK", onPress: () => (alertOpenRef.current = false) },
          ]);
        }
        return;
      }

      // 4) incrementar contador (tolerante)
      const { data: updated, error: uErr } = await supabase
        .from("ticket_books")
        .update({ meals_used: book.meals_used + 1 })
        .eq("id", bookId)
        .select()
        .maybeSingle();
      if (uErr || !updated) {
        if (!alertOpenRef.current) {
          alertOpenRef.current = true;
          Alert.alert("DB", uErr?.message ?? "Error actualizando", [
            { text: "OK", onPress: () => (alertOpenRef.current = false) },
          ]);
        }
        return;
      }

      if (!alertOpenRef.current) {
        alertOpenRef.current = true;
        Alert.alert(
          "Canje realizado",
          `Usados: ${updated.meals_used} / ${updated.meals_total}`,
          [{ text: "OK", onPress: () => (alertOpenRef.current = false) }]
        );
      }
    } catch (e: any) {
      if (!alertOpenRef.current) {
        alertOpenRef.current = true;
        Alert.alert("Error", e?.message ?? String(e), [
          { text: "OK", onPress: () => (alertOpenRef.current = false) },
        ]);
      }
    }
  }, []);

  const handleScan = ({ data }: { data: string }) => {
    if (scanningRef.current) return; // bloquea doble lectura en caliente
    scanningRef.current = true;
    setScanned(true);

    try {
      const parsed = JSON.parse(data);
      if (parsed?.t === "ticket_book" && parsed?.id) {
        redeemByBookId(parsed.id);
      } else {
        if (!alertOpenRef.current) {
          alertOpenRef.current = true;
          Alert.alert("QR inválido", "El código no corresponde a una tiquetera.", [
            { text: "OK", onPress: () => (alertOpenRef.current = false) },
          ]);
        }
      }
    } catch {
      if (!alertOpenRef.current) {
        alertOpenRef.current = true;
        Alert.alert("QR inválido", "No se pudo leer el contenido del código.", [
          { text: "OK", onPress: () => (alertOpenRef.current = false) },
        ]);
      }
    } finally {
      // cooldown para permitir reintentos
      setTimeout(() => {
        scanningRef.current = false;
        setScanned(false);
      }, 1800);
    }
  };

  if (!permission) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Solicitando permiso de cámara…</Text>
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Text style={{ textAlign: "center", marginBottom: 8 }}>
          Sin permiso de cámara.
        </Text>
        <Text style={{ textAlign: "center", opacity: 0.7 }}>
          Ve a Ajustes del sistema y habilita la cámara para esta app.
        </Text>
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
    </View>
  );
}
