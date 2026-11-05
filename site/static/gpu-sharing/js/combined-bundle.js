// Plotly basic 4.1.1 includes the scatter traces used here; data stays separate.
(async () => {
  const chart = document.getElementById('combined-chart');
  const status = document.getElementById('chart-status');
  try {
    const response = await fetch('/gpu-sharing/js/chart-data.json');
    if (!response.ok) throw new Error('Chart data unavailable');
    const {traces, layout, config} = await response.json();
    const parentRoot = window.frameElement ? parent.document.documentElement : document.documentElement;
    const originals = traces.map(t => t.line.color);
    const darkColors = ['#ffb86c','#8be9fd','#ff79c6','#bd93f9','#50fa7b','#f1fa8c','#c6caff','#ffffff'];
    const theme = () => {
      const palette = parentRoot.dataset.palette || 'white';
      const dark = ['red','green','blue','purple','black'].includes(palette);
      const styles = getComputedStyle(parentRoot);
      const bg = styles.getPropertyValue('--article-bg').trim() || '#fff';
      const fg = styles.getPropertyValue('--fg').trim() || '#202020';
      const surface = dark ? 'color-mix(in srgb, ' + bg + ' 40%, #111)' : bg;
      document.body.style.background = surface;
      document.body.style.color = fg;
      // Resolve CSS colors before passing them to Plotly's color parser.
      const resolved = getComputedStyle(document.body).backgroundColor;
      const colors = dark ? darkColors : originals;
      return {dark, fg, resolved, colors};
    };
    const applyTheme = async () => {
      const {dark, fg, resolved, colors} = theme();
      const grid = dark ? '#64748b' : '#cbd5e1';
      await Plotly.relayout(chart, {paper_bgcolor: resolved, plot_bgcolor: resolved,
        'font.color': fg, 'legend.font.color': fg,
        'xaxis.gridcolor': grid, 'yaxis.gridcolor': grid,
        'xaxis.zerolinecolor': grid, 'yaxis.zerolinecolor': grid});
      await Plotly.restyle(chart, {'line.color': colors, 'marker.color': colors, 'textfont.color': colors});
    };
    await Plotly.newPlot(chart, traces, layout, config);
    await applyTheme();
    new MutationObserver(applyTheme).observe(parentRoot, {attributes:true, attributeFilter:['data-palette']});
    const boxes = [...document.querySelectorAll('input[data-group]')];
    for (const box of boxes) box.addEventListener('change', () => {
      const indices = chart.data.flatMap((t,i) => t.meta.group === box.dataset.group ? [i] : []);
      Plotly.restyle(chart, {visible:box.checked ? true : 'legendonly'}, indices);
    });
    chart.on('plotly_restyle', () => {
      for (const box of boxes) {
        const traces = chart.data.filter(t => t.meta.group === box.dataset.group);
        const visible = traces.filter(t => t.visible !== false && t.visible !== 'legendonly').length;
        box.checked = visible > 0;
        box.indeterminate = visible > 0 && visible < traces.length;
      }
    });
    status.textContent = 'Scroll sideways or use the arrow keys to see the whole chart. Toggle series above; hover or tap points for values.';
  } catch (error) {
    status.textContent = 'The chart could not load. The results table in the article is still available.';
  }
})();
