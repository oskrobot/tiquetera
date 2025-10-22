import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from "react-native";
import TicketBook from "../../components/TicketBook";
import { supabase } from "../../lib/supabase";

const MAX_TOTAL = 30; // tope de comidas por tiquetera (plan demo)

/** Auth de desarrollo (email/password demo del cliente) */
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
      try {
        setLoading(true);
        const email = "demo@tiquetera.com";
        const password = "Demo1234!";

        // 1) Sesión
        const user = await signInOrSignUp(email, password);
        if (!user) { setLoading(false); return; }
        console.log("[home] user", user.id);

        // 2) Restaurante Demo (tolerante)
        const { data: rest, error: restErr } = await supabase
          .from("restaurants").select("id")
          .eq("name", "Restaurante Demo")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (restErr || !rest?.id) { Alert.alert("DB", restErr?.message ?? "Falta restaurante Demo"); setLoading(false); return; }
        const restaurantId = rest.id;
        console.log("[home] restaurantId", restaurantId);

        // 3) Membership cliente (SELECT → INSERT si falta)
        const { data: memRows, error: memSelErr } = await supabase
          .from("memberships")
          .select("user_id")
          .eq("user_id", user.id)
          .eq("restaurant_id", restaurantId)
          .limit(1);
        if (memSelErr) { Alert.alert("DB", memSelErr.message); setLoading(false); return; }
        if (!memRows || memRows.length === 0) {
          const { error: memInsErr } = await supabase
            .from("memberships")
            .insert([{ user_id: user.id, restaurant_id: restaurantId, role: "customer" }]);
          if (memInsErr) { Alert.alert("DB", memInsErr.message); setLoading(false); return; }
        }

        // 4) Plan 30 (tolerante). Si no existe, usamos fallback MAX_TOTAL
        const { data: plan, error: planErr } = await supabase
          .from("meal_plans").select("id, meals_total")
          .eq("restaurant_id", restaurantId).eq("name", "Plan 30")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (planErr) { Alert.alert("DB", planErr.message); setLoading(false); return; }
        const planId = plan?.id ?? null;
        const totalMeals = plan?.meals_total ?? MAX_TOTAL;
        console.log("[home] planId", planId, "totalMeals", totalMeals);

        // 5) Buscar tiquetera ACTIVA más reciente del usuario para ese restaurante
        const { data: existingBook, error: selErr } = await supabase
          .from("ticket_books")
          .select("*")
          .eq("user_id", user.id)
          .eq("restaurant_id", restaurantId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (selErr) { Alert.alert("DB", selErr.message); setLoading(false); return; }

        let currentBook = existingBook ?? null;

        // 6) Si no existe, crear una nueva (status activo)
        if (!currentBook) {
          const { data: created, error: cErr } = await supabase
            .from("ticket_books")
            .insert([{
              user_id: user.id,
              meals_total: totalMeals,
              restaurant_id: restaurantId,
              meal_plan_id: planId,
              status: "active",
            }])
            .select()
            .maybeSingle();
          if (cErr || !created) {
            Alert.alert("DB", cErr?.message ?? "No se pudo crear la tiquetera");
            setLoading(false);
            return;
          }
          currentBook = created;
        }

        if (!currentBook?.id) {
          Alert.alert("DB", "No se pudo establecer una tiquetera activa.");
          setLoading(false);
          return;
        }

        console.log("[home] bookId", currentBook.id);

        setBookId(currentBook.id);
        setUsed(currentBook.meals_used ?? 0);
        setTotal(currentBook.meals_total ?? totalMeals);

        await loadHistory(currentBook.id);
        setLoading(false);
      } catch (e: any) {
        console.error("[home] init error", e);
        Alert.alert("Error", e?.message ?? String(e));
        setLoading(false);
      }
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

  /** Renovar tiquetera: expira la actual y crea una nueva con el plan por defecto */
  async function renewBook() {
    try {
      if (!bookId) return;

      const { data: book, error: bErr } = await supabase
        .from("ticket_books")
        .select("id, restaurant_id, meal_plan_id")
        .eq("id", bookId).limit(1).maybeSingle();
      if (bErr || !book) { Alert.alert("DB", bErr?.message ?? "No se encontró la tiquetera"); return; }

      const { data: plan } = await supabase
        .from("meal_plans").select("id, meals_total")
        .eq("id", book.meal_plan_id).limit(1).maybeSingle();
      const totalMeals = plan?.meals_total ?? MAX_TOTAL;

      const { error: upErr } = await supabase
        .from("ticket_books")
        .update({ status: "expired" })
        .eq("id", bookId);
      if (upErr) { Alert.alert("DB", upErr.message); return; }

      const s = await supabase.auth.getSession();
      const userId = s.data.session?.user?.id;
      const { data: newBook, error: cErr } = await supabase
        .from("ticket_books")
        .insert([{
          user_id: userId,
          meals_total: totalMeals,
          restaurant_id: book.restaurant_id,
          meal_plan_id: plan?.id ?? null,
          status: "active",
        }])
        .select().maybeSingle();
      if (cErr || !newBook) { Alert.alert("DB", cErr?.message ?? "No se pudo crear la nueva tiquetera"); return; }

      setBookId(newBook.id);
      setUsed(newBook.meals_used ?? 0);
      setTotal(newBook.meals_total ?? totalMeals);

      Alert.alert("Listo", "Se renovó la tiquetera.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    }
  }

  /** Agregar almuerzos (demo) con tope */
  async function addMeals(delta: number) {
    try {
      if (!bookId) { Alert.alert("Tiquetera", "No hay tiquetera activa."); return; }

      const { data: book } = await supabase
        .from("ticket_books")
        .select("meals_total, meals_used")
        .eq("id", bookId).limit(1).maybeSingle();
      if (!book) { Alert.alert("DB", "No se encontró la tiquetera"); return; }

      const currentTotal = book.meals_total ?? total;
      const newTotal = currentTotal + delta;

      if (newTotal > MAX_TOTAL) {
        Alert.alert(
          "Límite alcanzado",
          `El máximo por tiquetera es ${MAX_TOTAL}. ¿Quieres renovar para empezar una nueva?`,
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Renovar", style: "destructive", onPress: renewBook },
          ]
        );
        return;
      }

      const { data: updated, error: uErr } = await supabase
        .from("ticket_books")
        .update({ meals_total: newTotal })
        .eq("id", bookId)
        .select().maybeSingle();
      if (uErr || !updated) {
        Alert.alert("DB", uErr?.message ?? "No se pudo recargar");
        return;
      }

      setTotal(updated.meals_total ?? newTotal);
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
        {/* Debug opcional: */}
        {/* <Text style={{ fontSize: 12, opacity: 0.6 }}>BookId: {bookId}</Text> */}
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
          onPress={renewBook}
          disabled={!(used >= total || total >= MAX_TOTAL)}
          style={{
            padding: 12,
            backgroundColor: (used >= total || total >= MAX_TOTAL) ? "#111827" : "#9ca3af",
            borderRadius: 12,
            alignItems: "center"
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Renovar tiquetera</Text>
        </Pressable>

        <Pressable
          onPress={async () => {
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
                      .from("redemptions").delete().eq("ticket_book_id", bookId);
                    if (delErr) { Alert.alert("DB", delErr.message); return; }

                    const { data: updated, error: uErr } = await supabase
                      .from("ticket_books").update({ meals_used: 0 }).eq("id", bookId).select().maybeSingle();
                    if (uErr || !updated) { Alert.alert("DB", uErr?.message ?? "No se pudo reiniciar"); return; }

                    setUsed(0);
                    await loadHistory(bookId);
                  }
                }
              ]
            );
          }}
          style={{ padding: 12, backgroundColor: "#ef4444", borderRadius: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Reiniciar demo (borra canjes)</Text>
        </Pressable>

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

      </View>
    </View>
  );

  return (
    <FlatList
      data={redemptions}
      keyExtractor={(item) => item.id}
      refreshing={refreshing}
      onRefresh={() => bookId ? loadAll(bookId) : undefined}
      ListHeaderComponent={
        <View style={{ padding: 16, gap: 16 }}>
          {Header}
          <Text style={{ fontSize: 16, fontWeight: "700", marginTop: 4 }}>Historial de canjes</Text>
        </View>
      }
      contentContainerStyle={{ paddingBottom: 80 }}
      ListEmptyComponent={<Text style={{ opacity: 0.6, marginTop: 8, paddingHorizontal: 16 }}>Aún no hay canjes.</Text>}
      renderItem={({ item }) => {
        const d = new Date(item.redeemed_at);
        return (
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
            <Text>Canje #{item.id.slice(0, 8)}</Text>
            <Text style={{ opacity: 0.7, fontSize: 12 }}>{d.toLocaleString()}</Text>
          </View>
        );
      }}
    />
  );
}
