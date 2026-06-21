(function () {
  'use strict';

  var root = document.documentElement;
  var paletteToggle = document.querySelector('.palette-toggle');
  var palettePicker = document.querySelector('.palette-picker');
  var soundToggle = document.querySelector('.sound-toggle');
  var roach = document.querySelector('.blue-roach');
  var song = document.querySelector('.blue-song');

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function rgbToHsl(rgb) {
    var r = rgb.r / 255;
    var g = rgb.g / 255;
    var b = rgb.b / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var delta = max - min;
    var hue = 0;

    if (delta) {
      if (max === r) hue = ((g - b) / delta) % 6;
      if (max === g) hue = (b - r) / delta + 2;
      if (max === b) hue = (r - g) / delta + 4;
      hue = Math.round(hue * 60);
      if (hue < 0) hue += 360;
    }

    return {
      h: hue,
      s: delta === 0 ? 0 : delta / (1 - Math.abs(max + min - 1)),
      l: (max + min) / 2
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

  function isBlue(hsl) {
    return hsl.h >= 195 && hsl.h <= 255 && hsl.s >= 0.35;
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

  function applyPalette(color, persist) {
    var rgb = hexToRgb(color);
    var hsl = rgbToHsl(rgb);
    var blue = isBlue(hsl);
    var dark = hsl.l < 0.48;
    var priorBlue = root.getAttribute('data-theme') === 'dark';

    root.setAttribute('data-theme', blue ? 'dark' : 'light');
    root.style.setProperty('--bg', color);
    root.style.setProperty('--bg-shade', mix(rgb, dark ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }, 0.12));
    root.style.setProperty('--fg', dark ? '#f5f7fa' : '#202020');
    root.style.setProperty('--muted', dark ? '#d2d7df' : '#555555');
    root.style.setProperty('--link', dark ? '#ffffff' : '#0000cc');
    root.style.setProperty('--link-hover', dark ? '#ffdd9a' : '#000066');
    root.style.setProperty('--border', mix(rgb, dark ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }, 0.35));
    root.style.setProperty('--mascot-filter', 'hue-rotate(' + (hsl.h - 30) + 'deg) saturate(1.15)');
    palettePicker.value = color;

    if (priorBlue && !blue) stopAll();

    if (persist) {
      try {
        window.localStorage.setItem('paletteColor', color);
        window.localStorage.removeItem('theme');
      } catch (error) {
        // The palette still works when storage is blocked.
      }
    }
  }

  paletteToggle.addEventListener('click', function () {
    palettePicker.click();
  });

  palettePicker.addEventListener('input', function () {
    applyPalette(palettePicker.value, true);
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
    var savedColor = window.localStorage.getItem('paletteColor');
    if (!savedColor && window.localStorage.getItem('theme') === 'dark') savedColor = '#002bff';
    applyPalette(savedColor || '#ffffff', false);
  } catch (error) {
    applyPalette('#ffffff', false);
  }

  updateSoundToggle();
})();
