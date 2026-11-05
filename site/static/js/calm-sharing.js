// The animation can be paused independently of the system motion preference.
document.querySelectorAll('svg.ts-diagram').forEach(svg => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const button = document.createElement('button');
  button.type = 'button';
  const controls = document.createElement('div');
  controls.className = 'diagram-controls';
  controls.append(button);
  svg.closest('.sharing-diagram-scroll').after(controls);
  let timer;
  let paused = reduced.matches;
  const update = () => {
    clearInterval(timer);
    button.textContent = paused ? 'Play animation' : 'Pause animation';
    if (!paused) timer = setInterval(() => svg.classList.toggle('b-active'), 4500);
  };
  button.addEventListener('click', () => { paused = !paused; update(); });
  reduced.addEventListener('change', () => { paused = reduced.matches; update(); });
  update();
});
