/* Tutifruti Online — cliente PWA (JavaScript sin frameworks).
   El servidor es la fuente de verdad: envía un "state" personalizado y la UI se dibuja a partir de él. */
(() => {
  'use strict';

  // ------------------------------------------------------------ utilidades
  const DEFAULT_CATEGORIES = ['Nombre', 'Apellido', 'País o ciudad', 'Animal', 'Fruta o verdura', 'Color', 'Cosa', 'Marca'];
  const TIME_OPTIONS = [[0, 'Sin límite'], [60, '1 minuto'], [90, '1 min 30 s'], [120, '2 minutos'], [180, '3 minutos']];
  const AVATAR_COLORS = ['#FF6B35', '#E23E57', '#3FA34D', '#6C4AB6', '#F2A900', '#1E88E5', '#D81B60', '#00897B'];

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tf_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('tf_' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  };
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/ñ/g, '\u0001').normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ');
  const startsOk = (ans, letter) => { const a = norm(ans); return !!a && a[0] === norm(letter); };
  const colorFor = (name) => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; };
  const avatar = (name) => `<span class="avatar" style="background:${colorFor(name)}">${esc(String(name || '?').trim().charAt(0).toUpperCase())}</span>`;
  const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; return d; };
  const fmtTime = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function genId() {
    const a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let playerId = store.get('playerId');
  if (!playerId) { playerId = genId(); store.set('playerId', playerId); }

  // ------------------------------------------------------------ estado local
  const S = {
    hello: false,
    online: false,
    rooms: [],
    search: '',
    game: null,
    offset: 0,
    view: 'home',
    editing: false,
    lobbyTab: 'sala',
    draft: null,
    summarySeen: store.get('summarySeen', {}),
    answers: { num: null, list: [] },
    marks: { key: null, list: [] },
    invite: new URLSearchParams(location.search).get('sala'),
    installEvt: null,
  };
  const now = () => Date.now() + S.offset;
  const me = () => (S.game ? S.game.players.find((p) => p.id === playerId) : null);
  const isHost = () => !!(S.game && S.game.room.hostId === playerId);
  const myName = () => store.get('name', '');

  // ------------------------------------------------------------ socket
  const socket = io({ transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    S.online = true;
    $('#net').hidden = true;
    socket.emit('hello', { playerId }, (res) => {
      S.hello = true;
      if (!res || !res.roomId) {
        if (S.game) toast('La sala ya no está disponible');
        S.game = null;
        subscribeRooms();
      }
      render();
    });
  });
  socket.on('disconnect', () => { S.online = false; $('#net').hidden = false; });
  socket.on('rooms:list', (list) => { S.rooms = list || []; if (!S.game) render(); });
  socket.on('kicked', () => { S.game = null; S.view = 'home'; toast('El anfitrión te sacó de la sala'); subscribeRooms(); render(); });

  socket.on('state', (st) => {
    const prev = S.game;
    S.offset = st.serverNow - Date.now();
    if (!prev || prev.room.id !== st.room.id) {
      // Al entrar a una sala no se muestra el resumen de rondas que no jugaste.
      if (S.summarySeen[st.room.id] === undefined) {
        S.summarySeen[st.room.id] = st.lastResult ? st.lastResult.num : 0;
        store.set('summarySeen', S.summarySeen);
      }
      S.lobbyTab = 'sala';
      S.editing = false;
    }
    const prevPhase = prev && prev.room.phase;
    S.game = st;
    const phase = st.room.phase;
    if (phase === 'collecting' && prevPhase !== 'collecting') {
      sendAnswers.flush();
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    }
    if (phase === 'playing' && prevPhase !== 'playing' && navigator.vibrate) navigator.vibrate(80);
    if (phase !== 'lobby') S.editing = false;
    render();
  });

  function subscribeRooms() {
    socket.emit('rooms:subscribe', null, (list) => { S.rooms = list || []; render(); });
  }

  const sendAnswers = debounce(() => {
    if (!S.game || !S.game.round || S.answers.num !== S.game.round.num) return;
    socket.emit('round:answers', { answers: S.answers.list });
  }, 350);

  // ------------------------------------------------------------ avisos y modales
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2800);
  }

  function modal(html, bind) {
    const m = $('#modal');
    m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    m.hidden = false;
    const close = () => { m.hidden = true; m.innerHTML = ''; };
    m.onclick = (e) => { if (e.target === m) close(); };
    bind && bind(m, close);
    const first = $('input', m);
    if (first) setTimeout(() => first.focus(), 50);
    return close;
  }

  function confirmBox(title, text, okLabel, onOk, danger = true) {
    modal(`
      <div class="stack">
        <h3>${esc(title)}</h3>
        <p class="muted" style="margin:0">${esc(text)}</p>
        <div class="row"><button class="btn ghost grow" data-x>Cancelar</button>
        <button class="btn ${danger ? 'berry' : 'primary'} grow" data-ok>${esc(okLabel)}</button></div>
      </div>`, (m, close) => {
      $('[data-x]', m).onclick = close;
      $('[data-ok]', m).onclick = () => { close(); onOk(); };
    });
  }

  // ------------------------------------------------------------ acciones
  function requireName() {
    const n = myName().trim();
    if (!n) {
      toast('Primero escribe tu nombre');
      const i = $('#pname');
      if (i) i.focus();
      return null;
    }
    return n;
  }

  function joinRoom(roomId, isPublic) {
    const playerName = requireName();
    if (!playerName) return;
    if (isPublic === false) return askPassword(roomId);
    socket.emit('room:join', { roomId, playerName }, (res) => {
      if (res && res.needPassword) return askPassword(roomId);
      if (!res || res.error) return toast((res && res.error) || 'No se pudo entrar');
      S.invite = null;
      history.replaceState(null, '', location.pathname);
    });
  }

  function askPassword(roomId, error) {
    const room = S.rooms.find((r) => r.id === roomId);
    modal(`
      <form class="stack" data-f>
        <h3>🔒 ${esc(room ? room.name : 'Sala privada')}</h3>
        <p class="muted small" style="margin:0">Esta sala es privada. Pide la contraseña al anfitrión.</p>
        <input class="input" type="password" name="pw" placeholder="Contraseña" autocomplete="off" required>
        ${error ? `<div class="tag bad">${esc(error)}</div>` : ''}
        <div class="row"><button type="button" class="btn ghost grow" data-x>Cancelar</button>
        <button class="btn primary grow">Entrar</button></div>
      </form>`, (m, close) => {
      $('[data-x]', m).onclick = close;
      $('[data-f]', m).onsubmit = (e) => {
        e.preventDefault();
        const password = e.target.pw.value;
        socket.emit('room:join', { roomId, password, playerName: myName() }, (res) => {
          if (res && res.error) { close(); return res.needPassword ? askPassword(roomId, res.error) : toast(res.error); }
          close();
          S.invite = null;
          history.replaceState(null, '', location.pathname);
        });
      };
    });
  }

  function leaveRoom() {
    confirmBox('¿Salir de la sala?', 'Perderás tu puntaje acumulado en esta sala.', 'Salir', () => {
      socket.emit('room:leave', null, () => {
        S.game = null;
        S.view = 'home';
        subscribeRooms();
        render();
      });
    });
  }

  async function shareRoom() {
    const g = S.game;
    const url = `${location.origin}/?sala=${g.room.id}`;
    const text = `¡Juguemos Tutifruti! Sala "${g.room.name}" (código ${g.room.id})${g.room.isPublic ? '' : ' — es privada, te paso la contraseña aparte'}`;
    try {
      if (navigator.share) return await navigator.share({ title: 'Tutifruti', text, url });
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast('Enlace copiado');
    } catch { /* el usuario canceló */ }
  }

  // ------------------------------------------------------------ enrutado de pantallas
  function screenName() {
    if (!S.hello) return 'connecting';
    const g = S.game;
    if (!g) return S.view;
    const phase = g.room.phase;
    if (phase === 'lobby') {
      const lr = g.lastResult;
      if (lr && lr.num > (S.summarySeen[g.room.id] || 0) && lr.rows.some((r) => r.id === playerId)) return 'summary';
      return S.editing ? 'config' : 'lobby';
    }
    const r = g.round;
    if (!r || !r.participating) return 'spectate';
    if (phase === 'countdown') return 'countdown';
    if (phase === 'playing') return 'play';
    if (phase === 'collecting') return 'stop';
    if (phase === 'validating') return r.review && !r.iApplied ? 'review' : 'reviewWait';
    return 'lobby';
  }

  let currentKey = null;
  function render() {
    const name = screenName();
    const scr = SCREENS[name];
    const g = S.game;
    const key = `${name}|${g ? g.room.id : ''}|${g && g.round ? g.round.num : ''}`;
    const app = $('#app');
    if (key !== currentKey || !scr.update) {
      const sameScreen = currentKey && currentKey.split('|')[0] === name;
      const y = window.scrollY;
      app.innerHTML = scr.html();
      scr.mount && scr.mount(app);
      if (sameScreen) window.scrollTo(0, y); else window.scrollTo(0, 0);
      currentKey = key;
    } else {
      scr.update(app);
    }
    tick();
  }

  // Refresca contadores (cuenta regresiva y tiempo restante) sin redibujar.
  function tick() {
    const g = S.game;
    if (!g || !g.round) return;
    const c = $('[data-countdown]');
    if (c) {
      const left = g.round.startsAt - now();
      const n = Math.max(1, Math.ceil(left / 1000));
      if (c.textContent !== String(n)) { c.textContent = n; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }
    }
    const t = $('[data-timeleft]');
    if (t && g.round.endsAt) {
      const left = g.round.endsAt - now();
      t.textContent = fmtTime(left);
      t.classList.toggle('low', left < 15000);
    }
  }
  setInterval(tick, 250);

  // ------------------------------------------------------------ piezas reutilizables
  function playersList(opts = {}) {
    const g = S.game;
    return `<div class="players">${g.players.map((p) => {
      let status = '';
      if (opts.mode === 'ready') status = p.ready ? '<span class="tag ok">✓ Listo</span>' : '<span class="tag warn">Esperando</span>';
      if (opts.mode === 'applied') status = p.reviewer ? (p.applied ? '<span class="tag ok">✓ Aplicó</span>' : '<span class="tag warn">Revisando…</span>') : '<span class="tag info">Espectador</span>';
      if (!p.connected) status = '<span class="tag bad">Desconectado</span>';
      const kick = opts.kick && isHost() && p.id !== playerId ? `<button class="icon-btn" data-kick="${esc(p.id)}" aria-label="Sacar a ${esc(p.name)}">✕</button>` : '';
      return `<div class="player ${p.connected ? '' : 'off'}">${avatar(p.name)}
        <div class="grow"><div class="pname">${esc(p.name)}${p.id === playerId ? ' <span class="muted small">(tú)</span>' : ''}${p.isHost ? ' 👑' : ''}</div>
        ${opts.showTotal ? `<div class="small muted">${p.total} pts acumulados</div>` : ''}</div>${status}${kick}</div>`;
    }).join('')}</div>`;
  }

  function bindKick(root) {
    $$('[data-kick]', root).forEach((b) => (b.onclick = () => {
      const p = S.game.players.find((x) => x.id === b.dataset.kick);
      if (!p) return;
      confirmBox(`¿Sacar a ${p.name}?`, 'Saldrá de la sala y perderá su puntaje.', 'Sacar', () => {
        socket.emit('room:kick', { playerId: p.id }, (res) => res && res.error && toast(res.error));
      });
    }));
  }

  function pointsPill(p) { return `<span class="pts p${p}">${p ? '+' + p : '0'}</span>`; }

  function resultTable(lr) {
    return `<div class="table-wrap"><table class="grid">
      <thead><tr><th>Categoría</th>${lr.rows.map((r) => `<th>${esc(r.name)}</th>`).join('')}</tr></thead>
      <tbody>${lr.categories.map((cat, c) => `<tr><td>${esc(cat)}</td>${lr.rows.map((r) => {
        const a = r.answers[c];
        return `<td><div class="cell-ans ${r.valid[c] ? '' : 'invalid'}">${a ? esc(a) : '—'}</div>${pointsPill(r.points[c])}</td>`;
      }).join('')}</tr>`).join('')}
      <tr><td>Total ronda</td>${lr.rows.map((r) => `<td><strong>${r.roundTotal}</strong></td>`).join('')}</tr>
      </tbody></table></div>`;
  }

  const legend = `<div class="legend small">
    <span class="pts p20">+20 única en la categoría</span><span class="pts p10">+10 no repetida</span>
    <span class="pts p5">+5 repetida</span><span class="pts p0">0 inválida o vacía</span></div>`;

  function rulesForm(d, withRoom) {
    const tl = TIME_OPTIONS.map(([v, l]) => `<option value="${v}" ${d.timeLimit === v ? 'selected' : ''}>${l}</option>`).join('');
    return `
      ${withRoom ? `
      <div class="card stack">
        <div><label class="label" for="rname">Nombre de la sala</label>
        <input class="input" id="rname" maxlength="30" placeholder="Ej: Los primos" value="${esc(d.name)}" autocomplete="off"></div>
        <div><span class="label">Tipo de sala</span>
        <div class="segmented" id="privacy">
          <button type="button" data-pub="1" class="${d.isPublic ? 'on' : ''}">🌎 Pública</button>
          <button type="button" data-pub="0" class="${d.isPublic ? '' : 'on'}">🔒 Privada</button>
        </div></div>
        <div id="pwbox" ${d.isPublic ? 'hidden' : ''}><label class="label" for="rpass">Contraseña</label>
        <input class="input" id="rpass" type="text" maxlength="30" placeholder="Mínimo 3 caracteres" value="${esc(d.password)}" autocomplete="off"></div>
      </div>` : ''}
      <div class="card stack">
        <div class="row between"><span class="label" style="margin:0">Categorías (${d.categories.length})</span>
        <button type="button" class="btn sm ghost" id="catreset">Restablecer</button></div>
        <div class="chips" id="cats">${d.categories.map((c, i) => `<span class="chip">${esc(c)}<button type="button" data-rm="${i}" aria-label="Quitar ${esc(c)}">×</button></span>`).join('')}</div>
        <form class="row" id="catadd"><input class="input grow" id="catnew" maxlength="24" placeholder="Agregar categoría" autocomplete="off">
        <button class="btn primary" aria-label="Agregar">＋</button></form>
        <div class="small muted">Entre 3 y 12 categorías.</div>
      </div>
      <div class="card stack">
        <div><label class="label" for="rtime">Tiempo por ronda</label>
        <select class="input" id="rtime">${tl}</select></div>
        <label class="switch"><span>Incluir letras difíciles<br><span class="small muted">K, Ñ, Q, W, X, Y, Z</span></span>
        <input type="checkbox" id="rhard" ${d.includeHard ? 'checked' : ''}></label>
      </div>`;
  }

  function bindRulesForm(root, d) {
    const drawCats = () => {
      $('#cats', root).innerHTML = d.categories.map((c, i) => `<span class="chip">${esc(c)}<button type="button" data-rm="${i}" aria-label="Quitar ${esc(c)}">×</button></span>`).join('');
      $('.label', $('#cats', root).parentElement).textContent = `Categorías (${d.categories.length})`;
    };
    $('#cats', root).onclick = (e) => {
      const b = e.target.closest('[data-rm]');
      if (!b) return;
      if (d.categories.length <= 3) return toast('Mínimo 3 categorías');
      d.categories.splice(+b.dataset.rm, 1);
      drawCats();
    };
    $('#catadd', root).onsubmit = (e) => {
      e.preventDefault();
      const i = $('#catnew', root);
      const v = i.value.trim().replace(/\s+/g, ' ');
      if (!v) return;
      if (d.categories.length >= 12) return toast('Máximo 12 categorías');
      if (d.categories.some((c) => norm(c) === norm(v))) return toast('Esa categoría ya está');
      d.categories.push(v);
      i.value = '';
      drawCats();
    };
    $('#catreset', root).onclick = () => { d.categories = DEFAULT_CATEGORIES.slice(); drawCats(); };
    $('#rtime', root).onchange = (e) => (d.timeLimit = +e.target.value);
    $('#rhard', root).onchange = (e) => (d.includeHard = e.target.checked);
    const rname = $('#rname', root);
    if (rname) {
      rname.oninput = (e) => (d.name = e.target.value);
      $('#rpass', root).oninput = (e) => (d.password = e.target.value);
      $('#privacy', root).onclick = (e) => {
        const b = e.target.closest('[data-pub]');
        if (!b) return;
        d.isPublic = b.dataset.pub === '1';
        $$('#privacy button', root).forEach((x) => x.classList.toggle('on', x === b));
        $('#pwbox', root).hidden = d.isPublic;
        if (!d.isPublic) $('#rpass', root).focus();
      };
    }
  }

  // ------------------------------------------------------------ pantallas
  const SCREENS = {};

  SCREENS.connecting = {
    html: () => `<div class="splash"><div class="logo">${[...'Tutifruti'].map((c) => `<span>${c}</span>`).join('')}</div>
      <div class="spinner"></div><div class="muted">Conectando al servidor…</div></div>`,
  };

  // ---- Inicio: nombre + buscar sala
  function roomListHtml() {
    const q = norm(S.search);
    const list = S.rooms.filter((r) => !q || norm(r.name).includes(q) || norm(r.id).includes(q) || norm(r.hostName).includes(q));
    if (!list.length) {
      return `<div class="empty"><span class="big-emoji">🍉</span>${S.rooms.length ? 'Ninguna sala coincide con tu búsqueda.' : 'No hay salas abiertas. ¡Crea la primera!'}</div>`;
    }
    const phaseLabel = { lobby: 'En espera', countdown: 'Empezando', playing: 'Jugando', collecting: 'Jugando', validating: 'Validando' };
    return list.map((r) => `
      <button class="room-item" data-room="${esc(r.id)}" data-pub="${r.isPublic ? 1 : 0}">
        <span class="room-badge ${r.isPublic ? '' : 'locked'}">${r.isPublic ? '🍊' : '🔒'}</span>
        <span class="grow"><div class="room-name">${esc(r.name)}</div>
        <div class="small muted">${r.players}/${r.maxPlayers} jugadores · anfitrión ${esc(r.hostName)} · <span class="code">${esc(r.id)}</span></div></span>
        <span class="tag ${r.phase === 'lobby' ? 'ok' : 'info'}">${phaseLabel[r.phase] || r.phase}</span>
      </button>`).join('');
  }

  SCREENS.home = {
    html: () => `
      <div class="logo" aria-label="Tutifruti">${[...'Tutifruti'].map((c) => `<span>${c}</span>`).join('')}</div>
      <div class="tagline">Basta · Stop · Tutti Frutti con tus amigos</div>
      ${S.invite ? `<div class="card row"><span style="font-size:28px">💌</span><div class="grow"><strong>Te invitaron</strong>
        <div class="small muted">Sala <span class="code">${esc(S.invite)}</span></div></div>
        <button class="btn primary sm" id="inviteJoin">Unirme</button></div>` : ''}
      <div class="card stack">
        <div><label class="label" for="pname">Tu nombre</label>
        <input class="input" id="pname" maxlength="20" placeholder="¿Cómo te llamas?" value="${esc(myName())}" autocomplete="nickname" autocapitalize="words"></div>
        <button class="btn primary big block" id="create">＋ Crear sala</button>
      </div>
      <div class="row between"><h3>Salas abiertas</h3><span class="small muted" id="rcount">${S.rooms.length}</span></div>
      <input class="input" id="search" type="search" placeholder="🔍 Buscar por nombre o código" value="${esc(S.search)}" autocomplete="off">
      <div class="stack" id="rooms">${roomListHtml()}</div>
      ${S.installEvt ? '<button class="btn ghost block" id="install">📲 Instalar app en este teléfono</button>' : ''}
      <div class="small muted center">Consejo: en el navegador del celular usa "Agregar a pantalla de inicio" para tenerla como app.</div>`,
    mount(root) {
      $('#pname', root).oninput = (e) => store.set('name', e.target.value.trim());
      $('#search', root).oninput = (e) => { S.search = e.target.value; $('#rooms', root).innerHTML = roomListHtml(); };
      $('#create', root).onclick = () => {
        if (!requireName()) return;
        S.draft = { name: `Sala de ${myName()}`.slice(0, 30), isPublic: true, password: '', categories: DEFAULT_CATEGORIES.slice(), timeLimit: 0, includeHard: false };
        S.view = 'create';
        render();
      };
      $('#rooms', root).onclick = (e) => {
        const b = e.target.closest('[data-room]');
        if (b) joinRoom(b.dataset.room, b.dataset.pub === '1');
      };
      const inv = $('#inviteJoin', root);
      if (inv) inv.onclick = () => joinRoom(S.invite.toUpperCase());
      const ins = $('#install', root);
      if (ins) ins.onclick = async () => { S.installEvt.prompt(); await S.installEvt.userChoice; S.installEvt = null; render(); };
    },
    update(root) {
      $('#rooms', root).innerHTML = roomListHtml();
      $('#rcount', root).textContent = S.rooms.length;
    },
  };

  // ---- Crear sala
  SCREENS.create = {
    html: () => `
      <div class="topbar"><button class="icon-btn" id="back" aria-label="Volver">←</button><h2>Crear sala</h2></div>
      ${rulesForm(S.draft, true)}
      <div class="sticky-bottom"><button class="btn primary big block" id="go">Crear y entrar</button></div>`,
    mount(root) {
      const d = S.draft;
      bindRulesForm(root, d);
      $('#back', root).onclick = () => { S.view = 'home'; render(); };
      $('#go', root).onclick = (e) => {
        if (!d.name.trim()) return toast('Ponle nombre a la sala');
        if (!d.isPublic && d.password.length < 3) return toast('La contraseña debe tener al menos 3 caracteres');
        e.target.disabled = true;
        socket.emit('room:create', { ...d, playerName: myName() }, (res) => {
          e.target.disabled = false;
          if (!res || res.error) return toast((res && res.error) || 'No se pudo crear');
          S.view = 'home';
        });
      };
    },
    update() { /* formulario local: no se redibuja */ },
  };

  // ---- Editar reglas (anfitrión, entre rondas)
  SCREENS.config = {
    html: () => `
      <div class="topbar"><button class="icon-btn" id="back" aria-label="Volver">←</button><h2>Reglas de la sala</h2></div>
      ${rulesForm(S.draft, false)}
      <div class="small muted center">Al guardar, todos deberán marcar "listo" otra vez.</div>
      <div class="sticky-bottom"><button class="btn primary big block" id="save">Guardar reglas</button></div>`,
    mount(root) {
      bindRulesForm(root, S.draft);
      $('#back', root).onclick = () => { S.editing = false; render(); };
      $('#save', root).onclick = () => {
        socket.emit('room:config', S.draft, (res) => {
          if (res && res.error) return toast(res.error);
          S.editing = false;
          toast('Reglas actualizadas');
          render();
        });
      };
    },
    update() { if (!isHost()) { S.editing = false; render(); } },
  };

  // ---- Sala de espera
  function standingsHtml() {
    const g = S.game;
    if (!g.history.length) return '<div class="card empty"><span class="big-emoji">🏆</span>Aún no se juega ninguna ronda.</div>';
    const sorted = g.players.slice().sort((a, b) => b.total - a.total);
    return `
      <div class="stack">${sorted.map((p, i) => `
        <div class="rank ${i === 0 ? 'first' : ''}"><span class="pos">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>${avatar(p.name)}
        <div class="grow pname">${esc(p.name)}${p.id === playerId ? ' <span class="muted small">(tú)</span>' : ''}</div>
        <span class="plus" style="color:var(--text)">${p.total}</span></div>`).join('')}</div>
      <h3>Rondas jugadas</h3>
      <div class="table-wrap"><table class="grid"><thead><tr><th>Ronda</th>${g.players.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr></thead>
      <tbody>${g.history.slice().reverse().map((h) => `<tr><td>#${h.num} · ${esc(h.letter)}</td>${g.players.map((p) => `<td>${h.scores[p.id] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      ${g.lastResult ? `<h3>Detalle de la última ronda (${esc(g.lastResult.letter)})</h3>${resultTable(g.lastResult)}${legend}` : ''}`;
  }

  SCREENS.lobby = {
    html: () => {
      const g = S.game;
      const online = g.players.filter((p) => p.connected);
      const waiting = online.filter((p) => !p.ready).length;
      const mine = me();
      let status;
      if (online.length < g.room.minPlayers) status = `Se necesitan al menos ${g.room.minPlayers} jugadores. ¡Comparte la sala!`;
      else if (waiting === 0) status = 'Todos listos, ¡arrancando!';
      else status = `Esperando a ${waiting} jugador${waiting === 1 ? '' : 'es'}…`;
      const tl = TIME_OPTIONS.find(([v]) => v === g.room.timeLimit);
      return `
        <div class="topbar">
          <button class="icon-btn" id="leave" aria-label="Salir de la sala">←</button>
          <div class="grow"><h2>${g.room.isPublic ? '' : '🔒 '}${esc(g.room.name)}</h2>
          <div class="small muted">Código <span class="code">${esc(g.room.id)}</span> · ${online.length} conectado${online.length === 1 ? '' : 's'}${g.room.roundNum ? ` · ${g.room.roundNum} ronda${g.room.roundNum === 1 ? '' : 's'}` : ''}</div></div>
          <button class="icon-btn" id="share" aria-label="Invitar">📤</button>
        </div>
        <div class="tabs"><button data-tab="sala" class="${S.lobbyTab === 'sala' ? 'on' : ''}">Sala de espera</button>
        <button data-tab="resumen" class="${S.lobbyTab === 'resumen' ? 'on' : ''}">Resumen</button></div>
        ${S.lobbyTab === 'sala' ? `
          <div class="card stack"><div class="row between"><h3>Jugadores</h3><span class="small muted">${online.length - waiting}/${online.length} listos</span></div>
          ${playersList({ mode: 'ready', kick: true })}</div>
          <div class="card stack">
            <div class="row between"><h3>Reglas</h3>${isHost() ? '<button class="btn sm ghost" id="edit">✏️ Editar</button>' : ''}</div>
            <div class="chips">${g.room.categories.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
            <div class="small muted">⏱ ${tl ? tl[1] : 'Sin límite'} · 🔤 ${g.room.includeHard ? 'Todas las letras' : 'Sin letras difíciles'}</div>
          </div>` : standingsHtml()}
        <div class="spacer"></div>
        <div class="sticky-bottom stack" style="gap:8px">
          <div class="small center muted">${esc(status)}</div>
          <button class="btn big block ${mine && mine.ready ? 'lime' : 'primary'}" id="ready">${mine && mine.ready ? '✓ Estoy listo · tocar para cancelar' : 'Marcar como listo'}</button>
        </div>`;
    },
    mount(root) {
      $('#leave', root).onclick = leaveRoom;
      $('#share', root).onclick = shareRoom;
      $$('[data-tab]', root).forEach((b) => (b.onclick = () => { S.lobbyTab = b.dataset.tab; render(); }));
      $('#ready', root).onclick = () => { const m = me(); socket.emit('player:ready', { ready: !(m && m.ready) }); };
      const ed = $('#edit', root);
      if (ed) ed.onclick = () => {
        const r = S.game.room;
        S.draft = { categories: r.categories.slice(), timeLimit: r.timeLimit, includeHard: r.includeHard };
        S.editing = true;
        render();
      };
      bindKick(root);
    },
  };

  // ---- Cuenta regresiva
  SCREENS.countdown = {
    html: () => `<div class="splash"><div class="muted" style="font-weight:800">Ronda ${S.game.round.num}</div>
      <div class="count" data-countdown>3</div><h2>¡Prepárate!</h2>
      <div class="muted">La letra aparece en un instante…</div></div>`,
    update() { /* tick() actualiza el número */ },
  };

  // ---- Jugando
  function progressHtml() {
    const g = S.game;
    const total = g.round.categories.length;
    return g.players.filter((p) => p.inRound && p.id !== playerId).map((p) =>
      `<span class="pdot ${p.filled === total ? 'done' : ''}">${esc(p.name)} ${p.filled}/${total}</span>`).join('');
  }

  SCREENS.play = {
    html: () => {
      const g = S.game;
      const r = g.round;
      if (S.answers.num !== r.num) {
        S.answers = { num: r.num, list: r.categories.map((_, i) => (r.myAnswers && r.myAnswers[i]) || '') };
      }
      return `
        <div class="letter-bar">
          <div class="letter" style="animation:pop .5s ease-out">${esc(r.letter)}</div>
          <div class="grow"><div class="small muted" style="font-weight:800">Ronda ${r.num} · Letra ${esc(r.letter)}</div>
          ${r.endsAt ? '<div class="timer" data-timeleft>--:--</div>' : '<div class="small muted">Sin límite de tiempo</div>'}
          <div class="progress-dots" id="prog">${progressHtml()}</div></div>
        </div>
        <form class="stack" id="answers" autocomplete="off">
          ${r.categories.map((c, i) => `
            <div class="field"><div class="field-head"><label class="label" for="a${i}" style="margin:0">${esc(c)}</label><span data-hint="${i}"></span></div>
            <input class="input" id="a${i}" data-i="${i}" maxlength="40" enterkeyhint="${i === r.categories.length - 1 ? 'done' : 'next'}"
              autocapitalize="words" autocorrect="off" spellcheck="false" placeholder="${esc(r.letter)}…" value="${esc(S.answers.list[i])}"></div>`).join('')}
        </form>
        <div class="sticky-bottom stack" style="gap:6px">
          <button class="stop-btn" id="stop">STOP</button>
          <div class="small muted center" id="stophint"></div>
        </div>`;
    },
    mount(root) {
      const r = S.game.round;
      const inputs = $$('#answers input', root);
      const refresh = () => {
        let filled = 0;
        inputs.forEach((inp, i) => {
          const v = inp.value.trim();
          const ok = startsOk(v, r.letter);
          if (v) filled++;
          inp.classList.toggle('ok', ok);
          inp.classList.toggle('warn', !!v && !ok);
          $(`[data-hint="${i}"]`, root).innerHTML = v && !ok ? `<span class="tag warn">No empieza con ${esc(r.letter)}</span>` : '';
        });
        const all = filled === inputs.length;
        $('#stop', root).disabled = !all;
        $('#stophint', root).textContent = all ? '¡Listo! Pulsa STOP para cerrar la ronda a todos' : `Completa las ${inputs.length} categorías para poder pulsar STOP (${filled}/${inputs.length})`;
      };
      inputs.forEach((inp) => {
        inp.oninput = () => { S.answers.list[+inp.dataset.i] = inp.value; refresh(); sendAnswers(); };
        inp.onkeydown = (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const next = inputs[+inp.dataset.i + 1];
          if (next) next.focus(); else inp.blur();
        };
      });
      $('#answers', root).onsubmit = (e) => e.preventDefault();
      $('#stop', root).onclick = () => {
        sendAnswers.flush();
        socket.emit('round:stop', { answers: S.answers.list }, (res) => res && res.error && toast(res.error));
      };
      refresh();
      const firstEmpty = inputs.find((i) => !i.value);
      if (firstEmpty && window.matchMedia('(pointer:fine)').matches) firstEmpty.focus();
    },
    update(root) { $('#prog', root).innerHTML = progressHtml(); },
  };

  // ---- STOP
  SCREENS.stop = {
    html: () => {
      const r = S.game.round;
      const who = r.stopReason === 'time' ? '¡Se acabó el tiempo!' : r.stoppedByName === me()?.name ? '¡Cerraste la ronda!' : `Lo pidió ${esc(r.stoppedByName || 'alguien')}`;
      return `<div class="splash"><div class="stop-splash">STOP</div><h2>${who}</h2>
        <div class="spinner"></div><div class="muted">Recogiendo respuestas…</div></div>`;
    },
  };

  // ---- Validación cruzada
  SCREENS.review = {
    html: () => {
      const r = S.game.round;
      const rv = r.review;
      const key = `${S.game.room.id}:${r.num}`;
      if (S.marks.key !== key) S.marks = { key, list: rv.defaults.slice() };
      return `
        <div class="topbar"><div class="letter" style="width:48px;height:48px;font-size:28px;border-radius:14px">${esc(r.letter)}</div>
        <div class="grow"><h2>Validación</h2><div class="small muted">Ronda ${r.num} · te toca revisar a otro jugador</div></div></div>
        <div class="card row">${avatar(rv.targetName)}<div class="grow">Revisa las respuestas de <strong>${esc(rv.targetName)}</strong>.
          <div class="small muted">Toca el botón para marcar cada respuesta como válida o inválida.</div></div></div>
        <div class="stack" id="rlist">${reviewItems()}</div>
        ${legend}
        <div class="sticky-bottom"><button class="btn lime big block" id="apply">Aplicar</button></div>`;
    },
    mount(root) {
      $('#rlist', root).onclick = (e) => {
        const b = e.target.closest('[data-t]');
        if (!b || b.disabled) return;
        const i = +b.dataset.t;
        S.marks.list[i] = !S.marks.list[i];
        $('#rlist', root).innerHTML = reviewItems();
      };
      $('#apply', root).onclick = (e) => {
        e.target.disabled = true;
        socket.emit('review:apply', { marks: S.marks.list }, (res) => { if (res && res.error) { e.target.disabled = false; toast(res.error); } });
      };
    },
    update() { /* las marcas son locales hasta pulsar Aplicar */ },
  };

  function reviewItems() {
    const r = S.game.round;
    const rv = r.review;
    return r.categories.map((cat, i) => {
      const a = rv.answers[i];
      const empty = !a;
      const valid = !empty && S.marks.list[i];
      const tags = [];
      if (empty) tags.push('<span class="tag bad">Vacía</span>');
      else if (!rv.startsOk[i]) tags.push(`<span class="tag warn">No empieza con ${esc(r.letter)}</span>`);
      if (rv.duplicates[i] && rv.duplicates[i].length) tags.push(`<span class="tag info">Repetida con ${esc(rv.duplicates[i].join(', '))}</span>`);
      return `<div class="review-item"><div class="grow"><div class="cat">${esc(cat)}</div>
        <div class="ans ${empty ? 'none' : ''}">${empty ? 'Sin respuesta' : esc(a)}</div>
        ${tags.length ? `<div class="chips" style="gap:4px;margin-top:4px">${tags.join('')}</div>` : ''}</div>
        <button class="toggle ${valid ? 'ok' : 'bad'}" data-t="${i}" ${empty ? 'disabled' : ''} aria-pressed="${valid}">${valid ? '✓ Válida' : '✕ Inválida'}</button></div>`;
    }).join('');
  }

  SCREENS.reviewWait = {
    html: () => {
      const r = S.game.round;
      return `
        <div class="topbar"><h2 class="grow">Validación</h2><span class="tag warn">${r.reviewersPending} pendiente${r.reviewersPending === 1 ? '' : 's'}</span></div>
        <div class="card stack"><div class="row"><div class="spinner"></div><div class="grow"><strong>¡Aplicado!</strong>
          <div class="small muted">Esperando a que los demás terminen de revisar.</div></div></div></div>
        <div class="card">${playersList({ mode: 'applied' })}</div>
        ${isHost() && r.reviewersPending > 0 ? `<div class="card stack"><div class="small muted">¿Alguien se quedó dormido o se desconectó? Como anfitrión puedes aplicar la validación automática por ellos.</div>
          <button class="btn ghost block" id="force">Forzar revisiones pendientes</button></div>` : ''}`;
    },
    mount(root) {
      const f = $('#force', root);
      if (f) f.onclick = () => confirmBox('¿Forzar revisiones?', 'Se aplicará la validación automática (solo cuenta si empieza con la letra) a quienes faltan.', 'Forzar', () => socket.emit('review:force', null, (res) => res && res.error && toast(res.error)), false);
    },
  };

  // ---- Resumen de la ronda
  SCREENS.summary = {
    html: () => {
      const g = S.game;
      const lr = g.lastResult;
      const why = lr.stopReason === 'time' ? 'Se acabó el tiempo' : lr.stoppedByName ? `STOP de ${esc(lr.stoppedByName)}` : '';
      return `
        <div class="topbar"><div class="letter" style="width:48px;height:48px;font-size:28px;border-radius:14px">${esc(lr.letter)}</div>
        <div class="grow"><h2>Resumen · Ronda ${lr.num}</h2><div class="small muted">${why}</div></div></div>
        <div class="stack">${lr.rows.map((r, i) => `
          <div class="rank ${i === 0 ? 'first' : ''}"><span class="pos">${i === 0 ? '🏆' : i + 1}</span>${avatar(r.name)}
          <div class="grow"><div class="pname">${esc(r.name)}${r.id === playerId ? ' <span class="muted small">(tú)</span>' : ''}</div>
          <div class="total">${r.total} pts acumulados</div></div><span class="plus">+${r.roundTotal}</span></div>`).join('')}</div>
        <h3>Respuestas</h3>
        ${resultTable(lr)}
        ${legend}
        <div class="spacer"></div>
        <div class="sticky-bottom"><button class="btn primary big block" id="back">Volver a la sala de espera</button></div>`;
    },
    mount(root) {
      $('#back', root).onclick = () => {
        S.summarySeen[S.game.room.id] = S.game.lastResult.num;
        store.set('summarySeen', S.summarySeen);
        S.lobbyTab = 'sala';
        render();
      };
    },
    update() { /* se queda fija hasta que el jugador vuelva */ },
  };

  // ---- Entró a mitad de ronda
  SCREENS.spectate = {
    html: () => {
      const g = S.game;
      const labels = { countdown: 'está por empezar', playing: 'está en juego', collecting: 'está cerrando', validating: 'se está validando' };
      return `
        <div class="topbar"><button class="icon-btn" id="leave" aria-label="Salir">←</button><h2 class="grow">${esc(g.room.name)}</h2>
        <button class="icon-btn" id="share" aria-label="Invitar">📤</button></div>
        <div class="card stack center"><span style="font-size:40px">⏳</span><h3>La ronda ${labels[g.room.phase] || 'está en curso'}</h3>
        <div class="muted">Entraste mientras se jugaba. Participarás en la siguiente ronda.</div></div>
        <div class="card">${playersList({ showTotal: true })}</div>`;
    },
    mount(root) { $('#leave', root).onclick = leaveRoom; $('#share', root).onclick = shareRoom; },
  };

  // ------------------------------------------------------------ PWA
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; if (!S.game && S.view === 'home') { currentKey = null; render(); } });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  render();
})();
