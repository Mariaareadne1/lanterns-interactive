import { useEffect, useRef, useState } from 'react';
import { Engine } from '../engine/Engine';
import { Store, useAppState } from '../state/store';
import { addLantern, defaultDoc, emptyDoc, showcaseDoc, type LanternsDoc } from '../state/document';
import { lakeSDF, surfaceHeight } from '../scene/lake';
import { downloadBlob, loadDoc } from '../state/persistence';
import { LanternsApp } from './LanternsApp';
import { WishCard } from './ui/WishCard';
import { loadWishFont } from '../lantern/wishTexture';
import { PointerInput } from '../interaction/PointerInput';
import { recordCanvas } from '../capture/recorder';
import { Chrome } from './ui/Chrome';
import { SelectionOverlay } from './ui/SelectionOverlay';

interface Running {
  engine: Engine;
  app: LanternsApp;
  input: PointerInput;
}

/** Pure helpers for tests and QA scripts (they work the same against the production build). */
const lib = { lakeSDF, surfaceHeight, showcaseDoc, addLantern };

declare global {
  interface Window {
    __lanterns?: Running & { store: Store; lib: typeof lib };
  }
}

function initialDoc(params: URLSearchParams): LanternsDoc {
  if (params.has('showcase')) return showcaseDoc();
  if (params.has('empty')) return emptyDoc();
  return loadDoc() ?? defaultDoc();
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [store] = useState(() => new Store(initialDoc(new URLSearchParams(location.search))));
  const [running, setRunning] = useState<Running | null>(null);
  const fatal = useAppState(store, (s) => s.fatal);
  const uiHidden = useAppState(store, (s) => s.uiHidden);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const params = new URLSearchParams(location.search);
    let engine: Engine;
    let app: LanternsApp;
    try {
      engine = new Engine({ canvas, quality: params.get('quality') === 'low' ? 'low' : 'high' });
      app = new LanternsApp(engine, store);
    } catch (error) {
      store.set({ fatal: `LANTERNS needs WebGL 2, which this browser could not start. (${error instanceof Error ? error.message : String(error)})` });
      return;
    }
    const input = new PointerInput(stage, app);
    input.onMessage = (text) => store.toast(text);
    const resize = () => engine.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    app.start();
    engine.start();
    void loadWishFont();

    const lost = (e: Event) => {
      e.preventDefault();
      engine.stop();
      store.toast('The graphics context was lost. Restoring…');
    };
    const restored = () => engine.start();
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    const visibility = () => (document.hidden ? engine.stop() : engine.start());
    document.addEventListener('visibilitychange', visibility);

    const r: Running = { engine, app, input };
    window.__lanterns = { ...r, store, lib };
    setRunning(r);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      ro.disconnect();
      input.dispose();
      app.dispose();
      engine.dispose();
      delete window.__lanterns;
    };
  }, [store]);

  const capture = async () => {
    if (!running) return;
    try {
      const { engine } = running;
      const dpr = engine.renderer.getPixelRatio();
      const scale = Math.max(1, Math.min(2.5, 3840 / (engine.canvas.clientWidth * dpr)));
      downloadBlob(await engine.capturePNG(scale), `lanterns-${stamp()}.png`);
    } catch (error) {
      store.toast(error instanceof Error ? error.message : 'Could not save the image.');
    }
  };

  const record = async () => {
    if (!running || store.get().recording) return;
    store.set({ recording: true, uiHidden: true, selection: null });
    try {
      const rec = await recordCanvas(running.engine.canvas, { seconds: 12, ink: running.input.ink });
      downloadBlob(rec.blob, `lanterns-${stamp()}.${rec.extension}`);
      store.toast(`Saved a ${(rec.durationMs / 1000).toFixed(0)}-second ${rec.extension.toUpperCase()} clip.`);
    } catch (error) {
      store.toast(error instanceof Error ? error.message : 'Recording failed.');
    } finally {
      store.set({ recording: false, uiHidden: false });
    }
  };

  useEffect(() => {
    if (!running) return;
    const { app, input } = running;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) app.redo();
        else app.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        app.redo();
        return;
      }
      if (mod) return;
      const sel = store.get().selection;
      switch (key) {
        case 'escape':
          if (input.isDrawing) input.abort();
          else if (store.get().uiHidden) store.set({ uiHidden: false });
          else store.set({ selection: null, reading: null });
          break;
        case 'h': if (!store.get().recording) store.set({ uiHidden: !store.get().uiHidden }); break;
        case ' ':
          if (store.get().pending) {
            e.preventDefault();
            app.letGo();
          }
          break;
        case 'delete': case 'backspace':
          if (sel) {
            e.preventDefault();
            app.remove();
          }
          break;
        case 'tab': {
          const ids = store.doc.lanterns.map((l) => l.id);
          if (!ids.length) break;
          e.preventDefault();
          const i = sel ? ids.indexOf(sel.id) : -1;
          store.set({ selection: { kind: 'lantern', id: ids[(i + (e.shiftKey ? ids.length - 1 : 1) + ids.length) % ids.length] }, reading: null });
          break;
        }
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, store]);

  return (
    <div className={`stage${uiHidden ? ' ui-hidden' : ''}`} ref={stageRef}>
      <canvas ref={canvasRef} aria-label="A little painted lake at dusk. Draw a closed loop and it becomes a paper lantern that floats up into the night." role="img" />
      {running && (
        <div className="chrome">
          <SelectionOverlay app={running.app} />
          <WishCard app={running.app} />
          <Chrome app={running.app} onCapture={capture} onRecord={record} />
        </div>
      )}
      {fatal && (
        <div className="fatal" role="alert">
          <h2>The night could not open</h2>
          <p>{fatal}</p>
        </div>
      )}
    </div>
  );
}
