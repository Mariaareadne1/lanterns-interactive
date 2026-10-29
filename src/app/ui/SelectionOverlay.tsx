import { useEffect, useRef } from 'react';
import type { LanternsApp } from '../LanternsApp';
import { useAppState } from '../../state/store';
import { findLantern } from '../../state/document';
import { WORLD_SCALE, groundHeight } from '../../scene/lake';
import { lanternBox, beside } from './anchor';
import { Icon } from './icons';

/**
 * MEADOW's thin blue box round the selected lantern with a readout — its
 * size and where it is — and a small bar of the only three things a
 * lantern can do. When its wish is being read, the wish appears beside it
 * as a soft handwritten caption. Positions are written straight to the DOM
 * every frame; no React renders.
 */

function whereabouts(app: LanternsApp, id: string): string {
  const l = app.lanterns.get(id);
  if (!l) return '';
  const p = l.pose;
  if (l.record.mode === 'lake') return p.phase === 'waiting' ? 'on the water' : 'sailing on the lake';
  if (p.phase === 'waiting') return l.record.at[1] > 1 ? 'waiting in the sky' : 'waiting to go';
  if (p.phase === 'star') return 'a star over the hills';
  const up = (l.group.position.y - Math.max(0, groundHeight(l.group.position.x, l.group.position.z))) * WORLD_SCALE;
  return `rising · ${Math.max(0, up).toFixed(0)} m up`;
}

export function SelectionOverlay({ app }: { app: LanternsApp }) {
  const selection = useAppState(app.store, (s) => s.selection);
  const reading = useAppState(app.store, (s) => s.reading);
  const boxRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const wish = useAppState(app.store, (s) => (s.reading ? findLantern(s.history.present, s.reading)?.wish ?? '' : null));

  useEffect(() => {
    if (!selection && !reading) return;
    let lastText = '';
    const update = () => {
      const rect = app.rect;
      if (reading && captionRef.current) {
        const b = lanternBox(app, reading);
        if (b) beside(captionRef.current, b, rect, 18);
      }
      if (!selection) return;
      const box = boxRef.current;
      const bar = barRef.current;
      const b = lanternBox(app, selection.id);
      if (!box || !bar || !b) return;
      box.style.transform = `translate(${b.minX.toFixed(1)}px, ${b.minY.toFixed(1)}px)`;
      box.style.width = `${(b.maxX - b.minX).toFixed(1)}px`;
      box.style.height = `${(b.maxY - b.minY).toFixed(1)}px`;
      const l = app.lanterns.get(selection.id);
      if (labelRef.current && l) {
        const text = `${(l.height * WORLD_SCALE * 0.5).toFixed(1)} m  ·  ${whereabouts(app, selection.id)}`;
        if (text !== lastText) labelRef.current.textContent = lastText = text;
      }
      // the bar sits under the box, or above it near the bottom edge
      const barW = bar.offsetWidth;
      const barH = bar.offsetHeight;
      const cx = Math.min(rect.width - barW / 2 - 12, Math.max(barW / 2 + 12, (b.minX + b.maxX) / 2));
      const below = b.maxY + 34 + barH < rect.height - 84;
      const y = below ? b.maxY + 30 : b.minY - barH - 12;
      bar.style.transform = `translate(${(cx - barW / 2).toFixed(1)}px, ${Math.max(8, y).toFixed(1)}px)`;
    };
    update();
    return app.engine.onBeforeRender(update);
  }, [app, selection, reading]);

  const id = selection?.id;
  return (
    <>
      {reading && wish !== null && (
        <p className="wish-caption" ref={captionRef} aria-live="polite">
          {wish ? `“${wish}”` : 'a wish kept to itself'}
        </p>
      )}
      {id && (
        <>
          <div className="select-box" ref={boxRef} aria-hidden="true">
            <i className="h tl" /><i className="h tr" /><i className="h bl" /><i className="h br" />
            <span className="select-label" ref={labelRef} />
          </div>
          <div className="action-bar" ref={barRef} role="toolbar" aria-label="Selected lantern">
            <span className="bar-title">Lantern</span>
            <Chip label="Read wish" icon="wish" on={reading === id} onClick={() => app.readWish(id)} />
            <Chip label="Glow" icon="glow" onClick={() => app.glow(id)} />
            <span className="sep" />
            <button className="icon-btn" title="Remove (Delete)" aria-label="Remove lantern" onClick={() => app.remove(id)}><Icon name="trash" /></button>
          </div>
        </>
      )}
    </>
  );
}

function Chip({ label, on, onClick, icon }: { label: string; on?: boolean; onClick: () => void; icon: Parameters<typeof Icon>[0]['name'] }) {
  return (
    <button className={on ? 'chip on' : 'chip'} title={label} aria-pressed={on} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}
