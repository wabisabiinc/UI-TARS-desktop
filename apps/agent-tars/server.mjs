import express from 'express';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// ミドルウェア
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

// 静的ファイル配信（長期キャッシュ）
app.use(
  express.static(path.join(__dirname, 'dist/web'), {
    maxAge: '1y',
    immutable: true,
  })
);

// SPA HTML はキャッシュしない
app.get('/*.html', (req, res, next) => {
  res.set('Cache-Control', 'no-cache');
  next();
});

// フォールバック or 404
app.use((req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'dist/web/index.html'));
  } else {
    res.status(404).send('Not Found');
  }
});

// エラーハンドラー
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Internal Server Error');
});

// ヘルスチェック
app.get('/healthz', (req, res) => {
  res.send('OK');
});

// サーバ起動
const port = Number.parseInt(process.env.PORT, 10) || 4173;
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Initiating graceful shutdown...');
  server.close(() => {
    console.log('Shutdown complete. Exiting.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 30000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
