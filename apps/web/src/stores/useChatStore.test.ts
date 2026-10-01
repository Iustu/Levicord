import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './useChatStore';

describe('useChatStore', () => {
  beforeEach(() => {
    // Reset store state
    useChatStore.setState({
      viewMode: 'channels',
      channels: [],
      users: [],
      activeChannelId: null,
      activeDmUserId: null,
      currentUserId: null,
      currentUser: null,
      messages: [],
      dms: {},
      dmsOrder: [],
    });
  });

  it('should initialize with default values', () => {
    const state = useChatStore.getState();
    expect(state.viewMode).toBe('channels');
    expect(state.messages).toEqual([]);
    expect(state.channels).toEqual([]);
    expect(state.dms).toEqual({});
  });

  it('should switch viewMode between channels and dms', () => {
    useChatStore.getState().setViewMode('dms');
    expect(useChatStore.getState().viewMode).toBe('dms');

    useChatStore.getState().setViewMode('channels');
    expect(useChatStore.getState().viewMode).toBe('channels');
  });

  it('should add message and prevent duplicate IDs', () => {
    const msg1 = {
      id: 'm-1',
      content: 'Hello World',
      authorId: 'u-1',
      channelId: 'ch-1',
      createdAt: new Date(),
    } as any;

    useChatStore.getState().addMessage(msg1);
    expect(useChatStore.getState().messages).toHaveLength(1);

    // Attempting to add duplicate message with same id
    useChatStore.getState().addMessage(msg1);
    expect(useChatStore.getState().messages).toHaveLength(1);

    const msg2 = { ...msg1, id: 'm-2', content: 'Second message' };
    useChatStore.getState().addMessage(msg2);
    expect(useChatStore.getState().messages).toHaveLength(2);
  });

  it('should prepend messages and filter existing IDs', () => {
    const existing = { id: 'm-2', content: 'Recent' } as any;
    const older1 = { id: 'm-1', content: 'Old 1' } as any;
    const olderDuplicate = { id: 'm-2', content: 'Duplicate' } as any;

    useChatStore.setState({ messages: [existing] });
    useChatStore.getState().prependMessages([older1, olderDuplicate]);

    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].id).toBe('m-1');
    expect(messages[1].id).toBe('m-2');
  });

  it('should manage DMs with LRU eviction when limit of 20 is exceeded', () => {
    // Add 22 distinct users' DMs
    for (let i = 1; i <= 22; i++) {
      const otherUserId = `user-${i}`;
      const dm = { id: `dm-${i}`, content: `Hi user ${i}`, senderId: 'me', receiverId: otherUserId } as any;
      useChatStore.getState().addDm(dm, otherUserId);
    }

    const state = useChatStore.getState();
    // Maximum stored users in LRU cache is 20
    expect(state.dmsOrder).toHaveLength(20);
    // Most recent is user-22
    expect(state.dmsOrder[0]).toBe('user-22');
    // First users (user-1 and user-2) should have been evicted
    expect(state.dms['user-1']).toBeUndefined();
    expect(state.dms['user-2']).toBeUndefined();
    expect(state.dms['user-22']).toBeDefined();
  });

  it('should update current user profile and sync with users list', () => {
    useChatStore.setState({
      currentUserId: 'me-1',
      currentUser: { id: 'me-1', displayName: 'Old Name', avatarUrl: null, email: 'me@test.com', role: 'USER' } as any,
      users: [
        { id: 'me-1', displayName: 'Old Name', avatarUrl: null, email: 'me@test.com', role: 'USER' } as any,
        { id: 'other-1', displayName: 'Other', avatarUrl: null, email: 'other@test.com', role: 'USER' } as any,
      ],
    });

    useChatStore.getState().updateCurrentUser({ displayName: 'New Name', avatarUrl: 'https://avatar.png' });

    const state = useChatStore.getState();
    expect(state.currentUser?.displayName).toBe('New Name');
    expect(state.currentUser?.avatarUrl).toBe('https://avatar.png');

    const meInUsers = state.users.find((u) => u.id === 'me-1');
    expect(meInUsers?.displayName).toBe('New Name');

    const otherInUsers = state.users.find((u) => u.id === 'other-1');
    expect(otherInUsers?.displayName).toBe('Other');
  });
});
