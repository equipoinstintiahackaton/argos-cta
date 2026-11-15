"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

/** Aparece al entrar en pantalla (una sola vez). Sin librerias. */
export default function Reveal({ children, retraso = 0, className = "" }: { children: ReactNode; retraso?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visto, setVisto] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setVisto(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisto(true); io.disconnect(); } }, { rootMargin: "0px 0px -100px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <div ref={ref} className={"lp-reveal " + (visto ? "visto " : "") + className} style={{ transitionDelay: `${retraso}s` }}>{children}</div>;
}
