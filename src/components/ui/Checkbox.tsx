import type { ReactNode } from "react";
import { Check } from "lucide-react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}

export function Checkbox({ checked, onChange, label, description }: CheckboxProps) {
  return (
    <label className="group flex cursor-pointer gap-3 rounded-xl bg-white/[0.025] p-3 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/[0.04]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`mt-px flex size-4 shrink-0 items-center justify-center rounded-[5px] ring-1 transition-all duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-400/70 ${
          checked ? "bg-emerald-400 ring-emerald-400" : "ring-white/25 group-hover:ring-white/40"
        }`}
      >
        <Check
          className={`size-3 text-emerald-950 transition-transform duration-150 ${checked ? "scale-100" : "scale-0"}`}
          strokeWidth={3.5}
        />
      </span>
      <span className="min-w-0 text-[13px] leading-snug">
        <span className="font-medium text-zinc-200">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-zinc-500">{description}</span>}
      </span>
    </label>
  );
}
