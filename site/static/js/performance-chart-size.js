// Fit the embed to its content, including wrapped controls on narrow screens.
if (window.frameElement) {
  const fit = () => {
    window.frameElement.style.height = Math.ceil(document.body.getBoundingClientRect().height) + 'px';
  };
  new ResizeObserver(fit).observe(document.body);
  fit();
}
