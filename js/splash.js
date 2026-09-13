/* Login screen — split access panel (branded hero + PIN entry). */
(function () {
  const CORRECT_PIN = '9269';
  // Temporary PIN for 3-4 days' guest access (Alok's request, 2026-09-10):
  // works only up to and including 13-09-2026 (local time), then silently
  // stops validating -- no code change or redeploy needed to revoke it.
  const TEMP_PIN = '0000';
  const TEMP_PIN_EXPIRES = new Date('2026-09-14T00:00:00');
  function isValidPin(v) {
    if (v === CORRECT_PIN) return true;
    if (v === TEMP_PIN && new Date() < TEMP_PIN_EXPIRES) return true;
    return false;
  }
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
    if (isValidPin(value)) unlock(); else reject();
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

  // The whole splash writes itself in once, the first time it actually
  // shows (the early return above already skips all of this on a
  // session that's unlocked and hiding the screen entirely): org name,
  // title and subtitle in the hero, then "Designed and developed by" and
  // Alok's own signature below the login button -- one continuous
  // sequence, top to bottom, in DOM order. Each .splash-wipe segment's
  // clip-path is animated left-to-right, its duration scaled to how much
  // it actually holds (a longer line takes proportionally longer to
  // "write" than a short one), with a small dot riding the reveal edge.
  (function playCredit() {
    const segs = Array.from(document.querySelectorAll('.splash-wipe')).map(wipeEl => {
      const box = wipeEl.closest('.splash-linewrap, .splash-credit-sigwrap');
      const tipEl = box ? box.querySelector('.splash-pen-tip') : null;
      const chars = wipeEl.textContent ? wipeEl.textContent.length : 22; // the signature has no text of its own
      const duration = Math.max(600, chars * 32);
      return { wipeEl, tipEl, duration };
    });
    if (reduceMotion) {
      segs.forEach(seg => seg.wipeEl.classList.add('play'));
      return;
    }
    let t = 260; // small delay so it starts just after the splash itself has appeared
    segs.forEach(seg => {
      seg.wipeEl.style.animationDuration = seg.duration + 'ms';
      if (seg.tipEl) seg.tipEl.style.animationDuration = seg.duration + 'ms';
      setTimeout(() => {
        seg.wipeEl.classList.add('play');
        if (seg.tipEl) seg.tipEl.classList.add('play');
      }, t);
      t += seg.duration + 160;
    });
  })();
})();
