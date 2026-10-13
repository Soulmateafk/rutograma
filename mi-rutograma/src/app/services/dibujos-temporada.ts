// ============================================================
// DIBUJOS PROPIOS DE LAS TEMPORADAS — en vez de los emojis del sistema
// (que cambian según el equipo y se ven distintos en cada uno), lo que cae,
// cruza la pantalla y adorna las esquinas son estos dibujos vectoriales
// hechos para MAKAND. Son SVG pequeños (cuadro de 64 × 64): pesan poco y se
// mueven igual de suave que antes. Lo que no tenga dibujo sigue siendo emoji.
// ============================================================

const D: Record<string, string> = {
  // ---------------- Halloween ----------------
  '🎃': `<path d="M32 12c-3 0-4 2-4 5h8c0-3-1-5-4-5z" fill="#4d7c0f"/><path d="M34 13c3-4 8-5 11-3-4 0-7 2-9 5z" fill="#65a30d"/>
    <ellipse cx="20" cy="38" rx="14" ry="19" fill="#ea580c"/><ellipse cx="44" cy="38" rx="14" ry="19" fill="#ea580c"/><ellipse cx="32" cy="38" rx="14" ry="20" fill="#f97316"/>
    <path d="M22 22c-3 9-3 23 0 32M42 22c3 9 3 23 0 32" stroke="#c2410c" stroke-width="2" fill="none"/>
    <path d="M22 32l6 5h-8zM42 32l-6 5h8z" fill="#451a03"/><path d="M20 44q12 9 24 0l-3 1-2 3-3-2-4 3-4-3-3 2-2-3z" fill="#451a03"/>
    <path d="M22 32l6 5h-8zM42 32l-6 5h8z" fill="#fbbf24" opacity=".35"/>`,
  '👻': `<path d="M32 6c-12 0-20 9-20 21v27l5-4 5 5 5-5 5 5 5-5 5 5 5-5 5 4V27C52 15 44 6 32 6z" fill="#f8fafc"/>
    <path d="M44 9c5 4 8 10 8 18v27l-5-4c2-8 2-30-3-41z" fill="#cbd5e1"/>
    <ellipse cx="25" cy="27" rx="3.5" ry="5" fill="#1e1b4b"/><ellipse cx="39" cy="27" rx="3.5" ry="5" fill="#1e1b4b"/><ellipse cx="32" cy="38" rx="4" ry="5" fill="#1e1b4b"/>
    <ellipse cx="20" cy="34" rx="3" ry="2" fill="#fda4af" opacity=".6"/><ellipse cx="44" cy="34" rx="3" ry="2" fill="#fda4af" opacity=".6"/>`,
  '🦇': `<path d="M32 26c-2-4-2-8 0-10 2 2 2 6 0 10z" fill="#3b0764"/><path d="M28 20l2-5 2 4 2-4 2 5" fill="#3b0764"/>
    <path d="M30 26C22 18 10 18 2 26c5 0 7 3 8 7 3-3 6-3 8 1 3-3 6-3 8 0 2 0 4-2 4-8zM34 26c8-8 20-8 28 0-5 0-7 3-8 7-3-3-6-3-8 1-3-3-6-3-8 0-2 0-4-2-4-8z" fill="#4c1d95"/>
    <ellipse cx="32" cy="28" rx="5" ry="7" fill="#2e1065"/><circle cx="30" cy="23" r="1.2" fill="#fde047"/><circle cx="34" cy="23" r="1.2" fill="#fde047"/>`,
  '🕷️': `<g stroke="#1c1917" stroke-width="2.5" fill="none" stroke-linecap="round"><path d="M26 34L12 26 8 36M26 38L10 40 8 50M38 34l14-8 4 10M38 38l16 2 2 10M27 30L18 16 12 18M37 30l9-14 6 2M28 42l-8 10-2 8M36 42l8 10 2 8"/></g>
    <circle cx="32" cy="38" r="9" fill="#292524"/><circle cx="32" cy="27" r="6" fill="#1c1917"/><circle cx="29.5" cy="26" r="1.6" fill="#ef4444"/><circle cx="34.5" cy="26" r="1.6" fill="#ef4444"/>
    <path d="M28 38h8M30 42h4" stroke="#57534e" stroke-width="1.5"/>`,
  '🕸️': `<g stroke="#e2e8f0" stroke-width="1.4" fill="none" opacity=".9"><path d="M32 4v56M4 32h56M12 12l40 40M52 12L12 52"/>
    <path d="M32 12l10 4 6 10-4 10 4 10-10 6-6 4-10-4-10-6 4-10-4-10 6-10z"/><path d="M32 22l6 2 4 6-2 4 2 6-6 2-4 2-6-2-4-4 2-4-2-4 4-6z"/></g>`,
  '🍬': `<path d="M14 32L2 22v20zM50 32l12-10v20z" fill="#f472b6"/><path d="M14 32L4 24v16zM50 32l10-8v16z" fill="#fbcfe8" opacity=".6"/>
    <circle cx="32" cy="32" r="16" fill="#ec4899"/><path d="M20 22c6 6 6 14 0 20M32 16c4 8 4 24 0 32M44 22c-6 6-6 14 0 20" stroke="#fdf2f8" stroke-width="3" fill="none"/>
    <circle cx="27" cy="25" r="4" fill="#fff" opacity=".35"/>`,
  '💀': `<path d="M32 6C19 6 10 15 10 27c0 8 4 13 8 15v8c0 3 2 5 5 5h18c3 0 5-2 5-5v-8c4-2 8-7 8-15C54 15 45 6 32 6z" fill="#f5f5f4"/>
    <ellipse cx="23" cy="29" rx="6" ry="7" fill="#292524"/><ellipse cx="41" cy="29" rx="6" ry="7" fill="#292524"/><path d="M32 36l-4 7h8z" fill="#292524"/>
    <path d="M24 48v6M30 48v7M36 48v7M42 48v6" stroke="#a8a29e" stroke-width="2"/><circle cx="21" cy="27" r="1.6" fill="#f97316"/><circle cx="39" cy="27" r="1.6" fill="#f97316"/>`,
  '🍭': `<rect x="30" y="34" width="4" height="28" rx="2" fill="#e7e5e4"/><circle cx="32" cy="24" r="18" fill="#a855f7"/>
    <path d="M32 24m-14 0a14 14 0 1 1 28 0a10 10 0 1 1-20 0a6 6 0 1 1 12 0a2.5 2.5 0 1 1-5 0" stroke="#fde68a" stroke-width="3.5" fill="none"/>
    <circle cx="24" cy="16" r="4" fill="#fff" opacity=".35"/>`,
  '🦉': `<path d="M16 16l6 6M48 16l-6 6" stroke="#78350f" stroke-width="4" stroke-linecap="round"/><ellipse cx="32" cy="36" rx="17" ry="22" fill="#92400e"/>
    <ellipse cx="32" cy="42" rx="11" ry="14" fill="#fcd34d"/><path d="M26 40l2 2 2-2M34 46l2 2 2-2M28 50l2 2 2-2" stroke="#b45309" stroke-width="1.4" fill="none"/>
    <circle cx="25" cy="27" r="7" fill="#fff"/><circle cx="39" cy="27" r="7" fill="#fff"/><circle cx="25" cy="27" r="3.5" fill="#1c1917"/><circle cx="39" cy="27" r="3.5" fill="#1c1917"/>
    <path d="M32 31l-3 4h6z" fill="#f97316"/>`,
  '🕯️': `<path d="M32 4c-4 6-6 10-3 14 2 2 4 2 6 0 3-4 1-8-3-14z" fill="#fbbf24"/><path d="M32 10c-2 3-3 5-1 7 1 1 2 1 3 0 1-2 0-4-2-7z" fill="#fef3c7"/>
    <circle cx="32" cy="14" r="10" fill="#fde68a" opacity=".25"/><rect x="31" y="18" width="2" height="5" fill="#44403c"/>
    <rect x="23" y="22" width="18" height="36" rx="3" fill="#fef3c7"/><path d="M23 26c3 3 6 0 9 4s6 1 9-2v-3H23z" fill="#fde68a"/><rect x="36" y="24" width="3" height="32" fill="#fde68a" opacity=".6"/>
    <rect x="18" y="56" width="28" height="5" rx="2.5" fill="#a16207"/>`,
  '🧹': `<rect x="30" y="2" width="4" height="36" rx="2" fill="#a16207" transform="rotate(20 32 32)"/><path d="M22 38l18-4 10 24c-12 6-26 4-34-2z" fill="#facc15"/>
    <path d="M24 42l4 16M30 40l2 20M36 39l1 20M42 38l4 18" stroke="#ca8a04" stroke-width="1.5"/><path d="M21 37l20-4 1 5-20 4z" fill="#b91c1c"/>`,
  '🧙‍♀️': `<path d="M4 46l58-10" stroke="#78350f" stroke-width="3" stroke-linecap="round"/><path d="M2 42l10 4-10 6z" fill="#facc15"/>
    <path d="M30 44c-2-10 2-18 8-20l6 18z" fill="#4c1d95"/><circle cx="40" cy="20" r="6" fill="#86efac"/><path d="M30 18l14-4-4-14z" fill="#1e1b4b"/><path d="M28 18h18" stroke="#1e1b4b" stroke-width="3" stroke-linecap="round"/>
    <path d="M34 24c-6 2-10 6-12 12" stroke="#f97316" stroke-width="3" fill="none"/><path d="M42 34l10 6-4 2" fill="#4c1d95"/>`,
  '🧙‍♂️': `<path d="M4 46l58-10" stroke="#78350f" stroke-width="3" stroke-linecap="round"/><path d="M2 42l10 4-10 6z" fill="#facc15"/>
    <path d="M30 44c-2-10 2-18 8-20l6 18z" fill="#1e3a8a"/><circle cx="40" cy="20" r="6" fill="#fcd9b6"/><path d="M36 22c0 8 4 10 8 8-2-2-2-6-2-8z" fill="#e5e7eb"/><path d="M30 18l14-4-4-14z" fill="#1e40af"/>
    <path d="M28 18h18" stroke="#1e40af" stroke-width="3" stroke-linecap="round"/><circle cx="38" cy="8" r="1.5" fill="#fde047"/>`,
  '🛸': `<ellipse cx="32" cy="24" rx="12" ry="10" fill="#a5f3fc" opacity=".85"/><circle cx="29" cy="22" r="2" fill="#22c55e"/><circle cx="35" cy="22" r="2" fill="#22c55e"/>
    <ellipse cx="32" cy="34" rx="28" ry="9" fill="#94a3b8"/><ellipse cx="32" cy="31" rx="28" ry="6" fill="#cbd5e1"/>
    <circle cx="14" cy="35" r="2" fill="#facc15"/><circle cx="25" cy="38" r="2" fill="#f472b6"/><circle cx="39" cy="38" r="2" fill="#22c55e"/><circle cx="50" cy="35" r="2" fill="#facc15"/>
    <path d="M22 42l-6 18h32l-6-18z" fill="#fef08a" opacity=".25"/>`,

  // ---------------- Navidad ----------------
  '🎁': `<rect x="8" y="26" width="48" height="32" rx="3" fill="#dc2626"/><rect x="5" y="18" width="54" height="11" rx="3" fill="#ef4444"/>
    <rect x="28" y="18" width="8" height="40" fill="#facc15"/><path d="M32 18c-8-10-18-8-14-2 2 3 8 3 14 2zM32 18c8-10 18-8 14-2-2 3-8 3-14 2z" fill="#fde047" stroke="#ca8a04" stroke-width="1.5"/>
    <rect x="8" y="29" width="48" height="3" fill="#991b1b" opacity=".35"/>`,
  '🔔': `<path d="M32 8c-11 0-16 9-16 20v12l-6 8h44l-6-8V28c0-11-5-20-16-20z" fill="#facc15"/><path d="M40 12c4 4 6 10 6 16v12l6 8h-8l-4-8z" fill="#eab308"/>
    <circle cx="32" cy="52" r="6" fill="#ca8a04"/><rect x="29" y="3" width="6" height="7" rx="3" fill="#ca8a04"/><path d="M14 26c4-2 6 2 10 0" stroke="#dc2626" stroke-width="3" fill="none"/>
    <path d="M22 18c2-4 5-6 8-6" stroke="#fef9c3" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  '🍪': `<circle cx="32" cy="32" r="25" fill="#d97706"/><circle cx="32" cy="32" r="25" fill="none" stroke="#b45309" stroke-width="3"/>
    <circle cx="23" cy="22" r="3.5" fill="#451a03"/><circle cx="39" cy="20" r="3" fill="#451a03"/><circle cx="42" cy="36" r="3.5" fill="#451a03"/><circle cx="27" cy="40" r="3" fill="#451a03"/><circle cx="33" cy="30" r="2.5" fill="#451a03"/><circle cx="18" cy="33" r="2" fill="#451a03"/>
    <path d="M14 22c3-6 8-9 13-10" stroke="#fde68a" stroke-width="2.5" fill="none" opacity=".5" stroke-linecap="round"/>`,
  '🧦': `<path d="M20 6h22v30c0 8 2 10 8 12 6 2 8 6 6 10-2 5-8 6-14 4l-16-6c-6-2-8-8-6-14z" fill="#dc2626"/><rect x="18" y="4" width="26" height="12" rx="3" fill="#f8fafc"/>
    <path d="M42 50c4 0 8 2 8 6" stroke="#f8fafc" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M22 24h18M22 30h18" stroke="#16a34a" stroke-width="3"/>`,
  '⭐': `<path d="M32 4l8 17 19 2-14 13 4 19-17-10-17 10 4-19L5 23l19-2z" fill="#facc15"/><path d="M32 4l8 17 19 2-14 13 4 19-17-10z" fill="#eab308"/>
    <path d="M27 18l5-9" stroke="#fef9c3" stroke-width="2.5" stroke-linecap="round"/>`,
  '🎀': `<path d="M32 30C22 14 6 16 8 28c2 10 16 8 24 2zM32 30c10-16 26-14 24-2-2 10-16 8-24 2z" fill="#ec4899"/>
    <path d="M30 32l-12 26 7-4 4 6 3-26zM34 32l12 26-7-4-4 6-3-26z" fill="#db2777"/><circle cx="32" cy="30" r="6" fill="#f472b6"/>
    <path d="M16 22c4-2 8 0 10 4M48 22c-4-2-8 0-10 4" stroke="#fbcfe8" stroke-width="2" fill="none"/>`,
  '❄': `<g stroke="#e0f2fe" stroke-width="3.2" stroke-linecap="round" fill="none"><path d="M32 4v56M8 18l48 28M8 46l48-28"/>
    <path d="M32 12l-6-6M32 12l6-6M32 52l-6 6M32 52l6 6M14 21l-8 1M14 21l-2-8M50 43l8-1M50 43l2 8M14 43l-8-1M14 43l-2 8M50 21l8 1M50 21l2-8"/></g><circle cx="32" cy="32" r="4" fill="#bae6fd"/>`,
  '⛄': `<circle cx="32" cy="44" r="16" fill="#f8fafc"/><circle cx="32" cy="22" r="11" fill="#f8fafc"/><path d="M42 40c2 6 0 14-6 18 8-2 12-8 12-14z" fill="#cbd5e1"/>
    <rect x="22" y="4" width="20" height="10" rx="2" fill="#1f2937"/><rect x="18" y="12" width="28" height="4" rx="2" fill="#1f2937"/><rect x="22" y="10" width="20" height="2" fill="#dc2626"/>
    <circle cx="28" cy="21" r="1.6" fill="#1f2937"/><circle cx="36" cy="21" r="1.6" fill="#1f2937"/><path d="M32 24l9 2-9 1z" fill="#f97316"/>
    <path d="M21 31c6 4 16 4 22 0v4c-6 3-16 3-22 0z" fill="#dc2626"/><path d="M38 34l4 10h-4z" fill="#dc2626"/><circle cx="32" cy="42" r="1.8" fill="#1f2937"/><circle cx="32" cy="49" r="1.8" fill="#1f2937"/>`,
  '🎄': `<rect x="28" y="50" width="8" height="10" fill="#92400e"/><path d="M32 8L14 30h8L10 44h10L6 54h52L44 44h10L42 30h8z" fill="#16a34a"/>
    <path d="M32 8l18 22h-8l12 14H44l14 10H32z" fill="#15803d"/><path d="M20 38q12 4 24-4M14 50q18 4 34-6" stroke="#facc15" stroke-width="1.8" fill="none"/>
    <circle cx="26" cy="30" r="2.5" fill="#ef4444"/><circle cx="40" cy="42" r="2.5" fill="#3b82f6"/><circle cx="22" cy="46" r="2.5" fill="#facc15"/><circle cx="36" cy="22" r="2" fill="#f472b6"/>
    <path d="M32 2l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" fill="#fde047"/>`,
  '🦌': `<path d="M22 14l-4-8M22 14l-8-4M22 14l2-8M42 14l4-8M42 14l8-4M42 14l-2-8" stroke="#78350f" stroke-width="3" stroke-linecap="round"/>
    <path d="M14 40c0-8 8-12 18-12h8l6-8c4 0 6 4 6 6l-6 6v14l4 14h-5l-3-12h-12l-2 12h-5l1-12c-4-1-8-4-10-8z" fill="#a16207"/>
    <circle cx="44" cy="22" r="7" fill="#b45309"/><circle cx="50" cy="24" r="3" fill="#ef4444"/><circle cx="43" cy="20" r="1.4" fill="#1c1917"/>
    <path d="M18 36c4 4 12 4 18 0" stroke="#fef3c7" stroke-width="2" fill="none" opacity=".5"/>`,
  '🛷': `<path d="M8 22h40c8 0 10 6 10 10v4H14z" fill="#dc2626"/><path d="M8 22h40c4 0 7 2 8 6H10z" fill="#ef4444"/>
    <path d="M4 50h50c6 0 8-6 4-8" stroke="#facc15" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M16 36v14M44 36v14" stroke="#facc15" stroke-width="3"/>
    <rect x="18" y="12" width="14" height="12" rx="2" fill="#16a34a"/><rect x="24" y="12" width="2" height="12" fill="#facc15"/>`,
  '🎅': `<circle cx="32" cy="36" r="16" fill="#fcd9b6"/><path d="M14 30C14 12 50 10 50 30z" fill="#dc2626"/><path d="M48 24c6 2 10 8 8 14" stroke="#dc2626" stroke-width="6" fill="none" stroke-linecap="round"/>
    <circle cx="56" cy="40" r="4" fill="#f8fafc"/><rect x="12" y="27" width="40" height="7" rx="3.5" fill="#f8fafc"/>
    <path d="M16 40c0 14 8 20 16 20s16-6 16-20c-4 4-10 2-16 2s-12 2-16-2z" fill="#f8fafc"/><circle cx="26" cy="38" r="1.8" fill="#1f2937"/><circle cx="38" cy="38" r="1.8" fill="#1f2937"/>
    <circle cx="32" cy="43" r="3" fill="#f87171"/><path d="M26 47c4 3 8 3 12 0" stroke="#cbd5e1" stroke-width="2" fill="none"/>`,

  // ---------------- Fiestas y celebraciones ----------------
  '🎉': `<path d="M6 58l14-38 24 24z" fill="#f59e0b"/><path d="M6 58l8-22 6 6z" fill="#fbbf24"/><path d="M12 42l10 10M16 32l16 16" stroke="#fb7185" stroke-width="3"/>
    <circle cx="44" cy="12" r="3" fill="#3b82f6"/><circle cx="54" cy="26" r="3" fill="#22c55e"/><rect x="30" y="6" width="5" height="5" rx="1" fill="#ec4899" transform="rotate(20 32 8)"/>
    <path d="M40 22c4-4 10-4 14-8M46 36c4-2 8 0 12-2" stroke="#a855f7" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="58" cy="10" r="2.5" fill="#facc15"/>`,
  '🎈': `<path d="M32 46c-2 6 2 8 0 16" stroke="#94a3b8" stroke-width="1.5" fill="none"/><path d="M32 4C20 4 13 13 13 24c0 12 10 20 19 22 9-2 19-10 19-22C51 13 44 4 32 4z" fill="#ef4444"/>
    <path d="M29 46h6l-3 4z" fill="#dc2626"/><ellipse cx="24" cy="18" rx="4" ry="7" fill="#fff" opacity=".35" transform="rotate(-20 24 18)"/>`,
  '🎂': `<rect x="10" y="32" width="44" height="24" rx="4" fill="#f9a8d4"/><path d="M10 38c4 4 8 0 11 4s7 0 11 3 7-1 11 2 7-2 11 0v-9H10z" fill="#fdf2f8"/>
    <rect x="6" y="54" width="52" height="5" rx="2.5" fill="#e2e8f0"/><rect x="18" y="20" width="4" height="12" rx="1" fill="#93c5fd"/><rect x="30" y="18" width="4" height="14" rx="1" fill="#fde68a"/><rect x="42" y="20" width="4" height="12" rx="1" fill="#86efac"/>
    <path d="M20 13c-2 3-2 5 0 6 2-1 2-3 0-6zM32 11c-2 3-2 5 0 6 2-1 2-3 0-6zM44 13c-2 3-2 5 0 6 2-1 2-3 0-6z" fill="#f97316"/>`,
  '🥂': `<path d="M8 6h18l-2 18c-1 6-6 8-7 8s-6-2-7-8z" fill="#fde68a" opacity=".85" transform="rotate(-12 17 30)"/><path d="M38 6h18l-2 18c-1 6-6 8-7 8s-6-2-7-8z" fill="#fde68a" opacity=".85" transform="rotate(12 47 30)"/>
    <path d="M14 34l-4 24M50 34l4 24M4 58h14M46 58h14" stroke="#e2e8f0" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="8" r="2" fill="#facc15"/><circle cx="28" cy="2" r="1.5" fill="#facc15"/><circle cx="36" cy="3" r="1.5" fill="#facc15"/>`,
  '🍾': `<path d="M26 22h12v4c6 4 8 8 8 14v18c0 2-2 4-4 4H22c-2 0-4-2-4-4V40c0-6 2-10 8-14z" fill="#166534"/><rect x="26" y="12" width="12" height="12" fill="#facc15"/>
    <rect x="20" y="40" width="24" height="12" rx="2" fill="#fef3c7"/><path d="M26 12l2-8h8l2 8z" fill="#a16207"/><circle cx="20" cy="4" r="2" fill="#fde68a"/><circle cx="44" cy="6" r="2" fill="#fde68a"/>
    <path d="M24 30c-2 4-2 10-2 16" stroke="#22c55e" stroke-width="2.5" fill="none" opacity=".6"/>`,
  '🎆': `<g stroke-linecap="round" stroke-width="3"><path d="M32 32V6M32 32v26M32 32H6M32 32h26M32 32L14 14M32 32l18 18M32 32l18-18M32 32L14 50" stroke="#f472b6"/>
    <path d="M32 32V16M32 32v16M32 32H16M32 32h16" stroke="#facc15"/></g><circle cx="32" cy="32" r="4" fill="#fff"/>
    <circle cx="32" cy="6" r="2.5" fill="#60a5fa"/><circle cx="58" cy="32" r="2.5" fill="#60a5fa"/><circle cx="32" cy="58" r="2.5" fill="#60a5fa"/><circle cx="6" cy="32" r="2.5" fill="#60a5fa"/>`,
  '✨': `<path d="M24 6l5 15 15 5-15 5-5 15-5-15L4 26l15-5z" fill="#fde047"/><path d="M48 34l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#fef08a"/><path d="M50 6l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fef9c3"/>`,
  '💕': `<path d="M24 52S4 38 4 24c0-8 6-12 11-12 4 0 7 2 9 6 2-4 5-6 9-6 5 0 11 4 11 12 0 14-20 28-20 28z" fill="#ec4899"/>
    <path d="M46 34s-12-8-12-17c0-5 4-8 7-8 2 0 4 1 5 4 1-3 3-4 5-4 3 0 7 3 7 8 0 9-12 17-12 17z" fill="#f9a8d4"/><ellipse cx="13" cy="22" rx="3" ry="5" fill="#fff" opacity=".35"/>`,
  '💘': `<path d="M32 56S6 40 6 22C6 12 13 8 19 8c5 0 10 3 13 8 3-5 8-8 13-8 6 0 13 4 13 14 0 18-26 34-26 34z" fill="#e11d48"/>
    <path d="M4 50L60 14" stroke="#fde68a" stroke-width="3"/><path d="M60 14l-10 1 3 3-1 4z" fill="#fde68a"/><path d="M4 50l4-8M4 50l8-3" stroke="#facc15" stroke-width="3"/>
    <ellipse cx="17" cy="20" rx="3.5" ry="6" fill="#fff" opacity=".35"/>`,
  '💝': `<path d="M32 58S6 42 6 24C6 14 13 10 19 10c5 0 10 3 13 8 3-5 8-8 13-8 6 0 13 4 13 14 0 18-26 34-26 34z" fill="#f43f5e"/>
    <path d="M28 16v38M6 26h52" stroke="#facc15" stroke-width="4"/><path d="M28 16c-6-10-14-8-12-2 1 3 6 4 12 2zM28 16c6-10 14-8 12-2-1 3-6 4-12 2z" fill="#fde047"/>`,
  '💛': `<path d="M32 56S6 40 6 22C6 12 13 8 19 8c5 0 10 3 13 8 3-5 8-8 13-8 6 0 13 4 13 14 0 18-26 34-26 34z" fill="#facc15"/>
    <path d="M45 8c6 0 13 4 13 14 0 18-26 34-26 34s20-16 20-32c0-8-3-13-7-16z" fill="#eab308"/><ellipse cx="17" cy="20" rx="3.5" ry="6" fill="#fff" opacity=".45"/>`,
  '💌': `<rect x="6" y="16" width="52" height="36" rx="4" fill="#fdf2f8"/><path d="M6 20l26 18 26-18" stroke="#f9a8d4" stroke-width="3" fill="none"/>
    <path d="M32 34s-8-5-8-10c0-3 2-4 4-4 1 0 3 1 4 3 1-2 3-3 4-3 2 0 4 1 4 4 0 5-8 10-8 10z" fill="#e11d48"/>`,
  '🌹': `<path d="M32 30c-1 10 0 20 1 30" stroke="#15803d" stroke-width="3" fill="none"/><path d="M33 44c6-6 14-4 16-2-6 4-12 4-16 2zM32 50c-6-6-14-4-16-2 6 4 12 4 16 2z" fill="#16a34a"/>
    <path d="M32 4c-8 0-16 6-16 14 0 10 8 14 16 14s16-4 16-14C48 10 40 4 32 4z" fill="#be123c"/><path d="M24 14c4-6 12-6 16 0-4 2-12 4-16 0z" fill="#e11d48"/>
    <path d="M26 18c2 6 10 8 14 2" stroke="#9f1239" stroke-width="2" fill="none"/><path d="M30 10c2-2 6-2 8 2" stroke="#fda4af" stroke-width="1.5" fill="none"/>`,
  '💐': `<path d="M22 60l10-26 10 26z" fill="#a7f3d0"/><path d="M24 44h16" stroke="#f472b6" stroke-width="3"/><path d="M32 34l-10-14M32 34V16M32 34l10-14" stroke="#16a34a" stroke-width="2"/>
    <circle cx="20" cy="18" r="8" fill="#f472b6"/><circle cx="32" cy="12" r="8" fill="#facc15"/><circle cx="44" cy="18" r="8" fill="#a855f7"/><circle cx="26" cy="26" r="6" fill="#fb7185"/><circle cx="38" cy="26" r="6" fill="#60a5fa"/>
    <circle cx="20" cy="18" r="3" fill="#fde68a"/><circle cx="32" cy="12" r="3" fill="#f97316"/><circle cx="44" cy="18" r="3" fill="#fde68a"/>`,
  '🌸': `<g fill="#f9a8d4"><ellipse cx="32" cy="16" rx="9" ry="12"/><ellipse cx="32" cy="16" rx="9" ry="12" transform="rotate(72 32 32)"/><ellipse cx="32" cy="16" rx="9" ry="12" transform="rotate(144 32 32)"/><ellipse cx="32" cy="16" rx="9" ry="12" transform="rotate(216 32 32)"/><ellipse cx="32" cy="16" rx="9" ry="12" transform="rotate(288 32 32)"/></g>
    <circle cx="32" cy="32" r="7" fill="#f472b6"/><circle cx="32" cy="32" r="3.5" fill="#fde047"/>`,
  '🌷': `<path d="M32 36v26" stroke="#15803d" stroke-width="3"/><path d="M32 52c-8-10-16-8-18-6 6 6 14 8 18 6zM32 48c8-8 14-6 16-4-6 4-12 6-16 4z" fill="#22c55e"/>
    <path d="M18 12c0 14 4 24 14 24s14-10 14-24l-7 6-7-12-7 12z" fill="#ec4899"/><path d="M32 6l-7 12 7 18 7-18z" fill="#f472b6"/>`,
  '🥚': `<path d="M32 4C21 4 12 22 12 36c0 14 9 24 20 24s20-10 20-24C52 22 43 4 32 4z" fill="#fef3c7"/>
    <path d="M13 32l6-4 6 4 7-4 7 4 6-4 6 4M13 42l6 4 6-4 7 4 7-4 6 4 6-4" stroke="#a855f7" stroke-width="3" fill="none" stroke-linejoin="round"/>
    <circle cx="26" cy="20" r="3" fill="#f472b6"/><circle cx="38" cy="18" r="2.5" fill="#60a5fa"/><circle cx="32" cy="52" r="3" fill="#34d399"/>`,
  '🐣': `<path d="M14 36c0 14 8 24 18 24s18-10 18-24l-5 4-4-6-5 6-4-6-5 6-4-6-4 6z" fill="#fef3c7"/><circle cx="32" cy="26" r="13" fill="#fde047"/>
    <circle cx="27" cy="24" r="2" fill="#1c1917"/><circle cx="37" cy="24" r="2" fill="#1c1917"/><path d="M29 29l3 4 3-4z" fill="#f97316"/><path d="M30 12c2-4 6-4 6 0" stroke="#facc15" stroke-width="2.5" fill="none"/>`,
  '🐇': `<ellipse cx="24" cy="12" rx="5" ry="12" fill="#f1f5f9" transform="rotate(-12 24 12)"/><ellipse cx="38" cy="12" rx="5" ry="12" fill="#f1f5f9" transform="rotate(12 38 12)"/>
    <ellipse cx="24" cy="12" rx="2" ry="8" fill="#fbcfe8" transform="rotate(-12 24 12)"/><ellipse cx="38" cy="12" rx="2" ry="8" fill="#fbcfe8" transform="rotate(12 38 12)"/>
    <ellipse cx="32" cy="46" rx="18" ry="15" fill="#f8fafc"/><circle cx="31" cy="28" r="11" fill="#f8fafc"/><circle cx="48" cy="48" r="5" fill="#fff"/>
    <circle cx="27" cy="27" r="1.8" fill="#1f2937"/><circle cx="35" cy="27" r="1.8" fill="#1f2937"/><path d="M29 32l2 2 2-2" fill="#f472b6"/>`,

  // ---------------- Trabajo, transporte y MAKAND ----------------
  '🚚': `<rect x="2" y="16" width="38" height="28" rx="3" fill="#f8fafc"/><rect x="2" y="34" width="38" height="4" fill="#2563eb"/>
    <text x="21" y="29" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="8" fill="#1d4ed8">MAKA<tspan fill="#f97316">ND</tspan></text>
    <path d="M40 22h12l8 10v12H40z" fill="#2563eb"/><path d="M43 25h8l5 7H43z" fill="#bae6fd"/><rect x="40" y="38" width="20" height="3" fill="#1e40af"/>
    <circle cx="14" cy="47" r="6" fill="#1f2937"/><circle cx="14" cy="47" r="2.5" fill="#94a3b8"/><circle cx="50" cy="47" r="6" fill="#1f2937"/><circle cx="50" cy="47" r="2.5" fill="#94a3b8"/>
    <rect x="57" y="34" width="4" height="3" rx="1" fill="#fde047"/>`,
  '🚛': `<rect x="0" y="14" width="40" height="28" rx="2" fill="#e2e8f0"/><rect x="0" y="32" width="40" height="3" fill="#f97316"/>
    <text x="20" y="27" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="8" fill="#1d4ed8">MAKA<tspan fill="#f97316">ND</tspan></text>
    <path d="M42 18h10l10 12v14H42z" fill="#1d4ed8"/><path d="M45 21h6l7 9H45z" fill="#bae6fd"/><rect x="40" y="40" width="4" height="4" fill="#334155"/>
    <circle cx="9" cy="46" r="5" fill="#1f2937"/><circle cx="21" cy="46" r="5" fill="#1f2937"/><circle cx="54" cy="46" r="5" fill="#1f2937"/><circle cx="9" cy="46" r="2" fill="#94a3b8"/><circle cx="21" cy="46" r="2" fill="#94a3b8"/><circle cx="54" cy="46" r="2" fill="#94a3b8"/>`,
  '🚐': `<path d="M4 20c0-3 2-6 6-6h30c6 0 12 6 18 14l2 4v12H4z" fill="#f8fafc"/><path d="M42 16c5 1 9 6 13 12H42z" fill="#bae6fd"/><rect x="10" y="18" width="10" height="9" rx="1" fill="#bae6fd"/><rect x="24" y="18" width="12" height="9" rx="1" fill="#bae6fd"/>
    <rect x="4" y="34" width="56" height="4" fill="#2563eb"/><circle cx="16" cy="45" r="6" fill="#1f2937"/><circle cx="48" cy="45" r="6" fill="#1f2937"/><circle cx="16" cy="45" r="2.5" fill="#94a3b8"/><circle cx="48" cy="45" r="2.5" fill="#94a3b8"/>`,
  '📦': `<path d="M8 20l24-10 24 10v28L32 58 8 48z" fill="#d97706"/><path d="M32 30v28L8 48V20z" fill="#b45309"/><path d="M8 20l24 10 24-10" stroke="#92400e" stroke-width="1.5" fill="none"/>
    <path d="M20 15l24 10v8l-6-2v-6L14 17z" fill="#fde68a"/><path d="M14 40l10 4" stroke="#fef3c7" stroke-width="2" opacity=".6"/>`,
  '💨': `<g fill="#e2e8f0" opacity=".85"><circle cx="16" cy="34" r="10"/><circle cx="30" cy="28" r="12"/><circle cx="44" cy="34" r="9"/><circle cx="54" cy="38" r="6"/></g>
    <path d="M4 44h40M10 50h28" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/>`,
  '⚙️': `<path d="M28 4h8l2 8 6 3 7-4 6 6-4 7 3 6 8 2v8l-8 2-3 6 4 7-6 6-7-4-6 3-2 8h-8l-2-8-6-3-7 4-6-6 4-7-3-6-8-2v-8l8-2 3-6-4-7 6-6 7 4 6-3z" fill="#94a3b8"/>
    <circle cx="32" cy="32" r="10" fill="#475569"/><circle cx="32" cy="32" r="5" fill="#cbd5e1"/>`,
  '🔧': `<path d="M46 4c-8 0-13 7-11 14L8 45c-3 3-3 7 0 10s7 3 10 0l27-27c7 2 15-3 15-11l-8 6-6-2-2-6z" fill="#64748b"/><circle cx="12" cy="51" r="2.5" fill="#cbd5e1"/>
    <path d="M38 18L12 44" stroke="#94a3b8" stroke-width="2"/>`,
  '🛠️': `<path d="M44 4c-7 0-11 6-10 12L8 42c-2 3-2 6 0 8s5 2 8 0l26-26c6 1 12-3 12-10l-7 5-5-2-1-5z" fill="#64748b"/>
    <path d="M10 10l8-6 10 10-4 4 26 26c2 2 2 5 0 7s-5 2-7 0L17 25l-4 4L3 19z" fill="#f59e0b"/><path d="M10 10l8-6 10 10-8 8z" fill="#94a3b8"/>`,
  '🏆': `<path d="M18 6h28v14c0 10-6 16-14 16s-14-6-14-16z" fill="#facc15"/><path d="M38 6h8v14c0 10-6 16-14 16 5-3 6-9 6-16z" fill="#eab308"/>
    <path d="M18 10H8c0 10 4 14 10 14M46 10h10c0 10-4 14-10 14" stroke="#facc15" stroke-width="3.5" fill="none"/>
    <rect x="28" y="36" width="8" height="10" fill="#ca8a04"/><rect x="18" y="46" width="28" height="12" rx="2" fill="#78350f"/><rect x="24" y="50" width="16" height="4" rx="1" fill="#facc15"/>
    <path d="M32 12l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" fill="#fef9c3"/>`,
  '👔': `<path d="M20 4l12 8 12-8 10 6-6 10-6-4-10 4-10-4-6 4-6-10z" fill="#f8fafc"/><path d="M28 12h8l-2 6h-4z" fill="#1d4ed8"/><path d="M30 18h4l5 32-7 10-7-10z" fill="#2563eb"/>
    <path d="M30 26l8 6M29 36l10 6" stroke="#93c5fd" stroke-width="2"/>`,
  '🛣️': `<path d="M24 4h16l20 56H4z" fill="#475569"/><path d="M24 4h3L10 60H4zM37 4h3l20 56h-6z" fill="#facc15"/>
    <path d="M32 8v8M32 24v10M32 42v12" stroke="#f8fafc" stroke-width="3" stroke-linecap="round"/>`,
  '🏇': `<path d="M8 40c2-10 10-14 20-14h14l8-10c4-2 8 0 8 4l-6 8v10l-4 2v14h-4l-2-12H26l-4 12h-4l2-14c-6-2-10 2-12 0z" fill="#78350f"/>
    <path d="M50 16c2-4 6-4 8-2" stroke="#451a03" stroke-width="3" fill="none"/><path d="M8 40c-4 0-6 4-4 8" stroke="#451a03" stroke-width="3" fill="none"/>
    <path d="M30 12l6 4-2 12h-8z" fill="#ce1126"/><circle cx="32" cy="8" r="5" fill="#fcd9b6"/><path d="M27 6c2-4 8-4 10 0z" fill="#fcd116"/>`,
  '🏮': `<rect x="30" y="2" width="4" height="6" fill="#facc15"/><rect x="22" y="8" width="20" height="5" rx="2" fill="#a16207"/>
    <path d="M32 12c-14 0-20 10-20 20s6 20 20 20 20-10 20-20-6-20-20-20z" fill="#dc2626"/><path d="M22 18c-4 8-4 20 0 28M42 18c4 8 4 20 0 28M32 12v40" stroke="#991b1b" stroke-width="2" fill="none"/>
    <ellipse cx="32" cy="32" rx="12" ry="14" fill="#fde047" opacity=".25"/><rect x="22" y="50" width="20" height="5" rx="2" fill="#a16207"/><path d="M28 55l-2 8M32 55v8M36 55l2 8" stroke="#facc15" stroke-width="2"/>`
};

