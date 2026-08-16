/* Login screen — split access panel (branded hero + PIN entry). */
(function () {
  const CORRECT_PIN = '0000';
  const screen = document.getElementById('splashScreen');
  if (!screen || screen.classList.contains('skip')) return;

  const wrap = document.getElementById('splashPinWrap');
  const errorEl = document.getElementById('splashPinError');
  const cellsEl = document.getElementById('splashPinCells');
  const padEl = document.getElementById('splashPad');
  const loginBtn = document.getElementById('splashLoginBtn');
  if (!wrap || !cellsEl || !padEl) return;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const cells = Array.from(cellsEl.querySelectorAll('.splash-cell'));
  let value = '';
  let locked = false; // true while a wrong PIN is shaking, or after unlock

  function paint() {
    cells.forEach((c, i) => {
      c.textContent = value[i] ? '•' : '';
      c.classList.toggle('filled', !!value[i]);
    });
  }
  function setError(text, ok) {
    errorEl.textContent = text || ' ';
    errorEl.classList.toggle('ok', !!ok);
  }
  function unlock() {
    locked = true;
    setError('Verified', true);
    try { sessionStorage.setItem('upgb-splash-unlocked', '1'); } catch (e) {}
    setTimeout(() => {
      screen.classList.add('unlocked');
      setTimeout(() => { screen.style.display = 'none'; }, 700);
    }, reduceMotion ? 0 : 350);
  }
  function reject() {
    locked = true;
    setError('Incorrect PIN — try again');
    wrap.classList.add('shake');
    setTimeout(() => {
      wrap.classList.remove('shake');
      value = ''; paint(); locked = false;
    }, 420);
  }
  function shakeIncomplete() {
    wrap.classList.add('shake');
    setTimeout(() => wrap.classList.remove('shake'), 420);
  }
  function submit() {
    if (locked || value.length !== 4) { shakeIncomplete(); return; }
    if (value === CORRECT_PIN) unlock(); else reject();
  }
  function push(d) {
    if (locked || value.length >= 4) return;
    setError('');
    value += d;
    paint();
    if (value.length === 4) setTimeout(submit, 170);
  }
  function back() {
    if (locked) return;
    setError('');
    value = value.slice(0, -1);
    paint();
  }

  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach(k => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'splash-key' + (k === '⌫' || k === '' ? ' ghost' : '');
    b.textContent = k;
    if (k === '') { b.disabled = true; b.style.visibility = 'hidden'; }
    b.setAttribute('aria-label', k === '⌫' ? 'Delete last digit' : k);
    b.addEventListener('click', () => { k === '⌫' ? back() : push(k); });
    padEl.appendChild(b);
  });

  if (loginBtn) loginBtn.addEventListener('click', submit);

  // A physical keyboard still works -- the on-screen pad exists so a phone
  // does not raise its own keyboard over the sheet, not to replace typing.
  document.addEventListener('keydown', e => {
    if (screen.classList.contains('unlocked') || screen.classList.contains('skip')) return;
    if (e.key >= '0' && e.key <= '9') { e.preventDefault(); push(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); back(); }
    else if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  paint();
  setError('');
})();
