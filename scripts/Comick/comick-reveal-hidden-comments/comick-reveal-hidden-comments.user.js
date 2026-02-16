// ==UserScript==
// @name        Comick Reveal Hidden Comments
// @namespace   https://github.com/GooglyBlox
// @version     1.0
// @description Reveals comments hidden by Community Standards on comick.dev
// @author      GooglyBlox
// @match       https://comick.dev/*
// @connect     api.comick.dev
// @grant       none
// @license     MIT
// @run-at      document-start
// @downloadURL https://update.greasyfork.org/scripts/566443/Comick%20Reveal%20Hidden%20Comments.user.js
// @updateURL https://update.greasyfork.org/scripts/566443/Comick%20Reveal%20Hidden%20Comments.meta.js
// ==/UserScript==

(function () {
  'use strict';

  const hiddenComments = new Map();

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    if (url.includes('api.comick.dev/comment/')) {
      const clone = response.clone();
      clone.json().then((data) => {
        if (data && data.comments) {
          collectHiddenComments(data.comments);
          requestAnimationFrame(() => revealHiddenComments());
        }
      }).catch(() => {});
    }

    return response;
  };

  function collectHiddenComments(comments) {
    for (const comment of comments) {
      if (comment.status === 'unapproved' || (comment.openai_analysis && !comment.openai_analysis.approved)) {
        hiddenComments.set(comment.id, comment.content);
      }
      if (comment.other_comments && comment.other_comments.length > 0) {
        collectHiddenComments(comment.other_comments);
      }
    }
  }

  function revealHiddenComments() {
    for (const [commentId, content] of hiddenComments) {
      const commentEl = document.getElementById(`comment-${commentId}`);
      if (!commentEl) continue;

      const hiddenButton = commentEl.querySelector('button.text-left.text-xs');
      if (!hiddenButton || !hiddenButton.textContent.includes('Content hidden due to Community Standards')) continue;

      const container = hiddenButton.parentElement;

      const contentP = document.createElement('p');
      contentP.className = 'comment-content break-words';
      contentP.textContent = content;

      const notice = document.createElement('p');
      notice.className = 'text-xs text-gray-500 dark:text-gray-400 mt-1 italic';
      notice.textContent = 'Content hidden due to Community Standards.';

      container.replaceChild(contentP, hiddenButton);
      container.appendChild(notice);
    }
  }

  const observer = new MutationObserver(() => {
    if (hiddenComments.size > 0) {
      revealHiddenComments();
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
})();