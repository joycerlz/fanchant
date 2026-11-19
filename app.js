// ponytail: 本名 list is a best guess, editable in the app ("修改這組名字").
const SETS = {
  藝名: ['릴리!', '해원!', '설윤!', '배이!', '지우!', '규진!', '엔믹스!'],
  本名: ['릴리!', '오해원!', '설윤아!', '배진솔!', '김지우!', '장규진!', '엔믹스!'],
};
const LEAD = 1.6, PERFECT = .08, GOOD = .16; // seconds
const KEY = 'fanchant-v1';
const $ = id => document.getElementById(id);

let db = null;
try { db = JSON.parse(localStorage.getItem(KEY)); } catch {}
db ||= { songs: [], cur: null, offset: 0, diff: 'easy' };
db.sets ||= structuredClone(SETS);
db.set ||= '藝名';
const LISTS = ['世巡歌單', '安可歌單']; // 全曲 = every song, not stored
db.lists ||= {};
for (const l of LISTS) db.lists[l] ||= [];
if (!['全曲', ...LISTS].includes(db.view)) db.view = '全曲';
db.custom ||= Object.fromEntries(LISTS.map(l => [l, db.lists[l].length > 1])); // true = dragged into own order; keeps setlists arranged before sorting existed
// ponytail: titles in Chinese characters sort before A–Z, not among them; add a pinyin initial table if that ever matters.
const coll = new Intl.Collator('zh-u-co-pinyin', { numeric: true, sensitivity: 'base' });
const wide = () => matchMedia('(min-width:840px)').matches;
const move = (L, i, j) => { if (j >= 0 && j < L.length) [L[i], L[j]] = [L[j], L[i]]; return L; };
const names = () => db.sets[db.set];
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
const song = () => db.songs.find(s => s.id === db.cur);
const vid = u => (u.trim().match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/) || u.trim().match(/^([\w-]{11})$/) || [])[1];
const grade = d => Math.abs(d) <= PERFECT ? 'perfect' : Math.abs(d) <= GOOD ? 'good' : null;
const fmt = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const flash = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
const showMsg = t => { $('msg').textContent = t; $('msg').hidden = !t; };
// pointerdown, not click: click waits for the finger to lift, which skews timing.
const press = (b, fn) => { b.onpointerdown = e => { e.preventDefault(); fn(); }; b.onclick = e => { if (!e.detail) fn(); }; };
let mode = 'play';

/* ---------- YouTube + clock ---------- */
let player, ready = false;
window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player('player', {
    ...(song() && { videoId: song().videoId }),
    playerVars: { playsinline: 1, rel: 0 },
    events: {
      onReady() { ready = true; if (song()) player.cueVideoById(song().videoId); },
      onStateChange(e) {
        if (e.data === 1) { showMsg(''); $('result').hidden = true; player.setPlaybackRate(rate); }
        if (e.data === 0) finish();
      },
      onError(e) { showMsg([101, 150].includes(e.data) ? '這支影片不允許嵌在別的網站播放，換一支試試（例如打歌節目官方頻道的舞台）。' : '影片載入失敗，檢查一下網址。'); },
    },
  });
};

// ponytail: getCurrentTime only refreshes a few times a second, so extrapolate between updates and ease toward each new reading.
let raw = -1, est = 0, last = 0;
function clock() {
  const p = performance.now(), dt = (p - last) / 1000; last = p;
  if (!ready) return 0;
  const yt = player.getCurrentTime() || 0;
  if (player.getPlayerState() !== 1) { raw = yt; return est = yt; }
  est += dt * player.getPlaybackRate();
  if (yt !== raw) { raw = yt; est = Math.abs(est - yt) > .25 ? yt : est + (yt - est) * .2; }
  return est;
}
const playing = () => ready && player.getPlayerState() === 1;

/* ---------- practice ---------- */
const lane = $('lane');
let notes = [], lastNow = 0, playBtns = [];

// Only the chants this song uses: names in roll-call order first, then the rest in order of appearance.
function chantList() {
  const used = new Set((song()?.cues || []).map(c => c.text));
  return [...new Set([...db.sets.藝名, ...db.sets.本名, ...used])].filter(w => used.has(w));
}

