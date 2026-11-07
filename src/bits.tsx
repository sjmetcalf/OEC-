import { useEffect, useState } from "react";

function allowMotion() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CountUp({ to }: { to: number }) {
  const [value, setValue] = useState(() => (typeof window !== "undefined" && !allowMotion() ? to : 0));

  useEffect(() => {
    if (!allowMotion() || to === 0) {
      setValue(to);
      return;
    }
    const duration = 900;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(to * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to]);

  return <span className="count-up">{value}</span>;
}

export function BlurText({ text }: { text: string }) {
  return <span className="blur-text">{text}</span>;
}
