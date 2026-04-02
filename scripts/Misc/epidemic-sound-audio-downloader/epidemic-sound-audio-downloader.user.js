// ==UserScript==
// @name         Epidemic Sound Audio Downloader
// @namespace    https://github.com/GooglyBlox
// @version      1.0
// @description  Directly download audio from Epidemic Sound without a premium account.
// @author       GooglyBlox
// @license      MIT
// @match        https://www.epidemicsound.com/*
// @grant        GM_download
// @connect      audiocdn.epidemicsound.com
// @downloadURL https://update.greasyfork.org/scripts/572169/Epidemic%20Sound%20Audio%20Downloader.user.js
// @updateURL https://update.greasyfork.org/scripts/572169/Epidemic%20Sound%20Audio%20Downloader.meta.js
// ==/UserScript==

(function () {
  'use strict';

  const TRACK_ROW_SELECTOR = 'li[class*="TrackRow_trackRow"]';
  const DOWNLOAD_BUTTON_SELECTOR = 'button[aria-label="Download"]';
  const TRACK_LINK_SELECTOR = 'a[href*="/music/tracks/"]';

  const STATE = {
    tracksByPath: new Map(),
    tracksById: new Map(),
  };

  init();

  function init() {
    indexInlineTrackData();
    document.addEventListener('pointerdown', suppressNativeDownload, true);
    document.addEventListener('mousedown', suppressNativeDownload, true);
    document.addEventListener('click', onDownloadClick, true);
    document.addEventListener('keydown', onDownloadKeydown, true);
    console.info('[Epidemic direct download] ready');
  }

  function getDownloadButtonInRow(event) {
    const button = event.target.closest(DOWNLOAD_BUTTON_SELECTOR);
    if (!button || !button.closest(TRACK_ROW_SELECTOR)) return null;
    return button;
  }

  function suppressNativeDownload(event) {
    if (!getDownloadButtonInRow(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function onDownloadClick(event) {
    const button = getDownloadButtonInRow(event);
    if (!button) return;

    const row = button.closest(TRACK_ROW_SELECTOR);
    if (!row) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const originalLabel = button.getAttribute('aria-label') || 'Download';
    setBusy(button, true);

    prepareTrackForDownload(row)
      .then(() => {
        const track = getTrackForRow(row);
        if (!track?.url) {
          throw new Error('No MP3 URL found for row after priming playback');
        }
        return downloadTrack(track);
      })
      .catch((error) => {
        console.error('[Epidemic direct download] download failed', error);
        const track = getTrackForRow(row);
        if (track?.url) {
          fallbackDownload(track.url, track.filename);
        }
      })
      .finally(() => {
        setBusy(button, false, originalLabel);
      });
  }

  function onDownloadKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!getDownloadButtonInRow(event)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    event.target.closest(DOWNLOAD_BUTTON_SELECTOR).click();
  }

  function setBusy(button, busy, label = 'Download') {
    button.dataset.esDirectDownloadBusy = busy ? 'true' : 'false';
    button.style.opacity = busy ? '0.6' : '';
    button.style.pointerEvents = busy ? 'none' : '';
    button.setAttribute('aria-label', busy ? 'Downloading' : label);
    button.title = busy ? 'Downloading preview MP3...' : '';
  }

  function getTrackForRow(row) {
    const link = row.querySelector(TRACK_LINK_SELECTOR);
    const path = normalizeTrackPath(link?.getAttribute('href'));
    const title = sanitizeFileName(link?.textContent?.trim() || 'track');

    if (!path) return null;

    const trackId = extractTrackId(path);
    const indexedTrack =
      STATE.tracksByPath.get(path) ||
      (trackId ? STATE.tracksById.get(trackId) : null);

    if (indexedTrack?.url) {
      return {
        ...indexedTrack,
        filename: buildFilename(indexedTrack.title || title, indexedTrack.artist),
      };
    }

    const resolvedUrl =
      findMp3NearRow(row) ||
      getActiveAudioUrl() ||
      findMp3InDocument(path, trackId);

    if (!resolvedUrl) return null;

    return {
      id: trackId,
      path,
      title,
      url: resolvedUrl,
      filename: buildFilename(title),
    };
  }

  async function prepareTrackForDownload(row) {
    const playButton = findPlayButton(row);
    if (!playButton) return;

    const previousAudio = getActiveAudioElement();
    const wasPaused = previousAudio ? previousAudio.paused : true;
    const previousTime = previousAudio ? previousAudio.currentTime : 0;

    playButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    playButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    playButton.click();

    await waitFor(() => {
      const track = getTrackForRow(row);
      return Boolean(track?.url);
    }, 2500);

    await delay(60);

    const currentAudio = getActiveAudioElement();
    if (!currentAudio) return;

    currentAudio.pause();

    if (currentAudio === previousAudio) {
      try {
        currentAudio.currentTime = previousTime;
      } catch {
        // Seek can fail during transient media state changes
      }

      if (!wasPaused) {
        currentAudio.play().catch(() => {});
      }
    }
  }

  function findPlayButton(row) {
    return Array.from(row.querySelectorAll('button[aria-label="Play"]'))
      .find((button) => button !== row.querySelector(DOWNLOAD_BUTTON_SELECTOR)) || null;
  }

  function findMp3NearRow(row) {
    const match = row.outerHTML.match(/https:\/\/audiocdn\.epidemicsound\.com\/[^"'\\\s]+\.mp3/);
    return match ? match[0] : null;
  }

  function getActiveAudioElement() {
    return document.querySelector('audio');
  }

  function getActiveAudioUrl() {
    const audio = getActiveAudioElement();
    const source = audio?.currentSrc || audio?.src;
    return source && source.includes('audiocdn.epidemicsound.com') ? source : null;
  }

  function downloadTrack(track) {
    if (typeof GM_download === 'function') {
      return new Promise((resolve, reject) => {
        GM_download({
          url: track.url,
          name: track.filename,
          saveAs: false,
          onload: resolve,
          onerror: reject,
          ontimeout: reject,
        });
      });
    }

    fallbackDownload(track.url, track.filename);
    return Promise.resolve();
  }

  function fallbackDownload(url, filename = 'track.mp3') {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function indexInlineTrackData() {
    const candidates = [];

    for (const script of document.querySelectorAll('script')) {
      const text = script.textContent;
      if (!text || !text.includes('lqMp3Url')) continue;
      candidates.push(text);
    }

    for (const text of candidates) {
      for (const track of extractTracks(text)) {
        if (!track.path || !track.url) continue;
        STATE.tracksByPath.set(track.path, track);
        if (track.id) {
          STATE.tracksById.set(track.id, track);
        }
      }
    }
  }

  function extractTracks(text) {
    const tracks = [];
    const regex = /"title":"((?:\\.|[^"])*)".*?"lqMp3Url":"(https?:\\?\/\\?\/audiocdn\.epidemicsound\.com\\?\/[^"]+?\.mp3)".*?"pathname":"(\/music\/tracks\/[^"]+\/)".*?"mainArtists":\[\{"name":"((?:\\.|[^"])*)"/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const title = decodeEscapedJsonString(match[1]);
      const url = decodeEscapedJsonString(match[2]);
      const path = normalizeTrackPath(decodeEscapedJsonString(match[3]));
      const artist = decodeEscapedJsonString(match[4]);
      const id = extractTrackId(path);

      tracks.push({ id, path, title, artist, url });
    }

    return tracks;
  }

  function findMp3InDocument(path, trackId) {
    const html = document.documentElement.innerHTML;
    const needles = [
      path,
      path?.replaceAll('/', '\\/'),
      trackId,
    ].filter(Boolean);

    for (const needle of needles) {
      const index = html.indexOf(needle);
      if (index === -1) continue;

      const start = Math.max(0, index - 4000);
      const end = Math.min(html.length, index + 12000);
      const url = extractMp3Url(html.slice(start, end));
      if (url) return url;
    }

    return null;
  }

  function extractMp3Url(text) {
    if (!text) return null;

    const patterns = [
      /https:\/\/audiocdn\.epidemicsound\.com\/[^"'\\\s]+\.mp3/,
      /https?:\\\/\\\/audiocdn\.epidemicsound\.com\\\/[^"]+?\.mp3/,
      /https?:\/\/audiocdn\.epidemicsound\.com\/[^"'\\\s]+\.mp3/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return decodeEscapedJsonString(match[0]);
    }

    return null;
  }

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function waitFor(predicate, timeoutMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();

      function poll() {
        try {
          if (predicate()) {
            resolve();
            return;
          }
        } catch {
          // Keep polling while the UI settles
        }

        if (Date.now() - start >= timeoutMs) {
          reject(new Error('Timed out waiting for track audio to load'));
          return;
        }

        window.setTimeout(poll, 25);
      }

      poll();
    });
  }

  function decodeEscapedJsonString(value) {
    try {
      return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
    } catch {
      return value
        .replace(/\\u0026/g, '&')
        .replace(/\\u002F/gi, '/')
        .replace(/\\\\\//g, '/')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }

  function normalizeTrackPath(path) {
    if (!path) return null;

    try {
      const url = new URL(path, location.origin);
      const normalized = url.pathname.replace(/\/+$/, '');
      return normalized ? `${normalized}/` : null;
    } catch {
      return null;
    }
  }

  function extractTrackId(path) {
    const match = path?.match(/\/music\/tracks\/([^/]+)\//);
    return match ? match[1] : null;
  }

  function buildFilename(title, artist) {
    const base = artist ? `${artist} - ${title}` : title;
    return `${sanitizeFileName(base)}.mp3`;
  }

  function sanitizeFileName(value) {
    return (value || 'track')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  }
})();