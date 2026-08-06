import React from 'react';

// Minimalist linear icon set. Single stroke, no fill, consistent 1.75 weight.
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Svg({ children, size, ...props }) {
  return (
    <svg {...base} width={size || base.width} height={size || base.height} {...props}>
      {children}
    </svg>
  );
}

export const IconBox = (p) => (
  <Svg {...p}><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></Svg>
);

export const IconChart = (p) => (
  <Svg {...p}><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></Svg>
);

export const IconUser = (p) => (
  <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4.5 5-6 8-6s6.5 1.5 8 6" /></Svg>
);

export const IconLogout = (p) => (
  <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Svg>
);

export const IconStore = (p) => (
  <Svg {...p}><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M9 20v-6h6v6" /><path d="M3 9h18" /></Svg>
);

export const IconPlus = (p) => (
  <Svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>
);

export const IconEdit = (p) => (
  <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>
);

export const IconTrash = (p) => (
  <Svg {...p}><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></Svg>
);

export const IconSearch = (p) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Svg>
);

export const IconCheck = (p) => (
  <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>
);

export const IconAlert = (p) => (
  <Svg {...p}><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.6 2.6 18a1.5 1.5 0 0 0 1.3 2.2h16.2a1.5 1.5 0 0 0 1.3-2.2L13.7 3.6a1.5 1.5 0 0 0-3.4 0Z" /></Svg>
);

export const IconClose = (p) => (
  <Svg {...p}><path d="M18 6 6 18" /><path d="M6 6l12 12" /></Svg>
);

export const IconChevronLeft = (p) => (
  <Svg {...p}><path d="M15 18l-6-6 6-6" /></Svg>
);

export const IconChevronRight = (p) => (
  <Svg {...p}><path d="M9 18l6-6-6-6" /></Svg>
);

export const IconArchive = (p) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><path d="M10 13h4" /></Svg>
);

export const IconTrendUp = (p) => (
  <Svg {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></Svg>
);

export const IconGrid = (p) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </Svg>
);

export const IconInfo = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-5" /><path d="M12 8h.01" /></Svg>
);
