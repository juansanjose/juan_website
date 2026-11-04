/* VS Code Dark-style syntax highlighting for the claim YAML blocks. */
(function () {
  'use strict';

  function esc(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var KNOWN = [
    'apiVersion','kind','metadata','spec','config','devices','requests','opaque',
    'parameters','driver','sharing','mpsConfig','timeSlicingConfig','strategy',
    'interval','replicas','name','namespace','image','resources','claims','containers',
    'resourceClaims','resourceClaimName','resourceClaimTemplateName','deviceClassName',
    'selectors','cel','expression','defaultActiveThreadPercentage',
    'defaultPinnedDeviceMemoryLimit','renameByDefault','failRequestsGreaterThanOne',
    'version'
  ];

  function highlightLine(ln) {
    var raw = ln;
    var trailing = '';

    // Whole-line comment.
    if (/^\s*#/.test(raw)) {
      return '<span class="y-comment">' + esc(raw) + '</span>';
    }

    // Trailing comment: only split off the # when it is not inside quotes.
    var m = raw.match(/^(\s*)(.*?)(\s+#.*)$/);
    if (m && (m[2].match(/"/g) || []).length % 2 === 0 && m[2].indexOf("'") === -1) {
      raw = m[1] + m[2];
      trailing = '<span class="y-comment">' + esc(m[3]) + '</span>';
    }

    var out = '';
    var i = 0;
    var re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|<[^>]+>|[-\w.]+(?=\s*:)|\s-|\s?:\s?)/g;
    var r;
    while ((r = re.exec(raw))) {
      out += esc(raw.slice(i, r.index));
      var tok = r[0];

      if (/^["']/.test(tok) || /^</.test(tok)) {
        out += '<span class="y-str">' + esc(tok) + '</span>';
      } else if (/^\s-$/.test(tok)) {
        out += ' <span class="y-punct">-</span>';
      } else if (tok === ':' || /^\s?:\s?$/.test(tok)) {
        out += esc(tok).replace(':', '<span class="y-punct">:</span>');
      } else {
        // A key (word followed by a colon) or a bare token.
        out += '<span class="y-key">' + esc(tok) + '</span>';
      }
      i = re.lastIndex;
    }
    out += esc(raw.slice(i));

    // Color bare scalar values (numbers, booleans, and dotted values like
    // nvidia.nvidia.com / 3g.40gb) that sit between a colon/space and end-of-line
    // or the next tagged token, without touching already-tagged spans.
    out = out.replace(/(>)([^<>\n]+?)(<span|\n|$)/g, function (m0, open, val, close) {
      if (val.trim() === '') return m0;
      var v = val.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      if (/^(true|false)$/.test(v.trim()) || /^\d+(\.\d+)?$/.test(v.trim())) {
        return open + '<span class="y-num">' + val + '</span>' + close;
      }
      if (/^[\d.\w-]+$/.test(v.trim()) && !/\s/.test(v.trim())) {
        return open + '<span class="y-val">' + val + '</span>' + close;
      }
      return m0;
    });
    // Recolor known keys for a touch of variety.
    var kr = new RegExp('<span class="y-key">(' + KNOWN.join('|') + ')</span>', 'g');
    out = out.replace(kr, '<span class="y-known">$1</span>');

    return out + trailing;
  }

  document.querySelectorAll('pre.claim code').forEach(function (el) {
    el.innerHTML = el.textContent.split('\n').map(highlightLine).join('\n');
  });
})();
