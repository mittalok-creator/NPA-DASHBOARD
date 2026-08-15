/* Login screen — ledger page with a handwritten masthead.

   No handwriting font is available, and the app is an offline PWA that
   cannot pull one from a CDN, so each letter below is defined as the actual
   pen strokes a hand would make, on a shared baseline grid (cap height 30,
   x-height 20, ascender 34). They are rendered as SVG paths with round caps
   at a marker-like weight, then animated with stroke-dashoffset so the two
   title lines write themselves in — roughly 2.5s, which is under the time it
   takes to reach for the first digit. */
(function () {
  const CORRECT_PIN = '0000';
  const screen = document.getElementById('splashScreen');
  if (!screen || screen.classList.contains('skip')) return;

  const wrap = document.getElementById('splashPinWrap');
  const errorEl = document.getElementById('splashPinError');
  const cellsEl = document.getElementById('splashPinCells');
  const padEl = document.getElementById('splashPad');
  const sealEl = document.getElementById('splashSeal');
  if (!wrap || !cellsEl || !padEl) return;

  /* ---------------- handwriting ---------------- */
  const GLYPHS = {
    /* uppercase, cap height 30 */
    'N': { w: 23, s: ['M2,0 L3.5,-30 L19,-4 L20.5,-30'] },
    'P': { w: 20, s: ['M3,0 C3.5,-10 4,-20 4.5,-30', 'M4.5,-30 C12,-31.5 18,-28 17.5,-22 C17,-16 10,-14 4.2,-15'] },
    'A': { w: 23, s: ['M1,0 L11,-30 L21,0', 'M5,-9 L17,-9'] },
    'D': { w: 22, s: ['M3,0 C3.5,-10 4,-20 4.5,-30', 'M4.5,-30 C14,-30 20,-24 20,-15 C20,-6 13,-0.5 3.5,0'] },
    'O': { w: 24, s: ['M12,-30 C5,-30 1.5,-23 1.5,-15 C1.5,-6 5.5,0 12,0 C18.5,0 22.5,-6 22.5,-15 C22.5,-23 19,-30 12,-30'] },
    'T': { w: 20, s: ['M1,-30 L19,-30.6', 'M10,-30 C10.3,-20 10.6,-10 10.5,0'] },
    'S': { w: 19, s: ['M16,-26 C13,-30.5 4,-31 3,-25 C2,-19 8,-18 12,-16 C16.5,-14 18,-10 16.5,-5 C14.5,1 5,0.5 2,-4'] },
    'C': { w: 21, s: ['M18,-25 C15,-30.5 8,-31 4,-26 C0.5,-21 0.5,-9 4,-4 C8,1.5 15,0.5 18.5,-4'] },
    /* lowercase, x-height 20 */
    'a': { w: 18, s: ['M14.5,-16 C11,-21 4,-20 2,-14 C0,-8 2,-1 6,-0.5 C10,0 13,-3 14.8,-6', 'M14.5,-20 C14.8,-13 15,-6 15.5,0'] },
    's': { w: 15, s: ['M12.5,-17 C10,-20.5 3.5,-21 2.5,-16.5 C1.5,-12.5 6,-11.5 9,-10 C12,-8.5 13,-5.5 11.5,-2 C9.5,1.5 3,1 1,-2'] },
    'h': { w: 18, s: ['M3,0 C3.3,-11 3.6,-23 4,-34', 'M3.6,-13 C7,-19 12,-21 14.5,-17 C16,-14.5 15.7,-7 16,0'] },
    'b': { w: 18, s: ['M3,0 C3.3,-11 3.6,-23 4,-34', 'M3.6,-14 C7,-20.5 13,-21 15.5,-16 C17.5,-11 16,-2 11,-0.3 C7.5,0.8 4.5,-2 3.5,-5'] },
    'o': { w: 18, s: ['M8.5,-20 C4,-20 1.5,-16 1.5,-10 C1.5,-4 4.5,0 9,0 C13.5,0 16.5,-4 16.5,-10 C16.5,-16 13,-20 8.5,-20'] },
    'r': { w: 13, s: ['M3,0 C3.3,-7 3.6,-13 4,-20', 'M3.8,-13 C6,-18.5 9.5,-21 12.5,-19.5'] },
    'd': { w: 18, s: ['M14.5,-15 C11,-20.5 4,-20 2,-14 C0,-8 2,-1 6,-0.5 C10,0 13,-3 14.8,-6', 'M14.5,-34 C14.8,-23 15,-11 15.5,0'] },
    'l': { w: 10, s: ['M4,-34 C4.3,-23 4.6,-11 5,0'] },
    'c': { w: 16, s: ['M14,-16 C11.5,-20.5 5,-21 2.5,-15.5 C0.5,-10.5 1.5,-3 6,-0.5 C9.5,1 12.5,-1 14.5,-4'] },
    'u': { w: 18, s: ['M2.5,-20 C2.5,-13 2,-6 3.5,-2.5 C5.5,1.5 11,0.5 14,-4', 'M14.5,-20 C14.8,-13 15,-6 15.5,0'] },
    't': { w: 13, s: ['M6,-28 C6.3,-19 6,-9 6.5,-3.5 C7,0.5 10,1 12,-1.5', 'M1.5,-19 L11.5,-19.8'] },
    ' ': { w: 9, s: [] }
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* Lays a word along the baseline. Each letter gets a small vertical nudge
     and rotation from a seeded generator, so the line does not sit perfectly
     on the rule the way a font would. Seeded, not Math.random, so the
     masthead looks identical on every load. */
  function layout(word, seed) {
    let x = 0, rnd = seed || 1;
    const out = [];
    const jitter = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; };
    for (const ch of word) {
      const g = GLYPHS[ch];
      if (!g) { x += 12; continue; }
      const dy = (jitter() - 0.5) * 1.6;
      const rot = (jitter() - 0.5) * 3.2;
      g.s.forEach(d => out.push({ d, tx: x, ty: dy, rot, cx: g.w / 2 }));
      x += g.w + 2;
    }
    return { paths: out, width: x };
  }

  function writeSVG(word, opts) {
    const lay = layout(word, opts.seed);
    const padX = 4, top = -38, bot = 12;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `${-padX} ${top} ${lay.width + padX * 2} ${bot - top}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', word);
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', 'skewX(-4)'); // the lean most people write with
    svg.appendChild(g);
    lay.paths.forEach(p => {
      const el = document.createElementNS(SVG_NS, 'path');
      el.setAttribute('d', p.d);
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', opts.color);
      el.setAttribute('stroke-width', opts.weight);
      el.setAttribute('stroke-linecap', 'round');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('transform', `translate(${p.tx},${p.ty}) rotate(${p.rot},${p.cx},-10)`);
      g.appendChild(el);
    });
    return { svg, paths: g.querySelectorAll('path') };
  }

  /* Draws each stroke in turn. Strokes overlap (the next starts before the
     previous ends) because a hand does not stop between letters -- and
     without the overlap a 21-stroke line takes long enough that the title is
     still being written when someone reaches for the PIN. */
  function animateWrite(paths, startDelay, speed) {
    let t = startDelay;
    paths.forEach(p => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
      p.style.transition = 'none';
      p.getBoundingClientRect(); // flush, so the transition starts from the offset state
      const dur = Math.max(0.07, len / speed);
      p.style.transition = `stroke-dashoffset ${dur}s ease-out ${t}s`;
      p.style.strokeDashoffset = 0;
      t += dur * 0.42;
    });
    return t;
  }

  const INK = '#1A1A1A';   // "NPA Dashboard"
  const INK_2 = '#B02A2A'; // "OTS Calculator", the red of an audit stamp

  const l1 = writeSVG('NPA Dashboard', { color: INK, weight: 3.0, seed: 7 });
  const l2 = writeSVG('OTS Calculator', { color: INK_2, weight: 2.3, seed: 31 });
  document.getElementById('splashTitle1').appendChild(l1.svg);
  document.getElementById('splashTitle2').appendChild(l2.svg);

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    const t = animateWrite(l1.paths, 0.2, 300);
    animateWrite(l2.paths, t + 0.1, 340);
  }

  /* ---------------- PIN ---------------- */
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
    errorEl.textContent = text || ' ';
    errorEl.classList.toggle('ok', !!ok);
  }
  function unlock() {
    locked = true;
    setError('Verified', true);
    if (sealEl) sealEl.classList.add('stamped');
    try { sessionStorage.setItem('upgb-splash-unlocked', '1'); } catch (e) {}
    setTimeout(() => {
      screen.classList.add('unlocked');
      setTimeout(() => { screen.style.display = 'none'; }, 700);
    }, reduceMotion ? 0 : 620);
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
  function push(d) {
    if (locked || value.length >= 4) return;
    setError('');
    value += d;
    paint();
    if (value.length === 4) {
      setTimeout(() => { if (value === CORRECT_PIN) unlock(); else reject(); }, 170);
    }
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

  // A physical keyboard still works -- the on-screen pad exists so a phone
  // does not raise its own keyboard over the sheet, not to replace typing.
  document.addEventListener('keydown', e => {
    if (screen.classList.contains('unlocked') || screen.classList.contains('skip')) return;
    if (e.key >= '0' && e.key <= '9') { e.preventDefault(); push(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); back(); }
  });

  paint();
  setError('');
})();
