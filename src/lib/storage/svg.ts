import "server-only";

/**
 * Conservatively strip a full-canvas solid-fill background path or rect from
 * an SVG document. Recraft's vector output begins with a primer like:
 *
 *     <path d="M 0 0 L W 0 L W H L 0 H L 0 0 z" fill="rgb(255,255,255)"/>
 *
 * We remove that single element if (and only if) the first child of <svg> is
 * a path/rect with a solid color fill (not "none", not a gradient, not url()).
 *
 * Returns the original document unchanged when no candidate is found.
 */
export function stripFullCanvasBackground(svg: string): {
  stripped: string;
  removed: boolean;
} {
  const match = svg.match(
    /(<svg\b[^>]*>\s*)(<(?:path|rect)\b[^>]*(?:\/>|>\s*<\/(?:path|rect)>))/i,
  );
  if (!match || match.index === undefined) {
    return { stripped: svg, removed: false };
  }

  const head = match[1];
  const element = match[2];
  const elementStart = match.index + head.length;
  const elementEnd = match.index + match[0].length;

  if (!isFullCanvasShape(element)) {
    return { stripped: svg, removed: false };
  }
  if (!isSolidColorFill(element)) {
    return { stripped: svg, removed: false };
  }

  const stripped = svg.slice(0, elementStart) + svg.slice(elementEnd);
  return { stripped, removed: true };
}

function isFullCanvasShape(element: string): boolean {
  if (/^<rect\b/i.test(element)) {
    const xy = readNumberAttrs(element, ["x", "y"]);
    const wh = readNumberAttrs(element, ["width", "height"]);
    if (wh.width === null || wh.height === null) return false;
    if ((xy.x ?? 0) !== 0 || (xy.y ?? 0) !== 0) return false;
    return wh.width > 0 && wh.height > 0;
  }
  // path: must be the canonical canvas-rect d attribute Recraft emits.
  const d = element.match(/\bd\s*=\s*"([^"]+)"/i)?.[1];
  if (!d) return false;
  const num = "\\d+(?:\\.\\d+)?";
  const pattern = new RegExp(
    `^\\s*M\\s*0\\s+0\\s+L\\s+${num}\\s+0\\s+L\\s+${num}\\s+${num}\\s+L\\s+0\\s+${num}\\s+L\\s+0\\s+0\\s+[zZ]\\s*$`,
  );
  return pattern.test(d.trim());
}

function isSolidColorFill(element: string): boolean {
  const fill = element.match(/\bfill\s*=\s*"([^"]+)"/i)?.[1]?.trim();
  if (!fill) return false;
  const lower = fill.toLowerCase();
  if (lower === "none" || lower === "transparent") return false;
  if (lower.startsWith("url(")) return false;
  return true;
}

function readNumberAttrs<T extends string>(
  element: string,
  names: T[],
): Record<T, number | null> {
  const out = {} as Record<T, number | null>;
  for (const name of names) {
    const m = element.match(
      new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, "i"),
    );
    out[name] = m ? Number(m[1]) : null;
  }
  return out;
}
