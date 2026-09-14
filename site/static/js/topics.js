(() => {
  const input = document.querySelector('#resource-search');
  if (!input) return;
  document.querySelector('.library-search').hidden = false;
  const sections = [...document.querySelectorAll('.topic-section')];
  const entries = sections.map(section => ({
    section,
    rows: [...section.querySelectorAll('li')].map(row => ({
      row,
      text: `${section.querySelector('summary').textContent} ${row.textContent}`.toLowerCase()
    }))
  }));
  sections.forEach(section => { section.open = false; });
  const revealHash = () => {
    const target = document.getElementById(location.hash.slice(1));
    if (target?.classList.contains('topic-section')) {
      if (input.value) { input.value = ''; filter(); }
      target.open = true;
      target.scrollIntoView({ block: 'start' });
    }
  };
  function filter() {
    const terms = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let total = 0;
    entries.forEach(({ section, rows }) => {
      let count = 0;
      rows.forEach(({ row, text }) => {
        row.hidden = !terms.every(term => text.includes(term));
        if (!row.hidden) count++;
      });
      section.hidden = count === 0;
      section.open = terms.length > 0;
      section.querySelector('.topic-count').textContent = count;
      total += count;
    });
    document.querySelectorAll('.library-group').forEach(group => {
      group.hidden = [...group.querySelectorAll('.topic-section')].every(section => section.hidden);
    });
    document.querySelector('#search-status').textContent = total ? `${total} resources` : 'No matching resources. Try another search.';
  }
  input.addEventListener('input', filter);
  window.addEventListener('hashchange', revealHash);
  document.querySelectorAll('.topic-map a').forEach(link => link.addEventListener('click', () => {
    if (link.hash === location.hash) revealHash();
  }));
  revealHash();
})();
