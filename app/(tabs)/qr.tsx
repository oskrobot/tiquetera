import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { supabase } from "../../lib/supabase";

export default function MyQR() {
  const [bookId, setBookId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const s = await supabase.auth.getSession();
      const userId = s.data.session?.user?.id;
      if (!userId) return;

      const { data: books } = await supabase
        .from("ticket_books")
        .select("id")
        .eq("user_id", userId)
        .limit(1);

      if (books?.[0]?.id) setBookId(books[0].id);
    })();
  }, []);

  const payload = JSON.stringify({
    t: "ticket_book",
    id: bookId,
    ts: Date.now(), // (en producción: token corto firmado)
  });

  return (
    <View style={{ flex:1, alignItems:"center", justifyContent:"center", gap:12, padding:16 }}>
      <Text style={{ fontSize:18, fontWeight:"600" }}>Mi QR de tiquetera</Text>
      {bookId ? (
        <QRCode value={payload} size={220} />
      ) : (
        <Text>Creando / buscando tu tiquetera…</Text>
      )}
      <Text style={{ opacity:0.6, fontSize:12, textAlign:"center" }}>
        Muestra este código al personal del restaurante para canjear.
      </Text>
    </View>
  );
}
