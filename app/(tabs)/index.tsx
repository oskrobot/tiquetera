import { useState } from "react";
import { Pressable, Text, View } from "react-native";
// 👇 Usa UNA de estas dos rutas según tu estructura
import TicketBook from "../../components/TicketBook"; // si components está fuera de app/
// import TicketBook from "../components/TicketBook";    // si components está dentro de app/

export default function Home() {
  const [used, setUsed] = useState(0);
  const total = 30;

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <TicketBook
        name="Cliente Demo"
        total={total}
        used={used}
        onSelect={(n) => setUsed(n)} // tocar un número marca hasta ese
      />

      <View style={{ gap: 8 }}>
        <Pressable
          onPress={() => setUsed((u) => Math.min(u + 1, total))}
          style={{
            padding: 12,
            backgroundColor: "#2563eb",
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>
            Canjear 1 almuerzo
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setUsed(0)}
          style={{
            padding: 12,
            backgroundColor: "#e5e7eb",
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#111827", fontWeight: "600" }}>Reiniciar</Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 12, opacity: 0.6 }}>
        Demo local: en producción los canjes vendrán del escáner QR + base de datos.
      </Text>
    </View>
  );
}
