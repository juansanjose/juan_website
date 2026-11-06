// Time-slicing runs automatically, respecting the system motion preference.
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
