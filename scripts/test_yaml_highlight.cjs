const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const decode = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const article = fs.readFileSync(path.join(root, 'site/content/blog/gpu-sharing-on-one-h100.md'), 'utf8');
const examples = [...article.matchAll(/<pre class="claim"[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(match => decode(match[1]));
assert.equal(examples.length, 5, 'All five article YAML examples must be tested');
examples.push('key : value\n  - name: gpu # comment\nquoted: "a: b"\nimage: <your-image>\nlimit: 50\nenabled: true');
const elements = examples.map(textContent => ({textContent, innerHTML: ''}));
vm.runInNewContext(fs.readFileSync(path.join(root, 'site/static/js/yaml-highlight.js'), 'utf8'), {
  document: {querySelectorAll: () => elements},
});
for (const element of elements) {
  const rendered = decode(element.innerHTML.replace(/<\/?span\b[^>]*>/g, ''));
  assert.equal(rendered, element.textContent, 'Highlighting must preserve every character of copyable YAML');
  assert.match(element.innerHTML, /class="y-punct"/, 'Syntax highlighting remains active');
}
console.log(`YAML highlighting preserves whitespace in ${elements.length} examples.`);