function buildNotes() {
  lane.querySelectorAll('.note').forEach(e => e.remove());
  notes = (song()?.cues || []).map((c, i) => ({ ...c, i, j: null, el: null }));
  playBtns = chantList().map(t => {
    const b = document.createElement('button');
    b.textContent = t;
    press(b, () => hit(t, b));
    return b;
  });
  $('pbtns').replaceChildren(...playBtns);
  $('hint').textContent = !song() ? '先在上面新增一首歌（歌名＋YouTube 網址）。' : notes.length
    ? '應援詞碰到粉紅線時按對應的按鈕。電腦可以用數字鍵 1、2、3…'
    : '這首還沒有應援點，先到「製作」記錄。';
  updateStats();
}

function paint(n) {
  if (!n.el) return;
  n.el.className = 'note ' + (n.j || '');
  n.el.textContent = db.diff === 'hard' && !n.j ? '?' : n.text;
}

function updateStats() {
  const c = { perfect: 0, good: 0, miss: 0 };
  notes.forEach(n => n.j && c[n.j === 'wrong' ? 'miss' : n.j]++);
  $('stats').textContent = notes.length ? `Perfect ${c.perfect} · Good ${c.good} · Miss ${c.miss} / ${notes.length}` : '';
  return c;
}

const LABEL = { perfect: 'PERFECT', miss: 'MISS', wrong: '按錯了' };
function showJudge(n, d) {
  const el = $('judge'), s = document.createElement('small');
  el.textContent = n.j === 'good' ? `GOOD · ${d < 0 ? '早' : '晚'}` : LABEL[n.j];
  el.style.color = `var(--${n.j === 'wrong' ? 'miss' : n.j})`;
  s.textContent = n.text;
  el.append(s);
  flash(el, 'pop');
}

function hit(text, btn) {
  if (btn) flash(btn, 'hit');
  if (mode !== 'play' || !playing()) return;
  const now = clock() - db.offset / 1000, dist = n => Math.abs(n.t - now);
  const near = notes.filter(n => !n.j && grade(n.t - now)).sort((a, b) => dist(a) - dist(b));
  const n = near.find(x => x.text === text) || near[0];
  if (!n) return; // stray tap, no penalty
  n.j = n.text === text ? grade(now - n.t) : 'wrong';
  paint(n); showJudge(n, now - n.t); updateStats();
}

function frame() {
  requestAnimationFrame(frame);
  const now = clock() - db.offset / 1000;
  if (mode !== 'play') return;
  if (now < lastNow - .3) notes.forEach(n => { if (n.t > now - .05 && n.j) { n.j = null; paint(n); } }); // seeked back
  lastNow = now;
  const W = lane.clientWidth, x0 = W * .15, pps = (W - x0) / LEAD;
  let changed = false;
  for (const n of notes) {
    if (!n.j && now > n.t + GOOD) { n.j = 'miss'; paint(n); showJudge(n, 0); changed = true; }
    if (n.t < now - .6 || n.t > now + LEAD + .3) { if (n.el) { n.el.remove(); n.el = null; } continue; }
    if (!n.el) { n.el = document.createElement('div'); lane.append(n.el); paint(n); }
    n.el.style.transform = `translate(${x0 + (n.t - now) * pps}px,${n.i % 2 ? 82 : 38}px) translate(-50%,-50%)`;
  }
  if (changed) updateStats();
}

function finish() {
  if (mode !== 'play' || !notes.length) return;
  notes.forEach(n => { if (!n.j) { n.j = 'miss'; paint(n); } });
  const c = updateStats(), acc = Math.round((c.perfect + c.good * .5) / notes.length * 100), s = song();
  s.best ||= {};
  const prev = s.best[db.diff] || 0;
  if (acc > prev) { s.best[db.diff] = acc; save(); }
  $('result').innerHTML = `<b>${acc}%</b><span>Perfect ${c.perfect} · Good ${c.good} · Miss ${c.miss}</span>
    <span class="muted">${db.diff === 'hard' ? '困難' : '簡單'}最佳 ${Math.max(acc, prev)}%${acc > prev && prev ? '，新紀錄！' : ''}</span>`;
  $('result').hidden = false;
}

