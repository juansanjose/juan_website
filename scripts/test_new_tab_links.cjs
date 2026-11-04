const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cases = [
  ['https://example.com/reference#section', true],
  ['http://example.com/', true],
  ['/blog/', true],
  ['#source-1', false],
  ['mailto:hello@example.com', false],
  ['tel:+123456789', false],
];
const links = cases.map(([href]) => ({
  protocol: new URL(href, 'https://jsanjosep.com/blog/').protocol,
  getAttribute: () => href,
  target: '',
  relList: {values: new Set(['author']), add(...values) {values.forEach(value => this.values.add(value));}},
}));
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../site/static/js/new-tab-links.js'), 'utf8'), {
  document: {querySelectorAll: () => links},
});
links.forEach((link, i) => {
  assert.equal(link.target, cases[i][1] ? '_blank' : '', cases[i][0]);
  assert.ok(link.relList.values.has('author'));
  assert.equal(link.relList.values.has('noopener'), cases[i][1]);
  assert.equal(link.relList.values.has('noreferrer'), cases[i][1]);
});
console.log('Page links open new tabs; fragments and non-web protocols are preserved.');
