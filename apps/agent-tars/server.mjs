import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

const __dirname = path.dirname(__filename);
const __filename = fileURLToPath(import.meta.url);

app.use(express.static(path.resolve(__dirname, 'dist/web')));

app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist/web/index.html'));
});

const port = process.env.PORT || 4173;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

