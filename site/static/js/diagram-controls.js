// Keep diagram text at its readable size and expose contained scrolling.
document.querySelectorAll('.sharing-diagram-scroll').forEach(region => {
  const controls = document.createElement('div');
  controls.className = 'diagram-controls';
  const hint = document.createElement('span');
  hint.textContent = 'Scroll sideways or use the arrow keys to explore.';
  controls.append(hint);
  region.before(controls);
  const update = () => { hint.hidden = region.scrollWidth <= region.clientWidth; };
  new ResizeObserver(update).observe(region);
  update();
});