$('restart').onclick = () => { if (!ready || !song()) return; $('result').hidden = true; buildNotes(); player.seekTo(0, true); player.playVideo(); };
function setDiff(d) { db.diff = d; save(); $('easy').classList.toggle('on', d === 'easy'); $('hard').classList.toggle('on', d === 'hard'); notes.forEach(paint); }
$('easy').onclick = () => setDiff('easy');
$('hard').onclick = () => setDiff('hard');
$('offset').oninput = e => { db.offset = +e.target.value; $('offsetVal').textContent = db.offset; save(); };

/* ---------- make ---------- */
let undoStack = [], nameBtns = [];

function record(text) {
  const s = song();
  if (!s || !ready) return false;
  const c = { t: Math.round(clock() * 100) / 100, text };
  s.cues.push(c); s.cues.sort((x, y) => x.t - y.t); undoStack.push(c); save();
  renderCues(c);
  return true;
}
const recBtn = t => {
  const b = document.createElement('button');
  b.textContent = t;
  press(b, () => { flash(b, 'hit'); record(t); });
  return b;
};

function renderNames() {
  $('setStage').classList.toggle('on', db.set === '藝名');
  $('setReal').classList.toggle('on', db.set === '本名');
  nameBtns = names().map((t, i) => Object.assign(recBtn(t), { title: `鍵盤 ${i + 1}` }));
  $('names').replaceChildren(...nameBtns);
  if (document.activeElement !== $('namesEdit')) $('namesEdit').value = names().join('\n');
}
const setSet = s => { db.set = s; save(); renderNames(); };
$('setStage').onclick = () => setSet('藝名');
$('setReal').onclick = () => setSet('本名');
$('namesEdit').oninput = e => {
  const v = e.target.value.split('\n').map(x => x.trim()).filter(Boolean);
  if (v.length) { db.sets[db.set] = v; save(); renderNames(); }
};

function renderWords() {
  const s = song(), ws = s?.words || [];
  $('words').replaceChildren(...ws.map(recBtn));
  $('wordsDel').replaceChildren(...ws.map(w => {
    const b = document.createElement('button');
    b.textContent = `${w} ✕`;
    b.onclick = () => { s.words.splice(s.words.indexOf(w), 1); save(); renderWords(); };
    return b;
  }));
  $('wordsDelBox').hidden = !ws.length;
}
$('wordForm').onsubmit = e => {
  e.preventDefault();
  const s = song(), w = $('wordInput').value.trim();
  if (s && w && !s.words.includes(w)) { s.words.push(w); save(); renderWords(); }
  $('wordInput').value = '';
  $('wordInput').focus();
};

function renderCues(focus) {
  const s = song(), ul = $('cues'), top = ul.scrollTop;
  $('cueCount').textContent = s?.cues.length || 0;
  ul.replaceChildren(...(s?.cues || []).map((c, i) => {
    const li = document.createElement('li');
    li.dataset.i = i;
    li.innerHTML = '<button class="t" data-a="seek"></button><span></span><button data-a="-" aria-label="提早 0.05 秒">−</button><button data-a="+" aria-label="延後 0.05 秒">＋</button><button data-a="del" class="danger" aria-label="刪除">✕</button>';
    li.querySelector('.t').textContent = fmt(c.t);
    li.querySelector('span').textContent = c.text;
    return li;
  }));
  ul.scrollTop = top;
  const li = focus && ul.children[s.cues.indexOf(focus)];
  if (li) ul.scrollTop = li.offsetTop - ul.clientHeight / 2;
}
$('cues').onclick = e => {
  const a = e.target.closest('button')?.dataset.a; if (!a) return;
  const s = song(), c = s.cues[+e.target.closest('li').dataset.i];
  if (a === 'seek') { player.seekTo(Math.max(0, c.t - 2), true); player.playVideo(); return; }
  if (a === 'del') s.cues.splice(s.cues.indexOf(c), 1);
  else c.t = Math.max(0, Math.round((c.t + (a === '+' ? .05 : -.05)) * 100) / 100);
  s.cues.sort((x, y) => x.t - y.t); save(); renderCues();
};
$('undo').onclick = () => {
  const s = song(), c = undoStack.pop();
  if (!s || !c || !s.cues.includes(c)) return;
  s.cues.splice(s.cues.indexOf(c), 1); save(); renderCues();
};

