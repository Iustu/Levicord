import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input Component', () => {
  it('renders input with associated label via htmlFor', () => {
    render(<Input label="Nome de Usuário" placeholder="Digite seu nome" />);

    const label = screen.getByText('Nome de Usuário');
    const input = screen.getByPlaceholderText('Digite seu nome');

    expect(label).toHaveAttribute('for', input.getAttribute('id'));
  });

  it('renders error message with role="alert" when error prop is provided', () => {
    render(<Input label="Email" error="Email inválido" />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Email inválido');
    expect(screen.getByRole('textbox')).toHaveClass('input-error');
  });
});
