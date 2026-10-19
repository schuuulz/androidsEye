import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

interface OtpInputProps {
  value: string;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
}

/** Caixas de dígitos com avanço automático, colar o código inteiro e navegação por setas. */
export function OtpInput({ value, length = 6, disabled, invalid, onChange, onComplete }: OtpInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (index: number) => inputs.current[Math.max(0, Math.min(index, length - 1))]?.focus();

  const commit = (next: string) => {
    const digits = next.replace(/\D/g, "").slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
    return digits;
  };

  const typeAt = (index: number, typed: string) => {
    const digit = typed.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    const digits = commit(value.slice(0, index) + digit + value.slice(index + 1));
    focus(digits.length);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      const target = value[index] ? index : index - 1;
      if (target < 0) return;
      commit(value.slice(0, target) + value.slice(target + 1));
      focus(target);
    } else if (event.key === "ArrowLeft") {
      focus(index - 1);
    } else if (event.key === "ArrowRight") {
      focus(index + 1);
    }
  };

  const onPaste = (event: ClipboardEvent) => {
    event.preventDefault();
    const digits = commit(event.clipboardData.getData("text"));
    focus(digits.length);
  };

  return (
    <div className={`flex gap-2 ${invalid ? "animate-shake" : ""}`} onPaste={onPaste}>
      {Array.from({ length }, (_, index) => {
        const filled = Boolean(value[index]);
        return (
          <input
            key={index}
            ref={(el) => {
              inputs.current[index] = el;
            }}
            value={value[index] ?? ""}
            onChange={(e) => typeAt(index, e.target.value)}
            onKeyDown={(e) => onKeyDown(index, e)}
            onFocus={(e) => e.target.select()}
            autoFocus={index === 0}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={`Dígito ${index + 1}`}
            className={`size-12 rounded-xl bg-black/30 text-center font-mono text-xl font-semibold text-zinc-50 caret-emerald-400 ring-1 ring-inset transition-all duration-150 outline-none focus:bg-black/40 focus:ring-2 focus:ring-emerald-400/60 disabled:opacity-50 ${
              invalid ? "ring-rose-400/50" : filled ? "ring-white/20" : "ring-white/[0.08]"
            } ${index === 2 ? "mr-2" : ""}`}
          />
        );
      })}
    </div>
  );
}
