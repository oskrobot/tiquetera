// app/(tabs)/index.tsx
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from "react-native";
import TicketBook from "../../components/TicketBook";
import { supabase } from "../../lib/supabase";

/** Auth de desarrollo (email/password demo) */
async function signInOrSignUp(email: string, password: string) {
  const { data: inData } = await supabase.auth.signInWithPassword({ email, password });
  if (inData?.user) return inData.user;

  const { error: upErr } = await supabase.auth.signUp({ email, password });
  if (upErr) { Alert.alert("Auth", upErr.message); return null; }

  const { data: after, error: afterErr } = await supabase.auth.signInWithPassword({ email, password });
  if (afterErr || !after?.user) {
    Alert.alert("Auth", "No hay sesión. Desactiva 'Confirm email' en Supabase o confirma el correo.");
    return null;
  }
  return after.user;
}

type Redemption = { id: string; redeemed_at: string };

export default function Home() {
  const [bookId, setBookId] = useState<string | null>(null);
  const [used, setUsed] = useState(0);
  const [total, setTotal] = useState(30); // fallback
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);

  /** Crear/buscar la tiquetera ligada al restaurante demo + plan, y cargar historial */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const email = "demo@tiquetera.com";
      const password = "Demo1234!";

      const user = await signInOrSignUp(email, password);
      if (!user) { setLoading(false); return; }

      // Restaurante Demo (tolerante)
      const { data: rest, error: restErr } = await supabase
        .from("restaurants").select("id")
        .eq("name", "Restaurante Demo").limit(1).maybeSingle();
      if (restErr || !rest?.id) { Alert.alert("DB", restErr?.message ?? "Falta restaurante Demo"); setLoading(false); return; }
      const restaurantId = rest.id;

      // Membership cliente
      const { error: memErr } = await supabase
        .from("memberships").upsert({ user_id: user.id, restaurant_id: restaurantId, role: "customer" });
      if (memErr) { Alert.alert("DB", memErr.message); setLoading(false); return; }

      // Plan 30 (tolerante)
      const { data: plan, error: planErr } = await supabase
        .from("meal_plans").select("id, meals_total")
        .eq("restaurant_id", restaurantId).eq("name", "Plan 30")
        .limit(1).maybeSingle();
      if (planErr || !plan?.id) { Alert.alert("DB", planErr?.message ?? "Falta crear Plan 30"); setLoading(false); return; }
      const planId = plan.id;
      const totalMeals = plan.meals_total ?? 30;

      // Book del usuario para ese restaurante
      const { data: books, error: selErr } = await supabase
        .from("ticket_books").select("*")
        .eq("user_id", user.id).eq("restaurant_id", restaurantId)
        .limit(1);
      if (selErr) { Alert.alert("DB", selErr.message); setLoading(false); return; }

      let book = books?.[0];
      if (!book) {
        const { data, error } = await supabase
          .from("ticket_books")
          .insert([{ user_id: user.id, meals_total: totalMeals, restaurant_id: restaurantId, meal_plan_id: planId }])
          .select().maybeSingle();
        if (error || !data) { Alert.alert("DB", error?.message ?? "No se pudo crear la tiquetera"); setLoading(false); return; }
        book = data;
      }

      setBookId(book.id);
      setUsed(book.meals_used ?? 0);
      setTotal(book.meals_total ?? totalMeals);

      await loadHistory(book.id);
      setLoading(false);
    })();
  }, []);

  /** Carga book y últimos 10 canjes */
  const loadAll = useCallback(async (id: string) => {
    setRefreshing(true);
    const [{ data: book }, { data: rows }] = await Promise.all([
      supabase.from("ticket_books").select("*").eq("id", id).limit(1).maybeSingle(),
      supabase.from("redemptions").select("id, redeemed_at").eq("ticket_book_id", id).order("redeemed_at", { ascending: false }).limit(10)
    ]);
    if (book) {
      setUsed(book.meals_used ?? 0);
      setTotal(book.meals_total ?? total);
    }
    setRedemptions(rows ?? []);
    setRefreshing(false);
  }, [total]);

  /** Solo historial */
  const loadHistory = useCallback(async (id: string) => {
    const { data: rows } = await supabase
      .from("redemptions")
      .select("id, redeemed_at")
      .eq("ticket_book_id", id)
      .order("redeemed_at", { ascending: false })
      .limit(10);
    setRedemptions(rows ?? []);
  }, []);

  /** Refrescar al volver a la pestaña */
  useFocusEffect(useCallback(() => {
    if (bookId) loadAll(bookId);
  }, [bookId, loadAll]));

  /** Suscripciones en tiempo real */
  useEffect(() => {
    if (!bookId) return;
    const chBook = supabase
      .channel("book_updates")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "ticket_books", filter: `id=eq.${bookId}` },
        (payload) => {
          const nextUsed = (payload.new as any)?.meals_used;
          const nextTotal = (payload.new as any)?.meals_total;
          if (typeof nextUsed === "number") setUsed(nextUsed);
          if (typeof nextTotal === "number") setTotal(nextTotal);
        }
      )
      .subscribe();

    const chRedeem = supabase
      .channel("redeem_inserts")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "redemptions", filter: `ticket_book_id=eq.${bookId}` },
        () => loadHistory(bookId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chBook);
      supabase.removeChannel(chRedeem);
    };
  }, [bookId, loadHistory]);

  /** Canje manual desde Home (pruebas) */
  async function redeemOne() {
    try {
      if (!bookId) { Alert.alert("Tiquetera", "No hay tiquetera activa."); return; }

      const { data: book } = await supabase
        .from("ticket_books").select("*").eq("id", bookId).limit(1).maybeSingle();
      if (!book) { Alert.alert("DB", "No se encontró la tiquetera"); return; }

      const remaining = (book.meals_total ?? total) - (book.meals_used ?? 0);
      if (remaining <= 0) { Alert.alert("Tiquetera", "Sin saldo disponible."); return; }

      const { error: rErr } = await supabase.from("redemptions").insert([{ ticket_book_id: bookId }]);
      if (rErr) { Alert.alert("DB", rErr.message); return; }

      const { data: updated, error: uErr } = await supabase
        .from("ticket_books")
        .update({ meals_used: (book.meals_used ?? 0) + 1 })
        .eq("id", bookId)
        .select().maybeSingle();
      if (uErr || !updated) { Alert.alert("DB", uErr?.message ?? "Error actualizando"); return; }

      setUsed(updated.meals_used ?? used + 1);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    }
  }

