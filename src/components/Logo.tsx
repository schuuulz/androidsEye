export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="64 64 896 896" aria-hidden>
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f1f23" />
          <stop offset="1" stopColor="#0c0c0e" />
        </linearGradient>
        <linearGradient id="logo-iris" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6ee7b7" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect x="64" y="64" width="896" height="896" rx="208" fill="url(#logo-bg)" />
      <rect x="66" y="66" width="892" height="892" rx="206" fill="none" stroke="#3f3f46" strokeWidth="4" />
      <path
        d="M192 512c80-136 192-208 320-208s240 72 320 208c-80 136-192 208-320 208S272 648 192 512z"
        fill="none"
        stroke="#e4e4e7"
        strokeWidth="44"
        strokeLinejoin="round"
      />
      <circle cx="512" cy="512" r="124" fill="url(#logo-iris)" />
      <circle cx="512" cy="512" r="48" fill="#09090b" />
      <circle cx="552" cy="470" r="18" fill="#ecfdf5" />
    </svg>
  );
}