const svg = (contenido: string) => `<svg class="td" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${contenido}</svg>`;
const cache = new Map<string, string>();
const separador: any = typeof Intl !== 'undefined' && (Intl as any).Segmenter ? new (Intl as any).Segmenter('es', { granularity: 'grapheme' }) : null;
const normal = (e: string) => e.replace(/️/g, '');
const DN: Record<string, string> = Object.fromEntries(Object.entries(D).map(([k, v]) => [normal(k), v]));

/** ¿Hay dibujo propio para este emoji? */
export function tieneDibujo(e: string): boolean { return !!DN[normal(e)]; }

/**
 * HTML con el dibujo de cada emoji del texto ("🦌🦌🛷" -> tres dibujos en fila).
 * Lo que no tenga dibujo queda como el emoji de siempre. invertir: al revés (para lo que cruza).
 */
export function dibujoTemporada(texto: string, invertir = false): string {
  if (!texto) return '';
  const clave = (invertir ? '↔' : '') + texto;
  const guardado = cache.get(clave); if (guardado) return guardado;
  let partes: string[] = separador ? Array.from(separador.segment(texto), (s: any) => s.segment) : Array.from(texto);
  // Lo que cruza va de izquierda a derecha y los dibujos miran a la derecha: el que va adelante queda a la derecha.
  if (invertir) partes = partes.reverse();
  const html = partes.filter(p => p.trim()).map(p => DN[normal(p)] ? svg(DN[normal(p)]) : `<span class="td-emoji">${p}</span>`).join('');
  cache.set(clave, html);
  return html;
}
