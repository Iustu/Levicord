import { FastifyInstance } from 'fastify';
import { requireAuth } from '../lib/auth';

export interface RTCIceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export default async function webrtcRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth);

  /**
   * Returns authorized ICE servers configuration including STUN and TURN credentials.
   * Prevents TURN credentials from being exposed statically in client-side Vite bundles.
   */
  fastify.get('/ice-servers', async () => {
    const iceServers: RTCIceServerConfig[] = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ];

    const turnUrl = process.env.TURN_URL || 'turn:levicord.uk:3478';
    const turnUser = process.env.TURN_USER || process.env.VITE_TURN_USER;
    const turnPassword = process.env.TURN_PASSWORD || process.env.VITE_TURN_PASSWORD;

    if (turnUser && turnPassword) {
      iceServers.push({
        urls: [turnUrl],
        username: turnUser,
        credential: turnPassword,
      });
    }

    return { iceServers };
  });
}
