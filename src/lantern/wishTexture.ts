import * as THREE from 'three';

/**
 * A wish written in a loose hand: Caveat on a transparent canvas, each
 * letter nudged a little off the line and tilted, as if written on curved
 * paper by someone holding it. Only the alpha is used — the paper shader
 * decides the ink's colour.
 */

export const WISH_FONT = '"Caveat Variable", "Caveat", "Segoe Print", "Bradley Hand", cursive';

/** Make sure the hand is loaded before the first wish is written (falls back silently). */
export async function loadWishFont(): Promise<void> {
  try {
    await document.fonts.load(`600 64px ${WISH_FONT}`);
  } catch {
    // the fallback cursive will do
  }
}

export function wishTexture(wish: string): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const chars = Array.from(wish);
  // shrink long wishes to fit across the lantern's face
  let size = 118;
  ctx.font = `700 ${size}px ${WISH_FONT}`;
  while (ctx.measureText(wish).width > 480 && size > 48) {
    size -= 4;
    ctx.font = `700 ${size}px ${WISH_FONT}`;
  }
  const width = ctx.measureText(wish).width;
  let x = (canvas.width - width) / 2;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    const w = ctx.measureText(ch).width;
    const wobble = Math.sin(i * 1.7 + chars.length) * size * 0.05;
    ctx.save();
    ctx.translate(x + w / 2, canvas.height / 2 + wobble);
    ctx.rotate(Math.sin(i * 2.3) * 0.05);
    ctx.fillText(ch, -w / 2, 0);
    ctx.restore();
    x += w;
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}
