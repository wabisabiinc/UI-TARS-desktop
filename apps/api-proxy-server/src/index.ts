import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/v1/ping', (c) => {
  return c.text('ok');
});

app.get('/', (c) => {
  return c.text('Hello UI-TARS!');
});

app.get('/api', (c) => {
  return c.json({
    code: 0,
    data: {
      message: 'Hello UI-TARS!',
    },
  });
});

serve(
  {
    fetch: app.fetch,
    hostname: process.env._FAAS_RUNTIME_HOST || '127.0.0.1',
    port: Number(process.env._FAAS_RUNTIME_PORT || 3000),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
