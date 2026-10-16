// The Nexus mark: an "N" drawn as three strands - GN, Relay and Flying Dragon - meeting at two
// hubs, the connected intelligence that joins them. Same geometry as app/icon.svg.
export function NexusMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="Nexus">
      <g fill="none" strokeWidth="9" strokeLinecap="round">
        <path d="M16 50V16" stroke="#f3d77a" />
        <path d="M16 16L48 48" stroke="#ffffff" />
        <path d="M48 48V14" stroke="#c9a227" />
      </g>
      <circle cx="16" cy="16" r="6.5" fill="#3a1257" stroke="#f3d77a" strokeWidth="3" />
      <circle cx="48" cy="48" r="6.5" fill="#3a1257" stroke="#c9a227" strokeWidth="3" />
    </svg>
  );
}
