interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}

/** Alternador com indicador deslizante (estilo iOS/macOS). */
export function SegmentedControl<T extends string>({ value, options, onChange }: SegmentedControlProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div
      role="radiogroup"
      className="relative grid shrink-0 rounded-[10px] bg-white/[0.04] p-0.5 ring-1 ring-inset ring-white/[0.06]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded-lg bg-white/[0.1] shadow-sm ring-1 ring-inset ring-white/[0.08] transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 h-8 px-3 text-[13px] font-medium transition-colors duration-150 ${
            option.value === value ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
