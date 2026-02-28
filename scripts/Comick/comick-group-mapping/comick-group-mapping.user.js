// ==UserScript==
// @name         Comick Group Mapping
// @namespace    https://github.com/GooglyBlox/comick-group-mapping
// @version      1.1
// @description  Brings back direct links to scanlation groups
// @author       GooglyBlox
// @match        https://comick.dev/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      api.comick.dev
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

  const chaptersByNum = {};

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

  function parseChaptersResponse(text) {
    try {
      const json = JSON.parse(text);
      if (!Array.isArray(json.chapters)) return;

      for (const chapter of json.chapters) {
        const chap = chapter.chap;
        if (!chap) continue;

        const groups = [];
        if (Array.isArray(chapter.md_chapters_groups)) {
          for (const entry of chapter.md_chapters_groups) {
            const group = entry.md_groups;
            if (!group || !group.slug || !group.title) continue;
            groups.push({ title: group.title, slug: group.slug });
          }
        }

        if (!chaptersByNum[chap]) chaptersByNum[chap] = [];
        chaptersByNum[chap].push({ created_at: chapter.created_at, groups });
      }

      injectChapterBadges();
    } catch {}
  }

  function isChaptersUrl(url) {
    return /api\.comick\.(?:dev|fun|io)\/v[\d.]+\/comic\/[^/]+\/chapters/.test(url);
  }

  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url ?? "";
    const response = await _fetch.apply(this, args);
    if (isChaptersUrl(url)) response.clone().text().then(parseChaptersResponse);
    return response;
  };

  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._comickUrl = url;
    return _open.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this._comickUrl && isChaptersUrl(this._comickUrl)) {
      this.addEventListener("load", () => parseChaptersResponse(this.responseText));
    }
    return _send.apply(this, args);
  };

  function getChapFromRow(row) {
    const span = row.querySelector("span.font-bold");
    if (!span) return null;
    const title = span.getAttribute("title") || span.textContent.trim();
    const match = title.match(/[\d.]+/);
    return match ? match[0] : null;
  }

  function injectChapterBadges() {
    const rows = Array.from(document.querySelectorAll("tbody tr"));

    const chapIndexSeen = {};

    for (const row of rows) {
      const chap = getChapFromRow(row);
      if (!chap) continue;

      if (chapIndexSeen[chap] === undefined) chapIndexSeen[chap] = 0;
      const idx = chapIndexSeen[chap];
      chapIndexSeen[chap]++;

      const tds = row.querySelectorAll("td");
      if (tds.length < 3) continue;
      const groupTd = tds[2];

      if (groupTd.querySelector("[data-comick-group-badge]")) continue;

      const entries = chaptersByNum[chap];
      if (!entries || !entries[idx]) continue;

      const groups = entries[idx].groups;
      if (!groups || groups.length === 0) continue;

      const innerDiv = groupTd.querySelector("div > div");
      if (!innerDiv) continue;

      innerDiv.innerHTML = "";

      groups.forEach((group, i) => {
        const a = document.createElement("a");
        a.href = `https://comick.dev/group/${group.slug}`;
        a.target = "_blank";
        a.rel = "nofollow noreferrer";
        a.setAttribute("data-comick-group-badge", group.slug);
        a.className = "text-blue-700 dark:text-blue-400 hover:underline";
        a.textContent = group.title;
        innerDiv.appendChild(a);

        if (i < groups.length - 1) {
          innerDiv.appendChild(document.createTextNode(", "));
        }
      });
    }
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
      if (linksHeader) linksHeader.after(ul);
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

  function tryInjectGroupLink() {
    const slug = getSlugFromPath(window.location.pathname);
    if (!slug || !groupMap || !groupMap[slug]) return;
    injectLink(groupMap[slug]);
  }

  async function init() {
    groupMap = await loadGroups();
    tryInjectGroupLink();

    let lastPath = window.location.pathname;
    const observer = new MutationObserver(() => {
      const currentPath = window.location.pathname;
      if (currentPath !== lastPath) {
        lastPath = currentPath;
        setTimeout(tryInjectGroupLink, 500);
      }
      if (getSlugFromPath(currentPath) && groupMap) tryInjectGroupLink();
      injectChapterBadges();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();