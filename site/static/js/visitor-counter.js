(function () {
  'use strict';

  var output = document.querySelector('[data-visitor-count]');
  if (!output) return;

  function createVisitorId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function getVisitorId() {
    var visitorId = window.localStorage.getItem('anonymousVisitorId');
    if (!visitorId) {
      visitorId = createVisitorId();
      window.localStorage.setItem('anonymousVisitorId', visitorId);
    }
    return visitorId;
  }

  var visitorId;
  try {
    visitorId = getVisitorId();
  } catch (error) {
    output.textContent = 'unavailable';
    return;
  }

  window.fetch('/api/visitor', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitor_id: visitorId })
  }).then(function (response) {
    if (!response.ok) throw new Error('Visitor counter request failed');
    return response.json();
  }).then(function (data) {
    if (!Number.isSafeInteger(data.total) || data.total < 0) throw new Error('Invalid visitor count');
    output.textContent = data.total.toLocaleString();
  }).catch(function () {
    output.textContent = 'unavailable';
  });
})();
