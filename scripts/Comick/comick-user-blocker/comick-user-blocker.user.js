// ==UserScript==
// @name         Comick User Blocker
// @namespace    https://github.com/GooglyBlox
// @version      1.0
// @description  Block users on comick.dev and hide their reviews, comments, list activity, and custom lists
// @author       GooglyBlox
// @license      MIT
// @match        https://comick.dev/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      auth.comick.dev
// @run-at       document-start
// @downloadURL https://update.greasyfork.org/scripts/574667/Comick%20User%20Blocker.user.js
// @updateURL https://update.greasyfork.org/scripts/574667/Comick%20User%20Blocker.meta.js
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'comick_blocked_users';
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const USER_PATH_RE = /^\/user\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

    let currentUserId = null;
    let blockedCache = null;
    let scheduled = false;
    let suppressObserver = false;

    function getBlocked() {
        if (blockedCache) return blockedCache;
        try {
            const raw = GM_getValue(STORAGE_KEY, '{}');
            blockedCache = JSON.parse(raw);
        } catch {
            blockedCache = {};
        }
        return blockedCache;
    }

    function saveBlocked(map) {
        blockedCache = map;
        GM_setValue(STORAGE_KEY, JSON.stringify(map));
    }

    function blockUser(uuid, username) {
        if (!UUID_RE.test(uuid)) return;
        const map = getBlocked();
        map[uuid] = {
            username: username || 'Unknown',
            blockedAt: Date.now()
        };
        saveBlocked(map);
        scheduleUpdate(true);
    }

    function unblockUser(uuid) {
        const map = getBlocked();
        delete map[uuid];
        saveBlocked(map);
        scheduleUpdate(true);
    }

    function isBlocked(uuid) {
        if (!uuid) return false;
        return Object.prototype.hasOwnProperty.call(getBlocked(), uuid);
    }

    function fetchCurrentUser() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://auth.comick.dev/sessions/whoami',
                headers: {
                    'accept': 'application/json, text/plain, */*'
                },
                withCredentials: true,
                onload(res) {
                    try {
                        const data = JSON.parse(res.responseText);
                        const id = data && data.identity && data.identity.id;
                        if (id && UUID_RE.test(id)) {
                            currentUserId = id;
                        }
                    } catch {
                        /* not logged in */
                    }
                    resolve(currentUserId);
                },
                onerror() {
                    resolve(null);
                },
                ontimeout() {
                    resolve(null);
                }
            });
        });
    }

    function extractUuidFromHref(href) {
        if (!href) return null;
        try {
            const url = new URL(href, location.origin);
            const m = url.pathname.match(USER_PATH_RE);
            return m ? m[1].toLowerCase() : null;
        } catch {
            return null;
        }
    }

    function findUuidInSubtree(root) {
        if (!root || root.nodeType !== 1) return null;
        const self = root.getAttribute && root.getAttribute('href');
        const selfUuid = extractUuidFromHref(self);
        if (selfUuid) return selfUuid;
        const anchors = root.querySelectorAll ? root.querySelectorAll('a[href*="/user/"]') : [];
        for (const a of anchors) {
            const uuid = extractUuidFromHref(a.getAttribute('href'));
            if (uuid) return uuid;
        }
        return null;
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function findRepliesContainer(commentEl) {
        const wrapper = commentEl.closest('.mb-2.relative');
        if (!wrapper) return null;
        let sibling = wrapper.nextElementSibling;
        while (sibling) {
            if (sibling.classList && sibling.classList.contains('ml-11')) {
                if (sibling.querySelector('div[id^="comment-"]')) {
                    return sibling;
                }
                return null;
            }
            sibling = sibling.nextElementSibling;
        }
        return null;
    }

    function replaceCommentWithPlaceholder(commentEl, uuid, username) {
        if (commentEl.getAttribute('data-cub-placeholder') === '1') return;
        suppressObserver = true;
        try {
            const avatar = commentEl.querySelector(':scope > div > img');
            const bubble = commentEl.querySelector(':scope > div > div.ml-2');
            if (!bubble) return;

            const avatarSize = avatar && avatar.classList.contains('h-7') ? 'small' : 'large';

            bubble.classList.add('cub-blocked-bubble');
            bubble.innerHTML = '';

            const row = document.createElement('div');
            row.className = 'cub-blocked-row';

            const icon = document.createElement('span');
            icon.className = 'cub-blocked-icon';
            icon.innerHTML = ICON_BLOCK;
            row.appendChild(icon);

            const text = document.createElement('div');
            text.className = 'cub-blocked-text';
            const profileHref = `/user/${uuid}`;
            text.innerHTML = `Comment from <a href="${profileHref}" class="cub-blocked-username">${escapeHtml(username)}</a> is hidden (blocked)`;
            row.appendChild(text);

            const showBtn = document.createElement('button');
            showBtn.type = 'button';
            showBtn.className = 'cub-blocked-show';
            showBtn.textContent = 'Unblock';
            showBtn.addEventListener('click', (e) => {
                e.preventDefault();
                unblockUser(uuid);
            });
            row.appendChild(showBtn);

            bubble.appendChild(row);

            if (avatar) {
                avatar.classList.add('cub-blocked-avatar');
                if (avatarSize === 'small') {
                    avatar.classList.add('cub-blocked-avatar-sm');
                }
            }

            commentEl.setAttribute('data-cub-placeholder', '1');
            commentEl.setAttribute('data-cub-hidden', '1');

            const actionsRow = commentEl.parentElement && commentEl.parentElement.querySelector(':scope > .flex.items-center.mt-1');
            if (actionsRow) {
                actionsRow.style.display = 'none';
                actionsRow.setAttribute('data-cub-action-hidden', '1');
            }
        } finally {
            suppressObserver = false;
        }
    }

    function hideReviewsAndComments() {
        const articles = document.querySelectorAll('article[id^="review-"]:not([data-cub-processed])');
        articles.forEach((art) => {
            art.setAttribute('data-cub-processed', '1');
            const uuid = findUuidInSubtree(art);
            if (uuid && isBlocked(uuid)) {
                art.style.display = 'none';
                art.setAttribute('data-cub-hidden', '1');
            }
        });

        const comments = document.querySelectorAll('div[id^="comment-"]:not([data-cub-processed])');
        comments.forEach((cmt) => {
            cmt.setAttribute('data-cub-processed', '1');
            const authorLink = cmt.querySelector('a[href^="/user/"]');
            const uuid = extractUuidFromHref(authorLink && authorLink.getAttribute('href'));
            if (!uuid || !isBlocked(uuid)) return;

            const info = getBlocked()[uuid] || {};
            const username = info.username || 'Unknown';
            const hasReplies = findRepliesContainer(cmt) !== null;

            if (hasReplies) {
                replaceCommentWithPlaceholder(cmt, uuid, username);
            } else {
                const wrapper = cmt.closest('.mb-2.relative') || cmt.parentElement;
                if (wrapper) {
                    wrapper.style.display = 'none';
                    wrapper.setAttribute('data-cub-hidden', '1');
                } else {
                    cmt.style.display = 'none';
                    cmt.setAttribute('data-cub-hidden', '1');
                }
            }
        });
    }

    function hideFollowsFeed() {
        const rows = document.querySelectorAll('.flex.items-center.border-t:not([data-cub-processed])');
        rows.forEach((row) => {
            const links = row.querySelectorAll('a[href*="/user/"]');
            if (!links.length) return;
            row.setAttribute('data-cub-processed', '1');
            for (const a of links) {
                const uuid = extractUuidFromHref(a.getAttribute('href'));
                if (uuid && isBlocked(uuid)) {
                    row.style.display = 'none';
                    row.setAttribute('data-cub-hidden', '1');
                    break;
                }
            }
        });
    }

    function hideCustomListCards() {
        const cards = document.querySelectorAll('a[href*="/user/"][href*="/list/"]:not([data-cub-processed])');
        cards.forEach((a) => {
            a.setAttribute('data-cub-processed', '1');
            const uuid = extractUuidFromHref(a.getAttribute('href'));
            if (uuid && isBlocked(uuid)) {
                a.style.display = 'none';
                a.setAttribute('data-cub-hidden', '1');
            }
        });
    }

    function hideRecentReviewCards() {
        const anchors = document.querySelectorAll('a[href*="?review-id="]:not([data-cub-processed-rev])');
        anchors.forEach((a) => {
            a.setAttribute('data-cub-processed-rev', '1');
            const article = a.closest('article');
            if (!article) return;
            const outer = article.closest('.overflow-hidden') || article.parentElement;
            if (!outer || outer.getAttribute('data-cub-hidden') === '1') return;

            const reviewId = (a.getAttribute('href').match(/review-id=(\d+)/) || [])[1];
            if (!reviewId) return;
            const exists = document.getElementById(`review-${reviewId}`);
            if (exists) {
                const uuid = findUuidInSubtree(exists);
                if (uuid && isBlocked(uuid)) {
                    outer.style.display = 'none';
                    outer.setAttribute('data-cub-hidden', '1');
                }
            }
        });
    }

    function applyBlocking() {
        hideReviewsAndComments();
        hideFollowsFeed();
        hideCustomListCards();
        hideRecentReviewCards();
    }

    function resetProcessedFlags() {
        document.querySelectorAll('[data-cub-processed]').forEach((el) => el.removeAttribute('data-cub-processed'));
        document.querySelectorAll('[data-cub-processed-rev]').forEach((el) => el.removeAttribute('data-cub-processed-rev'));
        document.querySelectorAll('[data-cub-hidden="1"]').forEach((el) => {
            el.style.display = '';
            el.removeAttribute('data-cub-hidden');
        });
        document.querySelectorAll('[data-cub-action-hidden="1"]').forEach((el) => {
            el.style.display = '';
            el.removeAttribute('data-cub-action-hidden');
        });
    }

    function iconSvg(pathD, extraAttrs = '') {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extraAttrs}>${pathD}</svg>`;
    }

    const ICON_BLOCK = iconSvg('<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>');
    const ICON_UNBLOCK = iconSvg('<path d="M20 6 9 17l-5-5"/>');
    const ICON_SHIELD = iconSvg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>');

    function getProfileUuidFromPath() {
        const m = location.pathname.match(USER_PATH_RE);
        return m ? m[1].toLowerCase() : null;
    }

    function getProfileUsername() {
        const h1 = document.querySelector('h1');
        if (h1 && h1.textContent) return h1.textContent.trim();
        return 'Unknown';
    }

    function ensureProfileBlockButton() {
        const uuid = getProfileUuidFromPath();
        if (!uuid) return;
        if (currentUserId && uuid === currentUserId) {
            const existing = document.querySelector('[data-cub-profile-btn]');
            if (existing) {
                suppressObserver = true;
                existing.remove();
                suppressObserver = false;
            }
            return;
        }

        const h1 = document.querySelector('h1');
        if (!h1) return;
        const nameContainer = h1.parentElement;
        if (!nameContainer) return;

        const blocked = isBlocked(uuid);
        const desiredState = blocked ? 'blocked' : 'unblocked';
        const desiredUuid = uuid;

        let wrap = nameContainer.querySelector(':scope > [data-cub-profile-btn]');
        if (wrap && wrap.getAttribute('data-cub-uuid') === desiredUuid && wrap.getAttribute('data-cub-state') === desiredState) {
            return;
        }

        suppressObserver = true;
        try {
            if (wrap) wrap.remove();
            wrap = document.createElement('div');
            wrap.setAttribute('data-cub-profile-btn', '1');
            wrap.setAttribute('data-cub-uuid', desiredUuid);
            wrap.setAttribute('data-cub-state', desiredState);
            wrap.style.marginTop = '8px';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cub-btn';
            btn.innerHTML = (blocked ? ICON_UNBLOCK : ICON_BLOCK) +
                `<span>${blocked ? 'Unblock user' : 'Block user'}</span>`;
            if (blocked) btn.classList.add('cub-btn-danger');
            btn.addEventListener('click', () => {
                if (isBlocked(uuid)) {
                    unblockUser(uuid);
                } else {
                    const username = getProfileUsername();
                    blockUser(uuid, username);
                }
            });
            wrap.appendChild(btn);
            nameContainer.appendChild(wrap);
        } finally {
            suppressObserver = false;
        }
    }

    function ensureBlockedTab() {
        const uuid = getProfileUuidFromPath();
        if (!uuid || !currentUserId || uuid !== currentUserId) {
            removeBlockedTab();
            return;
        }

        const nav = document.querySelector('nav[aria-label="Tabs"]');
        if (!nav) return;

        const scrollContainer = nav.parentElement;
        const widthContainer = nav.closest('.xl\\:max-w-3xl');

        if (scrollContainer && !scrollContainer.hasAttribute('data-cub-scroll-neutralized')) {
            suppressObserver = true;
            scrollContainer.setAttribute('data-cub-scroll-neutralized', '1');
            scrollContainer.classList.add('cub-scroll-neutralized');
            suppressObserver = false;
        }

        if (widthContainer && !widthContainer.hasAttribute('data-cub-nav-widened')) {
            suppressObserver = true;
            widthContainer.setAttribute('data-cub-nav-widened', '1');
            widthContainer.classList.add('cub-nav-widened');
            suppressObserver = false;
        }

        if (nav.querySelector('[data-cub-tab]')) {
            updateTabCount();
            syncTabActiveState();
            return;
        }

        suppressObserver = true;
        try {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.setAttribute('data-cub-tab', '1');
            tab.className = 'border-transparent text-gray-600 dark:text-gray-300 hover:text-blue-700 dark:hover:text-gray-200 hover:border-blue-500 dark:hover:border-blue-500 whitespace-nowrap flex py-4 px-1 border-b-2 font-medium text-sm flex-1';
            tab.style.background = 'transparent';
            tab.style.cursor = 'pointer';
            tab.innerHTML = `<span class="cub-tab-icon">${ICON_SHIELD}</span><span>Blocked</span><span data-cub-count class="cub-tab-count"></span>`;
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                openBlockedView();
            });
            nav.appendChild(tab);
        } finally {
            suppressObserver = false;
        }
        updateTabCount();
    }

    function removeBlockedTab() {
        suppressObserver = true;
        try {
            const existing = document.querySelector('[data-cub-tab]');
            if (existing) existing.remove();
            document.querySelectorAll('[data-cub-nav-widened]').forEach((el) => {
                el.classList.remove('cub-nav-widened');
                el.removeAttribute('data-cub-nav-widened');
            });
            document.querySelectorAll('[data-cub-scroll-neutralized]').forEach((el) => {
                el.classList.remove('cub-scroll-neutralized');
                el.removeAttribute('data-cub-scroll-neutralized');
            });
        } finally {
            suppressObserver = false;
        }
    }

    function updateTabCount() {
        const el = document.querySelector('[data-cub-tab] [data-cub-count]');
        if (!el) return;
        const n = Object.keys(getBlocked()).length;
        const text = n > 0 ? String(n) : '';
        if (el.textContent !== text) {
            suppressObserver = true;
            el.textContent = text;
            suppressObserver = false;
        }
    }

    function syncTabActiveState() {
        const tab = document.querySelector('[data-cub-tab]');
        if (!tab) return;
        const isOpen = !!document.querySelector('[data-cub-blocked-view]');
        suppressObserver = true;
        if (isOpen) {
            tab.classList.remove('border-transparent', 'text-gray-600', 'dark:text-gray-300');
            tab.classList.add('border-blue-500', 'text-blue-600', 'dark:border-blue-200', 'dark:text-blue-300');
        } else {
            tab.classList.add('border-transparent', 'text-gray-600', 'dark:text-gray-300');
            tab.classList.remove('border-blue-500', 'text-blue-600', 'dark:border-blue-200', 'dark:text-blue-300');
        }
        suppressObserver = false;
    }

    function closeBlockedView() {
        suppressObserver = true;
        try {
            const existing = document.querySelector('[data-cub-blocked-view]');
            if (existing) existing.remove();
            document.querySelectorAll('[data-cub-hidden-by-view="1"]').forEach((el) => {
                el.style.display = '';
                el.removeAttribute('data-cub-hidden-by-view');
            });
        } finally {
            suppressObserver = false;
        }
        syncTabActiveState();
    }

    function openBlockedView() {
        const tab = document.querySelector('[data-cub-tab]');
        if (!tab) return;
        closeBlockedView();

        const anchor = tab.closest('.xl\\:max-w-3xl') || tab.closest('div');
        if (!anchor || !anchor.parentElement) return;

        suppressObserver = true;
        try {
            let sibling = anchor.nextElementSibling;
            while (sibling) {
                const next = sibling.nextElementSibling;
                sibling.style.display = 'none';
                sibling.setAttribute('data-cub-hidden-by-view', '1');
                sibling = next;
            }
            const summarySection = document.querySelector('section.relative.mt-6.overflow-hidden');
            if (summarySection) {
                summarySection.style.display = 'none';
                summarySection.setAttribute('data-cub-hidden-by-view', '1');
            }

            const view = document.createElement('div');
            view.setAttribute('data-cub-blocked-view', '1');
            view.className = 'cub-blocked-view';
            anchor.parentElement.insertBefore(view, anchor.nextSibling);
            renderBlockedView(view);
        } finally {
            suppressObserver = false;
        }
        syncTabActiveState();
    }

    function renderBlockedView(container) {
        suppressObserver = true;
        try {
            container.innerHTML = '';
            const map = getBlocked();
            const entries = Object.entries(map).sort((a, b) => (b[1].blockedAt || 0) - (a[1].blockedAt || 0));

            const header = document.createElement('h2');
            header.className = 'cub-heading';
            header.textContent = `Blocked users (${entries.length})`;
            container.appendChild(header);

            if (entries.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'cub-empty';
                empty.textContent = 'You have not blocked anyone yet.';
                container.appendChild(empty);
                return;
            }

            const list = document.createElement('ul');
            list.className = 'cub-list';

            entries.forEach(([uuid, info]) => {
                const li = document.createElement('li');
                li.className = 'cub-list-item';

                const left = document.createElement('div');
                left.className = 'cub-list-main';

                const nameLink = document.createElement('a');
                nameLink.href = `/user/${uuid}`;
                nameLink.className = 'cub-list-name';
                nameLink.textContent = info.username || 'Unknown';
                left.appendChild(nameLink);

                const meta = document.createElement('div');
                meta.className = 'cub-list-meta';
                const date = info.blockedAt ? new Date(info.blockedAt).toLocaleString() : '';
                meta.textContent = date ? `Blocked ${date}` : 'Blocked';
                left.appendChild(meta);

                const uuidRow = document.createElement('div');
                uuidRow.className = 'cub-list-uuid';
                uuidRow.textContent = uuid;
                left.appendChild(uuidRow);

                const actions = document.createElement('div');
                actions.className = 'cub-list-actions';

                const unblockBtn = document.createElement('button');
                unblockBtn.type = 'button';
                unblockBtn.className = 'cub-btn';
                unblockBtn.innerHTML = ICON_UNBLOCK + '<span>Unblock</span>';
                unblockBtn.addEventListener('click', () => {
                    unblockUser(uuid);
                    renderBlockedView(container);
                    updateTabCount();
                });
                actions.appendChild(unblockBtn);

                li.appendChild(left);
                li.appendChild(actions);
                list.appendChild(li);
            });

            container.appendChild(list);
        } finally {
            suppressObserver = false;
        }
    }

    function injectStyles() {
        GM_addStyle(`
            .cub-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                font-size: 13px;
                font-weight: 500;
                border-radius: 6px;
                border: 1px solid rgb(209 213 219);
                background: rgb(249 250 251);
                color: rgb(17 24 39);
                cursor: pointer;
                transition: background-color .15s ease, border-color .15s ease, color .15s ease;
            }
            .cub-btn:hover {
                background: rgb(243 244 246);
                border-color: rgb(156 163 175);
            }
            .dark .cub-btn {
                background: rgb(55 65 81);
                border-color: rgb(75 85 99);
                color: rgb(243 244 246);
            }
            .dark .cub-btn:hover {
                background: rgb(75 85 99);
                border-color: rgb(107 114 128);
            }
            .cub-btn-danger {
                border-color: rgb(239 68 68);
                color: rgb(220 38 38);
            }
            .cub-btn-danger:hover {
                background: rgb(254 226 226);
            }
            .dark .cub-btn-danger {
                color: rgb(252 165 165);
                border-color: rgb(153 27 27);
                background: rgba(127, 29, 29, 0.25);
            }
            .dark .cub-btn-danger:hover {
                background: rgba(127, 29, 29, 0.5);
            }
            .cub-tab-icon {
                margin-right: 8px;
                color: rgb(156 163 175);
                display: inline-flex;
                align-items: center;
            }
            .cub-tab-count {
                margin-left: 8px;
                font-size: 12px;
                color: rgb(156 163 175);
            }
            .cub-blocked-view {
                margin-top: 24px;
                padding: 0 4px;
            }
            .cub-heading {
                font-size: 1.5rem;
                font-weight: 600;
                color: rgb(31 41 55);
                margin-bottom: 16px;
            }
            .dark .cub-heading {
                color: rgb(229 231 235);
            }
            .cub-empty {
                color: rgb(107 114 128);
                font-size: 14px;
                padding: 24px 0;
            }
            .dark .cub-empty {
                color: rgb(156 163 175);
            }
            .cub-list {
                list-style: none;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .cub-list-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 12px 16px;
                border: 1px solid rgb(229 231 235);
                border-radius: 8px;
                background: rgb(255 255 255);
            }
            .dark .cub-list-item {
                border-color: rgb(55 65 81);
                background: rgba(31, 41, 55, 0.5);
            }
            .cub-list-main {
                min-width: 0;
                flex: 1;
            }
            .cub-list-name {
                font-weight: 600;
                color: rgb(17 24 39);
                text-decoration: none;
            }
            .cub-list-name:hover {
                text-decoration: underline;
            }
            .dark .cub-list-name {
                color: rgb(243 244 246);
            }
            .cub-list-meta {
                font-size: 12px;
                color: rgb(107 114 128);
                margin-top: 2px;
            }
            .dark .cub-list-meta {
                color: rgb(156 163 175);
            }
            .cub-list-uuid {
                font-size: 11px;
                color: rgb(156 163 175);
                font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                margin-top: 2px;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .cub-list-actions {
                flex-shrink: 0;
            }
            [data-cub-profile-btn] {
                display: inline-flex;
            }
            .cub-blocked-bubble {
                padding: 8px 12px !important;
                background: rgb(243 244 246) !important;
                border-radius: 12px !important;
                flex: 1;
            }
            .dark .cub-blocked-bubble {
                background: rgba(55, 65, 81, 0.4) !important;
            }
            .cub-blocked-row {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 13px;
                color: rgb(107 114 128);
            }
            .dark .cub-blocked-row {
                color: rgb(156 163 175);
            }
            .cub-blocked-icon {
                display: inline-flex;
                color: rgb(156 163 175);
                flex-shrink: 0;
            }
            .cub-blocked-text {
                flex: 1;
                min-width: 0;
            }
            .cub-blocked-username {
                font-weight: 500;
                color: rgb(75 85 99);
                text-decoration: none;
            }
            .cub-blocked-username:hover {
                text-decoration: underline;
            }
            .dark .cub-blocked-username {
                color: rgb(209 213 219);
            }
            .cub-blocked-show {
                background: transparent;
                border: 1px solid rgb(209 213 219);
                color: rgb(75 85 99);
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
                flex-shrink: 0;
            }
            .cub-blocked-show:hover {
                background: rgb(229 231 235);
            }
            .dark .cub-blocked-show {
                border-color: rgb(75 85 99);
                color: rgb(209 213 219);
            }
            .dark .cub-blocked-show:hover {
                background: rgb(55 65 81);
            }
            .cub-blocked-avatar {
                opacity: 0.5;
                filter: grayscale(1);
            }
            .cub-nav-widened {
                max-width: none !important;
            }
            @media (min-width: 1280px) {
                .cub-nav-widened {
                    max-width: min(56rem, 100%) !important;
                }
            }
        `);
    }

    function scheduleUpdate(resetFlags = false) {
        if (resetFlags) resetProcessedFlags();
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            applyBlocking();
            ensureProfileBlockButton();
            ensureBlockedTab();
            const view = document.querySelector('[data-cub-blocked-view]');
            if (view) renderBlockedView(view);
        });
    }

    function onUrlChange() {
        closeBlockedView();
        suppressObserver = true;
        document.querySelectorAll('[data-cub-profile-btn]').forEach((el) => el.remove());
        suppressObserver = false;
        removeBlockedTab();
        scheduleUpdate(true);
    }

    function patchHistory() {
        const push = history.pushState;
        const replace = history.replaceState;
        history.pushState = function() {
            const ret = push.apply(this, arguments);
            window.dispatchEvent(new Event('cub-locationchange'));
            return ret;
        };
        history.replaceState = function() {
            const ret = replace.apply(this, arguments);
            window.dispatchEvent(new Event('cub-locationchange'));
            return ret;
        };
        window.addEventListener('popstate', () => window.dispatchEvent(new Event('cub-locationchange')));
        window.addEventListener('cub-locationchange', onUrlChange);
    }

    function isOurMutation(mutation) {
        const check = (node) => {
            if (!node || node.nodeType !== 1) return false;
            if (node.hasAttribute && (
                    node.hasAttribute('data-cub-profile-btn') ||
                    node.hasAttribute('data-cub-tab') ||
                    node.hasAttribute('data-cub-blocked-view') ||
                    node.hasAttribute('data-cub-processed') ||
                    node.hasAttribute('data-cub-processed-rev') ||
                    node.hasAttribute('data-cub-hidden') ||
                    node.hasAttribute('data-cub-hidden-by-view') ||
                    node.hasAttribute('data-cub-count') ||
                    node.hasAttribute('data-cub-uuid') ||
                    node.hasAttribute('data-cub-state') ||
                    node.hasAttribute('data-cub-placeholder') ||
                    node.hasAttribute('data-cub-action-hidden')
                )) return true;
            if (node.closest && (
                    node.closest('[data-cub-profile-btn]') ||
                    node.closest('[data-cub-tab]') ||
                    node.closest('[data-cub-blocked-view]') ||
                    node.closest('[data-cub-placeholder]')
                )) return true;
            return false;
        };
        if (check(mutation.target)) return true;
        for (const n of mutation.addedNodes) {
            if (check(n)) return true;
        }
        return false;
    }

    function startObserver() {
        const observer = new MutationObserver((mutations) => {
            if (suppressObserver) return;
            let relevant = false;
            for (const m of mutations) {
                if (m.type === 'attributes') continue;
                if (isOurMutation(m)) continue;
                if (m.addedNodes && m.addedNodes.length > 0) {
                    relevant = true;
                    break;
                }
            }
            if (relevant) scheduleUpdate(false);
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    async function init() {
        injectStyles();
        patchHistory();
        await fetchCurrentUser();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', afterReady, {
                once: true
            });
        } else {
            afterReady();
        }
    }

    function afterReady() {
        scheduleUpdate(false);
        startObserver();
    }

    init();
})();