function renderMake() {
  const s = song();
  $('editTitle').value = s?.title || '';
  $('editUrl').value = s ? `https://youtu.be/${s.videoId}` : '';
  renderWords(); renderCues();
}

/* ---------- songs ---------- */
function renderSongs() {
  const L = db.lists[db.view]; // undefined for 全曲
  let shown = L ? L.map(id => db.songs.find(s => s.id === id)).filter(Boolean) : db.songs;
  if (!db.custom[db.view]) shown = [...shown].sort((a, b) => coll.compare(a.title, b.title));
  $('lists').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.l === db.view));
  $('songList').replaceChildren(...shown.map((s, i) => {
    const li = document.createElement('li');
    li.dataset.id = s.id;
    li.innerHTML = '<button class="grip" aria-label="拖曳排序（鍵盤用上下鍵）">⠿</button><button class="pick"></button>' + (L ? '<button data-a="rm" aria-label="移出歌單">✕</button>' : '');
    li.querySelector('.pick').textContent = (L ? `${i + 1}. ` : '') + s.title;
    li.classList.toggle('cur', s.id === db.cur);
    return li;
  }));
  $('sortAlpha').hidden = !db.custom[db.view] || shown.length < 2;
  const rest = L ? db.songs.filter(s => !L.includes(s.id)) : [];
  $('listAdd').replaceChildren(new Option(`＋ 加歌到${db.view}`, ''), ...rest.map(s => new Option(s.title, s.id)));
  $('listAdd').hidden = !rest.length;
  $('sideHint').textContent = shown.length ? '' : db.songs.length ? '用下面的選單把歌加進來，拖 ⠿ 可以調順序。' : '還沒有歌，按「＋ 新增歌曲」。';
  $('songTitle').textContent = song()?.title || '';
  $('videoBox').hidden = !song();
  if (!db.songs.length) $('addForm').hidden = false;
}
$('lists').onclick = e => { const l = e.target.dataset.l; if (l) { db.view = l; save(); renderSongs(); } };
$('songList').onclick = e => {
  const b = e.target.closest('button'), id = b?.parentElement.dataset.id, L = db.lists[db.view];
  if (b?.classList.contains('pick')) { if (!wide()) setSide(false); selectSong(id); }
  if (b?.dataset.a === 'rm') { L.splice(L.indexOf(id), 1); save(); renderSongs(); }
};
function reorder(ids) {
  if (db.lists[db.view]) db.lists[db.view] = ids;
  else db.songs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); // 全曲 order = db.songs order
  db.custom[db.view] = true; save(); renderSongs();
}
const domIds = () => [...$('songList').children].map(li => li.dataset.id);
// ponytail: pointer events on a handle, so touch and mouse share one path; the list auto-scrolls only while the finger moves.
$('songList').onpointerdown = e => {
  const g = e.target.closest('.grip'); if (!g) return;
  e.preventDefault();
  const li = g.parentElement, ul = $('songList'), side = $('side');
  let moved = false;
  li.classList.add('drag');
  // listen on window: moving the row in the DOM drops pointer capture, so the grip itself stops getting events
  const ac = new AbortController(), on = (t, f) => addEventListener(t, f, { signal: ac.signal });
  on('pointermove', ev => {
    const r = side.getBoundingClientRect();
    side.scrollTop += ev.clientY < r.top + 40 ? -12 : ev.clientY > r.bottom - 40 ? 12 : 0;
    const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#songList li');
    if (!over || over === li) return;
    ul.insertBefore(li, li.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING ? over.nextSibling : over);
    moved = true;
  });
  const end = () => { ac.abort(); li.classList.remove('drag'); if (moved) reorder(domIds()); };
  on('pointerup', end); on('pointercancel', end);
};
$('songList').onkeydown = e => {
  const d = { ArrowUp: -1, ArrowDown: 1 }[e.key], id = e.target.closest('.grip')?.parentElement.dataset.id;
  if (!d || !id) return;
  e.preventDefault();
  const ids = domIds(), i = ids.indexOf(id);
  if (i + d < 0 || i + d >= ids.length) return;
  reorder(move(ids, i, i + d));
  $('songList').querySelector(`li[data-id="${CSS.escape(id)}"] .grip`).focus();
};
$('sortAlpha').onclick = () => { db.custom[db.view] = false; save(); renderSongs(); };
// Wide screens remember open/closed; phones always start closed and close after picking a song.
function setSide(open) {
  document.body.classList.toggle('open', open);
  $('menuBtn').setAttribute('aria-expanded', open);
  if (wide()) { db.collapsed = !open; save(); }
}
$('menuBtn').onclick = () => setSide(!document.body.classList.contains('open'));
$('scrim').onclick = () => setSide(false);
matchMedia('(min-width:840px)').onchange = () => setSide(wide() && !db.collapsed);
$('listAdd').onchange = e => { if (e.target.value) { db.lists[db.view].push(e.target.value); save(); renderSongs(); } };
function selectSong(id) {
  db.cur = id; save(); undoStack = [];
  if (ready && song()) player.cueVideoById(song().videoId);
  $('result').hidden = true;
  renderSongs(); buildNotes(); renderMake();
}
let rate = 1;
$('speed').onclick = e => {
  const r = e.target.dataset.r; if (!r) return;
  rate = +r;
  $('speed').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.target));
  if (ready) player.setPlaybackRate(rate);
};
$('addToggle').onclick = () => { $('addForm').hidden = !$('addForm').hidden; };
$('addForm').onsubmit = e => {
  e.preventDefault();
  const id = vid($('newUrl').value);
  if (!id) return showMsg('看不懂這個網址，請貼 YouTube 影片的網址。');
  const s = { id: Date.now().toString(36), title: $('newTitle').value.trim(), videoId: id, cues: [], words: [] };
  db.songs.push(s); db.lists[db.view]?.push(s.id); e.target.reset(); e.target.hidden = true; showMsg('');
  selectSong(s.id); setMode('make');
};
$('saveSong').onclick = () => {
  const s = song(); if (!s) return;
  const id = vid($('editUrl').value);
  if (!id) return showMsg('看不懂這個網址，請貼 YouTube 影片的網址。');
  s.title = $('editTitle').value.trim() || s.title;
  if (id !== s.videoId) { s.videoId = id; if (ready) player.cueVideoById(id); }
  save(); renderSongs(); showMsg('');
};
// In-page replacement for confirm(): resolves true only when the red button is pressed.
// Answers come straight from the buttons, not the dialog's async close event, so each answer reaches only its own question.
let answer = null;
const reply = v => { const r = answer; answer = null; if ($('dlg').open) $('dlg').close(); r?.(v); };
const ask = (title, body, ok) => new Promise(res => {
  reply(false);
  $('dlgTitle').textContent = title; $('dlgBody').textContent = body; $('dlgOk').textContent = ok;
  answer = res;
  $('dlg').showModal();
});
$('dlgOk').onclick = () => reply(true);
$('dlgCancel').onclick = () => reply(false);
$('dlg').oncancel = e => { e.preventDefault(); reply(false); }; // Esc
$('dlg').onclick = e => { if (e.target === $('dlg')) reply(false); }; // tap outside

