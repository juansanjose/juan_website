(() => {
  const root = document.documentElement;
  let lastFrame, lastTheme;
  const update = () => {
    const frame = document.querySelector('.utterances-frame');
    if (!frame) return;
    const dark = ['red','green','blue','purple','black'].includes(root.dataset.palette);
    const theme = dark ? 'github-dark' : 'github-light';
    if (frame === lastFrame && theme === lastTheme) return;
    lastFrame = frame; lastTheme = theme;
    frame.contentWindow.postMessage({type:'set-theme', theme}, 'https://utteranc.es');
  };
  new MutationObserver(update).observe(root, {attributes:true, attributeFilter:['data-palette']});
  window.addEventListener('message', event => {
    if (event.origin === 'https://utteranc.es' && event.source === document.querySelector('.utterances-frame')?.contentWindow) update();
  });
})();
