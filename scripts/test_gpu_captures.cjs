const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const output = {textContent: ''};
const inlineCode = {textContent: 'nvidia-smi'};
const pre = {scrollLeft: 100};
const status = {textContent: ''};
const controls = {
  children: [],
  append(button) { this.children.push(button); },
  get firstElementChild() { return this.children[0]; },
};
const root = {querySelector(selector) {
  return {'.gpu-modes': controls, 'code': inlineCode, 'pre code': output, 'pre': pre, '[role=status]': status}[selector] || null;
}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../site/static/js/gpu-captures-bundled.js'), 'utf8'), {
  document: {
    querySelector: () => root,
    createElement: () => ({
      attrs: {},
      setAttribute(key, value) { this.attrs[key] = value; },
      addEventListener(_, handler) { this.click = handler; },
    }),
  },
});
assert.equal(controls.children.length, 8);
for (const button of controls.children) {
  pre.scrollLeft = 100;
  button.click();
  assert.match(output.textContent, /NVIDIA-SMI/);
  assert.equal(inlineCode.textContent, 'nvidia-smi', 'Capture controls must leave introductory inline code alone');
  assert.equal(pre.scrollLeft, 0);
  assert.equal(controls.children.filter(b => b.attrs['aria-pressed'] === 'true').length, 1);
  assert.equal(button.attrs['aria-pressed'], 'true');
}
console.log('All eight SMI captures render in the output block, preserving inline code and selection state.');
