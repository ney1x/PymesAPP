const app = require('./app');
const { port, nodeEnv } = require('./config/env');

const server = app.listen(port, () => {
  console.log(`[backend] API escuchando en http://localhost:${port} (${nodeEnv})`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
