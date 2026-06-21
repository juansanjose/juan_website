(function () {
  'use strict';

  var root = document.documentElement;
  var themeToggle = document.querySelector('.theme-toggle');
  var soundToggle = document.querySelector('.sound-toggle');
  var roach = document.querySelector('.blue-roach');
  var song = document.querySelector('.blue-song');

  function isBlue() {
    return root.getAttribute('data-theme') === 'dark';
  }

  function updateThemeToggle() {
    var blueTheme = isBlue();
    themeToggle.textContent = blueTheme ? 'white' : 'blue';
    themeToggle.setAttribute(
      'aria-label',
      blueTheme ? 'Switch to white theme' : 'Switch to blue theme and start the blue party'
    );
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

  try {
    if (window.localStorage.getItem('theme') === 'dark') {
      root.setAttribute('data-theme', 'dark');
    }
  } catch (error) {
    // The theme still works when storage is blocked.
  }

  updateThemeToggle();
  updateSoundToggle();

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

  themeToggle.addEventListener('click', function () {
    var next = isBlue() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);

    try {
      window.localStorage.setItem('theme', next);
    } catch (error) {
      // Do not block the interaction when storage is unavailable.
    }

    updateThemeToggle();
    if (next !== 'dark') {
      stopAll();
    }
  });
})();
