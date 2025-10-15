import { Pressable, StyleSheet, Text, View } from "react-native";


export type TicketBookProps = {
name: string;
total: number; // ej. 30
used: number; // ej. 5 (consumidos)
onSelect?: (n: number) => void; // opcional: para demo, marcar hasta N
};

export default function TicketBook({ name, total, used, onSelect }: TicketBookProps) {
    const numbers = Array.from({ length: total }, (_, i) => i + 1);
    return (
        <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>Tiquetera</Text>
            <Text style={styles.subtitle}>Nombre: <Text style={{fontWeight: "600"}}>{name}</Text></Text>
<Text style={styles.helper}>Almuerzos restantes: {Math.max(total - used, 0)} / {total}</Text>
<View style={styles.grid}>
{numbers.map((n) => {
    const consumed = n <= used;
return (
<Pressable
key={n}
accessibilityLabel={`Número ${n} ${consumed ? "consumido" : "disponible"}`}
accessibilityRole="button"
style={[styles.circle, consumed && styles.circleConsumed]}
onPress={() => onSelect?.(n)}
>
<Text style={[styles.num, consumed && styles.numConsumed]}>{n}</Text>
</Pressable>
);
})}
</View>
</View>
);
}

const styles = StyleSheet.create({
card: {
margin: 16,
padding: 16,
borderRadius: 16,
backgroundColor: "#fff",
shadowColor: "#000",
shadowOpacity: 0.06,
shadowRadius: 12,
shadowOffset: { width: 0, height: 4 },
elevation: 3,
},
title: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
subtitle: { fontSize: 16, marginBottom: 8 },
helper: { fontSize: 14, opacity: 0.7, marginBottom: 12 },
grid: {
flexDirection: "row",
flexWrap: "wrap",
gap: 12,
justifyContent: "space-between",
},
circle: {
width: 46,
height: 46,
borderRadius: 23,
borderWidth: 2,
borderColor: "#1f2937",
alignItems: "center",
justifyContent: "center",
},
circleConsumed: {
backgroundColor: "#1f2937",
borderColor: "#1f2937",
},
num: { fontSize: 16, fontWeight: "600", color: "#1f2937" },
numConsumed: { color: "#fff", textDecorationLine: "line-through" },
});