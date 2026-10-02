import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfileSetup from './ProfileSetup';
import * as apiModule from '../lib/api';
import * as useAuthModule from '../hooks/useAuth';
import * as router from 'react-router-dom';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE: 'http://localhost:3000',
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

describe('ProfileSetup Page', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(router.useNavigate).mockReturnValue(mockNavigate);
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      token: 'jwt-profile-token',
      isLoading: false,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        user: { displayName: 'Initial Name', avatarUrl: null },
      }),
    } as any);
  });

  it('renders prefilled display name and profile instructions', async () => {
    render(<ProfileSetup />);

    expect(await screen.findByDisplayValue('Initial Name')).toBeInTheDocument();
    expect(screen.getByText('Defina seu nome de exibição para começar no Levicord.')).toBeInTheDocument();
  });

  it('disables submit button and shows error if form submitted with short name', async () => {
    const { container } = render(<ProfileSetup />);

    const input = await screen.findByDisplayValue('Initial Name');
    fireEvent.change(input, { target: { value: 'a' } });

    const submitBtn = screen.getByRole('button', { name: /Salvar e Continuar/i });
    expect(submitBtn).toBeDisabled();

    fireEvent.submit(container.querySelector('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um nome com pelo menos 2 caracteres.');
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
  });

  it('submits updated profile and navigates to /app on success', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce({ success: true });

    render(<ProfileSetup />);

    const input = await screen.findByDisplayValue('Initial Name');
    fireEvent.change(input, { target: { value: 'Meu Nome Legal' } });

    fireEvent.click(screen.getByRole('button', { name: /Salvar e Continuar/i }));

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/api/auth/profile',
        'jwt-profile-token',
        {
          method: 'PATCH',
          body: JSON.stringify({ displayName: 'Meu Nome Legal' }),
        }
      );
      expect(mockNavigate).toHaveBeenCalledWith('/app');
    });
  });
});
