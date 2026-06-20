(function () {
  'use strict';

  var root = document.documentElement;
  var themeToggle = document.querySelector('.theme-toggle');
  var soundToggle = document.querySelector('.sound-toggle');
  var roach = document.querySelector('.blue-roach');
  var song = document.querySelector('.blue-song');
  var partyTimer;

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
    soundToggle.textContent = playing ? '🔊' : '🔇';
    soundToggle.title = playing ? 'Mute the Blue song' : 'Play the full Blue song';
    soundToggle.setAttribute('aria-label', soundToggle.title);
  }

  function hideRoach() {
    window.clearTimeout(partyTimer);
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

  function startParty() {
    stopAll();
    roach.hidden = false;
    roach.play().catch(function () {});
    partyTimer = window.setTimeout(hideRoach, 30000);
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
      song.pause();
      song.currentTime = 0;
      updateSoundToggle();
      return;
    }

    song.currentTime = 0;
    song.play().then(updateSoundToggle).catch(updateSoundToggle);
  });

  song.addEventListener('ended', updateSoundToggle);

  themeToggle.addEventListener('click', function () {
    var next = isBlue() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);

    try {
      window.localStorage.setItem('theme', next);
    } catch (error) {
      // Do not block the interaction when storage is unavailable.
    }

    updateThemeToggle();
    if (next === 'dark') {
      startParty();
    } else {
      stopAll();
    }
  });
})();
