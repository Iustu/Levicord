import { FastifyInstance } from 'fastify';
import { processGoogleUser } from '../services/auth.service';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.get('/google/callback', async function (request, reply) {
    try {
      const { token } = await this.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` }
      });
      const userInfo = await userInfoResponse.json();

      const user = await processGoogleUser(userInfo);

      const accessToken = await reply.jwtSign({ sub: user.id }, { expiresIn: '1h' });
      // const refreshToken = await reply.jwtSign({ sub: user.id }, { expiresIn: '7d' });
      // To properly handle refresh tokens, we'd set them via httpOnly cookie here.

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      reply.redirect(`${frontendUrl}/auth/callback?token=${accessToken}`);

    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Authentication failed' });
    }
  });
}
