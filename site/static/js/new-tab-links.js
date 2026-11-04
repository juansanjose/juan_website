// Keep contents and citation jumps in place; open page links in a new tab.
document.querySelectorAll('a[href]').forEach(link => {
  if (link.getAttribute('href').startsWith('#') || !['http:', 'https:'].includes(link.protocol)) return;
  link.target = '_blank';
  link.relList.add('noopener', 'noreferrer');
});
