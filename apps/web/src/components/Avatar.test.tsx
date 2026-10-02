import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Avatar } from './Avatar';

describe('Avatar Component', () => {
  it('renders custom image avatar when src is provided', () => {
    render(<Avatar src="https://example.com/photo.jpg" name="Alice" size={48} />);

    const img = screen.getByRole('img', { name: /Avatar de Alice/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
    expect(img).toHaveStyle({ width: '48px', height: '48px' });
  });

  it('renders incógnita avatar when src is null or empty', () => {
    render(<Avatar src={null} name="Bob" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const incognita = screen.getByTitle(/Bob \(Foto não definida - Incógnita\)/i);
    expect(incognita).toBeInTheDocument();
    expect(incognita).toHaveClass('incognita-avatar');
  });

  it('falls back to incógnita avatar when custom image triggers onError', () => {
    render(<Avatar src="https://example.com/broken.jpg" name="Charlie" />);

    const img = screen.getByRole('img');
    fireEvent.error(img);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTitle(/Charlie \(Foto não definida - Incógnita\)/i)).toBeInTheDocument();
  });
});
