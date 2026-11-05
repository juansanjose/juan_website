// Keep internal navigation in this tab; open external web links separately.
document.querySelectorAll('a[href]').forEach(link => {
  if (link.getAttribute('href').startsWith('#') || !['http:', 'https:'].includes(link.protocol) || link.origin === window.location.origin) return;
  link.target = '_blank';
  link.relList.add('noopener', 'noreferrer');
});
