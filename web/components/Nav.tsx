import Link from "next/link";

export default function Nav({ activo }: { activo: "mapa" | "estadisticas" | "registro" }) {
  return (
    <nav className="nav">
      <span className="logo">ARGOS</span>
      <Link href="/" className={activo === "mapa" ? "on" : ""}>Mapa y alertas</Link>
      <Link href="/registro" className={activo === "registro" ? "on" : ""}>Registro de incendios</Link>
      <Link href="/estadisticas" className={activo === "estadisticas" ? "on" : ""}>Estadisticas</Link>
    </nav>
  );
}
