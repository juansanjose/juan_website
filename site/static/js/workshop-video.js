// Native playback is opt-in. Never restart after a user or visibility pause.
(() => {
  const videos = [...document.querySelectorAll('.workshop video')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pauseAll = () => videos.forEach(video => video.pause());
  const observer = new IntersectionObserver(entries => {
    entries.forEach(({target, isIntersecting, intersectionRatio}) => {
      if (!isIntersecting || intersectionRatio < 0.1) target.pause();
    });
  }, {threshold: [0, 0.1]});
  videos.forEach(video => {
    observer.observe(video);
    video.addEventListener('play', () => {
      if (reduced.matches || document.hidden) video.pause();
      else videos.forEach(other => { if (other !== video) other.pause(); });
    });
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAll(); });
  reduced.addEventListener('change', () => { if (reduced.matches) pauseAll(); });
})();
