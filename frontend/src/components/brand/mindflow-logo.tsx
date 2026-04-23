import { cn } from "@/lib/utils";

type MindFlowLogoProps = {
  /** Caixa do ícone (fundo + símbolo) */
  className?: string;
  /** Classes no SVG interno (ex.: text-white) */
  symbolClassName?: string;
  /** Mostrar texto “MindFlow” ao lado do ícone */
  showWordmark?: boolean;
  wordmarkClassName?: string;
};

/** Marca MindFlow: contorno suave (mente) + onda contínua (fluxo de pensamento). */
export function MindFlowLogo({
  className,
  symbolClassName = "text-white",
  showWordmark = false,
  wordmarkClassName,
}: MindFlowLogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", !showWordmark && "justify-center")}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-indigo-600 to-teal-500 shadow-lg shadow-violet-900/45",
          className ?? "h-10 w-10",
        )}
        aria-hidden
      >
        <svg
          viewBox="0 0 32 32"
          className={cn("h-[58%] w-[58%]", symbolClassName)}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Arco superior — ideia / mente */}
          <path
            d="M7 19.5C7 12.5 11 9 16 9s9 3.5 9 10.5"
            stroke="currentColor"
            strokeWidth="2.15"
            strokeLinecap="round"
            opacity="0.92"
          />
          {/* Onda inferior — fluxo contínuo */}
          <path
            d="M5 22.5c3.6 3.2 7.6 3.2 11 0s7.4-3.2 11 0"
            stroke="currentColor"
            strokeWidth="2.15"
            strokeLinecap="round"
            opacity="0.88"
          />
          <circle cx="16" cy="15.5" r="2.35" fill="currentColor" />
          <circle cx="11" cy="12" r="1.35" fill="currentColor" opacity="0.85" />
          <circle cx="21" cy="12" r="1.35" fill="currentColor" opacity="0.85" />
        </svg>
      </div>
      {showWordmark && (
        <span
          className={cn(
            "text-lg font-bold tracking-tight text-white",
            wordmarkClassName,
          )}
        >
          MindFlow
        </span>
      )}
    </div>
  );
}
