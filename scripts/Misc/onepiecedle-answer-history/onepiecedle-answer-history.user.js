// ==UserScript==
// @name         OnePiecedle Answer History
// @namespace    https://github.com/GooglyBlox
// @version      1.0
// @description  Tracks and displays your correct OnePiecedle answers across all game modes
// @author       GooglyBlox
// @match        https://onepiecedle.net/*
// @grant        GM_addStyle
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/572582/OnePiecedle%20Answer%20History.user.js
// @updateURL https://update.greasyfork.org/scripts/572582/OnePiecedle%20Answer%20History.meta.js
// ==/UserScript==

(function () {
  "use strict";

  const MODE_MAP = {
    "/classic": "classic",
    "/devilfruit": "devilfruit",
    "/wanted": "wanted",
    "/laugh": "laugh",
  };

  const MODE_LABELS = {
    classic: "Classic",
    devilfruit: "Devil Fruit",
    wanted: "Wanted",
    laugh: "Laugh",
  };

  const STORAGE_KEY = "onepiecedle-answer-history";
  const PUZZLE_KEY_PREFIX = "puzzle-";
  const MODE_ICONS = {
    classic: "/img/Classic.12c6a5e2.png",
    devilfruit: "/img/Devil.398d12d3.png",
    wanted: "/img/Wanted.58885dff.png",
    laugh: "/img/Laugh.91116a28.png",
  };

  function getMode() {
    const path = window.location.pathname;
    for (const [prefix, mode] of Object.entries(MODE_MAP)) {
      if (path.startsWith(prefix)) return mode;
    }
    return null;
  }

  function getTodayKey() {
    const now = new Date();
    const utcMinus6 = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const year = utcMinus6.getUTCFullYear();
    const month = String(utcMinus6.getUTCMonth() + 1).padStart(2, "0");
    const day = String(utcMinus6.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeModeKey(value) {
    if (!value) return null;

    const normalized = String(value).toLowerCase().replace(/[^a-z]/g, "");
    if (normalized === "devilfruit") return "devilfruit";
    if (normalized === "classic") return "classic";
    if (normalized === "wanted") return "wanted";
    if (normalized === "laugh") return "laugh";
    return null;
  }

  function parseStoredJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function readPuzzleNumeroFromList(key, mode) {
    const entries = parseStoredJson(key);
    if (!Array.isArray(entries)) return null;

    for (const entry of entries) {
      if (!entry || typeof entry.gameNumero !== "number") continue;
      if (!mode) return entry.gameNumero;
      if (normalizeModeKey(entry.gameName) === mode) return entry.gameNumero;
    }

    return null;
  }

  function readPuzzleNumeroFromObject(key) {
    const entry = parseStoredJson(key);
    return entry && typeof entry.gameNumero === "number" ? entry.gameNumero : null;
  }

  function getCurrentPuzzleNumero(mode) {
    const keysToCheck = [
      () => readPuzzleNumeroFromList("gamesDoneFull", mode),
      () => readPuzzleNumeroFromList("gamesDone", mode),
      () =>
        readPuzzleNumeroFromObject(
          mode === "classic" ? "classic_won_challenger" : `${mode}_won_keepBlur`
        ),
      () =>
        readPuzzleNumeroFromObject(
          mode === "wanted" ? "wanted_won_greyFilter" : `${mode}_won_greyFilter`
        ),
    ];

    for (const read of keysToCheck) {
      const numero = read();
      if (typeof numero === "number" && Number.isFinite(numero)) {
        return numero;
      }
    }

    return null;
  }

  function getHistoryRecordKey(mode) {
    const puzzleNumero = getCurrentPuzzleNumero(mode);
    return puzzleNumero !== null
      ? `${PUZZLE_KEY_PREFIX}${puzzleNumero}`
      : getTodayKey();
  }

  function getEntryDateKey(entry, fallbackKey) {
    return entry?.dateKey || fallbackKey;
  }

  function getCurrentEntry(history, mode) {
    const recordKey = getHistoryRecordKey(mode);
    const directMatch = history[mode]?.[recordKey];
    if (directMatch) return directMatch;

    const todayKey = getTodayKey();
    return history[mode]?.[todayKey] || null;
  }

  function getPastEntries(history) {
    const rows = [];

    for (const modeKey of Object.keys(MODE_LABELS)) {
      const modeHistory = history[modeKey];
      if (!modeHistory) continue;

      const currentEntry = getCurrentEntry(history, modeKey);

      for (const [recordKey, entry] of Object.entries(modeHistory)) {
        if (!entry || entry === currentEntry) continue;
        rows.push({
          modeKey,
          recordKey,
          entry,
          dateKey: getEntryDateKey(entry, recordKey),
          sortValue:
            typeof entry.timestamp === "number"
              ? entry.timestamp
              : Date.parse(getEntryDateKey(entry, recordKey)) || 0,
        });
      }
    }

    return rows;
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {
      // corrupted data, start fresh
    }
    return {};
  }

  function saveHistory(history) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }

  function saveAnswer(mode, characterName, characterImgSrc, tries) {
    const history = loadHistory();
    const dateKey = getTodayKey();
    const recordKey = getHistoryRecordKey(mode);
    const puzzleNumero = getCurrentPuzzleNumero(mode);

    if (!history[mode]) history[mode] = {};
    if (history[mode][recordKey]) return;

    history[mode][recordKey] = {
      name: characterName,
      img: characterImgSrc || null,
      tries: tries || null,
      dateKey,
      puzzleNumero,
      timestamp: Date.now(),
    };

    saveHistory(history);
  }

  function detectWin() {
    const mode = getMode();
    if (!mode) return;

    const endScreen = document.querySelector(".background-end");
    if (!endScreen) return;

    const nameEl = endScreen.querySelector(".gg-name");
    if (!nameEl) return;

    const characterName = nameEl.textContent.trim();
    if (!characterName) return;

    const imgEl = endScreen.querySelector(".gg-icon");
    const characterImg = imgEl ? imgEl.src : null;

    const triesEl = endScreen.querySelector(".nb-tries .nth");
    const tries = triesEl ? parseInt(triesEl.textContent.trim(), 10) : null;

    saveAnswer(mode, characterName, characterImg, tries);
  }

  function formatDate(dateKey) {
    const [year, month, day] = dateKey.split("-");
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
  }

  function buildModal() {
    const history = loadHistory();

    const overlay = document.createElement("div");
    overlay.className = "vm--container scrollable opd-history-shell";

    const backdrop = document.createElement("div");
    backdrop.className = "vm--overlay";
    backdrop.addEventListener("click", () => overlay.remove());
    overlay.appendChild(backdrop);

    const modal = document.createElement("div");
    modal.className = "vm--modal opd-history-modal";
    modal.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "opd-history-close";
    closeBtn.setAttribute("aria-label", "Close answer history");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => overlay.remove());

    const header = document.createElement("div");
    header.className = "opd-history-header";

    const title = document.createElement("div");
    title.className = "opd-history-title";
    title.textContent = "Answer History";

    const subtitle = document.createElement("div");
    subtitle.className = "opd-history-subtitle";
    subtitle.textContent = "Your OnePiecedle solves across every mode";

    header.appendChild(title);
    header.appendChild(subtitle);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const modeStrip = document.createElement("div");
    modeStrip.className = "games-progress-container opd-history-mode-strip";

    const rope = document.createElement("div");
    rope.className = "rope-background";
    modeStrip.appendChild(rope);

    const imagesContainer = document.createElement("div");
    imagesContainer.className = "images-container";

    for (const modeKey of Object.keys(MODE_LABELS)) {
      const wrapper = document.createElement("div");
      const isSolvedToday = Boolean(getCurrentEntry(history, modeKey));
      wrapper.className = `game-wrapper has-tooltip${isSolvedToday ? " game-selected" : ""}`;
      wrapper.setAttribute("data-original-title", MODE_LABELS[modeKey]);

      const img = document.createElement("img");
      img.src = MODE_ICONS[modeKey];
      img.className = `main-image${isSolvedToday ? " game-selected" : ""}`;
      wrapper.appendChild(img);

      if (isSolvedToday) {
        const check = document.createElement("img");
        check.src = "/img/Check.fa9ea16f.png";
        check.className = "green-check";
        wrapper.appendChild(check);
      }

      imagesContainer.appendChild(wrapper);
    }

    modeStrip.appendChild(imagesContainer);
    modal.appendChild(modeStrip);

    // --- Today's answers ---
    const todaySection = document.createElement("div");
    todaySection.className = "opd-history-section";

    const todayHeader = document.createElement("div");
    todayHeader.className = "opd-history-section-title";
    todayHeader.textContent = "Today's Answers";
    todaySection.appendChild(todayHeader);

    const todayGrid = document.createElement("div");
    todayGrid.className = "opd-history-grid";

    for (const [modeKey, modeLabel] of Object.entries(MODE_LABELS)) {
      const card = document.createElement("div");
      card.className = "opd-history-card";

      const cardLabel = document.createElement("div");
      cardLabel.className = "opd-history-card-label";
      cardLabel.textContent = modeLabel;

      const cardBody = document.createElement("div");
      cardBody.className = "opd-history-card-body";

      const entry = getCurrentEntry(history, modeKey);
      if (entry) {
        if (entry.img) {
          const img = document.createElement("img");
          img.src = entry.img;
          img.className = "opd-history-char-img";
          cardBody.appendChild(img);
        }
        const nameSpan = document.createElement("div");
        nameSpan.className = "opd-history-char-name";
        nameSpan.textContent = entry.name;
        cardBody.appendChild(nameSpan);

        if (entry.tries) {
          const triesSpan = document.createElement("div");
          triesSpan.className = "opd-history-char-tries";
          triesSpan.textContent =
            entry.tries === 1 ? "ONE SHOT!" : `${entry.tries} tries`;
          cardBody.appendChild(triesSpan);
        }
      } else {
        const pending = document.createElement("div");
        pending.className = "opd-history-pending";
        pending.textContent = "---";
        cardBody.appendChild(pending);
      }

      card.appendChild(cardLabel);
      card.appendChild(cardBody);
      todayGrid.appendChild(card);
    }

    todaySection.appendChild(todayGrid);
    modal.appendChild(todaySection);

    // --- Previous days ---
    const pastSection = document.createElement("div");
    pastSection.className = "opd-history-section";

    const pastHeader = document.createElement("div");
    pastHeader.className = "opd-history-section-title";
    pastHeader.textContent = "Previous Days";
    pastSection.appendChild(pastHeader);

    const pastEntries = getPastEntries(history);
    const groupedByDate = new Map();

    for (const { modeKey, entry, dateKey, sortValue } of pastEntries) {
      if (!groupedByDate.has(dateKey)) {
        groupedByDate.set(dateKey, {
          sortValue,
          entries: {},
        });
      }

      const group = groupedByDate.get(dateKey);
      group.sortValue = Math.max(group.sortValue, sortValue);
      group.entries[modeKey] = entry;
    }

    const sortedDates = Array.from(groupedByDate.entries()).sort(
      (a, b) => b[1].sortValue - a[1].sortValue
    );

    if (sortedDates.length === 0) {
      const empty = document.createElement("div");
      empty.className = "opd-history-empty";
      empty.textContent =
        "No previous answers recorded yet. Come back tomorrow!";
      pastSection.appendChild(empty);
    } else {
      const table = document.createElement("div");
      table.className = "opd-history-table";

      const headerRow = document.createElement("div");
      headerRow.className = "opd-history-table-row opd-history-table-header";

      const dateHeader = document.createElement("div");
      dateHeader.className = "opd-history-table-cell opd-history-date-cell";
      dateHeader.textContent = "Date";
      headerRow.appendChild(dateHeader);

      for (const modeLabel of Object.values(MODE_LABELS)) {
        const modeHeader = document.createElement("div");
        modeHeader.className = "opd-history-table-cell";
        modeHeader.textContent = modeLabel;
        headerRow.appendChild(modeHeader);
      }

      table.appendChild(headerRow);

      for (const [dateKey, group] of sortedDates) {
        const row = document.createElement("div");
        row.className = "opd-history-table-row";

        const dateCell = document.createElement("div");
        dateCell.className = "opd-history-table-cell opd-history-date-cell";
        dateCell.textContent = formatDate(dateKey);
        row.appendChild(dateCell);

        for (const modeKey of Object.keys(MODE_LABELS)) {
          const cell = document.createElement("div");
          cell.className = "opd-history-table-cell";

          const entry = group.entries[modeKey];
          if (entry) {
            if (entry.img) {
              const img = document.createElement("img");
              img.src = entry.img;
              img.className = "opd-history-table-img";
              cell.appendChild(img);
            }
            const name = document.createElement("div");
            name.className = "opd-history-table-name";
            name.textContent = entry.name;
            cell.appendChild(name);

            if (entry.tries) {
              const tries = document.createElement("div");
              tries.className = "opd-history-table-tries";
              tries.textContent =
                entry.tries === 1 ? "1 try" : `${entry.tries} tries`;
              cell.appendChild(tries);
            }
          } else {
            const dash = document.createElement("div");
            dash.className = "opd-history-pending";
            dash.textContent = "-";
            cell.appendChild(dash);
          }

          row.appendChild(cell);
        }

        table.appendChild(row);
      }

      pastSection.appendChild(table);
    }

    modal.appendChild(pastSection);

    // --- Clear data ---
    const clearBtn = document.createElement("div");
    clearBtn.className = "opd-history-clear";
    clearBtn.textContent = "Clear history";
    clearBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to clear all answer history?")) {
        localStorage.removeItem(STORAGE_KEY);
        overlay.remove();
      }
    });
    modal.appendChild(clearBtn);

    overlay.appendChild(modal);

    return overlay;
  }

  function injectButton() {
    const headerButtons = document.querySelector(".header-buttons-container");
    if (!headerButtons) return;
    if (document.querySelector(".opd-history-button")) return;

    const helpButtons = headerButtons.querySelectorAll(".help-button");
    const howToPlayButton =
      helpButtons.length > 0 ? helpButtons[helpButtons.length - 1] : null;

    const btn = howToPlayButton
      ? howToPlayButton.cloneNode(true)
      : document.createElement("div");

    if (!howToPlayButton) {
      btn.className =
        "help-button animate__animated animate__fadeIn has-tooltip";
    }

    btn.classList.add("opd-history-button");
    btn.setAttribute("data-original-title", "Answer History");
    btn.removeAttribute("aria-describedby");

    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const existing = document.querySelector(".opd-history-shell");
      if (existing) {
        existing.remove();
        return;
      }
      document.body.appendChild(buildModal());
    });

    if (howToPlayButton) {
      howToPlayButton.replaceWith(btn);
    } else {
      headerButtons.appendChild(btn);
    }
  }

  function init() {
    detectWin();
    injectButton();
  }

  const observer = new MutationObserver(() => {
    detectWin();
    injectButton();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  GM_addStyle(`
      .opd-history-shell {
        z-index: 99999;
      }

      .opd-history-modal {
        width: min(760px, calc(100vw - 24px));
        max-width: 760px;
        max-height: calc(100vh - 40px);
        margin: 20px auto;
        overflow-y: auto;
        padding: 22px 22px 18px;
      }

      .opd-history-header {
        position: relative;
        text-align: center;
        padding: 0 44px 10px;
      }

      .opd-history-close {
        position: absolute;
        top: -4px;
        right: -4px;
        background: transparent;
        border: 0;
        color: #666;
        cursor: pointer;
        font-size: 34px;
        line-height: 1;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        outline: none;
        box-shadow: none;
        -webkit-tap-highlight-color: transparent;
      }

      .opd-history-close:hover,
      .opd-history-close:focus,
      .opd-history-close:focus-visible,
      .opd-history-close:active {
        background: transparent;
        color: #111;
        outline: none;
        box-shadow: none;
      }

      .opd-history-title {
        font-size: 28px;
        font-weight: 700;
        color: #222;
      }

      .opd-history-subtitle {
        margin-top: 4px;
        font-size: 13px;
        color: #666;
      }

      .opd-history-mode-strip {
        margin: 4px auto 18px;
        max-width: 420px;
        width: 100%;
      }

      .opd-history-mode-strip .images-container {
        display: flex;
        justify-content: center;
        align-items: flex-end;
        gap: 10px;
        flex-wrap: nowrap;
        width: 100%;
      }

      .opd-history-mode-strip .game-wrapper {
        position: relative;
        flex: 0 0 auto;
        width: 72px;
        min-width: 72px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .opd-history-section {
        margin-bottom: 18px;
      }

      .opd-history-section-title {
        font-size: 14px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #111;
        margin-bottom: 10px;
      }

      .opd-history-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
      }

      @media (max-width: 700px) {
        .opd-history-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .opd-history-card {
        min-height: 160px;
        padding: 12px 10px;
        justify-content: flex-start;
        display: flex;
        flex-direction: column;
        align-items: center;
        border: 1px solid #eee;
        border-radius: 8px;
        background: #fff;
        box-sizing: border-box;
        overflow: hidden;
      }

      .opd-history-card-label {
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        color: inherit;
        margin-top: 2px;
        margin-bottom: 10px;
      }

      .opd-history-card-body {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        justify-content: center;
        flex: 1;
        width: 100%;
        min-width: 0;
      }

      .opd-history-char-img {
        width: 54px !important;
        height: 54px !important;
        min-width: 54px !important;
        min-height: 54px !important;
        max-width: 54px !important;
        max-height: 54px !important;
        object-fit: cover !important;
        border-radius: 8px !important;
        display: block !important;
        flex: 0 0 54px !important;
      }

      .opd-history-char-name {
        font-size: 13px;
        font-weight: 700;
        color: inherit;
        max-width: 100%;
        text-align: center;
        word-break: break-word;
      }

      .opd-history-char-tries {
        font-size: 11px;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .opd-history-pending {
        font-size: 13px;
        color: #777;
        font-style: italic;
      }

      .opd-history-empty {
        text-align: center;
        color: #666;
        font-style: italic;
        padding: 16px 8px 6px;
      }

      .opd-history-table {
        width: 100%;
        overflow-x: auto;
        border: 1px solid #eee;
        border-radius: 8px;
      }

      .opd-history-table-row {
        display: grid;
        grid-template-columns: 132px repeat(4, minmax(116px, 1fr));
        border-bottom: 1px solid #eee;
      }

      .opd-history-table-row:last-child {
        border-bottom: 0;
      }

      @media (max-width: 760px) {
        .opd-history-table-row {
          min-width: 620px;
        }
      }

      .opd-history-table-header {
        background: #fafafa;
      }

      .opd-history-table-header .opd-history-table-cell {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #444;
      }

      .opd-history-table-cell {
        padding: 12px 8px;
        text-align: center;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }

      .opd-history-date-cell {
        text-align: left;
        justify-content: center;
        align-items: flex-start;
        font-weight: 700;
        color: #333;
        font-size: 12px;
      }

      .opd-history-table-img {
        width: 38px !important;
        height: 38px !important;
        min-width: 38px !important;
        min-height: 38px !important;
        max-width: 38px !important;
        max-height: 38px !important;
        object-fit: cover !important;
        border-radius: 6px !important;
        display: block !important;
      }

      .opd-history-table-name {
        font-size: 11px;
        font-weight: 700;
        color: #222;
      }

      .opd-history-table-tries {
        font-size: 10px;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .opd-history-clear {
        text-align: center;
        margin-top: 8px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: #666;
        cursor: pointer;
        text-transform: uppercase;
        text-decoration: underline;
      }

      .opd-history-clear:hover {
        color: #111;
      }

      .opd-history-button {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .opd-history-modal img {
        max-width: 100%;
      }

      .opd-history-mode-strip .main-image {
        width: 64px !important;
        height: 64px !important;
        min-width: 64px !important;
        min-height: 64px !important;
        max-width: 64px !important;
        max-height: 64px !important;
        object-fit: contain !important;
        display: block !important;
      }

      .opd-history-mode-strip .green-check {
        position: absolute;
        right: 2px;
        bottom: 0;
        width: 18px !important;
        height: 18px !important;
        min-width: 18px !important;
        min-height: 18px !important;
        max-width: 18px !important;
        max-height: 18px !important;
        object-fit: contain !important;
      }

      .opd-history-modal .opd-history-card img,
      .opd-history-modal .opd-history-table img {
        width: auto;
      }

      .opd-history-modal .opd-history-card .opd-history-char-img {
        width: 54px !important;
        height: 54px !important;
      }

      .opd-history-modal .opd-history-table .opd-history-table-img {
        width: 38px !important;
        height: 38px !important;
      }

      @media (max-width: 640px) {
        .opd-history-mode-strip {
          max-width: 320px;
        }

        .opd-history-mode-strip .images-container {
          gap: 6px;
        }

        .opd-history-mode-strip .game-wrapper {
          width: 56px;
          min-width: 56px;
        }

        .opd-history-mode-strip .main-image {
          width: 48px !important;
          height: 48px !important;
          min-width: 48px !important;
          min-height: 48px !important;
          max-width: 48px !important;
          max-height: 48px !important;
        }

        .opd-history-mode-strip .green-check {
          width: 15px !important;
          height: 15px !important;
          min-width: 15px !important;
          min-height: 15px !important;
          max-width: 15px !important;
          max-height: 15px !important;
          right: 1px;
        }

        .opd-history-modal {
          width: min(760px, calc(100vw - 12px));
          padding: 18px 14px 14px;
        }

        .opd-history-header {
          padding: 0 34px 10px;
        }
      }
    `);
})();
