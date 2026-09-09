import { buildApp } from './app';
import { setupSockets } from './socket';

const start = async () => {
  const app = buildApp();
  setupSockets(app);
  
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    app.log.info('Server listening on http://localhost:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
