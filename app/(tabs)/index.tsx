import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import TicketBook from "../../components/TicketBook"; // 👈 ajusta si tu components está en otro lugar
import { supabase } from "../../lib/supabase"; // 👈 ajusta si tu lib/ está en otro lugar

// 1) Helper de autenticación: intenta login; si no existe, crea y luego fuerza login.
//   - En Supabase (Auth → Email) es recomendable DESACTIVAR "Confirm email" mientras desarrollas.
async function signInOrSignUp(email: string, password: string) {
  const { data: inData } = await supabase.auth.signInWithPassword({ email, password });
  if (inData?.user) return inData.user;

  const { data: upData, error: upErr } = await supabase.auth.signUp({ email, password });
  if (upErr) { Alert.alert("Auth", upErr.message); return null; }

  const { data: after, error: afterErr } = await supabase.auth.signInWithPassword({ email, password });
  if (afterErr || !after?.user) {
    Alert.alert("Auth", "No hay sesión. Desactiva 'Confirm email' en Supabase o confirma el correo.");
    return null;
  }
  return after.user;
}

export default function Home() {
  // estado UI
  const [used, setUsed] = useState(0);
  const [bookId, setBookId] = useState<string | null>(null);
  const total = 30;

  // 2) Al montar: login/registro, verificar sesión y crear/buscar la tiquetera
  useEffect(() => {
    (async () => {
      const email = "demo@tiquetera.com";
      const password = "Demo1234!";

      // opcional: limpia sesión anterior si estabas probando
      // await supabase.auth.signOut();

      const user = await signInOrSignUp(email, password);
      if (!user) return;

      const s = await supabase.auth.getSession();
      console.log("session user id:", s.data.session?.user?.id);
      if (!s.data.session?.user?.id) {
        Alert.alert("Auth", "Sin sesión activa.");
        return;
      }

      // Buscar tiquetera del usuario
      const { data: books, error: selErr } = await supabase
        .from("ticket_books")
        .select("*")
        .eq("user_id", user.id)
        .limit(1);

      if (selErr) { Alert.alert("DB", selErr.message); return; }

      let book = books?.[0];
      // Crear si no existe
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

  // 3) Canjear 1 almuerzo (inserta en redemptions y aumenta meals_used)
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
          <Text style={{ color: "#fff", fontWeight: "700" }}>Canjear 1 almuerzo</Text>
        </Pressable>

        <Pressable
          onPress={() => setUsed(0)}
          style={{ padding: 12, backgroundColor: "#e5e7eb", borderRadius: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#111827", fontWeight: "600" }}>Reiniciar (solo UI)</Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 12, opacity: 0.6 }}>
        Los canjes reales se registran en Supabase (ticket_books / redemptions).
      </Text>
    </View>
  );
}
