"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

const read = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const onChange = (cb: () => void) => (window.addEventListener("hashchange", cb), window.addEventListener("present", cb), () => (window.removeEventListener("hashchange", cb), window.removeEventListener("present", cb)));

// After a "Show in the tool" jump from the presentation: find the part being talked about, scroll to
// it, light it up, and float a "Return to presentation" button bottom-left (the copilot owns the right).
export function PresentReturn({ hash }: { hash: string }) {
  const router = useRouter();
  const back = useSyncExternalStore(onChange, () => (window.location.hash === "#presentation" ? null : read("present.return")), () => null);
  useEffect(() => {
    const sel = read("present.hl");
    if (!sel || hash === "#presentation") return;
    let tries = 0;
    const t = setInterval(() => { // the target renders once its data has loaded
      const el = document.querySelector<HTMLElement>(sel);
      if (!el && ++tries < 40) return;
      clearInterval(t);
      if (!el) return;
      document.querySelectorAll(".present-hl").forEach((x) => x.classList.remove("present-hl"));
      el.classList.add("present-hl");
      el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    }, 250);
    return () => clearInterval(t);
  }, [hash]);
  if (!back) return null;
  const go = () => {
    document.querySelectorAll(".present-hl").forEach((x) => x.classList.remove("present-hl"));
    try { sessionStorage.removeItem("present.hl"); sessionStorage.removeItem("present.return"); } catch { /* ignore */ }
    window.dispatchEvent(new Event("present"));
    if (back.startsWith("#")) window.location.hash = back;
    else router.push(back);
  };
  return (
    <button onClick={go} className="fixed bottom-4 left-4 z-[55] rounded-full bg-[var(--gold)] text-[var(--ink)] px-5 py-3 font-bold shadow-2xl ring-4 ring-[var(--gold)]/30 print:hidden">
      ← Return to presentation
    </button>
  );
}
