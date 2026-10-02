import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupSockets } from './index';
import * as presenceModule from './presenceHandler';
import * as messageModule from './messageHandler';
import * as dmModule from './dmHandler';
import * as voiceModule from './voiceHandler';

vi.mock('./presenceHandler', () => ({ registerPresenceHandler: vi.fn() }));
vi.mock('./messageHandler', () => ({ registerMessageHandler: vi.fn() }));
vi.mock('./dmHandler', () => ({ registerDmHandler: vi.fn() }));
vi.mock('./voiceHandler', () => ({ registerVoiceHandler: vi.fn() }));

describe('Socket Setup Façade (setupSockets)', () => {
  let mockIo: any;
  let mockApp: any;
  let middlewareFn: any;
  let connectionFn: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockIo = {
      use: vi.fn((fn) => { middlewareFn = fn; }),
      on: vi.fn((event, fn) => {
        if (event === 'connection') connectionFn = fn;
      }),
    };

    mockApp = {
      io: mockIo,
      jwt: {
        verify: vi.fn((token: string) => {
          if (token === 'valid-token') return { sub: 'user-123' };
          throw new Error('invalid token');
        }),
      },
      log: {
        info: vi.fn(),
      },
      ready: vi.fn((callback) => callback(null)),
    };
  });

  it('registers auth middleware and connection listener on app.ready', () => {
    setupSockets(mockApp);

    expect(mockApp.ready).toHaveBeenCalled();
    expect(mockIo.use).toHaveBeenCalled();
    expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  it('rejects socket without token in auth handshake or cookies', async () => {
    setupSockets(mockApp);

    const mockSocket = {
      handshake: { auth: {}, headers: {} },
      data: {},
    };
    const next = vi.fn();

    await middlewareFn(mockSocket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe('Authentication error');
  });

  it('accepts socket with valid token in auth.token and sets userId', async () => {
    setupSockets(mockApp);

    const mockSocket = {
      handshake: { auth: { token: 'valid-token' }, headers: {} },
      data: {} as any,
    };
    const next = vi.fn();

    await middlewareFn(mockSocket, next);

    expect(next).toHaveBeenCalledWith();
    expect(mockSocket.data.userId).toBe('user-123');
  });

  it('accepts socket with valid token in cookie header', async () => {
    setupSockets(mockApp);

    const mockSocket = {
      handshake: {
        auth: {},
        headers: { cookie: 'other=foo; accessToken=valid-token; bar=baz' },
      },
      data: {} as any,
    };
    const next = vi.fn();

    await middlewareFn(mockSocket, next);

    expect(next).toHaveBeenCalledWith();
    expect(mockSocket.data.userId).toBe('user-123');
  });

  it('registers domain handlers on connection', () => {
    setupSockets(mockApp);

    const mockSocket = {
      id: 'sock-1',
      data: { userId: 'user-123' },
    };

    connectionFn(mockSocket);

    expect(presenceModule.registerPresenceHandler).toHaveBeenCalledWith(mockIo, mockSocket, 'user-123');
    expect(messageModule.registerMessageHandler).toHaveBeenCalledWith(mockIo, mockSocket, 'user-123', mockApp.log);
    expect(dmModule.registerDmHandler).toHaveBeenCalledWith(mockIo, mockSocket, 'user-123', mockApp.log);
    expect(voiceModule.registerVoiceHandler).toHaveBeenCalledWith(mockIo, mockSocket, 'user-123', mockApp.log);
  });
});
