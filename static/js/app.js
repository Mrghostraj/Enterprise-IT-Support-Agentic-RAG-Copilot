const chat = document.getElementById('chat');
const chatInner = document.getElementById('chatInner');
const form = document.getElementById('chatForm');
const question = document.getElementById('question');
const trace = document.getElementById('trace');
const sourceUsed = document.getElementById('sourceUsed');

if (window.marked) {
  marked.setOptions({
    breaks: true,
    gfm: true,
  });
}

function escapeHtml(s = '') {
  return s.replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[c]));
}

function renderMarkdown(s = '') {
  if (window.marked && window.DOMPurify) {
    return DOMPurify.sanitize(marked.parse(s));
  }
  // Fallback if CDN fails to load
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
  });
}

function addMessage(role, text, source = '', citations = []) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;

  const bodyHtml = role === 'assistant'
    ? renderMarkdown(text)
    : `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

  const citeHtml = citations.length
    ? `<div class="citations"><strong>Sources</strong><br>${citations
        .map(c =>
          c.url
            ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.title)}</a>`
            : escapeHtml(c.title)
        )
        .join('<br>')}</div>`
    : '';

  wrap.innerHTML = `
    <div class="avatar">AI</div>
    <div class="bubble">
      ${bodyHtml}
      ${source ? `<div class="answer-source">Source: ${escapeHtml(source)}</div>` : ''}
      ${citeHtml}
    </div>
  `;

  chatInner.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function addThinkingIndicator() {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant';
  wrap.innerHTML = `
    <div class="avatar">AI</div>
    <div class="bubble"><p class="muted" style="margin:0;">Routing &amp; searching knowledge base...</p></div>
  `;
  chatInner.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function renderTrace(items = []) {
  trace.innerHTML = items.length
    ? items.map(x => `<div class="trace-item">${escapeHtml(x)}</div>`).join('')
    : '<div class="empty">No trace.</div>';
}

async function askAgent(q) {
  addMessage('user', q);
  question.value = '';
  question.style.height = 'auto';

  const thinkingBubble = addThinkingIndicator();
  renderTrace(['Running LangGraph workflow...']);
  sourceUsed.textContent = 'Running';

  const btn = form.querySelector('button');
  btn.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Request failed');

    thinkingBubble.remove();
    addMessage('assistant', data.answer, data.source_used, data.citations || []);
    renderTrace(data.trace || []);
    sourceUsed.textContent = data.source_used;
  } catch (e) {
    thinkingBubble.remove();
    addMessage('assistant', `**Error:** ${e.message}`);
    renderTrace(['Request failed']);
    sourceUsed.textContent = 'Error';
  } finally {
    btn.disabled = false;
    question.focus();
  }
}

// Auto-expand textarea and send on Enter (Shift+Enter for newline)
question.addEventListener('input', () => {
  question.style.height = 'auto';
  question.style.height = `${Math.min(question.scrollHeight, 140)}px`;
});

question.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const q = question.value.trim();
    if (q) askAgent(q);
  }
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const q = question.value.trim();
  if (q) askAgent(q);
});

document.querySelectorAll('.example').forEach(b =>
  b.addEventListener('click', () => askAgent(b.textContent.trim()))
);

const modal = document.getElementById('uploadModal');
document.getElementById('openUpload').onclick = () => modal.classList.remove('hidden');
document.getElementById('closeUpload').onclick = () => modal.classList.add('hidden');
document.getElementById('uploadBtn').onclick = async () => {
  const file = document.getElementById('fileInput').files[0];
  const key = document.getElementById('adminKey').value;
  const status = document.getElementById('uploadStatus');
  if (!file) {
    status.textContent = 'Choose a file first.';
    return;
  }
  status.textContent = 'Indexing document...';
  const fd = new FormData();
  fd.append('file', file);
  try {
    const r = await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'X-Admin-Key': key },
      body: fd,
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'Upload failed');
    status.textContent = `Indexed ${d.file}: ${d.chunks} chunks.`;
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
  }
};
