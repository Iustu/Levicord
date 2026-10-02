import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import JoinInvite from './JoinInvite';
import * as useSessionModule from '../hooks/useSession';
import * as router from 'react-router-dom';

vi.mock('../hooks/useSession', () => ({
  useSession: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useParams: vi.fn(),
    useNavigate: vi.fn(),
  };
});

describe('JoinInvite Page', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(router.useNavigate).mockReturnValue(mockNavigate);
  });

  it('redirects to /login when invite code parameter is missing', () => {
    vi.mocked(router.useParams).mockReturnValue({});
    vi.mocked(useSessionModule.useSession).mockReturnValue({
      token: null,
      isLoading: false,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
    });

    render(<JoinInvite />);

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('stores invite code and redirects to /app if user is already authenticated', () => {
    vi.mocked(router.useParams).mockReturnValue({ code: 'inv-123' });
    vi.mocked(useSessionModule.useSession).mockReturnValue({
      token: 'jwt-active',
      isLoading: false,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
    });

    render(<JoinInvite />);

    expect(sessionStorage.getItem('pending_invite_code')).toBe('inv-123');
    expect(mockNavigate).toHaveBeenCalledWith('/app', { replace: true });
  });

  it('stores invite code and redirects to /login?invite=code if unauthenticated', () => {
    vi.mocked(router.useParams).mockReturnValue({ code: 'inv-456' });
    vi.mocked(useSessionModule.useSession).mockReturnValue({
      token: null,
      isLoading: false,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
    });

    render(<JoinInvite />);

    expect(sessionStorage.getItem('pending_invite_code')).toBe('inv-456');
    expect(mockNavigate).toHaveBeenCalledWith('/login?invite=inv-456', { replace: true });
    expect(screen.getByText('Entrando no servidor...')).toBeInTheDocument();
  });
});
