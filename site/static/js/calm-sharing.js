// Time-slicing animation: A and B alternate on the shared compute box.
// A is active by default; the box is pink. Toggling .b-active makes B active
// and the box turns green. A reload button in the top-right restarts the cycle.
document.querySelectorAll('svg.ts-diagram').forEach(svg => {
  const wrap = svg.closest('.workshop-media');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ts-reload';
  btn.setAttribute('aria-label', 'Restart time-slicing animation');
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>';
  wrap.appendChild(btn);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let timer;

  const start = () => {
    clearInterval(timer);
    svg.classList.remove('b-active');
    if (!reduced.matches) {
      timer = setInterval(() => svg.classList.toggle('b-active'), 4500);
    }
  };

  btn.addEventListener('click', start);
  btn.disabled = reduced.matches;
  reduced.addEventListener('change', () => { btn.disabled = reduced.matches; start(); });
  start();
});
