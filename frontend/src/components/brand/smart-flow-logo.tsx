import { cn } from "@/lib/utils";

type SmartFlowLogoProps = {
  /** Caixa do ícone (fundo + símbolo) */
  className?: string;
  /** Classes no SVG interno (ex.: text-white) */
  symbolClassName?: string;
  /** Mostrar texto “SmartFlow” ao lado do ícone */
  showWordmark?: boolean;
  wordmarkClassName?: string;
};

/** Marca SmartFlow: curvas de fluxo + nós (automação / inteligência). */
export function SmartFlowLogo({
  className,
  symbolClassName = "text-white",
  showWordmark = false,
  wordmarkClassName,
}: SmartFlowLogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", !showWordmark && "justify-center")}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 shadow-lg shadow-blue-900/40",
          className ?? "h-10 w-10",
        )}
        aria-hidden
      >
        <svg
          viewBox="0 0 32 32"
          className={cn("h-[55%] w-[55%]", symbolClassName)}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M5 21c4.5 0 5.5-5 10.5-5s6 5 11.5 5"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            opacity="0.95"
          />
          <path
            d="M5 11c5.5 0 7-6 13.5-6S24 11 27 11"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            opacity="0.75"
          />
          <circle cx="15.5" cy="16" r="2.4" fill="currentColor" />
          <circle cx="24" cy="11" r="1.9" fill="currentColor" opacity="0.9" />
        </svg>
      </div>
      {showWordmark && (
        <span
          className={cn(
            "text-lg font-bold tracking-tight text-white",
            wordmarkClassName,
          )}
        >
          SmartFlow
        </span>
      )}
    </div>
  );
}
