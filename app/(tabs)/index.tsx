import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import TicketBook from "../../components/TicketBook";
import { supabase } from "../../lib/supabase";

// Login/registro de prueba
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

export default function Home() {
  const [used, setUsed] = useState(0);
  const [bookId, setBookId] = useState<string | null>(null);
  const totalFallback = 30;

  // Crear/buscar tiquetera al montar (ligada a restaurante y plan)
  useEffect(() => {
    (async () => {
      const email = "demo@tiquetera.com";
      const password = "Demo1234!";

      const user = await signInOrSignUp(email, password);
      if (!user) return;

      // Restaurante Demo (tolerante a duplicados)
      const { data: rest, error: restErr } = await supabase
        .from("restaurants")
        .select("id")
        .eq("name", "Restaurante Demo")
        .limit(1)
        .maybeSingle();
      if (restErr || !rest?.id) { Alert.alert("DB", restErr?.message ?? "Falta restaurante Demo"); return; }
      const restaurantId = rest.id;

      // Membership del cliente
      const { error: memErr } = await supabase
        .from("memberships")
        .upsert({ user_id: user.id, restaurant_id: restaurantId, role: "customer" });
      if (memErr) { Alert.alert("DB", memErr.message); return; }

      // Plan 30 del restaurante (tolerante)
      const { data: plan, error: planErr } = await supabase
        .from("meal_plans")
        .select("id, meals_total")
        .eq("restaurant_id", restaurantId)
        .eq("name", "Plan 30")
        .limit(1)
        .maybeSingle();
      if (planErr || !plan?.id) { Alert.alert("DB", planErr?.message ?? "Falta crear Plan 30"); return; }
      const planId = plan.id;
      const totalMeals = plan.meals_total ?? totalFallback;

      // Buscar tiquetera del usuario para ese restaurante
      const { data: books, error: selErr } = await supabase
        .from("ticket_books")
        .select("*")
        .eq("user_id", user.id)
        .eq("restaurant_id", restaurantId)
        .limit(1);
      if (selErr) { Alert.alert("DB", selErr.message); return; }

      let book = books?.[0];

      // Crear si no existe (ligada a restaurante y plan)
      if (!book) {
        const { data, error } = await supabase
          .from("ticket_books")
          .insert([{
            user_id: user.id,
            meals_total: totalMeals,
            restaurant_id: restaurantId,
            meal_plan_id: planId
          }])
          .select()
          .maybeSingle(); // 👈 tolerante
        if (error || !data) { Alert.alert("DB", error?.message ?? "No se pudo crear la tiquetera"); return; }
        book = data;
      }

      setBookId(book.id);
      setUsed(book.meals_used ?? 0);
    })();
  }, []);

  // Función para recargar el libro desde la DB
  const loadBookById = useCallback(async (id: string) => {
    const { data: book } = await supabase
      .from("ticket_books")
      .select("*")
      .eq("id", id)
      .limit(1)
      .maybeSingle();
    if (book) setUsed(book.meals_used ?? 0);
  }, []);

  // Refrescar cuando la pestaña Home gana foco
  useFocusEffect(
    useCallback(() => {
      if (bookId) loadBookById(bookId);
    }, [bookId, loadBookById])
  );

  // Suscripción en tiempo real (opcional)
  useEffect(() => {
    if (!bookId) return;
    const channel = supabase
      .channel("ticket_book_updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ticket_books", filter: `id=eq.${bookId}` },
        (payload) => {
          const nextUsed = (payload.new as any)?.meals_used;
          if (typeof nextUsed === "number") setUsed(nextUsed);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [bookId]);

  // Canje 1 desde Home (prueba)
  async function redeemOne() {
    try {
      if (!bookId) { Alert.alert("Tiquetera", "No hay tiquetera activa."); return; }

      const { data: book } = await supabase
        .from("ticket_books")
        .select("*")
        .eq("id", bookId)
        .limit(1)
        .maybeSingle();
      if (!book) { Alert.alert("DB", "No se encontró la tiquetera"); return; }

      const remaining = book.meals_total - book.meals_used;
      if (remaining <= 0) { Alert.alert("Tiquetera", "Sin saldo disponible."); return; }

      const { error: rErr } = await supabase
        .from("redemptions")
        .insert([{ ticket_book_id: bookId }]);
      if (rErr) { Alert.alert("DB", rErr.message); return; }

      const { data: updated, error: uErr } = await supabase
        .from("ticket_books")
        .update({ meals_used: book.meals_used + 1 })
        .eq("id", bookId)
        .select()
        .maybeSingle();
      if (uErr || !updated) { Alert.alert("DB", uErr?.message ?? "Error actualizando"); return; }

      setUsed(updated.meals_used);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <TicketBook
        name="Cliente Demo"
        total={30}
        used={used}
        onSelect={(n) => setUsed(n)}
      />

      <View style={{ gap: 8 }}>
        <Pressable
          onPress={redeemOne}
          style={{ padding: 12, backgroundColor: "#2563eb", borderRadius: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Canjear 1 almuerzo (Home)</Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 12, opacity: 0.6 }}>
        Home se refresca al volver a la pestaña y en tiempo real si está suscrito.
      </Text>
    </View>
  );
}
