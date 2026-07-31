import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FilmFrame } from '../src/shared/FilmFrame';

describe('FilmFrame', () => {
  it('renders provided media and frame metadata', () => {
    render(<FilmFrame frameNumber={18} date="2026 / 07 / 20" media={<img src="blob:test" alt="rainy Luojia Mountain" />}><h2>Walk after rain</h2></FilmFrame>);
    expect(screen.getByText('FRAME 018')).toBeInTheDocument();
    expect(screen.getByText('2026 / 07 / 20')).toBeInTheDocument();
    expect(screen.getByAltText('rainy Luojia Mountain')).toBeInTheDocument();
  });

  it('renders an unexposed frame when media is absent', () => {
    render(<FilmFrame frameNumber={1} date="DATE UNRECORDED" media={<img src="blob:hidden" alt="should not render" />} hasMedia={false}><h2>First frame</h2></FilmFrame>);
    expect(screen.getByText('UNEXPOSED')).toBeInTheDocument();
    expect(screen.getByText('FRAME 001')).toBeInTheDocument();
    expect(screen.queryByAltText('should not render')).not.toBeInTheDocument();
  });

  it('supports a non-numeric frame label without leaking frame zero', () => {
    render(<FilmFrame frameNumber={0} frameLabel="NEW PLACE" date="DATE UNRECORDED" media={<span>Place thumbnail</span>}><h2>New place</h2></FilmFrame>);
    expect(screen.getByText('NEW PLACE')).toBeInTheDocument();
    expect(screen.queryByText('FRAME 000')).not.toBeInTheDocument();
  });
});
