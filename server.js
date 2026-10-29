const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- multer ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomUUID() + ext);
  },
});

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) return cb(new Error('Недопустимый тип файла'));
    cb(null, true);
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// --- validation ---
function validateNote(body) {
  const errors = [];
  const title = (body.title || '').trim();
  const content = (body.content || '').trim();
  if (title.length < 1 || title.length > 200) errors.push('Заголовок: 1–200 символов');
  if (content.length < 1 || content.length > 5000) errors.push('Содержимое: 1–5000 символов');
  return { errors, title, content };
}

function rmFile(url) {
  if (!url) return;
  const p = path.join(__dirname, url.replace(/^\//, ''));
  fs.unlink(p, () => {});
}

// --- routes ---

// GET all
app.get('/api/notes', async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM notes ORDER BY id DESC');
    res.status(200).json(r.rows);
  } catch (e) { next(e); }
});

// GET one
app.get('/api/notes/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Некорректный id' });
    const r = await pool.query('SELECT * FROM notes WHERE id = $1', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Заметка не найдена' });
    res.status(200).json(r.rows[0]);
  } catch (e) { next(e); }
});

// POST create (multipart/form-data)
app.post('/api/notes', upload.single('image'), async (req, res, next) => {
  try {
    const { errors, title, content } = validateNote(req.body);
    if (errors.length) {
      if (req.file) rmFile('/uploads/' + req.file.filename);
      return res.status(400).json({ error: errors.join('; ') });
    }
    const image_url = req.file ? '/uploads/' + req.file.filename : null;
    const r = await pool.query(
      'INSERT INTO notes (title, content, image_url) VALUES ($1,$2,$3) RETURNING *',
      [title, content, image_url]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// PUT update (multipart/form-data)
app.put('/api/notes/:id', upload.single('image'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Некорректный id' });

    const existing = await pool.query('SELECT * FROM notes WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      if (req.file) rmFile('/uploads/' + req.file.filename);
      return res.status(404).json({ error: 'Заметка не найдена' });
    }

    const { errors, title, content } = validateNote(req.body);
    if (errors.length) {
      if (req.file) rmFile('/uploads/' + req.file.filename);
      return res.status(400).json({ error: errors.join('; ') });
    }

    let image_url = existing.rows[0].image_url;
    if (req.file) {
      rmFile(image_url);
      image_url = '/uploads/' + req.file.filename;
    }

    const r = await pool.query(
      'UPDATE notes SET title=$1, content=$2, image_url=$3 WHERE id=$4 RETURNING *',
      [title, content, image_url, id]
    );
    res.status(200).json(r.rows[0]);
  } catch (e) { next(e); }
});

// DELETE
app.delete('/api/notes/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Некорректный id' });
    const r = await pool.query('DELETE FROM notes WHERE id = $1 RETURNING *', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Заметка не найдена' });
    rmFile(r.rows[0].image_url);
    res.status(200).json({ message: 'Удалено' });
  } catch (e) { next(e); }
});

// --- error handler ---
app.use((err, req, res, next) => {
  console.error(err);
  if (err && err.message === 'Недопустимый тип файла') {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Файл слишком большой (макс. 5 МБ)' });
  }
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// --- start with retry for DB ---
async function start() {
  for (let i = 1; i <= 30; i++) {
    try { await init(); break; }
    catch (e) {
      console.log(`Ждём БД... (попытка ${i})`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  app.listen(PORT, () => console.log(`Сервер: http://localhost:${PORT}`));
}
start();