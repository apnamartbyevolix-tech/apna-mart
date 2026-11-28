(() => {
  if (window.MartStartup) return;
  const native = document.documentElement.dataset.nativeStartup === 'true';
  const preview = document.documentElement.dataset.startupPreview === 'true';
  const root = document.createElement('section');
  root.id = 'mart-startup';
  root.className = 'is-intro';
  root.setAttribute('aria-label', 'Opening Apna Mart');
  root.innerHTML = `<div class="startup-card">
    <div class="startup-brand"><img width="44" height="44" alt="">Apna Mart</div>
    <h1 id="startup-title">Your neighbourhood is waking up</h1>
    <p id="startup-message" role="status" aria-live="polite">Getting things ready for you.</p>
    <p class="startup-note">We’ll open the app as soon as the server is ready.</p>
    <button id="startup-retry" hidden>Try again</button><br>
    <div id="startup-game" hidden><div class="startup-game-top"><strong>Neighbourhood Snake</strong><button id="startup-game-pause">Start</button></div>
      <canvas width="288" height="288" tabindex="0" aria-label="Snake board. Swipe or drag to steer. Arrow keys also work."></canvas>
      <p id="startup-game-status" role="status">Swipe on the board to start. Collect the golden squares.</p>
      <p class="startup-note">Score: <strong id="startup-score">0</strong> · The app opens automatically when ready.</p>
    </div></div>`;
  document.body.append(root);
  root.querySelector('.startup-brand img').src = window.MART_STARTUP_LOGO || '/brand/apna-mart-icon-192.png';
  const $ = selector => root.querySelector(selector);
  let timer, attempts = 0, generation = 0, busy = false, completed = false, resolveReady;
  let controller;
  const introTimer = setTimeout(() => {
    if (completed) return;
    root.className = 'has-game';
    $('#startup-game').hidden = false;
  }, 3000);
  const ready = new Promise(resolve => { resolveReady = resolve; });
  function phase(state, message) {
    if (completed) return;
    $('#startup-message').textContent = message;
    $('#startup-title').textContent = state === 'error' ? 'We’re taking a little longer' : state === 'opening' ? 'Your market is ready' : 'Your neighbourhood is waking up';
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
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = 288 * pixelRatio;
  context.scale(pixelRatio, pixelRatio);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = 180;
  let snake = [], previous = [], food, direction, queued, frame, last = 0, elapsed = 0, score = 0, playing = false, ended = false, started = false, pointer;
  function draw(alpha = 1) {
    context.clearRect(0, 0, 288, 288);
    if (food) { context.fillStyle = '#f4b544'; context.fillRect(food.x * cell + 2, food.y * cell + 2, cell - 4, cell - 4); }
    snake.forEach((part, index) => {
      const from = previous[index] || part;
      const x = from.x + (part.x - from.x) * alpha, y = from.y + (part.y - from.y) * alpha;
      context.fillStyle = index ? '#367467' : '#123d36';
      context.beginPath(); context.roundRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2, 4); context.fill();
    });
  }
  function newFood() {
    const free = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!snake.some(p => p.x === x && p.y === y)) free.push({ x, y });
    food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }
  function pause() {
    playing = false; cancelAnimationFrame(frame); last = 0;
    $('#startup-game-pause').textContent = ended ? 'Play again' : 'Resume';
    draw();
  }
  function tick() {
    if (queued) direction = queued;
    queued = null;
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
    const eats = head.x === food.x && head.y === food.y, body = eats ? snake : snake.slice(0, -1);
    if (head.x < 0 || head.y < 0 || head.x >= size || head.y >= size || body.some(p => p.x === head.x && p.y === head.y)) {
      ended = true; pause(); $('#startup-game-status').textContent = 'Nice try! Tap Play again for another round.'; return;
    }
    previous = snake.map(p => ({...p})); snake.unshift(head);
    if (eats) { score++; $('#startup-score').textContent = String(score); newFood(); } else snake.pop();
    if (!food) { ended = true; pause(); $('#startup-game-status').textContent = 'You filled the neighbourhood!'; }
  }
  function animate(now) {
    if (!playing || completed || document.hidden) return;
    const delta = last ? Math.min(step, now - last) : 0; last = now;
    elapsed += delta;
    if (elapsed >= step) { elapsed %= step; tick(); }
    draw(reducedMotion ? 1 : elapsed / step);
    if (playing) frame = requestAnimationFrame(animate);
  }
  function reset(next = {x:1,y:0}) {
    direction = next; queued = null;
    snake = [0,1,2].map(offset => ({x:7-offset*next.x,y:8-offset*next.y}));
    previous = snake.map(p => ({...p})); score = 0; ended = false; elapsed = 0;
    $('#startup-score').textContent = '0'; newFood(); draw();
  }
  function startGame() {
    if (playing || completed || document.hidden) return;
    if (ended) reset();
    started = true; playing = true; last = 0; elapsed = 0;
    $('#startup-game-pause').textContent = 'Pause';
    $('#startup-game-status').textContent = 'Collect the golden squares. Avoid the edges.';
    tick(); frame = requestAnimationFrame(animate);
  }
  function turn(value) {
    const moves = {up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}}, next = moves[value];
    if (!next || $('#startup-game').hidden) return;
    if (!started || ended) { reset(next); startGame(); return; }
    if (!playing) startGame();
    if (next.x === direction.x && next.y === direction.y) return;
    if (!queued && (next.x !== -direction.x || next.y !== -direction.y)) queued = next;
  }
  canvas.addEventListener('pointerdown', event => {
    pointer = {id:event.pointerId,x:event.clientX,y:event.clientY};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX-pointer.x, dy = event.clientY-pointer.y;
    if (Math.max(Math.abs(dx),Math.abs(dy)) < 14) return;
    turn(Math.abs(dx)>Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up'));
    pointer = {id:event.pointerId,x:event.clientX,y:event.clientY};
  });
  const releasePointer = () => { pointer = undefined; };
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  reset();
  $('#startup-game-pause').addEventListener('click', () => playing ? pause() : startGame());
  function keydown(event) { const move = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[event.key]; if (move) { event.preventDefault(); turn(move); } }
  function visibility() { if (document.hidden) { pause(); clearTimeout(timer); } else if (!native && !preview && !completed && !busy && attempts < 12) schedule(0); }
  document.addEventListener('keydown', keydown); document.addEventListener('visibilitychange', visibility);
  window.MartStartup = { ready, phase, complete() {
    completed = true; generation++; clearTimeout(timer); clearTimeout(introTimer); controller?.abort(); pause();
    document.removeEventListener('keydown', keydown); document.removeEventListener('visibilitychange', visibility); root.remove();
  } };
  if (!native && !preview) void probe();
})();
