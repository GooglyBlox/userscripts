// ==UserScript==
// @name         Instagram Profile Post Scraper
// @namespace    https://github.com/GooglyBlox
// @version      1.0
// @description  Scrapes all post URLs and image sources from an Instagram profile page
// @author       GooglyBlox
// @match        https://www.instagram.com/*/
// @grant        GM_setClipboard
// @connect      instagram.com
// @connect      cdninstagram.com
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/566010/Instagram%20Profile%20Post%20Scraper.user.js
// @updateURL https://update.greasyfork.org/scripts/566010/Instagram%20Profile%20Post%20Scraper.meta.js
// ==/UserScript==

(function () {
    'use strict';
  
    const SCROLL_DELAY = 1500;
    const NO_CHANGE_THRESHOLD = 5;
  
    let isRunning = false;
  
    function createButton() {
      const btn = document.createElement('button');
      btn.id = 'ig-scraper-btn';
      btn.textContent = 'Scrape Posts';
      btn.style.cssText = `
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 99999;
        padding: 10px 20px;
        background: #1a1a1a;
        color: #fff;
        border: 1px solid #444;
        border-radius: 6px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#333';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = '#1a1a1a';
      });
      btn.addEventListener('click', startScraping);
      document.body.appendChild(btn);
      return btn;
    }
  
    function createStatusOverlay() {
      const overlay = document.createElement('div');
      overlay.id = 'ig-scraper-status';
      overlay.style.cssText = `
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 99999;
        padding: 14px 22px;
        background: #1a1a1a;
        color: #fff;
        border: 1px solid #444;
        border-radius: 6px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        pointer-events: none;
      `;
      document.body.appendChild(overlay);
      return overlay;
    }
  
    function updateStatus(overlay, text) {
      overlay.textContent = text;
    }
  
    function collectPosts() {
      const posts = [];
      const postLinks = document.querySelectorAll('a[href*="/p/"]');
  
      for (const link of postLinks) {
        const href = link.getAttribute('href');
        if (!href || !href.match(/^\/[^/]+\/p\/[^/]+\//)) continue;
  
        const postUrl = 'https://www.instagram.com' + href;
        const img = link.querySelector('img');
        const imgSrc = img ? img.getAttribute('src') : null;
        const altText = img ? img.getAttribute('alt') : null;
  
        posts.push({
          postUrl,
          imageSrc: imgSrc,
          altText: altText || null,
        });
      }
  
      return posts;
    }
  
    function deduplicatePosts(posts) {
      const seen = new Set();
      const unique = [];
      for (const post of posts) {
        if (!seen.has(post.postUrl)) {
          seen.add(post.postUrl);
          unique.push(post);
        }
      }
      return unique;
    }
  
    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
  
    async function startScraping() {
      if (isRunning) return;
      isRunning = true;
  
      const btn = document.getElementById('ig-scraper-btn');
      if (btn) btn.remove();
  
      const status = createStatusOverlay();
      updateStatus(status, 'Starting scrape...');
  
      let allPosts = [];
      let previousCount = 0;
      let noChangeRounds = 0;
  
      while (true) {
        const currentPosts = collectPosts();
        allPosts = deduplicatePosts([...allPosts, ...currentPosts]);
  
        updateStatus(status, `Collected ${allPosts.length} posts... scrolling`);
  
        if (allPosts.length === previousCount) {
          noChangeRounds++;
        } else {
          noChangeRounds = 0;
        }
  
        if (noChangeRounds >= NO_CHANGE_THRESHOLD) {
          break;
        }
  
        previousCount = allPosts.length;
        window.scrollBy(0, window.innerHeight);
        await sleep(SCROLL_DELAY);
      }
  
      const profilePath = window.location.pathname.replace(/\//g, '').trim();
      const output = {
        profile: profilePath,
        scrapedAt: new Date().toISOString(),
        postCount: allPosts.length,
        posts: allPosts,
      };
  
      const json = JSON.stringify(output, null, 2);
      GM_setClipboard(json, 'text');
  
      updateStatus(status, `Done! ${allPosts.length} posts copied to clipboard as JSON.`);
      status.style.pointerEvents = 'auto';
      status.style.cursor = 'pointer';
      status.addEventListener('click', () => status.remove());
  
      isRunning = false;
    }
  
    createButton();
  })();