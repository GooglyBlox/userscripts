// ==UserScript==
// @name         Comick Group Mapping
// @namespace    https://github.com/GooglyBlox/comick-group-mapping
// @version      1.0
// @description  Adds website links to scanlation group pages on comick.dev
// @author       GooglyBlox
// @match        https://comick.dev/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/567563/Comick%20Group%20Mapping.user.js
// @updateURL https://update.greasyfork.org/scripts/567563/Comick%20Group%20Mapping.meta.js
// ==/UserScript==

(function () {
  "use strict";

  const JSON_URL =
    "https://raw.githubusercontent.com/GooglyBlox/comick-group-mapping/refs/heads/master/groups.json";
  const CACHE_KEY = "comick-group-mapping-cache";
  const CACHE_TTL = 1000 * 60 * 60;

  let groupMap = null;

  function loadGroups() {
    return new Promise((resolve) => {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL) {
            resolve(data);
            return;
          }
        } catch {}
      }

      GM_xmlhttpRequest({
        method: "GET",
        url: JSON_URL,
        onload(res) {
          try {
            const groups = JSON.parse(res.responseText);
            const map = {};
            for (const g of groups) {
              if (g.url) map[g.slug] = g.url;
            }
            localStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ data: map, ts: Date.now() }),
            );
            resolve(map);
          } catch {
            resolve({});
          }
        },
        onerror() {
          resolve({});
        },
      });
    });
  }

  function getSlugFromPath(path) {
    const match = path.match(/^\/group\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  function faviconUrl(siteUrl) {
    try {
      const domain = new URL(siteUrl).hostname;
      return `https://www.google.com/s2/favicons?sz=32&domain_url=https://${domain}`;
    } catch {
      return null;
    }
  }

  function injectLink(url) {
    const sidebar = document.querySelector(".md\\:w-64.lg\\:w-80.xl\\:w-96");
    if (!sidebar) return false;

    if (sidebar.querySelector("[data-comick-mapping]")) return true;

    const linksHeader = Array.from(sidebar.querySelectorAll("div")).find(
      (el) =>
        el.textContent.trim() === "External Links" &&
        el.classList.contains("font-semibold"),
    );

    let ul = sidebar.querySelector("ul");

    if (!linksHeader) {
      const header = document.createElement("div");
      header.className = "text-left flex truncate font-semibold";
      header.textContent = "External Links";
      sidebar.prepend(header);

      ul = document.createElement("ul");
      ul.className = "";
      header.after(ul);
    }

    if (!ul) {
      ul = document.createElement("ul");
      ul.className = "";
      if (linksHeader) {
        linksHeader.after(ul);
      }
    }

    const li = document.createElement("li");
    li.setAttribute("data-comick-mapping", "true");

    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "nofollow noreferrer";
    a.className =
      "flex items-center text-blue-700 dark:text-blue-400 my-1 break-all";

    const favicon = faviconUrl(url);
    if (favicon) {
      const img = document.createElement("img");
      img.src = favicon;
      img.className = "w-6 h-6 mr-2";
      img.alt = url;
      a.appendChild(img);
    }

    a.appendChild(document.createTextNode(url));
    li.appendChild(a);
    ul.appendChild(li);

    return true;
  }

  function tryInject() {
    const slug = getSlugFromPath(window.location.pathname);
    if (!slug || !groupMap || !groupMap[slug]) return;
    injectLink(groupMap[slug]);
  }

  async function init() {
    groupMap = await loadGroups();
    tryInject();

    let lastPath = window.location.pathname;
    const observer = new MutationObserver(() => {
      const currentPath = window.location.pathname;
      if (currentPath !== lastPath) {
        lastPath = currentPath;
        setTimeout(tryInject, 500);
      }
      if (getSlugFromPath(currentPath) && groupMap) {
        tryInject();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
