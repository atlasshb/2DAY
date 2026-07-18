/** Stylized neighborhood map, ported 1:1 from prototype/index.html's #screen-route SVG. */
export function MapSvg() {
  return (
    <svg
      viewBox="0 0 412 700"
      preserveAspectRatio="xMidYMid slice"
      aria-label="Stylized neighborhood map with planned loop"
    >
      <rect width="412" height="700" fill="var(--mapland)" />
      <g fill="var(--mapblock)">
        <rect x="30" y="60" width="150" height="70" rx="6" />
        <rect x="220" y="60" width="160" height="70" rx="6" />
        <rect x="30" y="170" width="150" height="80" rx="6" />
        <rect x="220" y="170" width="160" height="80" rx="6" />
        <rect x="30" y="290" width="150" height="80" rx="6" />
        <rect x="220" y="290" width="160" height="80" rx="6" />
        <rect x="30" y="410" width="150" height="70" rx="6" />
        <rect x="220" y="410" width="160" height="70" rx="6" />
        <rect x="30" y="520" width="350" height="60" rx="6" />
      </g>
      <g stroke="var(--mapstreet)" strokeWidth="10" strokeLinecap="round">
        <line x1="10" y1="150" x2="402" y2="150" />
        <line x1="10" y1="270" x2="402" y2="270" />
        <line x1="10" y1="390" x2="402" y2="390" />
        <line x1="10" y1="500" x2="402" y2="500" />
        <line x1="200" y1="40" x2="200" y2="600" />
        <line x1="20" y1="40" x2="20" y2="600" />
        <line x1="392" y1="40" x2="392" y2="600" />
        <line x1="10" y1="610" x2="402" y2="610" />
      </g>
      <polyline
        points="20,610 20,500 200,500 200,390 20,390 20,270 150,270"
        fill="none"
        stroke="var(--faint)"
        strokeWidth="4"
        strokeLinecap="round"
        opacity=".7"
      />
      <polyline
        className="routedash"
        points="150,270 392,270 392,150 200,150 200,270"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g>
        <circle cx="50" cy="493" r="5" fill="var(--noans)" />
        <circle cx="80" cy="493" r="5" fill="var(--convo)" />
        <circle cx="110" cy="493" r="5" fill="var(--sale)" />
        <circle cx="140" cy="493" r="5" fill="var(--noans)" />
        <circle cx="170" cy="493" r="5" fill="var(--notint)" />
        <circle cx="60" cy="383" r="5" fill="var(--convo)" />
        <circle cx="95" cy="383" r="5" fill="var(--noans)" />
        <circle cx="130" cy="383" r="5" fill="var(--fup)" />
        <circle cx="165" cy="383" r="5" fill="var(--noans)" />
        <circle cx="45" cy="263" r="5" fill="var(--sale)" />
        <circle cx="85" cy="263" r="5" fill="var(--noans)" />
        <circle cx="120" cy="263" r="5" fill="var(--dnk)" />
      </g>
      <g fontSize="15" textAnchor="middle">
        <rect x="368" y="586" width="34" height="34" rx="10" fill="var(--surface)" stroke="var(--line)" />
        <text x="385" y="609">
          🚆
        </text>
        <rect x="30" y="46" width="34" height="34" rx="10" fill="var(--surface)" stroke="var(--line)" />
        <text x="47" y="69">
          🏋️
        </text>
        <rect x="300" y="236" width="34" height="34" rx="10" fill="var(--surface)" stroke="var(--line)" />
        <text x="317" y="259">
          ☕
        </text>
      </g>
      <g className="puck">
        <circle cx="150" cy="270" r="14" fill="var(--accent)" opacity=".25" />
        <circle cx="150" cy="270" r="7" fill="var(--accent)" stroke="#fff" strokeWidth="2" />
      </g>
    </svg>
  );
}
