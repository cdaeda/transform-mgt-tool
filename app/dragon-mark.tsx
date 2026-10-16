// Flying Dragon -> Dragon Nexus: a dragon folds into the mark (a "D" around a hub of spokes),
// and flames rise from the drive. Pure SVG + CSS; holds on the final mark when motion is reduced.
export function DragonMark({ size = 160, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={`dragon-mark ${className}`} role="img" aria-label="A flying dragon transforming into the Dragon Nexus mark, with flames rising from it">
      <defs>
        <linearGradient id="dm-fire" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="#d2353f" /><stop offset="55%" stopColor="#e07b2e" /><stop offset="100%" stopColor="#f3d77a" />
        </linearGradient>
        <linearGradient id="dm-gold" x1="0" x2="1"><stop offset="0%" stopColor="#f3d77a" /><stop offset="100%" stopColor="#c9a227" /></linearGradient>
      </defs>

      {/* the dragon: wings, body, tail, head */}
      <g className="dm-dragon" fill="var(--plum, #3a1257)">
        <path className="dm-wing-l" d="M100 104 C 74 70, 40 62, 14 74 C 36 80, 46 92, 52 104 C 40 100, 30 104, 22 112 C 48 110, 74 112, 100 104 Z" />
        <path className="dm-wing-r" d="M100 104 C 126 70, 160 62, 186 74 C 164 80, 154 92, 148 104 C 160 100, 170 104, 178 112 C 152 110, 126 112, 100 104 Z" />
        <path d="M92 96 C 92 84, 108 84, 108 96 L 106 132 C 104 146, 96 146, 94 132 Z" />
        <path d="M96 140 C 90 158, 104 168, 120 162 C 108 162, 102 156, 104 144 Z" />
        <path d="M100 66 L 112 78 L 106 80 L 108 92 L 100 88 L 92 92 L 94 80 L 88 78 Z" />
        <circle cx="96.5" cy="80" r="1.6" fill="#f3d77a" /><circle cx="103.5" cy="80" r="1.6" fill="#f3d77a" />
      </g>

      {/* the Drive mark */}
      <g className="dm-drive">
        <path d="M60 52 H 104 A 48 48 0 0 1 104 148 H 60 Z" fill="none" stroke="url(#dm-gold)" strokeWidth="11" strokeLinejoin="round" />
        <circle cx="100" cy="100" r="25" fill="none" stroke="var(--plum, #3a1257)" strokeWidth="6" />
        <circle cx="100" cy="100" r="6" fill="var(--plum, #3a1257)" />
        <path d="M100 100 L 76 106 M100 100 L 124 106 M100 100 L 100 125" stroke="var(--plum, #3a1257)" strokeWidth="5" strokeLinecap="round" />
        {/* flames rising from the drive */}
        <g className="dm-flames" fill="url(#dm-fire)">
          <path className="dm-f1" d="M132 62 C 124 46, 140 38, 136 20 C 150 34, 152 50, 142 64 Z" />
          <path className="dm-f2" d="M146 78 C 142 62, 160 56, 160 40 C 170 58, 166 74, 154 84 Z" />
          <path className="dm-f3" d="M118 54 C 112 44, 120 36, 118 26 C 128 36, 128 46, 124 56 Z" />
        </g>
      </g>
    </svg>
  );
}
