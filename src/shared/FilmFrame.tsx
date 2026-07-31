import type { ReactNode } from 'react';

export interface FilmFrameProps {
  frameNumber: number;
  frameLabel?: string;
  date: string;
  media?: ReactNode;
  hasMedia?: boolean;
  children: ReactNode;
  variant?: 'card' | 'thumbnail';
  className?: string;
}

export function FilmFrame({ frameNumber, frameLabel, date, media, hasMedia, children, variant = 'card', className = '' }: FilmFrameProps) {
  const number = String(frameNumber).padStart(3, '0');
  const label = frameLabel ?? `FRAME ${number}`;
  const showMedia = hasMedia ?? media !== undefined;
  const perforations = '\u25a3 \u25a3 \u25a3 \u25a3';

  return <div className={`film-frame film-frame-${variant} ${className}`.trim()}>
    <div className="film-frame-perforation" aria-hidden="true"><span>{perforations}</span><b>{label}</b><span>{perforations}</span></div>
    <div className={showMedia ? 'film-frame-media' : 'film-frame-media unexposed'}>
      {showMedia ? media : <strong>UNEXPOSED</strong>}
    </div>
    <div className="film-frame-content">{children}<time>{date}</time></div>
  </div>;
}
