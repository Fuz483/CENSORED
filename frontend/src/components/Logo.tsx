export function Logo({ tone = "dark", size = "default" }: { tone?: "dark" | "light"; size?: "default" | "compact" }) {
  const text = tone === "light" ? "text-paper" : "text-ink";
  const sizing = size === "compact" ? "text-[26px] sm:text-[42px]" : "text-[35px] sm:text-[42px]";

  return (
    <span
      className={`font-serif ${sizing} leading-none font-bold tracking-[-0.055em] ${text}`}
    >
      Пляцоўка<span className="text-orange">.</span>
    </span>
  );
}
