import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    token: null,
    isLoading: false,
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('./pages/Login', () => ({
  default: () => <div data-testid="login-page">Página de Login</div>,
}));

vi.mock('./pages/MainApp', () => ({
  default: () => <div data-testid="main-app">App Principal</div>,
}));

describe('App Root Component', () => {
  it('renders skip link for keyboard accessibility', () => {
    render(<App />);

    const skipLink = screen.getByRole('link', { name: /Pular para o conteúdo/i });
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  it('renders loading status fallback or redirects unauthenticated to login', async () => {
    render(<App />);

    // Since token is null, ProtectedRoute redirects from /app to /login
    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
  });
});
