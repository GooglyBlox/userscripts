// ==UserScript==
// @name        Comick Remove Reviews Section
// @namespace   https://github.com/GooglyBlox
// @version     1.0
// @description Removes the reviews section from series pages on Comick
// @author      GooglyBlox
// @match       https://comick.dev/*
// @license     MIT
// @grant       none
// @run-at      document-idle
// @downloadURL https://update.greasyfork.org/scripts/570911/Comick%20Remove%20Reviews%20Section.user.js
// @updateURL https://update.greasyfork.org/scripts/570911/Comick%20Remove%20Reviews%20Section.meta.js
// ==/UserScript==

(function () {
  'use strict';

  function removeReviews() {
    const section = document.querySelector('section#reviews');
    if (section) {
      section.remove();
      return true;
    }
    return false;
  }

  removeReviews();

  const observer = new MutationObserver(() => {
    removeReviews();
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();