import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { supabase } from "../../lib/supabase";

// (opcional) helper por si abres esta pestaña sin pasar por Home
async function ensureSession() {
  const s = await supabase.auth.getSession();
  const userId = s.data.session?.user?.id;
  if (userId) return userId;

  // usuario demo (cliente)
  const email = "demo@tiquetera.com";
  const password = "Demo1234!";
  const { data: inData } = await supabase.auth.signInWithPassword({ email, password });
  let user = inData?.user;
  if (!user) {
    await supabase.auth.signUp({ email, password });
    const { data: after } = await supabase.auth.signInWithPassword({ email, password });
    user = after?.user ?? null;
  }
  return user?.id ?? null;
}

export default function MyQR() {
  const [bookId, setBookId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // 1) sesión del usuario
        const userId = await ensureSession();
        if (!userId) { Alert.alert("Auth", "No hay sesión de usuario."); setLoading(false); return; }

        // 2) restaurante demo
        const { data: rest, error: restErr } = await supabase
          .from("restaurants").select("id")
          .eq("name", "Restaurante Demo").limit(1).maybeSingle();
        if (restErr || !rest?.id) { Alert.alert("DB", restErr?.message ?? "Falta restaurante Demo"); setLoading(false); return; }
        const restaurantId = rest.id;

        // 3) membership (SELECT → INSERT si falta)
        const { data: memRows, error: memSelErr } = await supabase
          .from("memberships")
          .select("user_id")
          .eq("user_id", userId)
          .eq("restaurant_id", restaurantId)
          .limit(1);
        if (memSelErr) { Alert.alert("DB", memSelErr.message); setLoading(false); return; }
        if (!memRows || memRows.length === 0) {
          const { error: memInsErr } = await supabase
            .from("memberships")
            .insert([{ user_id: userId, restaurant_id: restaurantId, role: "customer" }]);
          if (memInsErr) { Alert.alert("DB", memInsErr.message); setLoading(false); return; }
        }

        // 4) plan (para crear book si falta)
        const { data: plan } = await supabase
          .from("meal_plans").select("id, meals_total")
          .eq("restaurant_id", restaurantId).eq("name", "Plan 30")
          .limit(1).maybeSingle();
        const planId = plan?.id ?? null;
        const totalMeals = plan?.meals_total ?? 30;

        // 5) buscar tiquetera de este restaurante para el usuario
        const { data: book } = await supabase
          .from("ticket_books")
          .select("id")
          .eq("user_id", userId)
          .eq("restaurant_id", restaurantId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let tid = book?.id ?? null;

        // 6) si no existe, crearla ligada al restaurante y plan
        if (!tid) {
          const { data: newBook, error: cErr } = await supabase
            .from("ticket_books")
            .insert([{
              user_id: userId,
              meals_total: totalMeals,
              restaurant_id: restaurantId,
              meal_plan_id: planId
            }])
            .select("id").maybeSingle();
          if (cErr || !newBook?.id) { Alert.alert("DB", cErr?.message ?? "No se pudo crear la tiquetera"); setLoading(false); return; }
          tid = newBook.id;
        }

        setBookId(tid);
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={{ flex:1, alignItems:"center", justifyContent:"center", gap:12 }}>
        <ActivityIndicator />
        <Text>Creando / buscando tu tiquetera…</Text>
      </View>
    );
  }

  if (!bookId) {
    return (
      <View style={{ flex:1, alignItems:"center", justifyContent:"center", padding:16 }}>
        <Text style={{ textAlign:"center" }}>
          No se encontró tu tiquetera. Abre la pestaña Home para crearla e inténtalo de nuevo.
        </Text>
      </View>
    );
  }

  // Payload del QR (simple). En la siguiente fase lo firmaremos con un token corto.
  const payload = JSON.stringify({ t: "ticket_book", id: bookId, ts: Date.now() });

  return (
    <View style={{ flex:1, alignItems:"center", justifyContent:"center", gap:12, padding:16 }}>
      <Text style={{ fontSize:18, fontWeight:"600" }}>Mi QR de tiquetera</Text>
      <QRCode value={payload} size={220} />
      <Text style={{ opacity:0.6, fontSize:12, textAlign:"center" }}>
        Muestra este código al personal del restaurante para canjear.
      </Text>
    </View>
  );
}
