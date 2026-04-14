// ==UserScript==
// @name         Reddit Gallery Slide Counter
// @namespace    https://github.com/GooglyBlox
// @version      1.0
// @description  Shows a slide counter on Reddit image galleries
// @author       GooglyBlox
// @match        https://www.reddit.com/*
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/573850/Reddit%20Gallery%20Slide%20Counter.user.js
// @updateURL https://update.greasyfork.org/scripts/573850/Reddit%20Gallery%20Slide%20Counter.meta.js
// ==/UserScript==

(function () {
  "use strict";

  const COUNTER_ID = "gg-gallery-counter";

  function getSlides(galleryCarousel) {
    return Array.from(galleryCarousel.querySelectorAll("ul > li[slot^='page-']"));
  }

  function getCurrentIndex(slides) {
    return slides.findIndex((li) => li.style.visibility === "visible");
  }

  function getOrCreateCounter(galleryCarousel) {
    let anchor = galleryCarousel.querySelector(`#${COUNTER_ID}`);
    if (!anchor) {
      anchor = document.createElement("div");
      anchor.id = COUNTER_ID;
      anchor.style.cssText = "all: initial; position: absolute; top: 10px; right: 10px; z-index: 20; pointer-events: none;";

      const pill = document.createElement("span");
      pill.className = "gg-pill";
      pill.style.cssText = [
        "all: initial",
        "display: inline-block",
        "background: rgba(0,0,0,0.65)",
        "color: #fff",
        "font-size: 13px",
        "font-family: sans-serif",
        "font-weight: 600",
        "line-height: 1",
        "border-radius: 999px",
        "padding-top: 4px",
        "padding-bottom: 4px",
        "padding-left: 8px",
        "padding-right: 8px",
        "white-space: nowrap",
        "box-sizing: content-box",
      ].join("; ");

      anchor.appendChild(pill);
      galleryCarousel.style.position = "relative";
      galleryCarousel.appendChild(anchor);
    }
    return anchor;
  }

  function updateCounter(galleryCarousel) {
    const slides = getSlides(galleryCarousel);
    if (slides.length <= 1) return;

    const index = getCurrentIndex(slides);
    if (index === -1) return;

    const anchor = getOrCreateCounter(galleryCarousel);
    const pill = anchor.querySelector(".gg-pill");
    pill.textContent = `${index + 1} / ${slides.length}`;
  }

  function attachToGallery(galleryCarousel) {
    const slides = getSlides(galleryCarousel);
    if (slides.length <= 1) return;

    updateCounter(galleryCarousel);

    const ul = galleryCarousel.querySelector("ul");
    if (!ul) return;

    new MutationObserver(() => {
      updateCounter(galleryCarousel);
    }).observe(ul, {
      attributes: true,
      attributeFilter: ["style"],
      subtree: true,
    });
  }

  function init() {
    document.querySelectorAll("gallery-carousel").forEach(attachToGallery);

    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.tagName?.toLowerCase() === "gallery-carousel") {
            attachToGallery(node);
          }
          node.querySelectorAll?.("gallery-carousel").forEach(attachToGallery);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();