$('clearCues').onclick = async () => {
  const s = song();
  if (s && await ask(`清空「${s.title}」的應援點？`, `${s.cues.length} 個應援點會全部刪掉，沒辦法復原。`, '清空')) { s.cues = []; save(); renderCues(); }
};
$('delSong').onclick = async () => {
  const s = song();
  if (!s || !await ask(`刪除「${s.title}」？`, '這首歌和它的應援點會一起刪掉，沒辦法復原。', '刪除')) return;
  if (!db.songs.includes(s)) return; // already gone; splice(-1) would delete another song
  db.songs.splice(db.songs.indexOf(s), 1);
  for (const l of LISTS) db.lists[l] = db.lists[l].filter(x => x !== s.id);
  selectSong(db.songs[0]?.id || null);
};

/* ---------- backup ---------- */
$('exportBtn').onclick = () => {
  const json = JSON.stringify(db);
  navigator.clipboard.writeText(json)
    .then(() => { $('exportMsg').textContent = '已複製 ✓ 到另一台裝置的這一頁貼上匯入。'; })
    .catch(() => { $('importText').value = json; $('importText').select(); $('exportMsg').textContent = '沒辦法自動複製，請手動全選複製下面框框裡的文字。'; });
};
$('importBtn').onclick = async () => {
  try {
    const d = JSON.parse($('importText').value);
    const songs = d.songs.map(s => ({
      id: String(s.id), title: String(s.title), videoId: String(s.videoId), best: s.best || {},
      words: (s.words || []).map(String),
      cues: (s.cues || []).map(c => ({ t: +c.t, text: String(c.text) }))
        .filter(c => isFinite(c.t)).sort((a, b) => a.t - b.t),
    }));
    if (!await ask(`匯入 ${songs.length} 首歌？`, '這台裝置上目前的歌和應援點會被取代。', '匯入')) return;
    const sets = d.sets?.藝名?.length && d.sets?.本名?.length ? { 藝名: d.sets.藝名.map(String), 本名: d.sets.本名.map(String) } : db.sets;
    const ids = songs.map(s => s.id);
    const lists = Object.fromEntries(LISTS.map(l => [l, (d.lists?.[l] || []).map(String).filter(id => ids.includes(id))]));
    const custom = Object.fromEntries(['全曲', ...LISTS].map(l => [l, !!d.custom?.[l]]));
    db = { ...db, songs, sets, lists, custom, cur: songs[0]?.id || null };
    save(); renderNames(); selectSong(db.cur);
    $('importText').value = ''; $('ioMsg').textContent = `匯入了 ${songs.length} 首歌 ✓`;
  } catch { $('ioMsg').textContent = '這段文字不是這個 app 匯出的資料。'; }
};

