// ==UserScript==
// @name         Comick Other Users' Notes
// @namespace    https://github.com/GooglyBlox
// @version      1.0
// @description  Shows public notes that other Comick users left for the current series
// @author       GooglyBlox
// @match        https://comick.dev/comic/*
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/573549/Comick%20Other%20Users%27%20Notes.user.js
// @updateURL https://update.greasyfork.org/scripts/573549/Comick%20Other%20Users%27%20Notes.meta.js
// ==/UserScript==

(function () {
  "use strict";

  const API_BASE_URL = "https://api.comick.dev";
  const SECTION_ID = "comick-other-users-notes";
  const STYLE_ID = "comick-other-users-notes-style";
  const CACHE_PREFIX = "comick-other-users-notes:v1:";
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const FOLLOWS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const SERIES_SCAN_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 15000;
  const CHAPTERS_PAGE_LIMIT = 100;
  const CHAPTER_COMMENT_CONCURRENCY = 4;
  const USER_FOLLOWS_CONCURRENCY = 3;
  const NOTES_PER_PAGE = 5;
  const MAX_NOTES = NOTES_PER_PAGE * 3;
  const REQUEST_INTERVAL_MS = 150;

  let lastUrl = location.href;
  let notesPage = 0;
  let currentRunToken = 0;
  const inFlightRequests = new Map();
  let activeLoadSlug = null;
  const completedSlugs = new Set();
  let lastRequestTime = 0;

  function rateLimit() {
    const now = Date.now();
    const wait = Math.max(0, lastRequestTime + REQUEST_INTERVAL_MS - now);
    lastRequestTime = Math.max(now, lastRequestTime) + REQUEST_INTERVAL_MS;
    return wait > 0 ? new Promise((r) => setTimeout(r, wait)) : Promise.resolve();
  }

  function isSeriesPage(pathname = location.pathname) {
    return /^\/comic\/[^/]+\/?$/.test(pathname);
  }

  function getSeriesSlug(pathname = location.pathname) {
    const match = pathname.match(/^\/comic\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function getCache(key, ttlMs) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (Date.now() - parsed.timestamp > ttlMs) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }

  function setCache(key, data) {
    try {
      localStorage.setItem(
        CACHE_PREFIX + key,
        JSON.stringify({ timestamp: Date.now(), data }),
      );
    } catch {
      // Ignore storage failures.
    }
  }

  function getSeriesScanCache(comic) {
    return (
      getCache(
        `series-scan:${comic.id}:${comic.slug}`,
        SERIES_SCAN_CACHE_TTL_MS,
      ) || { scannedUsers: {}, notes: {} }
    );
  }

  function setSeriesScanCache(comic, data) {
    setCache(`series-scan:${comic.id}:${comic.slug}`, data);
  }

  async function fetchJson(url, cacheKey, ttlMs = CACHE_TTL_MS) {
    const cached = getCache(cacheKey, ttlMs);
    if (cached !== null) return cached;
    if (inFlightRequests.has(cacheKey)) return inFlightRequests.get(cacheKey);

    const requestPromise = (async () => {
      await rateLimit();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          credentials: "omit",
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok)
          throw new Error(`Request failed with status ${response.status}`);
        const data = await response.json();
        setCache(cacheKey, data);
        return data;
      } finally {
        clearTimeout(timeoutId);
        inFlightRequests.delete(cacheKey);
      }
    })();

    inFlightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SECTION_ID} {
        border: 1px solid rgba(156,163,175,.35);
        border-radius: .5rem;
        padding: 1rem;
        background: rgba(249,250,251,.65);
      }
      .dark #${SECTION_ID} {
        background: rgba(31,41,55,.55);
        border-color: rgba(75,85,99,.7);
      }
      #${SECTION_ID} .oun-list {
        display: grid;
        gap: .75rem;
        margin-top: .75rem;
      }
      #${SECTION_ID} .oun-item {
        border: 1px solid rgba(156,163,175,.25);
        border-radius: .5rem;
        padding: .75rem;
        background: rgba(255,255,255,.8);
      }
      .dark #${SECTION_ID} .oun-item {
        background: rgba(17,24,39,.7);
        border-color: rgba(75,85,99,.6);
      }
      #${SECTION_ID} .oun-meta {
        display: flex;
        align-items: center;
        gap: .5rem;
        margin-bottom: .35rem;
      }
      #${SECTION_ID} .oun-avatar {
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 9999px;
        flex: none;
      }
      #${SECTION_ID} .oun-note {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        line-height: 1.5;
      }
      #${SECTION_ID} .oun-sub {
        color: rgb(107,114,128);
        font-size: .875rem;
      }
      .dark #${SECTION_ID} .oun-sub {
        color: rgb(156,163,175);
      }
      #${SECTION_ID} .oun-progress {
        display: flex;
        align-items: center;
        gap: .5rem;
        margin-top: .25rem;
      }
      #${SECTION_ID} .oun-bar {
        flex: 1;
        height: 4px;
        border-radius: 2px;
        background: rgba(156,163,175,.25);
        overflow: hidden;
        max-width: 120px;
      }
      .dark #${SECTION_ID} .oun-bar {
        background: rgba(75,85,99,.5);
      }
      #${SECTION_ID} .oun-bar-fill {
        height: 100%;
        background: rgb(99,102,241);
        border-radius: 2px;
        transition: width .2s ease;
      }
      #${SECTION_ID} .oun-pager {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: .5rem;
        margin-top: .75rem;
      }
      #${SECTION_ID} .oun-pager button {
        padding: .25rem .625rem;
        border: 1px solid rgba(156,163,175,.35);
        border-radius: .375rem;
        background: rgba(255,255,255,.8);
        color: inherit;
        font-size: .8125rem;
        cursor: pointer;
        line-height: 1.4;
      }
      .dark #${SECTION_ID} .oun-pager button {
        background: rgba(31,41,55,.7);
        border-color: rgba(75,85,99,.6);
      }
      #${SECTION_ID} .oun-pager button:hover:not(:disabled) {
        background: rgba(99,102,241,.15);
        border-color: rgb(99,102,241);
      }
      #${SECTION_ID} .oun-pager button:disabled {
        opacity: .35;
        cursor: default;
      }
      #${SECTION_ID} .oun-pager span {
        font-size: .8125rem;
        color: rgb(107,114,128);
      }
      .dark #${SECTION_ID} .oun-pager span {
        color: rgb(156,163,175);
      }
    `;
    document.head.appendChild(style);
  }

  function getInsertAnchor() {
    const noteField = document.querySelector("#usernote");
    if (noteField) {
      return (
        noteField.closest(".my-3.max-w-screen-sm") || noteField.closest("div")
      );
    }
    const descriptionHeading = Array.from(document.querySelectorAll("h3")).find(
      (h) => h.textContent?.trim().toLowerCase() === "description",
    );
    return descriptionHeading ? descriptionHeading.parentElement : null;
  }

  function ensureSection() {
    ensureStyles();
    let section = document.getElementById(SECTION_ID);
    const anchor = getInsertAnchor();
    if (!anchor) return null;

    if (!section) {
      section = document.createElement("section");
      section.id = SECTION_ID;
      section.className = "my-4";
      section.innerHTML = `
        <h3 class="mb-2">Community Notes</h3>
        <div class="oun-sub oun-status"></div>
      `;
    }
    if (section.previousElementSibling !== anchor) {
      anchor.insertAdjacentElement("afterend", section);
    }
    return section;
  }

  function removeSection() {
    document.getElementById(SECTION_ID)?.remove();
  }

  function updateProgress(current, total, label) {
    const section = ensureSection();
    if (!section) return;

    let status = section.querySelector(".oun-status");
    if (!status) {
      status = document.createElement("div");
      status.className = "oun-sub oun-status";
      section.appendChild(status);
    }

    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    status.innerHTML = `
      <div class="oun-progress">
        <span>${label}</span>
        <span class="oun-bar"><span class="oun-bar-fill" style="width:${pct}%"></span></span>
      </div>
    `;
  }

  function updateStatus(message) {
    const section = ensureSection();
    if (!section) return;
    let status = section.querySelector(".oun-status");
    if (!status) {
      status = document.createElement("div");
      status.className = "oun-sub oun-status";
      section.appendChild(status);
    }
    status.textContent = message;
  }

  function appendTextWithLinks(container, text) {
    const parts = String(text).split(/(https?:\/\/[^\s]+)/g);
    for (const part of parts) {
      if (!part) continue;
      if (/^https?:\/\/[^\s]+$/i.test(part)) {
        const link = document.createElement("a");
        link.href = part;
        link.textContent = part;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "link";
        container.appendChild(link);
      } else {
        container.appendChild(document.createTextNode(part));
      }
    }
  }

  let lastRenderedNotes = [];
  let lastRenderedUserCount = 0;
  let lastRenderedLoading = false;

  function renderNotes(notes, userCount, loading = false) {
    lastRenderedNotes = notes;
    lastRenderedUserCount = userCount;
    lastRenderedLoading = loading;
    renderPage();
  }

  function renderPage() {
    const notes = lastRenderedNotes;
    const userCount = lastRenderedUserCount;
    const loading = lastRenderedLoading;
    const section = ensureSection();
    if (!section) return;

    const totalPages = Math.max(1, Math.ceil(notes.length / NOTES_PER_PAGE));
    if (notesPage >= totalPages) notesPage = totalPages - 1;
    if (notesPage < 0) notesPage = 0;

    const start = notesPage * NOTES_PER_PAGE;
    const pageNotes = notes.slice(start, start + NOTES_PER_PAGE);

    const countText = `${notes.length} note${notes.length === 1 ? "" : "s"} from ${userCount} user${userCount === 1 ? "" : "s"}`;

    section.innerHTML = `
      <h3 class="mb-2">Community Notes</h3>
      <div class="oun-sub">${countText}${loading ? " (scanning\u2026)" : ""}</div>
      <div class="oun-list"></div>
    `;

    const list = section.querySelector(".oun-list");

    if (!notes.length) {
      const empty = document.createElement("div");
      empty.className = "oun-sub";
      empty.style.marginTop = ".5rem";
      empty.textContent = loading ? "Scanning\u2026" : "No notes found.";
      list.appendChild(empty);
      return;
    }

    for (const entry of pageNotes) {
      const item = document.createElement("article");
      item.className = "oun-item";

      const meta = document.createElement("div");
      meta.className = "oun-meta";

      if (entry.gravatar) {
        const avatar = document.createElement("img");
        avatar.className = "oun-avatar";
        avatar.src = entry.gravatar;
        avatar.alt = "";
        avatar.loading = "lazy";
        meta.appendChild(avatar);
      }

      const name = document.createElement("strong");
      name.textContent = entry.username;
      meta.appendChild(name);
      item.appendChild(meta);

      const note = document.createElement("div");
      note.className = "oun-note";
      appendTextWithLinks(note, entry.note);
      item.appendChild(note);

      list.appendChild(item);
    }

    if (totalPages > 1) {
      const pager = document.createElement("div");
      pager.className = "oun-pager";

      const prev = document.createElement("button");
      prev.textContent = "\u2039 Prev";
      prev.disabled = notesPage === 0;
      prev.addEventListener("click", () => { notesPage--; renderPage(); });

      const label = document.createElement("span");
      label.textContent = `${notesPage + 1} / ${totalPages}`;

      const next = document.createElement("button");
      next.textContent = "Next \u203A";
      next.disabled = notesPage >= totalPages - 1;
      next.addEventListener("click", () => { notesPage++; renderPage(); });

      pager.append(prev, label, next);
      section.appendChild(pager);
    }
  }

  async function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let idx = 0;
    async function worker() {
      while (idx < items.length) {
        const i = idx++;
        results[i] = await mapper(items[i], i);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, () =>
        worker(),
      ),
    );
    return results;
  }

  async function fetchComicBySlug(slug) {
    return fetchJson(
      `${API_BASE_URL}/comic/${encodeURIComponent(slug)}/?tachiyomi=true`,
      `comic:${slug}`,
    );
  }

  async function fetchSeriesComments(comicId) {
    const firstPage = await fetchJson(
      `${API_BASE_URL}/comment/comic/${comicId}?page=1`,
      `comic-comments:${comicId}:page:1`,
    );

    const firstComments = Array.isArray(firstPage?.comments)
      ? firstPage.comments
      : [];
    const remaining = Number.isFinite(firstPage?.remaining)
      ? firstPage.remaining
      : 0;

    if (remaining <= 0 || !firstComments.length) return firstComments;

    const extraPages = Math.ceil(remaining / Math.max(firstComments.length, 1));
    const pageNumbers = Array.from({ length: extraPages }, (_, i) => i + 2);

    const results = await mapWithConcurrency(pageNumbers, 3, (page) =>
      fetchJson(
        `${API_BASE_URL}/comment/comic/${comicId}?page=${page}`,
        `comic-comments:${comicId}:page:${page}`,
      ).catch(() => ({ comments: [] })),
    );

    const allComments = [...firstComments];
    for (const data of results) {
      const c = Array.isArray(data?.comments) ? data.comments : [];
      allComments.push(...c);
    }
    return allComments;
  }

  async function fetchReviews(comicId) {
    return fetchJson(
      `${API_BASE_URL}/reviews/list?id=${comicId}&most_helpful_limit=3&review_type=all`,
      `reviews:${comicId}`,
    );
  }

  async function fetchAllChapters(comicHid) {
    const firstPage = await fetchJson(
      `${API_BASE_URL}/comic/${encodeURIComponent(comicHid)}/chapters?limit=${CHAPTERS_PAGE_LIMIT}&page=1`,
      `chapters:${comicHid}:page:1`,
    );

    const firstChapters = Array.isArray(firstPage?.chapters)
      ? firstPage.chapters
      : [];
    const total = Number.isFinite(firstPage?.total)
      ? firstPage.total
      : firstChapters.length;

    if (firstChapters.length >= total) return firstChapters;

    const totalPages = Math.ceil(total / CHAPTERS_PAGE_LIMIT);
    const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

    const results = await mapWithConcurrency(pageNumbers, 3, (page) =>
      fetchJson(
        `${API_BASE_URL}/comic/${encodeURIComponent(comicHid)}/chapters?limit=${CHAPTERS_PAGE_LIMIT}&page=${page}`,
        `chapters:${comicHid}:page:${page}`,
      ).catch(() => ({ chapters: [] })),
    );

    const allChapters = [...firstChapters];
    for (const data of results) {
      const c = Array.isArray(data?.chapters) ? data.chapters : [];
      allChapters.push(...c);
    }
    return allChapters;
  }

  async function fetchChapterComments(chapter, comicId) {
    const lang = chapter?.lang || "en";
    const chap = chapter?.chap ?? "";
    return fetchJson(
      `${API_BASE_URL}/comment/chapter/${chapter.id}?lang=${encodeURIComponent(lang)}&comic-id=${comicId}&chap=${encodeURIComponent(chap)}`,
      `chapter-comments:${chapter.id}:${comicId}:${lang}:${chap}`,
    );
  }

  async function fetchUserFollows(userId) {
    return fetchJson(
      `${API_BASE_URL}/user/${encodeURIComponent(userId)}/follows`,
      `user-follows:${userId}`,
      FOLLOWS_CACHE_TTL_MS,
    );
  }

  function addUserToMap(userMap, identities, sourceLabel) {
    const userId = identities?.id;
    if (!userId) return;
    const username = identities?.traits?.username || "Unknown user";
    if (!userMap.has(userId)) {
      userMap.set(userId, {
        id: userId,
        username,
        gravatar: identities?.traits?.gravatar || "",
        sources: new Set(),
      });
    }
    userMap.get(userId).sources.add(sourceLabel);
  }

  function walkCommentTree(comment, sourceLabel, userMap) {
    if (!comment || typeof comment !== "object") return;
    addUserToMap(userMap, comment.identities, sourceLabel);
    const replies = Array.isArray(comment.other_comments)
      ? comment.other_comments
      : [];
    for (const reply of replies) walkCommentTree(reply, sourceLabel, userMap);
  }

  function collectUsersFromComments(comments, sourceLabel, userMap) {
    for (const c of comments) walkCommentTree(c, sourceLabel, userMap);
  }

  function collectUsersFromReviews(reviewsData, userMap) {
    const buckets = [
      ...(Array.isArray(reviewsData?.most_helpful) ? reviewsData.most_helpful : []),
      ...(Array.isArray(reviewsData?.recently_posted) ? reviewsData.recently_posted : []),
    ];
    if (reviewsData?.current_user_review) buckets.push(reviewsData.current_user_review);
    if (reviewsData?.focused_review) buckets.push(reviewsData.focused_review);
    for (const review of buckets) addUserToMap(userMap, review?.identities, "review");
  }

  function findNoteForSeries(follows, comic) {
    if (!Array.isArray(follows)) return null;
    return (
      follows.find((f) => {
        const c = f?.md_comics;
        return c && (c.id === comic.id || c.hid === comic.hid || c.slug === comic.slug);
      }) || null
    );
  }

  async function checkUserNote(user, comic, scanCache) {
    const follows = await fetchUserFollows(user.id);
    const followEntry = findNoteForSeries(follows, comic);
    const note =
      typeof followEntry?.notes === "string" ? followEntry.notes.trim() : "";

    scanCache.scannedUsers[user.id] = {
      username: user.username,
      gravatar: user.gravatar,
      sources: Array.from(user.sources).sort(),
      scannedAt: Date.now(),
      hasNote: Boolean(note),
    };

    if (note) {
      scanCache.notes[user.id] = note;
      return {
        username: user.username,
        gravatar: user.gravatar,
        note,
      };
    }
    delete scanCache.notes[user.id];
    return null;
  }

  async function collectSeriesNotes(comic, runToken) {
    updateStatus("Loading\u2026");

    const [reviewsData, seriesComments, chapters] = await Promise.all([
      fetchReviews(comic.id),
      fetchSeriesComments(comic.id),
      fetchAllChapters(comic.hid),
    ]);

    if (runToken !== currentRunToken) throw new Error("Stale run");

    const userMap = new Map();
    collectUsersFromReviews(reviewsData, userMap);
    collectUsersFromComments(seriesComments, "series comment", userMap);

    const scanCache = getSeriesScanCache(comic);
    const notes = [];

    const addCachedNotes = () => {
      for (const [userId, noteText] of Object.entries(scanCache.notes)) {
        if (notes.some((n) => n.userId === userId)) continue;
        const userData = scanCache.scannedUsers[userId] || userMap.get(userId);
        if (!userData) continue;
        notes.push({
          userId,
          username: userData.username,
          gravatar: userData.gravatar,
          note: noteText,
        });
      }
    };
    addCachedNotes();

    const usersAlreadyQueued = new Set();
    const followQueue = [];
    let followsDone = false;
    let followsProcessed = 0;

    const queueNewUsers = () => {
      for (const [userId, user] of userMap) {
        if (usersAlreadyQueued.has(userId)) continue;
        const cached = scanCache.scannedUsers[userId];
        if (cached?.scannedAt) {
          usersAlreadyQueued.add(userId);
          followsProcessed++;
          continue;
        }
        usersAlreadyQueued.add(userId);
        followQueue.push(user);
      }
    };

    queueNewUsers();

    let queueIdx = 0;
    const followWorker = async () => {
      while (!followsDone) {
        if (notes.length >= MAX_NOTES) break;
        if (queueIdx >= followQueue.length) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }
        const user = followQueue[queueIdx++];
        if (runToken !== currentRunToken) throw new Error("Stale run");

        const result = await checkUserNote(user, comic, scanCache);
        followsProcessed++;

        if (result && notes.length < MAX_NOTES) {
          result.userId = user.id;
          notes.push(result);
          renderNotes(notes, userMap.size, true);
        }

        if (followsProcessed % 5 === 0) {
          setSeriesScanCache(comic, scanCache);
          updateProgress(
            followsProcessed,
            Math.max(userMap.size, followQueue.length + followsProcessed),
            `Loading\u2026 ${followsProcessed}/${Math.max(userMap.size, followQueue.length + followsProcessed)}`,
          );
        }
      }
    };

    const workerCount = USER_FOLLOWS_CONCURRENCY;
    const workers = Array.from({ length: workerCount }, () => followWorker());

    let chaptersProcessed = 0;
    await mapWithConcurrency(chapters, CHAPTER_COMMENT_CONCURRENCY, async (chapter) => {
      if (notes.length >= MAX_NOTES) return;
      const data = await fetchChapterComments(chapter, comic.id);
      if (runToken !== currentRunToken) throw new Error("Stale run");

      collectUsersFromComments(
        Array.isArray(data?.comments) ? data.comments : [],
        `ch.${chapter.chap}`,
        userMap,
      );

      queueNewUsers();
      chaptersProcessed++;
      if (chaptersProcessed % 10 === 0 || chaptersProcessed === chapters.length) {
        updateProgress(
          chaptersProcessed,
          chapters.length,
          `Loading\u2026 ${chaptersProcessed}/${chapters.length}`,
        );
      }
    });

    queueNewUsers();

    const waitForDrain = async () => {
      while (queueIdx < followQueue.length && notes.length < MAX_NOTES) {
        await new Promise((r) => setTimeout(r, 50));
      }
    };
    await waitForDrain();
    followsDone = true;
    await Promise.all(workers);

    setSeriesScanCache(comic, scanCache);

    return { notes, userCount: userMap.size };
  }

  async function loadNotesForCurrentSeries() {
    if (!isSeriesPage()) {
      activeLoadSlug = null;
      removeSection();
      return;
    }

    const slug = getSeriesSlug();
    if (!slug) return;

    const section = ensureSection();
    if (!section) return;

    if (activeLoadSlug === slug) return;
    if (completedSlugs.has(slug)) return;

    const runToken = ++currentRunToken;
    notesPage = 0;
    activeLoadSlug = slug;

    try {
      updateStatus("Loading\u2026");
      const data = await fetchComicBySlug(slug);
      if (runToken !== currentRunToken) return;

      const comic = data?.comic;
      if (!comic?.id || !comic?.hid) throw new Error("Could not identify comic.");

      const result = await collectSeriesNotes(comic, runToken);
      if (runToken !== currentRunToken) return;

      completedSlugs.add(slug);
      renderNotes(result.notes, result.userCount);
    } catch (error) {
      if (String(error?.message || error) === "Stale run") return;
      updateStatus(`Error: ${error.message || "Unknown error"}`);
    } finally {
      if (activeLoadSlug === slug) activeLoadSlug = null;
    }
  }

  function scheduleLoad() {
    setTimeout(() => loadNotesForCurrentSeries(), 250);
  }

  function handleUrlChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    scheduleLoad();
  }

  function init() {
    scheduleLoad();
    const observer = new MutationObserver(() => {
      handleUrlChange();
      if (isSeriesPage() && !completedSlugs.has(getSeriesSlug())) {
        loadNotesForCurrentSeries();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
