const api = '/api/notes';
const list = document.getElementById('list');
const form = document.getElementById('note-form');
const msg = document.getElementById('msg');
const titleInp = form.querySelector('[name=title]');
const contentInp = form.querySelector('[name=content]');
const imageInp = form.querySelector('[name=image]');
const submitBtn = form.querySelector('button[type=submit]');
const cancelBtn = document.getElementById('cancel-edit');
let editingId = null;

function showMsg(text, type) {
  msg.textContent = text || '';
  msg.className = 'msg ' + (type || '');
  if (text) {
    setTimeout(() => { if (msg.textContent === text) { msg.textContent = ''; msg.className = 'msg'; } }, 4000);
  }
}

async function request(url, opts) {
  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || ('Ошибка ' + res.status));
  return data;
}

function renderNotes(notes) {
  if (!notes.length) {
    list.innerHTML = '<p class="empty">Заметок пока нет</p>';
    return;
  }
  list.innerHTML = '';
  for (const n of notes) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      ${n.image_url ? '<img alt="">' : ''}
      <h3></h3>
      <p class="content"></p>
      <small></small>
      <div class="actions">
        <button class="edit">✏ Редактировать</button>
        <button class="del">🗑 Удалить</button>
      </div>
    `;
    if (n.image_url) card.querySelector('img').src = n.image_url;
    card.querySelector('h3').textContent = n.title;
    card.querySelector('.content').textContent = n.content;
    card.querySelector('small').textContent = new Date(n.created_at).toLocaleString('ru-RU');
    card.querySelector('.edit').addEventListener('click', () => startEdit(n));
    card.querySelector('.del').addEventListener('click', () => deleteNote(n.id));
    list.appendChild(card);
  }
}

async function loadNotes() {
  try {
    const notes = await request(api);
    renderNotes(notes);
  } catch (e) { showMsg(e.message, 'error'); }
}

function startEdit(n) {
  editingId = n.id;
  titleInp.value = n.title;
  contentInp.value = n.content;
  imageInp.value = '';
  submitBtn.textContent = 'Сохранить';
  cancelBtn.style.display = 'inline-block';
  form.scrollIntoView({ behavior: 'smooth' });
}

function resetForm() {
  editingId = null;
  form.reset();
  submitBtn.textContent = 'Добавить';
  cancelBtn.style.display = 'none';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  if (!imageInp.files.length) fd.delete('image');
  try {
    if (editingId) {
      await request(api + '/' + editingId, { method: 'PUT', body: fd });
      showMsg('Обновлено', 'ok');
    } else {
      await request(api, { method: 'POST', body: fd });
      showMsg('Добавлено', 'ok');
    }
    resetForm();
    loadNotes();
  } catch (err) { showMsg(err.message, 'error'); }
});

cancelBtn.addEventListener('click', resetForm);

async function deleteNote(id) {
  if (!confirm('Удалить заметку?')) return;
  try {
    await request(api + '/' + id, { method: 'DELETE' });
    showMsg('Удалено', 'ok');
    loadNotes();
  } catch (e) { showMsg(e.message, 'error'); }
}

loadNotes();