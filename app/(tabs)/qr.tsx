import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { supabase } from "../../lib/supabase";

async function ensureSession() {
  const s = await supabase.auth.getSession();
  const userId = s.data.session?.user?.id;
  if (userId) return userId;

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
  const [nonce, setNonce] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);

  // Carga/crea book activo y emite token
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const userId = await ensureSession();
        if (!userId) { Alert.alert("Auth", "No hay sesión de usuario."); setLoading(false); return; }

        // Restaurante Demo
        const { data: rest, error: restErr } = await supabase
          .from("restaurants").select("id")
          .eq("name", "Restaurante Demo").order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (restErr || !rest?.id) { Alert.alert("DB", restErr?.message ?? "Falta restaurante Demo"); setLoading(false); return; }

        // Membership cliente (si falta, crear)
        const { data: mm } = await supabase
          .from("memberships").select("user_id")
          .eq("user_id", userId).eq("restaurant_id", rest.id).limit(1);
        if (!mm || mm.length === 0) {
          const { error: memInsErr } = await supabase
            .from("memberships").insert([{ user_id: userId, restaurant_id: rest.id, role: "customer" }]);
          if (memInsErr) { Alert.alert("DB", memInsErr.message); setLoading(false); return; }
        }

        // Plan 30 (solo para crear book si falta)
        const { data: plan } = await supabase
          .from("meal_plans").select("id, meals_total")
          .eq("restaurant_id", rest.id).eq("name", "Plan 30")
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        const planId = plan?.id ?? null;
        const totalMeals = plan?.meals_total ?? 30;

        // Book ACTIVO más reciente
        const { data: book } = await supabase
          .from("ticket_books").select("id")
          .eq("user_id", userId).eq("restaurant_id", rest.id).eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();

        let tid = book?.id ?? null;
        if (!tid) {
          const { data: created, error: cErr } = await supabase
            .from("ticket_books")
            .insert([{ user_id: userId, meals_total: totalMeals, restaurant_id: rest.id, meal_plan_id: planId, status: "active" }])
            .select("id").maybeSingle();
          if (cErr || !created?.id) { Alert.alert("DB", cErr?.message ?? "No se pudo crear la tiquetera"); setLoading(false); return; }
          tid = created.id;
        }
        setBookId(tid);

        // Emitir token inicial
        await issueToken(tid);
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function issueToken(bookId: string) {
    try {
      setIssuing(true);
      const exp = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // 2 minutos
      const { data, error } = await supabase
        .from("qr_tokens")
        .insert([{ book_id: bookId, expires_at: exp }])
        .select("nonce, expires_at")
        .maybeSingle();
      if (error || !data?.nonce) { Alert.alert("DB", error?.message ?? "No se pudo generar el QR"); return; }
      setNonce(String(data.nonce));
      setExpiresAt(data.expires_at);
    } finally {
      setIssuing(false);
    }
  }

  if (loading || !bookId) {
    return (
      <View style={{ flex:1, alignItems:"center", justifyContent:"center", gap:12 }}>
        <ActivityIndicator />
        <Text>Preparando tu QR…</Text>
      </View>
    );
  }

  const payload = nonce
    ? JSON.stringify({ t: "redeem_token", nonce })
    : "{}";

  return (
    <View style={{ flex:1, alignItems:"center", justifyContent:"center", gap:12, padding:16 }}>
      <Text style={{ fontSize:18, fontWeight:"600" }}>Mi QR de tiquetera</Text>

      {nonce ? <QRCode value={payload} size={220} /> : <ActivityIndicator />}

      {!!expiresAt && (
        <Text style={{ opacity:0.6, fontSize:12, textAlign:"center" }}>
          Vence: {new Date(expiresAt).toLocaleTimeString()}
        </Text>
      )}

      <Pressable
        onPress={() => issueToken(bookId)}
        disabled={issuing}
        style={{ padding: 12, backgroundColor: issuing ? "#9ca3af" : "#2563eb", borderRadius: 12 }}
      >
        <Text style={{ color:"#fff", fontWeight:"700" }}>{issuing ? "Generando…" : "Actualizar QR"}</Text>
      </Pressable>

      <Text style={{ opacity:0.6, fontSize:12, textAlign:"center" }}>
        Muestra este código al personal del restaurante para canjear.
      </Text>
    </View>
  );
}
