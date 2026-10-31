(() => {
  'use strict';
  const base = '/gpu-sharing/results/';
  const experiments = {
    'ts-default': {label: 'Time-slicing Default', path: 'run-02-core/ts-default', claims: ['claim-ts-default.yaml']},
    'ts-short': {label: 'Time-slicing Short', path: 'inference-extension-20261025/inference-ts-short', claims: ['claim-ts-short.yaml']},
    'ts-long': {label: 'Time-slicing Long', path: 'inference-extension-20261025/inference-ts-long', claims: ['claim-ts-long.yaml']},
    mps25: {label: 'MPS 25%', path: 'inference-extension-20261025/inference-mps25', claims: ['claim-mps25.yaml']},
    mps50: {label: 'MPS 50%', path: 'run-02-core/mps50', claims: ['claim-mps50.yaml']},
    mps100: {label: 'MPS 100%', path: 'inference-extension-20261025/inference-mps100', claims: ['claim-mps100.yaml']},
    mig: {label: 'MIG: two 3g.40gb slices', path: 'run-02-core/mig', claims: ['claim-mig-a.yaml', 'claim-mig-b.yaml']},
    solo: {label: 'Model alone', path: 'inference-extension-20261025/inference-solo', claims: ['claim-ts-default.yaml']}
  };
  const dialog = document.createElement('dialog');
  dialog.className = 'yaml-dialog';
  dialog.setAttribute('aria-label', 'Resource YAML');
  dialog.innerHTML = '<p class="yaml-status" role="status"></p><div class="yaml-content"></div>';
  document.body.append(dialog);
  const content = dialog.querySelector('.yaml-content');
  const status = dialog.querySelector('.yaml-status');

  let sequence = 0;
  let opener;
  function changes(before, after) {
    const a = before.trimEnd().split('\n'), b = after.trimEnd().split('\n');
    const lengths = Array.from({length: a.length + 1}, () => new Uint32Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
    const lines = [];
    let i = 0, j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {i++; j++;}
      else if (i < a.length && (j === b.length || lengths[i + 1][j] >= lengths[i][j + 1])) lines.push('- ' + a[i++]);
      else lines.push('+ ' + b[j++]);
    }
    return lines;
  }
  function block(title, lines, diff = false) {
    const pre = content.querySelector('pre') || document.createElement('pre');
    pre.tabIndex = 0;
    const code = pre.querySelector('code') || document.createElement('code');
    if (title && code.childNodes.length) code.append(document.createTextNode('\n'));
    if (title) {
      const comment = document.createElement('span');
      comment.textContent = '# ' + title + '\n';
      comment.style.color = '#536575';
      code.append(comment);
    }
    for (const line of lines) {
      const span = document.createElement('span');
      span.textContent = (diff ? '# ' : '') + line + '\n';
      if (diff) span.style.cssText = line.startsWith('+ ') ? 'display:block;background:#dcfce7;color:#14532d' : 'display:block;background:#fee2e2;color:#7f1d1d';
      code.append(span);
    }
    pre.append(code);
    content.append(pre);
  }
  async function load(key, file, compare = true) {
    const ticket = ++sequence;
    const family = !compare ? [key] : key.startsWith('ts-') ? ['ts-default', 'ts-short', 'ts-long'] : key.startsWith('mps') ? ['mps50', 'mps25', 'mps100'] : [key];
    const filename = k => file === 'claim' ? experiments[k].claims[0] : file;
    const url = k => base + experiments[k].path + '/' + filename(k);
    content.replaceChildren();
    status.textContent = 'Loading…';

    try {
      const texts = await Promise.all(family.map(async k => {
        const response = await fetch(url(k));
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      }));
      if (ticket !== sequence) return;
      block('', texts[0].trimEnd().split('\n'));
      if (!compare) content.querySelector('code').textContent = texts[0];
      for (let i = 1; i < family.length; i++) {
        const diff = changes(texts[0], texts[i]);
        if (diff.length) block(experiments[family[i]].label + ' vs ' + experiments[family[0]].label, diff, true);
      }

      status.textContent = '';
    } catch (error) {
      if (ticket === sequence) status.textContent = 'Could not load YAML (' + error.message + ').';
    }
  }
  function open(key = 'ts-default', file = 'claim', compare = true) {
    opener = document.activeElement;
    load(key, file, compare);
    dialog.showModal();
  }

  dialog.addEventListener('close', () => {sequence++; if (opener) opener.focus();});
  dialog.addEventListener('click', event => {if (event.target === dialog) {const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();}});

  document.querySelectorAll('[data-yaml]').forEach(button => button.addEventListener('click', () => open(button.dataset.yaml, button.dataset.file || 'claim')));
  // Reuse the existing setting names instead of adding a YAML button to every row.
  document.querySelectorAll('#original tbody th').forEach(cell => {
    const match = Object.entries(experiments).find(([, exp]) => exp.label === cell.textContent.trim());
    if (!match) return;
    const button = document.createElement('button');
    button.className = 'yaml-setting';
    button.textContent = match[1].label;
    button.setAttribute('aria-label', 'View YAML: ' + match[1].label);
    button.addEventListener('click', () => open(match[0], 'claim', false));
    cell.replaceChildren(button);
  });
  // Make the existing resource boxes interactive without adding diagram labels.
  const bindings = {
    timeslicing: [[10, 28, 'ts-default', 'model-a.yaml'], [10, 146, 'ts-default', 'model-b.yaml'], [248, 80, 'ts-default', 'claim']],
    mps: [[10, 28, 'mps50', 'model-a.yaml'], [10, 146, 'mps50', 'model-b.yaml'], [248, 80, 'mps50', 'claim']],
    mig: [[10, 40, 'mig', 'model-a.yaml'], [10, 137, 'mig', 'model-b.yaml'], [226, 40, 'mig', 'claim-mig-a.yaml'], [226, 137, 'mig', 'claim-mig-b.yaml']],

  };
  for (const [id, boxes] of Object.entries(bindings)) {
    const svg = document.querySelector('#' + id + ' svg');
    // Original explainer panels use the explicit resource buttons below them.
    if (!svg || svg.closest('.explainer')) continue;
    for (const [x, y, key, file] of boxes) {
      const rect = svg.querySelector('rect[x="' + x + '"][y="' + y + '"]');
      const w = Number(rect.getAttribute('width')), h = Number(rect.getAttribute('height'));
      const texts = [...svg.querySelectorAll('text')].filter(t => Number(t.getAttribute('x')) > x && Number(t.getAttribute('x')) < x + w && Number(t.getAttribute('y')) > y && Number(t.getAttribute('y')) < y + h);
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.classList.add('yaml-node');
      group.setAttribute('role', 'button');
      group.setAttribute('tabindex', '0');
      group.setAttribute('aria-label', 'View YAML: ' + (texts[0]?.textContent || file));
      svg.append(group);
      group.append(rect, ...texts);
      group.addEventListener('click', () => open(key, file));
      group.addEventListener('keydown', event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); open(key, file);}});
    }
  }
})();
