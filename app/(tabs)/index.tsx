import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import TicketBook from "../../components/TicketBook";
import { supabase } from "../../lib/supabase";

// Login/registro de prueba (desactiva Confirm email en Supabase para dev)
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
  const total = 30;

  // Crear/buscar tiquetera al montar
  useEffect(() => {
    (async () => {
      const email = "demo@tiquetera.com";
      const password = "Demo1234!";

      const user = await signInOrSignUp(email, password);
      if (!user) return;

      const { data: books, error: selErr } = await supabase
        .from("ticket_books")
        .select("*")
        .eq("user_id", user.id)
        .limit(1);

      if (selErr) { Alert.alert("DB", selErr.message); return; }

      let book = books?.[0];
      if (!book) {
        const { data, error } = await supabase
          .from("ticket_books")
          .insert([{ user_id: user.id, meals_total: total }])
          .select()
          .single();
        if (error) { Alert.alert("DB", error.message); return; }
        book = data;
      }

      setBookId(book.id);
      setUsed(book.meals_used ?? 0);
    })();
  }, []);

  // Función para recargar el libro desde la DB
  const loadBookById = useCallback(async (id: string) => {
    const { data: book, error } = await supabase
      .from("ticket_books")
      .select("*")
      .eq("id", id)
      .single();
    if (!error && book) setUsed(book.meals_used ?? 0);
  }, []);

  // Refrescar cuando la pestaña Home gana foco
  useFocusEffect(
    useCallback(() => {
      if (bookId) loadBookById(bookId);
    }, [bookId, loadBookById])
  );

  // (Opcional) Tiempo real: suscribirse a updates del ticket_book
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookId]);

  // Canjear 1 (para probar desde Home también)
  async function redeemOne() {
    try {
      if (!bookId) { Alert.alert("Tiquetera", "No hay tiquetera activa."); return; }

      const { data: book, error: bErr } = await supabase
        .from("ticket_books")
        .select("*")
        .eq("id", bookId)
        .single();
      if (bErr || !book) { Alert.alert("DB", bErr?.message ?? "No se encontró la tiquetera"); return; }

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
        .single();
      if (uErr) { Alert.alert("DB", uErr.message); return; }

      setUsed(updated.meals_used);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <TicketBook
        name="Cliente Demo"
        total={total}
        used={used}
        onSelect={(n) => setUsed(n)} // solo UI; el canje real es con el botón
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
        Home se refresca al volver a la pestaña y (opcional) en tiempo real.
      </Text>
    </View>
  );
}
