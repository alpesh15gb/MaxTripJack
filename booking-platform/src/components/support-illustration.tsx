/** Original Max Travel support illustration: a travel-desk headset, a chat
 * bubble and a boarding pass on a route arc. Decorative only. */
export default function SupportIllustration() {
  return <svg className="support-illustration" viewBox="0 0 640 300" role="presentation" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="support-sky" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f6e8d0"/>
        <stop offset="1" stopColor="#eee9dd"/>
      </linearGradient>
    </defs>
    <ellipse cx="380" cy="160" rx="250" ry="132" fill="url(#support-sky)"/>
    <path d="M110 230 C210 90 420 60 570 120" fill="none" stroke="#1b554c" strokeWidth="3" strokeDasharray="9 9" opacity=".55"/>
    <g transform="translate(548 104) rotate(18)">
      <path d="M0 0 L26 8 L0 16 L5 8 Z" fill="#a94924"/>
    </g>
    <circle cx="110" cy="230" r="8" fill="#1b554c"/>
    {/* Headset */}
    <g transform="translate(250 70)">
      <path d="M20 96 C20 38 60 6 110 6 C160 6 200 38 200 96" fill="none" stroke="#0c3532" strokeWidth="16" strokeLinecap="round"/>
      <rect x="0" y="86" width="48" height="78" rx="22" fill="#236052"/>
      <rect x="172" y="86" width="48" height="78" rx="22" fill="#236052"/>
      <path d="M196 158 C196 196 170 210 132 210" fill="none" stroke="#0c3532" strokeWidth="9" strokeLinecap="round"/>
      <rect x="108" y="198" width="34" height="22" rx="11" fill="#a94924"/>
    </g>
    {/* Chat bubble */}
    <g transform="translate(468 40)">
      <rect width="132" height="74" rx="18" fill="#fffefa" stroke="#dedbd0" strokeWidth="2"/>
      <path d="M30 74 L22 98 L52 74 Z" fill="#fffefa" stroke="#dedbd0" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M31 76 L49 76" stroke="#fffefa" strokeWidth="4"/>
      <circle cx="40" cy="37" r="7" fill="#236052"/>
      <circle cx="66" cy="37" r="7" fill="#236052" opacity=".7"/>
      <circle cx="92" cy="37" r="7" fill="#236052" opacity=".45"/>
    </g>
    {/* Boarding pass */}
    <g transform="translate(60 92) rotate(-8)">
      <rect width="150" height="78" rx="12" fill="#fffefa" stroke="#dedbd0" strokeWidth="2"/>
      <rect width="40" height="78" rx="12" fill="#1b554c"/>
      <rect x="28" width="12" height="78" fill="#1b554c"/>
      <path d="M58 26 H134 M58 42 H112 M58 58 H124" stroke="#52635f" strokeWidth="5" strokeLinecap="round" opacity=".5"/>
      <path d="M12 39 L28 33 L28 45 Z" fill="#f0c888"/>
    </g>
  </svg>;
}
