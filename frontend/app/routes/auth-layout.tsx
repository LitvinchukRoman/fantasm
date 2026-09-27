import { useLayoutEffect, useRef, useState } from "react";
import { Link, Outlet } from "react-router";
import { GlyphHalo } from "../components/auth/glyph-halo";

export default function AuthLayout() {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const measure = () => {
      const next = inner.offsetHeight;
      setHeight((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <main className="auth-screen relative flex flex-col items-center overflow-x-hidden bg-[var(--color-bg)] px-5">
      <div className="relative w-full max-w-[400px]">
        <GlyphHalo />
        <div className="relative z-20 mb-8 flex justify-center">
          <Link to="/" className="flex items-center gap-2 transition-transform hover:scale-105" aria-label="На головну">
            <img src="/favicon.jpg" alt="" width={48} height={48} className="size-12 rounded-xl shadow-md" />
          </Link>
        </div>
        <div
          className="relative z-10 overflow-hidden rounded-[var(--radius-card)] bg-[#0d0e11] shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_25px_50px_-12px_rgb(0_0_0/0.45)]"
          style={{
            height: height === null ? "auto" : height,
            transition: height === null ? "none" : "height 0.65s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div ref={innerRef} className="p-6 sm:p-8">
            <Outlet />
          </div>
        </div>
      </div>
    </main>
  );
}
