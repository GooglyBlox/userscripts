// ==UserScript==
// @name        Comick Move Reviews Below Chapters
// @namespace   https://github.com/GooglyBlox
// @version     1.0
// @description Moves the reviews section below the chapter list on series pages
// @author      GooglyBlox
// @match       https://comick.dev/*
// @license     MIT
// @grant       none
// @run-at      document-idle
// @downloadURL https://update.greasyfork.org/scripts/570912/Comick%20Move%20Reviews%20Below%20Chapters.user.js
// @updateURL https://update.greasyfork.org/scripts/570912/Comick%20Move%20Reviews%20Below%20Chapters.meta.js
// ==/UserScript==

(function () {
  'use strict';

  function moveReviews() {
    const reviews = document.querySelector('section#reviews');
    if (!reviews) return false;

    const chapterHeader = document.querySelector('h2#chapter-header');
    if (!chapterHeader) return false;

    const chapterSection = chapterHeader.closest('.max-xl\\:pl-1');
    if (!chapterSection) return false;

    if (reviews.previousElementSibling === chapterSection) return true;

    chapterSection.after(reviews);
    return true;
  }

  moveReviews();

  const observer = new MutationObserver(() => {
    moveReviews();
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();