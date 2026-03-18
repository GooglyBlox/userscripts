// ==UserScript==
// @name         MangaDex Forum Comments Embed
// @namespace    https://github.com/GooglyBlox
// @version      1.0
// @description  Embeds forum comments directly into MangaDex group and title comment tabs
// @author       GooglyBlox
// @license      MIT
// @match        https://mangadex.org/group/*
// @match        https://mangadex.org/title/*
// @connect      forums.mangadex.org
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/570085/MangaDex%20Forum%20Comments%20Embed.user.js
// @updateURL https://update.greasyfork.org/scripts/570085/MangaDex%20Forum%20Comments%20Embed.meta.js
// ==/UserScript==

(function () {
  'use strict';

  let lastUrl = '';
  let injecting = false;
  let lastPagePath = '';

  function getPagePath() {
    const match = window.location.pathname.match(/^\/(group|title)\/[^/]+/);
    return match ? match[0] : '';
  }

  function getForumUrl() {
    const links = document.querySelectorAll('a[href*="forums.mangadex.org/threads/"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href) {
        const match = href.match(/forums\.mangadex\.org\/threads\/(\d+)/);
        if (match) return `https://forums.mangadex.org/threads/${match[1]}/`;
      }
    }
    return null;
  }

  function isCommentsTab() {
    return window.location.search.includes('tab=comments');
  }

  function fetchForumThread(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        onload: function (response) {
          if (response.status === 200) {
            resolve(response.responseText);
          } else {
            reject(new Error(`Forum fetch failed with status ${response.status}`));
          }
        },
        onerror: function (error) {
          reject(error);
        }
      });
    });
  }

  function parseForumPosts(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const articles = doc.querySelectorAll('article.message--post');
    const posts = [];

    const pageNav = doc.querySelector('.pageNav');
    const lastPageLink = pageNav
      ? pageNav.querySelector('.pageNav-main .pageNav-page:last-child a')
      : null;
    const totalPages = lastPageLink ? parseInt(lastPageLink.textContent.trim(), 10) : 1;

    for (const article of articles) {
      const authorEl = article.querySelector('.message-name a.username');
      const author = authorEl ? authorEl.textContent.trim() : 'Unknown';
      const authorUrl = authorEl ? authorEl.getAttribute('href') : null;

      const avatarEl = article.querySelector('.message-avatar img');
      const avatarSrc = avatarEl ? avatarEl.getAttribute('src') : null;

      const defaultAvatarEl = article.querySelector('.message-avatar .avatar--default span');
      const defaultAvatarLetter = defaultAvatarEl ? defaultAvatarEl.textContent.trim() : null;
      const defaultAvatarStyle = defaultAvatarEl
        ? defaultAvatarEl.closest('.avatar--default').getAttribute('style')
        : null;

      const hasRealAvatar = avatarSrc && !avatarSrc.startsWith('data:');

      const timeEl = article.querySelector('time.u-dt');
      const dateStr = timeEl ? timeEl.getAttribute('title') || timeEl.textContent.trim() : '';
      const datetime = timeEl ? timeEl.getAttribute('datetime') : '';

      const bodyEl = article.querySelector('.message-body .bbWrapper');
      const bodyHtml = bodyEl ? bodyEl.innerHTML.trim() : '';
      const bodyText = bodyEl ? bodyEl.textContent.trim() : '';

      const postLinkEl = article.querySelector('header .message-attribution-opposite a[href*="post-"]');
      const postNumber = postLinkEl ? postLinkEl.textContent.trim() : '';

      const isStaff = !!article.querySelector('.userBanner--staff');

      if (bodyText.length > 0) {
        posts.push({
          author,
          authorUrl: authorUrl ? `https://forums.mangadex.org${authorUrl}` : null,
          avatarSrc: hasRealAvatar ? (avatarSrc.startsWith('http') ? avatarSrc : `https://forums.mangadex.org${avatarSrc}`) : null,
          defaultAvatarLetter,
          defaultAvatarStyle,
          dateStr,
          datetime,
          bodyHtml,
          postNumber,
          isStaff
        });
      }
    }

    return { posts, totalPages };
  }

  function processSmilies(container) {
    const smilies = container.querySelectorAll('img.smilie');
    for (const smilie of smilies) {
      const alt = smilie.getAttribute('alt');
      if (alt) {
        const textNode = document.createTextNode(alt);
        smilie.replaceWith(textNode);
      }
    }
  }

  function processQuoteBlocks(container) {
    const expandLinks = container.querySelectorAll('.bbCodeBlock-expandLink');
    for (const link of expandLinks) {
      link.remove();
    }

    const expandContents = container.querySelectorAll('.bbCodeBlock-expandContent');
    for (const content of expandContents) {
      content.style.maxHeight = 'none';
      content.style.overflow = 'visible';
      content.classList.remove('js-expandContent');
    }

    const quoteBlocks = container.querySelectorAll('.bbCodeBlock--quote');
    for (const block of quoteBlocks) {
      block.style.cssText = 'border-left: 3px solid var(--md-primary, #ff6740); margin: 0 0 10px 0; padding: 0; border-radius: 4px; overflow: hidden;';

      const title = block.querySelector('.bbCodeBlock-title');
      if (title) {
        title.style.cssText = 'padding: 6px 12px; font-size: 12px; font-weight: 600; color: var(--md-primary, #ff6740); background: transparent;';

        const sourceLink = title.querySelector('.bbCodeBlock-sourceJump');
        if (sourceLink) {
          sourceLink.style.cssText = 'color: var(--md-primary, #ff6740); text-decoration: none; pointer-events: none;';
        }
      }

      const content = block.querySelector('.bbCodeBlock-content');
      if (content) {
        content.style.cssText = 'padding: 4px 12px 8px 12px; font-size: 13px; opacity: 0.8;';
      }
    }
  }

  function processLinks(container) {
    const mentions = container.querySelectorAll('a.username');
    for (const mention of mentions) {
      mention.style.cssText = 'color: var(--md-primary, #ff6740); font-weight: 600; text-decoration: none; background: rgba(255, 103, 64, 0.1); padding: 1px 4px; border-radius: 3px;';

      const href = mention.getAttribute('href');
      if (href && !href.startsWith('http')) {
        mention.href = `https://forums.mangadex.org${href}`;
      }
      mention.target = '_blank';
      mention.rel = 'noopener noreferrer';
    }

    const regularLinks = container.querySelectorAll('a.link, a[href]:not(.username):not(.bbCodeBlock-sourceJump)');
    for (const link of regularLinks) {
      if (link.closest('.bbCodeBlock-title') || link.closest('.bbCodeBlock-expandLink')) continue;

      link.style.cssText = 'color: #5b9bd5; text-decoration: underline; text-decoration-color: rgba(91, 155, 213, 0.4); text-underline-offset: 2px;';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      const href = link.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('data:')) {
        link.href = `https://forums.mangadex.org${href}`;
      }
    }
  }

  function createPostElement(post) {
    const container = document.createElement('div');
    container.style.cssText = 'border: 1px solid var(--md-accent, #333); border-radius: 8px; padding: 16px; margin-bottom: 12px; background: var(--md-accent-darken, rgba(255,255,255,0.03));';

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 10px;';

    if (post.avatarSrc) {
      const avatar = document.createElement('img');
      avatar.src = post.avatarSrc;
      avatar.alt = post.author;
      avatar.style.cssText = 'width: 40px; height: 40px; border-radius: 50%; object-fit: cover;';
      avatar.loading = 'lazy';
      header.appendChild(avatar);
    } else if (post.defaultAvatarLetter) {
      const avatarDiv = document.createElement('div');
      let bgColor = '#555';
      let textColor = '#fff';
      if (post.defaultAvatarStyle) {
        const bgMatch = post.defaultAvatarStyle.match(/background-color:\s*([^;]+)/);
        const colorMatch = post.defaultAvatarStyle.match(/(?:^|;\s*)color:\s*([^;]+)/);
        if (bgMatch) bgColor = bgMatch[1].trim();
        if (colorMatch) textColor = colorMatch[1].trim();
      }
      avatarDiv.textContent = post.defaultAvatarLetter;
      avatarDiv.style.cssText = `width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 18px; flex-shrink: 0; background-color: ${bgColor}; color: ${textColor};`;
      header.appendChild(avatarDiv);
    }

    const meta = document.createElement('div');
    meta.style.cssText = 'display: flex; flex-direction: column;';

    const authorRow = document.createElement('div');
    authorRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    const authorLink = document.createElement('a');
    authorLink.textContent = post.author;
    authorLink.href = post.authorUrl || '#';
    authorLink.target = '_blank';
    authorLink.rel = 'noopener noreferrer';
    authorLink.style.cssText = 'font-weight: 600; color: var(--md-primary, #ff6740); text-decoration: none;';
    authorRow.appendChild(authorLink);

    if (post.isStaff) {
      const badge = document.createElement('span');
      badge.textContent = 'Staff';
      badge.style.cssText = 'font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--md-primary, #ff6740); color: #fff; font-weight: 600;';
      authorRow.appendChild(badge);
    }

    meta.appendChild(authorRow);

    const dateEl = document.createElement('span');
    dateEl.textContent = post.dateStr;
    dateEl.style.cssText = 'font-size: 12px; color: var(--md-icon-contrast, #888);';
    if (post.datetime) {
      dateEl.title = post.datetime;
    }
    meta.appendChild(dateEl);

    header.appendChild(meta);

    if (post.postNumber) {
      const postNum = document.createElement('span');
      postNum.textContent = post.postNumber;
      postNum.style.cssText = 'margin-left: auto; font-size: 12px; color: var(--md-icon-contrast, #888);';
      header.appendChild(postNum);
    }

    container.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'line-height: 1.5; word-break: break-word; overflow: hidden;';
    body.innerHTML = post.bodyHtml;

    processSmilies(body);
    processQuoteBlocks(body);
    processLinks(body);

    const images = body.querySelectorAll('img');
    for (const img of images) {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '4px';
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        img.src = `https://forums.mangadex.org${src}`;
      }
    }

    container.appendChild(body);

    return container;
  }

  function createLoadingElement() {
    const el = document.createElement('div');
    el.style.cssText = 'text-align: center; padding: 24px; color: var(--md-icon-contrast, #888);';
    el.textContent = 'Loading forum comments...';
    return el;
  }

  function createErrorElement(message, forumUrl) {
    const el = document.createElement('div');
    el.style.cssText = 'text-align: center; padding: 24px; color: var(--md-icon-contrast, #888);';
    el.textContent = message;
    if (forumUrl) {
      const link = document.createElement('a');
      link.href = forumUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View on forums';
      link.style.cssText = 'display: block; margin-top: 8px; color: var(--md-primary, #ff6740);';
      el.appendChild(link);
    }
    return el;
  }

  function createPaginationControls(displayPage, totalPages, forumBaseUrl, postsContainer) {
    const nav = document.createElement('div');
    nav.className = 'gmx-forum-pagination';
    nav.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 0;';

    const newerBtn = document.createElement('button');
    newerBtn.textContent = 'Newer';
    newerBtn.disabled = displayPage <= 1;
    newerBtn.style.cssText = `padding: 6px 14px; border-radius: 6px; border: 1px solid var(--md-accent, #333); background: transparent; color: inherit; cursor: ${displayPage <= 1 ? 'not-allowed' : 'pointer'}; opacity: ${displayPage <= 1 ? '0.4' : '1'};`;
    newerBtn.addEventListener('click', () => {
      if (displayPage > 1) loadPage(displayPage - 1, totalPages, forumBaseUrl, postsContainer);
    });

    const pageInfo = document.createElement('span');
    pageInfo.textContent = `Page ${displayPage} of ${totalPages}`;
    pageInfo.style.cssText = 'font-size: 13px; color: var(--md-icon-contrast, #888);';

    const olderBtn = document.createElement('button');
    olderBtn.textContent = 'Older';
    olderBtn.disabled = displayPage >= totalPages;
    olderBtn.style.cssText = `padding: 6px 14px; border-radius: 6px; border: 1px solid var(--md-accent, #333); background: transparent; color: inherit; cursor: ${displayPage >= totalPages ? 'not-allowed' : 'pointer'}; opacity: ${displayPage >= totalPages ? '0.4' : '1'};`;
    olderBtn.addEventListener('click', () => {
      if (displayPage < totalPages) loadPage(displayPage + 1, totalPages, forumBaseUrl, postsContainer);
    });

    nav.appendChild(newerBtn);
    nav.appendChild(pageInfo);
    nav.appendChild(olderBtn);

    return nav;
  }

  function displayPageToForumPage(displayPage, totalPages) {
    return totalPages - displayPage + 1;
  }

  async function loadPage(displayPage, totalPages, forumBaseUrl, postsContainer) {
    postsContainer.innerHTML = '';
    postsContainer.appendChild(createLoadingElement());

    const forumPage = displayPageToForumPage(displayPage, totalPages);
    const url = forumPage > 1 ? `${forumBaseUrl}page-${forumPage}` : forumBaseUrl;

    try {
      const html = await fetchForumThread(url);
      const result = parseForumPosts(html);
      const resolvedTotalPages = result.totalPages > totalPages ? result.totalPages : totalPages;

      const actualDisplayPage = displayPageToForumPage(forumPage, resolvedTotalPages);

      result.posts.reverse();

      postsContainer.innerHTML = '';

      if (result.posts.length === 0) {
        postsContainer.appendChild(createErrorElement('No comments on this page.', forumBaseUrl));
        return;
      }

      if (resolvedTotalPages > 1) {
        postsContainer.appendChild(createPaginationControls(actualDisplayPage, resolvedTotalPages, forumBaseUrl, postsContainer));
      }

      for (const post of result.posts) {
        postsContainer.appendChild(createPostElement(post));
      }

      if (resolvedTotalPages > 1) {
        postsContainer.appendChild(createPaginationControls(actualDisplayPage, resolvedTotalPages, forumBaseUrl, postsContainer));
      }
    } catch (error) {
      console.error('MangaDex Forum Embed:', error);
      postsContainer.innerHTML = '';
      postsContainer.appendChild(createErrorElement('Failed to load forum comments.', forumBaseUrl));
    }
  }

  function findCommentsAlert() {
    const alertDiv = document.querySelector('div.bg-accent[role="alert"]');
    if (!alertDiv) return null;

    const noteText = alertDiv.querySelector('span');
    if (!noteText || !noteText.textContent.includes('Embedded comments have not yet been implemented')) return null;

    return alertDiv;
  }

  async function injectComments() {
    if (!isCommentsTab() || injecting) return;
    if (document.querySelector('.gmx-forum-embedded')) return;

    const alertDiv = findCommentsAlert();
    if (!alertDiv) return;

    const forumUrl = getForumUrl();
    if (!forumUrl) return;

    injecting = true;

    const parentContainer = alertDiv.parentElement;

    const wrapper = document.createElement('div');
    wrapper.className = 'gmx-forum-embedded';

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;';

    const title = document.createElement('span');
    title.textContent = 'Forum Comments';
    title.style.cssText = 'font-weight: 600; font-size: 16px;';
    headerRow.appendChild(title);

    const forumLink = document.createElement('a');
    forumLink.href = forumUrl;
    forumLink.target = '_blank';
    forumLink.rel = 'noopener noreferrer';
    forumLink.textContent = 'Open in Forums';
    forumLink.style.cssText = 'font-size: 13px; color: var(--md-primary, #ff6740); text-decoration: none;';
    headerRow.appendChild(forumLink);

    wrapper.appendChild(headerRow);

    const postsContainer = document.createElement('div');
    postsContainer.appendChild(createLoadingElement());
    wrapper.appendChild(postsContainer);

    alertDiv.style.display = 'none';

    const forumButton = parentContainer.querySelector('a[href*="forums.mangadex.org"]');
    if (forumButton) forumButton.style.display = 'none';

    parentContainer.insertBefore(wrapper, alertDiv);

    try {
      const html = await fetchForumThread(forumUrl);
      const result = parseForumPosts(html);
      const totalPages = result.totalPages;

      if (totalPages > 1) {
        const lastPageUrl = `${forumUrl}page-${totalPages}`;
        const lastPageHtml = await fetchForumThread(lastPageUrl);
        const lastPageResult = parseForumPosts(lastPageHtml);

        lastPageResult.posts.reverse();
        postsContainer.innerHTML = '';

        if (lastPageResult.posts.length === 0) {
          postsContainer.appendChild(createErrorElement('No comments found.', forumUrl));
        } else {
          postsContainer.appendChild(createPaginationControls(1, totalPages, forumUrl, postsContainer));
          for (const post of lastPageResult.posts) {
            postsContainer.appendChild(createPostElement(post));
          }
          postsContainer.appendChild(createPaginationControls(1, totalPages, forumUrl, postsContainer));
        }
      } else {
        result.posts.reverse();
        postsContainer.innerHTML = '';

        if (result.posts.length === 0) {
          postsContainer.appendChild(createErrorElement('No comments found.', forumUrl));
        } else {
          for (const post of result.posts) {
            postsContainer.appendChild(createPostElement(post));
          }
        }
      }
    } catch (error) {
      console.error('MangaDex Forum Embed:', error);
      postsContainer.innerHTML = '';
      postsContainer.appendChild(createErrorElement('Failed to load forum comments.', forumUrl));
    }

    injecting = false;
  }

  function cleanup() {
    const embedded = document.querySelector('.gmx-forum-embedded');
    if (embedded) embedded.remove();

    const alertDiv = findCommentsAlert();
    if (alertDiv) alertDiv.style.display = '';

    const forumButtons = document.querySelectorAll('a[href*="forums.mangadex.org"]');
    for (const btn of forumButtons) {
      btn.style.display = '';
    }
  }

  function onUrlChange() {
    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;

    const currentPagePath = getPagePath();

    if (currentPagePath !== lastPagePath) {
      cleanup();
      lastPagePath = currentPagePath;
    }

    if (isCommentsTab()) {
      setTimeout(tryInject, 300);
    }
  }

  function tryInject() {
    if (!isCommentsTab()) return;
    if (document.querySelector('.gmx-forum-embedded')) return;

    if (findCommentsAlert()) {
      injectComments();
    }
  }

  const originalPushState = history.pushState;
  history.pushState = function () {
    originalPushState.apply(this, arguments);
    onUrlChange();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function () {
    originalReplaceState.apply(this, arguments);
    onUrlChange();
  };

  window.addEventListener('popstate', onUrlChange);

  setInterval(onUrlChange, 500);

  const observer = new MutationObserver(() => {
    if (isCommentsTab() && !document.querySelector('.gmx-forum-embedded') && findCommentsAlert()) {
      injectComments();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  lastUrl = window.location.href;
  lastPagePath = getPagePath();
  setTimeout(tryInject, 500);
})();