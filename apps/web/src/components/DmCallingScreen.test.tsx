import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DmCallingScreen } from './DmCallingScreen';

describe('DmCallingScreen Component', () => {
  const targetUser = {
    id: 'user-target',
    email: 'target@test.com',
    displayName: 'Mariana',
    avatarUrl: null,
    role: 'USER' as const,
  };

  it('renders target user info and voice call status', () => {
    render(<DmCallingScreen targetUser={targetUser} isVideo={false} onCancel={vi.fn()} />);

    expect(screen.getByText('A chamar @Mariana...')).toBeInTheDocument();
    expect(screen.getByText(/chamada de voz/i)).toBeInTheDocument();
  });

  it('renders video call status when isVideo is true and triggers onCancel', () => {
    const onCancel = vi.fn();
    render(<DmCallingScreen targetUser={targetUser} isVideo={true} onCancel={onCancel} />);

    expect(screen.getByText(/chamada de vídeo/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cancelar chamada/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
