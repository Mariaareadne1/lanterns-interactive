import { useSyncExternalStore } from 'react';
import { amend, commit, createHistory, redo, undo, type History } from './history';
import type { LanternsDoc } from './document';

/** Minimal external store: React reads it through useSyncExternalStore. */

/** What is selected: a lantern, by id. */
export type Selection = { kind: 'lantern'; id: string } | null;

export interface AppState {
  readonly history: History;
  readonly selection: Selection;
  readonly hasDrawn: boolean;
  readonly uiHidden: boolean;
  readonly toast: { id: number; text: string } | null;
  readonly loading: boolean;
  readonly recording: boolean;
  readonly fatal: string | null;
  /** The lantern just drawn, waiting on the ground for its wish and "Let go". */
  readonly pending: string | null;
  /** A lantern whose wish is being read: its caption shows. */
  readonly reading: string | null;
}

type Listener = () => void;

export class Store {
  private state: AppState;
  private readonly listeners = new Set<Listener>();
  private toastId = 0;

  constructor(doc: LanternsDoc) {
    this.state = {
      history: createHistory(doc),
      selection: null,
      hasDrawn: false,
      uiHidden: false,
      toast: null,
      loading: true,
      recording: false,
      fatal: null,
      pending: null,
      reading: null,
    };
  }

  get = (): AppState => this.state;

  get doc(): LanternsDoc {
    return this.state.history.present;
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  commit(doc: LanternsDoc, patch: Partial<AppState> = {}): void {
    this.set({ ...patch, history: commit(this.state.history, doc) });
  }

  amend(doc: LanternsDoc): void {
    this.set({ history: amend(this.state.history, doc) });
  }

  undo(): void {
    this.set({ history: undo(this.state.history) });
    this.dropMissingSelection();
  }

  redo(): void {
    this.set({ history: redo(this.state.history) });
    this.dropMissingSelection();
  }

  toast(text: string): void {
    this.set({ toast: { id: ++this.toastId, text } });
  }

  private dropMissingSelection(): void {
    const s = this.state.selection;
    const has = (id: string | null) => !!id && this.doc.lanterns.some((l) => l.id === id);
    if (s && !has(s.id)) this.set({ selection: null });
    if (this.state.pending && !has(this.state.pending)) this.set({ pending: null });
    if (this.state.reading && !has(this.state.reading)) this.set({ reading: null });
  }
}

export function useAppState<T>(store: Store, select: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
