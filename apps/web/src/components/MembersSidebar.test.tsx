import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MembersSidebar } from './MembersSidebar';
import type { User } from '@discord-clone/shared';

describe('MembersSidebar', () => {
  const currentUser: User = {
    id: 'user-me',
    displayName: 'Eu Próprio',
    email: 'me@example.com',
  };

  const users: User[] = [
    { id: 'user-1', displayName: 'Ana Silva' },
    { id: 'user-2', displayName: 'Bruno Costa' },
  ];

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <MembersSidebar
        users={users}
        currentUser={currentUser}
        onlineUserIds={[]}
        isOpen={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders online and offline sections with correct counts and names', () => {
    render(
      <MembersSidebar
        users={users}
        currentUser={currentUser}
        onlineUserIds={['user-1']}
        isOpen={true}
      />,
    );

    expect(screen.getByText('Disponível — 2')).toBeInTheDocument(); // currentUser + Ana Silva
    expect(screen.getByText('Offline — 1')).toBeInTheDocument(); // Bruno Costa
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument();
    expect(screen.getByText('(você)')).toBeInTheDocument();
  });

  it('calls onSelectUser when a member is clicked', () => {
    const onSelectUser = vi.fn();
    render(
      <MembersSidebar
        users={users}
        currentUser={currentUser}
        onlineUserIds={['user-1']}
        isOpen={true}
        onSelectUser={onSelectUser}
      />,
    );

    fireEvent.click(screen.getByText('Ana Silva'));
    expect(onSelectUser).toHaveBeenCalledWith('user-1');
  });
});