/* ---------- mode + keys ---------- */
let lastMode = 'play';
function setMode(m) {
  if (mode !== 'io') lastMode = mode;
  mode = m;
  $('play').hidden = m !== 'play'; $('make').hidden = m !== 'make'; $('io').hidden = m !== 'io';
  document.body.classList.toggle('io', m === 'io');
  $('tabPlay').classList.toggle('on', m === 'play'); $('tabMake').classList.toggle('on', m === 'make'); $('ioBtn').classList.toggle('on', m === 'io');
  $('result').hidden = true;
  if (m === 'io') { if (ready) player.pauseVideo(); $('exportMsg').textContent = $('ioMsg').textContent = ''; }
  else m === 'play' ? buildNotes() : renderMake();
}
$('tabPlay').onclick = () => setMode('play');
$('tabMake').onclick = () => setMode('make');
$('ioBtn').onclick = () => setMode(mode === 'io' ? lastMode : 'io');

addEventListener('keydown', e => {
  if (e.target.matches?.('input,textarea,select') || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key === '0' ? 10 : +e.key;
  if (mode === 'play' && k >= 1 && k <= playBtns.length) hit(playBtns[k - 1].textContent, playBtns[k - 1]);
  if (mode === 'make' && k >= 1 && k <= nameBtns.length) { flash(nameBtns[k - 1], 'hit'); record(names()[k - 1]); }
});

/* ---------- boot ---------- */
$('offset').value = db.offset; $('offsetVal').textContent = db.offset;
setSide(wide() && !db.collapsed);
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('anim'))); // no slide-in on load
setDiff(db.diff); renderNames(); renderSongs(); setMode('play');
requestAnimationFrame(frame);

if (location.hash === '#selftest') {
  console.assert(vid('https://www.youtube.com/watch?v=abcdefghijk&t=3') === 'abcdefghijk', 'watch url');
  console.assert(vid('https://youtu.be/abcdefghijk?si=x') === 'abcdefghijk', 'short url');
  console.assert(vid('https://youtube.com/shorts/abcdefghijk') === 'abcdefghijk', 'shorts url');
  console.assert(vid('not a url') === undefined, 'bad url');
  console.assert(grade(.05) === 'perfect' && grade(-.12) === 'good' && grade(.2) === null, 'grade');
  console.assert(move(['a', 'b', 'c'], 0, 1).join() === 'b,a,c' && move(['a', 'b'], 0, -1).join() === 'a,b', 'move');
  console.log('selftest done');
}
