import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import * as useSessionModule from '../hooks/useSession';

vi.mock('../hooks/useSession', () => ({
  useSession: vi.fn(),
}));

describe('ProtectedRoute', () => {
  it('renders nothing while authentication state is loading', () => {
    vi.mocked(useSessionModule.useSession).mockReturnValue({
      token: null,
      isLoading: true,
      setToken: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/protected']}>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(container.innerHTML).toBe('');
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login', () => {
    vi.mocked(useSessionModule.useSession).mockReturnValue({
      token: null,
      isLoading: false,
      setToken: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children when authenticated with a valid token', () => {
    vi.mocked(useSessionModule.useSession).mockReturnValue({
      token: 'valid-jwt-token',
      isLoading: false,
      setToken: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
