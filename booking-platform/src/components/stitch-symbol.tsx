/** Locally hosted Material Symbols subset used in the supplied booking screens. */
export function StitchSymbol({ name, size = 20 }: { name: string; size?: number }) {
  return <span aria-hidden="true" className="stitch-symbol" style={{fontSize: size}}>{name}</span>;
}
