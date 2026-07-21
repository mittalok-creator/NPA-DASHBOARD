(function () {
  const CORRECT_PIN = '0000';
  const screen = document.getElementById('splashScreen');
  const wrap = document.getElementById('splashPinWrap');
  const errorEl = document.getElementById('splashPinError');
  if (!screen || screen.classList.contains('skip')) return;
  const boxes = Array.from(document.querySelectorAll('.pin-box'));
  if (!boxes.length) return;

  function currentValue() {
    return boxes.map(b => b.value).join('');
  }
  function clearBoxes() {
    boxes.forEach(b => { b.value = ''; });
    boxes[0].focus();
  }
  function unlock() {
    try { sessionStorage.setItem('upgb-splash-unlocked', '1'); } catch (e) {}
    screen.classList.add('unlocked');
    setTimeout(() => { screen.style.display = 'none'; }, 700);
  }
  function reject() {
    errorEl.textContent = 'Incorrect PIN — try again';
    wrap.classList.add('shake');
    setTimeout(() => { wrap.classList.remove('shake'); clearBoxes(); }, 400);
  }
  function checkComplete() {
    if (currentValue().length !== 4) return;
    if (currentValue() === CORRECT_PIN) unlock();
    else reject();
  }

  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(0, 1);
      errorEl.textContent = '';
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      checkComplete();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus();
    });
    box.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 4);
      if (!text) return;
      e.preventDefault();
      text.split('').forEach((ch, idx) => { if (boxes[idx]) boxes[idx].value = ch; });
      boxes[Math.min(text.length, boxes.length) - 1].focus();
      checkComplete();
    });
  });

  setTimeout(() => { if (boxes[0]) boxes[0].focus(); }, 2400);
})();
