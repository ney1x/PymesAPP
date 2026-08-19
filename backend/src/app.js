const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { corsOrigin } = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');
const mlClient = require('./lib/mlClient');

const app = express();

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'inventario-pymes-backend', uptime: process.uptime() });
});

app.get('/health/ml', async (_req, res) => {
  try {
    const ml = await mlClient.health();
    res.json({ ok: true, ml });
  } catch (err) {
    res.status(503).json({ ok: false, ml: { disponible: false, error: err.message } });
  }
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
