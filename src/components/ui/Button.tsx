import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-emerald-500 text-emerald-950 shadow-[0_1px_0_0_rgb(255_255_255/0.25)_inset,0_6px_20px_-8px_rgb(16_185_129/0.6)] hover:bg-emerald-400",
  secondary:
    "bg-white/[0.06] text-zinc-100 ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.1] hover:ring-white/[0.14]",
  ghost: "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
  danger:
    "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/25 hover:bg-rose-500/25 hover:text-rose-200",
};

const sizes: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-[13px] rounded-lg",
  md: "h-9 gap-2 px-3.5 text-sm rounded-[10px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-all duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, className = "", children, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={`inline-flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors duration-150 hover:bg-white/[0.07] hover:text-zinc-100 active:scale-95 disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
