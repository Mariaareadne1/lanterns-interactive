import { useEffect, useRef, useState } from 'react';
import type { LanternsApp } from '../LanternsApp';
import { useAppState } from '../../state/store';
import { WISH_MAX, findLantern } from '../../state/document';
import { lanternBox, beside } from './anchor';
import { Icon } from './icons';

/**
 * The small card beside a lantern that has just been drawn: Make a wish
 * (one line, written onto the paper as you type) and Let go. Doing nothing
 * for about four seconds, the lantern lets itself go; while the wish is
 * being typed, it waits.
 */
export function WishCard({ app }: { app: LanternsApp }) {
  const pending = useAppState(app.store, (s) => s.pending);
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');

  // a fresh card for every lantern
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (pending !== shownFor) {
    setShownFor(pending);
    setWriting(false);
    setText(pending ? findLantern(app.store.doc, pending)?.wish ?? '' : '');
  }

  useEffect(() => {
    if (!pending) return;
    const update = () => {
      const b = lanternBox(app, pending);
      if (b && cardRef.current) beside(cardRef.current, b, app.rect, 18);
    };
    update();
    return app.engine.onBeforeRender(update);
  }, [app, pending]);

  useEffect(() => {
    if (writing) inputRef.current?.focus();
  }, [writing]);

  if (!pending) return null;
  const letGo = () => app.letGo(pending, text);
  return (
    <div className="wish-card" ref={cardRef} role="dialog" aria-label="Your lantern">
      {writing ? (
        <form
          className="wish-form"
          onSubmit={(e) => {
            e.preventDefault();
            letGo();
          }}
        >
          <input
            ref={inputRef}
            className="wish-input"
            value={text}
            maxLength={WISH_MAX}
            placeholder="I wish…"
            aria-label="Your wish"
            enterKeyHint="send"
            autoComplete="off"
            spellCheck={false}
            onFocus={() => app.holdPending(true)}
            onBlur={() => app.holdPending(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                inputRef.current?.blur();
              }
            }}
            onChange={(e) => {
              setText(e.target.value);
              app.setWish(pending, e.target.value);
            }}
          />
          <button type="submit" className="chip strong"><Icon name="up" /><span>Let go</span></button>
        </form>
      ) : (
        <>
          <button className="chip" onClick={() => { app.touchPending(); setWriting(true); }}><Icon name="wish" /><span>Make a wish</span></button>
          <button className="chip strong" onClick={letGo}><Icon name="up" /><span>Let go</span></button>
        </>
      )}
    </div>
  );
}
