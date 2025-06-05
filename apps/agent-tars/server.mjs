import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const app = express();


app.use(express.static(path.join(__dirname, 'dist/web')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/web/index.html'));
});

const port = process.env.PORT || 4173;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

