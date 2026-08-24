/**
 * Decorative light-theme layer: soft cyan glows, holographic rings,
 * and delicate circuit-style lines. Hidden in dark theme via CSS.
 */
export function LightTechBackdrop() {
  return (
    <div
      className="light-tech-backdrop pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="light-tech-orb light-tech-orb-a" />
      <div className="light-tech-orb light-tech-orb-b" />
      <div className="light-tech-orb light-tech-orb-c" />

      <svg
        className="light-tech-circuits absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="lt-line" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#35C2FF" stopOpacity="0.4" />
            <stop offset="55%" stopColor="#2F80FF" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#6C7BFF" stopOpacity="0.2" />
          </linearGradient>
          <radialGradient id="lt-node" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#35C2FF" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#2F80FF" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Left circuit cluster */}
        <g
          fill="none"
          stroke="url(#lt-line)"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
        >
          <path d="M-40 160 H140 V250 H250 V330 H360" />
          <path d="M50 100 V160 H140" />
          <path d="M250 250 H320 V190 H420" />
          <path d="M100 330 V420 H190 V500" />
          <path d="M190 420 H280 V370 H380" />
          <path d="M-20 560 H120 V640 H210 V720 H310" />
          <path d="M210 640 H300 V590" />
          <path d="M60 760 H160 V820 H260" />
        </g>

        {/* Right circuit cluster */}
        <g
          fill="none"
          stroke="url(#lt-line)"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.48"
        >
          <path d="M1480 120 H1120 V210 H1020 V300 H920" />
          <path d="M1380 60 V120 H1120" />
          <path d="M1020 210 H940 V140" />
          <path d="M920 300 V390 H820 V470" />
          <path d="M1280 430 H1120 V510 H980 V580" />
          <path d="M1500 620 H1180 V700 H1080" />
          <path d="M1320 780 H1160 V840" />
        </g>

        {/* Mid subtle traces */}
        <g
          fill="none"
          stroke="url(#lt-line)"
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity="0.3"
        >
          <path d="M520 70 H620 V140 H720 V90 H820" />
          <path d="M640 420 H740 V490 H840" />
          <path d="M560 700 H660 V780 H760 V730" />
          <path d="M480 280 H560 V340" />
        </g>

        {/* Glowing nodes */}
        <g fill="url(#lt-node)">
          <circle cx="140" cy="160" r="5" />
          <circle cx="250" cy="250" r="4.5" />
          <circle cx="360" cy="330" r="4" />
          <circle cx="190" cy="420" r="4.5" />
          <circle cx="210" cy="640" r="4" />
          <circle cx="1120" cy="120" r="5" />
          <circle cx="1020" cy="210" r="4.5" />
          <circle cx="920" cy="300" r="4" />
          <circle cx="820" cy="470" r="4.5" />
          <circle cx="1120" cy="510" r="4" />
          <circle cx="620" cy="140" r="3.5" />
          <circle cx="740" cy="490" r="3.5" />
          <circle cx="160" cy="820" r="3.5" />
        </g>

        {/* Holographic frame accents */}
        <g fill="none" stroke="#2F80FF" strokeOpacity="0.14" strokeWidth="1">
          <rect x="90" y="90" width="220" height="120" rx="16" />
          <rect x="1080" y="520" width="250" height="140" rx="18" />
        </g>

        <g fill="none" stroke="#35C2FF" strokeOpacity="0.12" strokeWidth="1">
          <circle cx="240" cy="680" r="78" />
          <circle cx="240" cy="680" r="108" />
          <circle cx="1220" cy="180" r="62" />
          <circle cx="1220" cy="180" r="92" />
        </g>
      </svg>

      <div className="light-tech-scan" />
    </div>
  )
}
