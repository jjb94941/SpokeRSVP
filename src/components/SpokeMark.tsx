export function SpokeMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="4" />
      <circle cx="32" cy="32" r="5" fill="currentColor" />
      {[0, 45, 90, 135].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x = 32 + Math.cos(rad) * 22;
        const y = 32 + Math.sin(rad) * 22;
        const x2 = 32 - Math.cos(rad) * 22;
        const y2 = 32 - Math.sin(rad) * 22;
        return (
          <line
            key={deg}
            x1={x}
            y1={y}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