/** Agregar almuerzos al plan actual (demo) */
async function addMeals(delta: number) {
  try {
    if (!bookId) { Alert.alert("Tiquetera", "No hay tiquetera activa."); return; }

    const { data: book } = await supabase
      .from("ticket_books")
      .select("meals_total, meals_used")
      .eq("id", bookId)
      .limit(1)
      .maybeSingle();

    if (!book) { Alert.alert("DB", "No se encontró la tiquetera"); return; }

    const newTotal = (book.meals_total ?? total) + delta;

    const { data: updated, error: uErr } = await supabase
      .from("ticket_books")
      .update({ meals_total: newTotal })
      .eq("id", bookId)
      .select()
      .maybeSingle();

    if (uErr || !updated) {
      Alert.alert("DB", uErr?.message ?? "No se pudo recargar");
      return;
    }

    // Actualiza UI de inmediato (también llegará por realtime)
    setTotal(updated.meals_total ?? newTotal);
  } catch (e: any) {
    Alert.alert("Error", e?.message ?? String(e));
  }
}

  /** Reinicio de demo (borra canjes y pone usados=0) — requiere policy de DELETE en redemptions */
  async function resetDemo() {
    try {
      if (!bookId) return;
      Alert.alert(
        "Reiniciar demo",
        "Esto borrará los canjes y pondrá usados=0. ¿Continuar?",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Sí, reiniciar",
            style: "destructive",
            onPress: async () => {
              const { error: delErr } = await supabase
                .from("redemptions")
                .delete()
                .eq("ticket_book_id", bookId);
              if (delErr) { Alert.alert("DB", delErr.message); return; }

              const { data: updated, error: uErr } = await supabase
                .from("ticket_books")
                .update({ meals_used: 0 })
                .eq("id", bookId)
                .select().maybeSingle();
              if (uErr || !updated) { Alert.alert("DB", uErr?.message ?? "No se pudo reiniciar"); return; }

              setUsed(0);
              await loadHistory(bookId);
            }
          }
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ActivityIndicator />
        <Text>Cargando tu tiquetera…</Text>
      </View>
    );
  }

  const remaining = Math.max(total - used, 0);

  /** Header de la lista: resumen + grilla + botones */
  const Header = (
    <View style={{ gap: 16 }}>
      {/* Resumen */}
      <View style={{ padding: 16, borderRadius: 16, backgroundColor: "#f3f4f6", gap: 6 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Saldo</Text>
        <Text style={{ fontSize: 28, fontWeight: "800" }}>{remaining} restantes</Text>
        <Text style={{ opacity: 0.7 }}>Usados: {used} / {total}</Text>
      </View>

      {/* Tiquetera visual */}
      <TicketBook
        name="Cliente Demo"
        total={total}
        used={used}
        onSelect={() => { /* solo visual; el canje real es con botón o QR */ }}
      />

      {/* Acciones */}
      <View style={{ gap: 8 }}>
        <Pressable
          onPress={redeemOne}
          style={{ padding: 12, backgroundColor: "#2563eb", borderRadius: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Canjear 1 almuerzo (Home)</Text>
        </Pressable>
        <Pressable
          onPress={resetDemo}
          style={{ padding: 12, backgroundColor: "#ef4444", borderRadius: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Reiniciar demo (borra canjes)</Text>
        </Pressable>
      </View>

      {/* Recargar almuerzos (demo) */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: "700" }}>Recargar almuerzos (demo)</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => addMeals(5)}
            style={{ flex: 1, padding: 12, backgroundColor: "#10b981", borderRadius: 12, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>+5</Text>
          </Pressable>
          <Pressable
            onPress={() => addMeals(10)}
            style={{ flex: 1, padding: 12, backgroundColor: "#059669", borderRadius: 12, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>+10</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 12, opacity: 0.6 }}>
          (Solo para pruebas; en producción se hará tras el pago)
        </Text>
      </View>

      {/* Título historial */}
      <Text style={{ fontSize: 16, fontWeight: "700", marginTop: 4 }}>Historial de canjes</Text>
    </View>
  );

  return (
    <FlatList
      data={redemptions}
      keyExtractor={(item) => item.id}
      refreshing={refreshing}
      onRefresh={() => bookId ? loadAll(bookId) : undefined}
      ListHeaderComponent={Header}
      contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      ListEmptyComponent={<Text style={{ opacity: 0.6, marginTop: 8 }}>Aún no hay canjes.</Text>}
      renderItem={({ item }) => {
        const d = new Date(item.redeemed_at);
        return (
          <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
            <Text>Canje #{item.id.slice(0, 8)}</Text>
            <Text style={{ opacity: 0.7, fontSize: 12 }}>{d.toLocaleString()}</Text>
          </View>
        );
      }}
    />
  );
}
