// Time-slicing animation: A and B alternate on the shared compute box.
// A is active by default; the box is pink. The cycle repeats automatically.
document.querySelectorAll('svg.ts-diagram').forEach(svg => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let timer;

  const start = () => {
    clearInterval(timer);
    svg.classList.remove('b-active');
    if (!reduced.matches) {
      timer = setInterval(() => svg.classList.toggle('b-active'), 4500);
    }
  };

  reduced.addEventListener('change', start);
  start();
});
