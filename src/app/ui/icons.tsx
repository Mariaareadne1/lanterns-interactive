// Small line icons, drawn for this UI at 20px on a 20-unit grid.

interface IconProps {
  name: IconName;
}

export type IconName =
  | 'draw' | 'undo' | 'redo' | 'camera' | 'help' | 'menu' | 'trash' | 'wish' | 'glow' | 'up';

const paths: Record<IconName, string> = {
  undo: 'M7.5 6.5 4 10l3.5 3.5M4.5 10H12a4 4 0 0 1 0 8h-1',
  redo: 'M12.5 6.5 16 10l-3.5 3.5M15.5 10H8a4 4 0 0 0 0 8h1',
  camera: 'M3.5 7.5h3l1.3-2h4.4l1.3 2h3v8h-13zM10 13.6a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6',
  help: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15M7.9 7.8a2.2 2.2 0 1 1 3 2c-.6.3-.9.8-.9 1.4v.5M10 14.2v.1',
  menu: 'M4.5 10h.1M10 10h.1M15.5 10h.1',
  trash: 'M4.5 6h11M8 6V4.5h4V6M6 6l.7 10h6.6L14 6',
  // a lantern-loop pen, a written line, rays of light, an arrow up
  draw: 'M10 3.5c3.4 0 5 2.8 5 6 0 3.6-2.4 5.8-3.3 6.5H8.3C7.4 15.3 5 13.1 5 9.5c0-3.2 1.6-6 5-6zM8.6 17.5h2.8',
  wish: 'M4 13.5c1.6-2.5 2.6-.6 3.6-2.4 1-1.8 1.8-.6 2.6.6.9 1.3 2-1.2 3.2-1.5M4 16.5h12',
  glow: 'M10 7.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6M10 2.8v1.6M10 15.6v1.6M2.8 10h1.6M15.6 10h1.6M4.9 4.9 6 6M14 14l1.1 1.1M4.9 15.1 6 14M14 6l1.1-1.1',
  up: 'M10 16.5v-12M5.5 9 10 4.5 14.5 9',
};

export function Icon({ name }: IconProps) {
  return (
    <svg className="icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d={paths[name]} fill="none" stroke="currentColor" strokeWidth={name === 'menu' ? 2.6 : 1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
