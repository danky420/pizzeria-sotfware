import type { JSX, ReactNode } from "react";

const T = "#2A1A12";

function Svg({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ width: "100%", height: "100%" }}
    >
      {children}
    </svg>
  );
}

const PIZZA_TOPPING_SPOTS: [number, number][] = [
  [31, 17],
  [44, 24],
  [47, 35],
  [38, 45],
  [25, 46],
  [16, 36],
  [18, 24],
  [32, 31],
  [24, 32],
  [40, 33],
  [31, 41]
];

export function IcPizza({ tops }: { tops?: string[] | null }): JSX.Element {
  const colors = tops && tops.length > 0 ? tops : ["#C7342A"];
  return (
    <Svg>
      <g stroke={T} strokeWidth="2.4" strokeLinejoin="round">
        <circle cx="32" cy="32" r="26" fill="#E9B76B" />
        <circle cx="32" cy="32" r="20.5" fill="#F4D77E" strokeWidth="2" />
      </g>
      <path d="M32 11.5 A20.5 20.5 0 0 1 52.5 32 Z" fill="#fff" opacity=".22" />
      {PIZZA_TOPPING_SPOTS.map(([cx, cy], index) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r={(3.5 - (index % 3) * 0.45).toFixed(1)}
          fill={colors[index % colors.length]}
          stroke={T}
          strokeWidth="1.4"
        />
      ))}
    </Svg>
  );
}

export function IcBurger(): JSX.Element {
  return (
    <Svg>
      <g stroke={T} strokeWidth="2.4" strokeLinejoin="round">
        <path d="M9 26c0-10 10-17 23-17s23 7 23 17z" fill="#E9A94F" />
        <rect x="8" y="26" width="48" height="6" rx="3" fill="#8FC04B" />
        <rect x="9" y="31" width="46" height="8" rx="3" fill="#F2C93B" />
        <rect x="8" y="37" width="48" height="9" rx="4" fill="#7A4726" />
        <path d="M9 45h46c0 6-6 10-23 10S9 51 9 45z" fill="#E9A94F" />
      </g>
      <circle cx="22" cy="18" r="1.6" fill="#FFF2D6" />
      <circle cx="32" cy="15" r="1.6" fill="#FFF2D6" />
      <circle cx="42" cy="19" r="1.6" fill="#FFF2D6" />
    </Svg>
  );
}

export function IcWing(): JSX.Element {
  return (
    <Svg>
      <g stroke={T} strokeWidth="2.4" strokeLinejoin="round">
        <path
          d="M40 10c8 4 13 13 10 22-3 10-13 16-22 14-6-1-9-5-8-9 1-5 7-5 11-9 5-5 4-13 9-18z"
          fill="#D2552C"
        />
        <path d="M20 37c-4 2-7 6-8 10-1 4 2 7 6 6 4-1 7-5 8-9z" fill="#EFD9B4" />
        <circle cx="14" cy="48" r="4.5" fill="#EFD9B4" />
      </g>
      <path
        d="M36 20c3 3 4 8 3 12"
        stroke="#F2C93B"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IcPasta(): JSX.Element {
  return (
    <Svg>
      <g stroke={T} strokeWidth="2.4" strokeLinejoin="round">
        <path d="M8 32h48c0 12-11 20-24 20S8 44 8 32z" fill="#F2E3C4" />
        <path d="M12 32c0-10 9-16 20-16s20 6 20 16z" fill="#F4D77E" />
      </g>
      <g stroke="#E3A83C" strokeWidth="2.2" fill="none" strokeLinecap="round">
        <path d="M17 31c3-6 8-9 15-9s12 3 15 9" />
        <path d="M20 26c3-4 7-6 12-6s9 2 12 6" />
      </g>
      <circle cx="26" cy="25" r="3" fill="#C7342A" stroke={T} strokeWidth="1.6" />
      <circle cx="39" cy="27" r="2.6" fill="#C7342A" stroke={T} strokeWidth="1.6" />
      <path d="M6 52h52" stroke={T} strokeWidth="2.4" strokeLinecap="round" />
    </Svg>
  );
}

export function IcDulce(): JSX.Element {
  return (
    <Svg>
      <g stroke={T} strokeWidth="2.4" strokeLinejoin="round">
        <path d="M10 44l22-26 22 26z" fill="#F4D77E" />
        <path d="M10 44h44v6a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill="#E9B76B" />
      </g>
      <path
        d="M22 34c4-3 7 3 11 0s7 3 10 0"
        stroke="#8E4A22"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="32" cy="14" r="4.5" fill="#C7342A" stroke={T} strokeWidth="2.2" />
    </Svg>
  );
}

export function IcFrappe(): JSX.Element {
  return (
    <Svg>
      <g stroke={T} strokeWidth="2.4" strokeLinejoin="round">
        <path d="M18 24h28l-4 28a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z" fill="#C08457" />
        <path d="M18 24h28l-1.6 11H19.6z" fill="#EFE0C4" />
        <path d="M16 22c0-6 7-10 16-10s16 4 16 10z" fill="#FFF6E4" />
      </g>
      <path d="M36 12V4" stroke="#C7342A" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="26" cy="17" r="2.4" fill="#8E4A22" />
      <circle cx="39" cy="18" r="2" fill="#8E4A22" />
    </Svg>
  );
}

export function IcBotella(): JSX.Element {
  return (
    <Svg>
      <g stroke={T} strokeWidth="2.4" strokeLinejoin="round">
        <path
          d="M27 8h10v8c0 4 6 7 6 13v27a6 6 0 0 1-6 6H27a6 6 0 0 1-6-6V29c0-6 6-9 6-13z"
          fill="#C7342A"
        />
        <path d="M21 34h22v14H21z" fill="#FFF6E4" />
      </g>
      <rect x="26" y="4" width="12" height="5" rx="2" fill="#7A4726" stroke={T} strokeWidth="2.2" />
    </Svg>
  );
}

export function IcLata(): JSX.Element {
  return (
    <Svg>
      <g stroke={T} strokeWidth="2.4" strokeLinejoin="round">
        <rect x="20" y="12" width="24" height="42" rx="5" fill="#D9C48E" />
        <path d="M20 26h24v14H20z" fill="#C7342A" />
      </g>
      <ellipse cx="32" cy="13" rx="12" ry="3.6" fill="#EDE3CC" stroke={T} strokeWidth="2.2" />
    </Svg>
  );
}

export function IcCafe(): JSX.Element {
  return (
    <Svg>
      <g stroke={T} strokeWidth="2.4" strokeLinejoin="round">
        <path d="M12 24h34v16a12 12 0 0 1-12 12H24a12 12 0 0 1-12-12z" fill="#FFF6E4" />
        <path d="M46 28h4a6 6 0 0 1 0 12h-4" fill="none" />
        <path d="M16 28h26v11a9 9 0 0 1-9 9h-8a9 9 0 0 1-9-9z" fill="#7A4726" strokeWidth="2" />
      </g>
      <path
        d="M22 16c0-3 3-4 3-7M31 16c0-3 3-4 3-7"
        stroke={T}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}
