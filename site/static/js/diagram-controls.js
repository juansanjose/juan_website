// Keep diagram text at its readable size; expose scrolling and a larger view.
document.querySelectorAll('.sharing-diagram-scroll').forEach(region => {
  const controls = document.createElement('div');
  controls.className = 'diagram-controls';
  const hint = document.createElement('span');
  hint.textContent = 'Scroll sideways or use the arrow keys to explore.';
  controls.append(hint);
  const link = region.querySelector('a');
  if (link) {
    const full = document.createElement('a');
    full.href = link.href;
    full.textContent = 'Open full diagram';
    controls.append(full);
  }
  region.before(controls);
  const update = () => { hint.hidden = region.scrollWidth <= region.clientWidth; };
  new ResizeObserver(update).observe(region);
  update();
});
