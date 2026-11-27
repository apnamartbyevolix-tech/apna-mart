(() => {
  if (window.MartStartup) return;
  const native = document.documentElement.dataset.nativeStartup === 'true';
  const preview = document.documentElement.dataset.startupPreview === 'true';
  const root = document.createElement('section');
  root.id = 'mart-startup';
  root.setAttribute('aria-label', 'Opening Apna Mart');
  root.innerHTML = `<div class="startup-card">
    <div class="startup-brand"><img width="44" height="44" alt="">Apna Mart</div>
    <div class="startup-orbit" aria-hidden="true"><span></span></div>
    <h1 id="startup-title">Your neighbourhood is waking up</h1>
    <p id="startup-message" role="status" aria-live="polite">Getting things ready for you.</p>
    <div class="startup-steps"><span>1 · App</span><span aria-current="step">2 · Connect</span><span>3 · Open</span></div>
    <progress id="startup-progress" max="3" aria-label="Connecting to the shop server"></progress>
    <p class="startup-note">We’ll open the app as soon as the server is ready.</p>
    <button id="startup-retry" hidden>Try again</button><br>
    <button id="startup-play" aria-expanded="false" aria-controls="startup-game">Play a quick Snake game</button>
    <div id="startup-game" hidden><div class="startup-game-top"><strong>Neighbourhood Snake</strong><button id="startup-game-pause">Pause</button></div>
      <canvas width="288" height="288" aria-label="Snake board. Use the arrow keys or the direction buttons below."></canvas>
      <p id="startup-game-status" role="status">Use the arrows to collect the golden squares.</p>
      <div class="startup-controls"><button data-direction="up" aria-label="Move up">↑</button><button data-direction="left" aria-label="Move left">←</button><button data-direction="down" aria-label="Move down">↓</button><button data-direction="right" aria-label="Move right">→</button></div>
      <p class="startup-note">Score: <strong id="startup-score">0</strong> · The app opens automatically when ready.</p>
    </div></div>`;
  document.body.append(root);
  root.querySelector('.startup-brand img').src = window.MART_STARTUP_LOGO || '/brand/apna-mart-icon-192.png';
  const $ = selector => root.querySelector(selector);
  let timer, attempts = 0, generation = 0, busy = false, completed = false, resolveReady;
  let controller;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  function phase(state, message) {
    if (completed) return;
    $('#startup-message').textContent = message;
    $('#startup-title').textContent = state === 'error' ? 'We’re taking a little longer' : state === 'opening' ? 'Your market is ready' : 'Your neighbourhood is waking up';
    const progress = $('#startup-progress');
    if (state === 'opening') progress.value = 2;
    else progress.removeAttribute('value');
    progress.setAttribute('aria-label', state === 'opening' ? 'Opening the marketplace, step 3 of 3' : 'Waiting for a confirmed server connection');
    $('.startup-steps span[aria-current]')?.removeAttribute('aria-current');
    root.querySelectorAll('.startup-steps span')[state === 'opening' ? 2 : 1].setAttribute('aria-current', 'step');
    $('#startup-retry').hidden = state !== 'error';
  }
  function schedule(delay) { clearTimeout(timer); timer = setTimeout(probe, delay); }
  async function probe() {
    if (completed || busy || attempts >= 12 || document.hidden) return;
    if (!navigator.onLine) { phase('error', 'You’re offline. Check your connection, then try again.'); return; }
    const current = generation; attempts++; busy = true;
    phase('waiting', attempts > 1 ? 'Our shop server is still waking up. You can play while you wait.' : 'Connecting to your local marketplace…');
    controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch('/api/health/ready', { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: controller.signal });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw Error('Not ready');
      const reader = response.body.getReader(); let bytes = 0, text = ''; const decoder = new TextDecoder();
      try {
        for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 256) throw Error('Response limit'); text += decoder.decode(chunk.value, {stream:true}); }
        text += decoder.decode();
      } finally { await reader.cancel(); }
      if (JSON.parse(text).status !== 'ok') throw Error('Not ready');
      if (current !== generation || completed) return;
      phase('opening', 'Connected. Opening your marketplace…'); resolveReady();
    } catch {
      if (current !== generation || completed) return;
      if (attempts >= 12) phase('error', 'The server has not confirmed it is ready. Your data is safe. Please try again.');
      else schedule(Math.min(8000, attempts * 1500));
    } finally { clearTimeout(deadline); busy = false; }
  }
  function retry() {
    if (native) { window.location.href = 'mart-startup:retry'; return; }
    if (preview) { window.location.assign('/'); return; }
    if (busy || completed) return;
    attempts = 0; generation++; void probe();
  }
  $('#startup-retry').addEventListener('click', retry);

  // The game stays entirely on-device and has no storage, tracking or network calls.
  const canvas = $('canvas'), context = canvas.getContext('2d'), size = 16, cell = 18;
  let snake = [], food, direction, queued, gameTimer, score = 0, playing = false, ended = false;
  function draw() {
    context.clearRect(0, 0, 288, 288);
    context.fillStyle = '#f4b544'; context.fillRect(food.x * cell + 2, food.y * cell + 2, cell - 4, cell - 4);
    snake.forEach((part, index) => { context.fillStyle = index ? '#367467' : '#123d36'; context.fillRect(part.x * cell + 1, part.y * cell + 1, cell - 2, cell - 2); });
  }
  function newFood() {
    const free = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!snake.some(p => p.x === x && p.y === y)) free.push({ x, y });
    food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }
  function pause() { playing = false; clearInterval(gameTimer); $('#startup-game-pause').textContent = ended ? 'Play again' : 'Resume'; }
  function tick() {
    direction = queued;
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
    const eats = head.x === food.x && head.y === food.y;
    const body = eats ? snake : snake.slice(0, -1);
    if (head.x < 0 || head.y < 0 || head.x >= size || head.y >= size || body.some(p => p.x === head.x && p.y === head.y)) {
      ended = true; pause(); $('#startup-game-status').textContent = 'Nice try! Tap Play again for another round.'; return;
    }
    snake.unshift(head);
    if (eats) { score++; $('#startup-score').textContent = String(score); newFood(); }
    else snake.pop();
    if (!food) { ended = true; pause(); $('#startup-game-status').textContent = 'You filled the neighbourhood!'; return; }
    draw();
  }
  function startGame() {
    if (!snake.length || ended) { snake = [{x:7,y:8},{x:6,y:8},{x:5,y:8}]; direction = queued = {x:1,y:0}; score = 0; ended = false; $('#startup-score').textContent = '0'; newFood(); }
    playing = true; $('#startup-game-pause').textContent = 'Pause'; $('#startup-game-status').textContent = 'Collect the golden squares. Avoid the edges.'; draw(); clearInterval(gameTimer); gameTimer = setInterval(tick, 180);
  }
  function turn(value) {
    const moves = {up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}}, next = moves[value];
    if (playing && next && (next.x !== -direction.x || next.y !== -direction.y)) queued = next;
  }
  $('#startup-play').addEventListener('click', () => {
    const open = $('#startup-game').hidden;
    $('#startup-game').hidden = !open; $('#startup-play').setAttribute('aria-expanded', String(open));
    root.classList.toggle('has-game', open);
    $('#startup-play').textContent = open ? 'Hide game' : 'Play a quick Snake game';
    if (open) { startGame(); $('#startup-game').scrollIntoView({ block: 'nearest' }); } else pause();
  });
  $('#startup-game-pause').addEventListener('click', () => playing ? pause() : startGame());
  root.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('click', () => turn(button.dataset.direction)));
  function keydown(event) { const move = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[event.key]; if (playing && move) { event.preventDefault(); turn(move); } }
  function visibility() { if (document.hidden) { pause(); clearTimeout(timer); } else if (!native && !preview && !completed && !busy && attempts < 12) schedule(0); }
  document.addEventListener('keydown', keydown); document.addEventListener('visibilitychange', visibility);
  window.MartStartup = { ready, phase, complete() {
    completed = true; generation++; clearTimeout(timer); controller?.abort(); pause();
    document.removeEventListener('keydown', keydown); document.removeEventListener('visibilitychange', visibility); root.remove();
  } };
  if (!native && !preview) void probe();
})();
