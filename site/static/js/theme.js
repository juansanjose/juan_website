(function () {
  'use strict';

  var root = document.documentElement;
  var themeToggle = document.querySelector('.theme-toggle');
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

  function stopParty() {
    window.clearTimeout(partyTimer);
    roach.hidden = true;
    roach.pause();
    roach.currentTime = 0;
    song.pause();
    song.currentTime = 0;
  }

  function startParty() {
    stopParty();
    roach.hidden = false;
    roach.play().catch(function () {});
    song.play().catch(function () {});
    partyTimer = window.setTimeout(stopParty, 30000);
  }

  try {
    if (window.localStorage.getItem('theme') === 'dark') {
      root.setAttribute('data-theme', 'dark');
    }
  } catch (error) {
    // The theme still works when storage is blocked.
  }

  updateThemeToggle();

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
      stopParty();
    }
  });
})();
