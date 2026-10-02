import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Login from './Login';
import * as useAuthModule from '../hooks/useAuth';

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

describe('Login Page', () => {
  const mockLoginWithGoogle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      token: null,
      isLoading: false,
      loginWithGoogle: mockLoginWithGoogle,
      logout: vi.fn(),
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('renders login screen with brand header and Google login button', () => {
    render(<Login />);

    expect(screen.getByText('Bem-vindo ao Levicord')).toBeInTheDocument();
    expect(
      screen.getByText(/Faça login com a sua conta Google para continuar/i)
    ).toBeInTheDocument();

    const googleBtn = screen.getByRole('button', { name: /Entrar com Google/i });
    expect(googleBtn).toBeInTheDocument();

    fireEvent.click(googleBtn);
    expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('captures invite code from search query parameters and saves it in sessionStorage', () => {
    const originalLocation = window.location;
    // @ts-ignore
    delete window.location;
    window.location = {
      ...originalLocation,
      search: '?invite=vip-comunidade',
    } as any;

    render(<Login />);

    expect(sessionStorage.getItem('pending_invite_code')).toBe('vip-comunidade');
    expect(screen.getByText(/Convite detectado:/i)).toBeInTheDocument();

    window.location = originalLocation;
  });

  it('restores pending invite from sessionStorage when no search param is present', () => {
    sessionStorage.setItem('pending_invite_code', 'stored-invite-123');

    render(<Login />);

    expect(screen.getByText(/Convite detectado:/i)).toBeInTheDocument();
  });
});
