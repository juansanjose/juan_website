(function () {
  'use strict';

  var root = document.documentElement;
  var paletteToggle = document.querySelector('.palette-toggle');
  var paletteMenu = document.querySelector('.palette-menu');
  var paletteSwatches = Array.prototype.slice.call(document.querySelectorAll('.palette-swatch'));
  var soundToggle = document.querySelector('.sound-toggle');
  var roach = document.querySelector('.blue-roach');
  var song = document.querySelector('.blue-song');

  var palettes = {
    white:  { bg: '#ffffff', button: '#ff5a00', buttonHover: '#ff7a2e', buttonText: '#111111', mascot: 'none' },
    red:    { bg: '#c62828', button: '#28c6c6', buttonHover: '#5adede', buttonText: '#111111', mascot: 'hue-rotate(-32deg) saturate(1.35)' },
    orange: { bg: '#ef6c00', button: '#0067cc', buttonHover: '#2788e8', buttonText: '#ffffff', mascot: 'none' },
    yellow: { bg: '#f7d038', button: '#4930c7', buttonHover: '#6650de', buttonText: '#ffffff', mascot: 'hue-rotate(24deg) saturate(1.1) brightness(1.08)' },
    green:  { bg: '#16823b', button: '#d735a8', buttonHover: '#eb62c4', buttonText: '#ffffff', mascot: 'hue-rotate(108deg) saturate(1.3) brightness(0.82)' },
    blue:   { bg: '#003cff', button: '#ff6800', buttonHover: '#ff8b3d', buttonText: '#111111', mascot: 'hue-rotate(194deg) saturate(1.45) brightness(0.88)' },
    purple: { bg: '#6b35a8', button: '#8dcc35', buttonHover: '#a8df5e', buttonText: '#111111', mascot: 'hue-rotate(244deg) saturate(1.25) brightness(0.86)' },
    black:  { bg: '#111111', button: '#ff5a00', buttonHover: '#ff7a2e', buttonText: '#111111', mascot: 'grayscale(1) brightness(0.42) contrast(1.35)' }
  };

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function mix(rgb, target, amount) {
    function channel(value, targetValue) {
      return Math.round(value + (targetValue - value) * amount);
    }

    return 'rgb(' +
      channel(rgb.r, target.r) + ' ' +
      channel(rgb.g, target.g) + ' ' +
      channel(rgb.b, target.b) + ')';
  }

  function updateSoundToggle() {
    var playing = !song.paused && !song.ended;
    soundToggle.textContent = playing ? '■ MUTE' : '⚠ SOUND';
    soundToggle.classList.toggle('is-playing', playing);
    soundToggle.title = playing ? 'Mute the Blue song' : 'Alert: click to play the full Blue song';
    soundToggle.setAttribute('aria-label', soundToggle.title);
  }

  function hideRoach() {
    roach.hidden = true;
    roach.pause();
    roach.currentTime = 0;
  }

  function stopAll() {
    hideRoach();
    song.pause();
    song.currentTime = 0;
    updateSoundToggle();
  }

  function showRoach() {
    roach.hidden = false;
    roach.play().catch(function () {});
  }

  function setMenuOpen(open) {
    paletteMenu.hidden = !open;
    paletteToggle.setAttribute('aria-expanded', String(open));
  }

  function applyPalette(name, persist) {
    var palette = palettes[name] || palettes.white;
    var rgb = hexToRgb(palette.bg);
    var blue = name === 'blue';
    var dark = name === 'red' || name === 'orange' || name === 'green' || name === 'blue' || name === 'purple' || name === 'black';
    var priorBlue = root.getAttribute('data-theme') === 'dark';

    root.setAttribute('data-theme', blue ? 'dark' : 'light');
    root.style.setProperty('--bg', palette.bg);
    root.style.setProperty('--bg-shade', mix(rgb, dark ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }, 0.12));
    root.style.setProperty('--fg', dark ? '#f5f7fa' : '#202020');
    root.style.setProperty('--muted', dark ? '#d2d7df' : '#555555');
    root.style.setProperty('--link', dark ? '#ffffff' : '#0000cc');
    root.style.setProperty('--link-hover', dark ? '#fff0b8' : '#000066');
    root.style.setProperty('--border', mix(rgb, dark ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }, 0.35));
    root.style.setProperty('--accent', palette.button);
    root.style.setProperty('--button-face', palette.button);
    root.style.setProperty('--button-hover', palette.buttonHover);
    root.style.setProperty('--button-text', palette.buttonText);
    root.style.setProperty('--mascot-filter', palette.mascot);

    paletteSwatches.forEach(function (swatch) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.palette === name));
    });

    if (priorBlue && !blue) stopAll();

    if (persist) {
      try {
        window.localStorage.setItem('paletteName', name);
        window.localStorage.removeItem('paletteColor');
        window.localStorage.removeItem('theme');
      } catch (error) {
        // The palette still works when storage is blocked.
      }
    }
  }

  paletteToggle.addEventListener('click', function () {
    setMenuOpen(paletteMenu.hidden);
  });

  paletteSwatches.forEach(function (swatch) {
    swatch.addEventListener('click', function () {
      applyPalette(swatch.dataset.palette, true);
      setMenuOpen(false);
      paletteToggle.focus();
    });
  });

  document.addEventListener('click', function (event) {
    if (!paletteMenu.hidden && !event.target.closest('.site-brand')) setMenuOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      setMenuOpen(false);
      paletteToggle.focus();
    }
  });

  soundToggle.addEventListener('click', function () {
    if (!song.paused && !song.ended) {
      stopAll();
      return;
    }

    song.currentTime = 0;
    showRoach();
    song.play().then(updateSoundToggle).catch(function () {
      hideRoach();
      updateSoundToggle();
    });
  });

  song.addEventListener('ended', function () {
    hideRoach();
    updateSoundToggle();
  });

  try {
    var savedPalette = window.localStorage.getItem('paletteName');
    if (!savedPalette && window.localStorage.getItem('theme') === 'dark') savedPalette = 'blue';
    applyPalette(savedPalette || 'white', false);
  } catch (error) {
    applyPalette('white', false);
  }

  setMenuOpen(false);
  updateSoundToggle();
})();
