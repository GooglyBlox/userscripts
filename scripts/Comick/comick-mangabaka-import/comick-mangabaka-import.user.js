// ==UserScript==
// @name         Comick MangaBaka Import
// @namespace    https://github.com/GooglyBlox
// @version      1.0
// @description  Import comics from MangaBaka JSON export
// @author       GooglyBlox
// @match        https://comick.dev/import
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/573409/Comick%20MangaBaka%20Import.user.js
// @updateURL https://update.greasyfork.org/scripts/573409/Comick%20MangaBaka%20Import.meta.js
// ==/UserScript==

(function() {
    'use strict';

    const API_ENDPOINTS = {
        search: 'https://api.comick.dev/v1.0/search/',
        follow: 'https://api.comick.dev/follow'
    };

    const READING_LISTS = {
        1: 'Reading',
        2: 'Completed',
        3: 'On Hold',
        4: 'Dropped',
        5: 'Plan to Read'
    };

    const MANGABAKA_ICON_URL = 'https://www.google.com/s2/favicons?sz=64&domain_url=https://mangabaka.org';

    const MANGABAKA_STATUS_MAP = {
        considering: 5,
        plan_to_read: 5,
        'plan to read': 5,
        reading: 1,
        rereading: 1,
        re_reading: 1,
        're reading': 1,
        completed: 2,
        paused: 3,
        on_hold: 3,
        'on hold': 3,
        dropped: 4
    };

    const state = {
        observer: null,
        buttonAdded: false,
        iconsAdded: false,
        isProcessing: false
    };

    function getImportProvidersSection() {
        return Array.from(document.querySelectorAll('section')).find(section =>
            section.querySelector('h2')?.textContent.trim() === 'Import from another site'
        ) || null;
    }

    function getProvidersGrid() {
        return getImportProvidersSection()?.querySelector('.grid.grid-cols-1.gap-4') || null;
    }

    function getProviderIconRail() {
        return Array.from(document.querySelectorAll('div.flex.flex-wrap.items-center.gap-2, div.flex.flex-wrap.items-center.gap-3')).find(container =>
            container.querySelector('.bg-auto.bg-al') && container.querySelector('.bg-auto.bg-mal')
        ) || null;
    }

    function addMangaBakaIcon() {
        if (state.iconsAdded && document.querySelector('img[alt="MangaBaka"]')) {
            return;
        }

        const iconRail = getProviderIconRail();
        if (!iconRail) return;

        const existingMangaBakaIcon = iconRail.querySelector('img[alt="MangaBaka"]');
        if (existingMangaBakaIcon) {
            state.iconsAdded = true;
            return;
        }

        const mangaBakaIcon = document.createElement('div');
        mangaBakaIcon.className = 'flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800';
        mangaBakaIcon.id = 'mangabaka-import-hero-icon';
        mangaBakaIcon.innerHTML = `
            <img src="${MANGABAKA_ICON_URL}" class="h-6 w-6 rounded object-cover" alt="MangaBaka">
        `;

        iconRail.appendChild(mangaBakaIcon);
        state.iconsAdded = true;
    }

    function createMangaBakaSection() {
        const section = document.createElement('div');
        section.className = 'rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm dark:border-gray-700 dark:from-gray-900/80 dark:to-gray-800/70';
        section.id = 'mangabaka-import-section';

        section.innerHTML = `
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-3">
                        <div class="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <img src="${MANGABAKA_ICON_URL}" class="h-6 w-6 rounded object-cover" alt="MangaBaka">
                        </div>
                        <div class="min-w-0">
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">MangaBaka</h3>
                            <p class="text-sm text-gray-600 dark:text-gray-300">Upload the exported JSON file from MangaBaka.</p>
                        </div>
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-3">
                    <div class="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        Ready to import
                    </div>
                    <div class="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        File upload
                    </div>
                </div>
            </div>
            <div class="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50/80 p-4 dark:border-gray-600 dark:bg-gray-800/40">
                <div class="flex flex-wrap items-center gap-2">
                    <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Upload exported file</h4>
                </div>
                <p class="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">Choose the JSON export generated by MangaBaka.</p>
                <div class="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
                    <div class="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900/80">
                        <div class="items-center">
                            <input type="file" id="mangabaka-file-input" accept=".json,application/json" class="block text-sm file:mr-4 file:py-2 my-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:hover:cursor-pointer file:active:border-none">
                            <div class="flex space-x-3 items-center">
                                <div class="text-sm italic text-gray-600 dark:text-gray-300">Choose the .json file</div>
                            </div>
                        </div>
                    </div>
                    <button id="mangabaka-import-trigger" class="btn lg:mb-1" color="default" disabled>Import</button>
                </div>
            </div>
            <div id="mangabaka-progress-section" class="mt-4 hidden">
                <div class="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/80">
                    <div class="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-2">
                        <span id="mangabaka-progress-text">Processing MangaBaka import...</span>
                        <span id="mangabaka-progress-count">0/0</span>
                    </div>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div id="mangabaka-progress-bar" class="bg-blue-600 h-2 rounded-full" style="width: 0%"></div>
                    </div>
                    <div id="mangabaka-results" class="mt-4 max-h-64 overflow-y-auto"></div>
                </div>
            </div>
        `;

        return section;
    }

    function addMangaBakaButton() {
        if (state.buttonAdded || document.getElementById('mangabaka-import-section')) {
            return;
        }

        const gridContainer = getProvidersGrid();
        if (!gridContainer) return;

        gridContainer.appendChild(createMangaBakaSection());
        state.buttonAdded = true;
        setupEventListeners();
    }

    function setupEventListeners() {
        const fileInput = document.getElementById('mangabaka-file-input');
        const importTrigger = document.getElementById('mangabaka-import-trigger');

        if (!fileInput || !importTrigger) return;

        importTrigger.addEventListener('click', async () => {
            const file = fileInput.files[0];
            if (file && !state.isProcessing) {
                await processMangaBakaFile(file);
                fileInput.value = '';
                importTrigger.disabled = true;
            }
        });

        fileInput.addEventListener('change', () => {
            importTrigger.disabled = !fileInput.files[0];
        });
    }

    async function processMangaBakaFile(file) {
        state.isProcessing = true;
        const importTrigger = document.getElementById('mangabaka-import-trigger');
        const progressSection = document.getElementById('mangabaka-progress-section');
        const originalBtnContent = importTrigger.textContent;

        importTrigger.textContent = 'Processing...';
        importTrigger.disabled = true;
        progressSection.classList.remove('hidden');

        try {
            const fileContent = await readFileAsText(file);
            const mangaBakaData = JSON.parse(fileContent);

            if (!Array.isArray(mangaBakaData)) {
                throw new Error('Invalid MangaBaka file format. Expected a JSON array.');
            }

            await importFromMangaBaka(mangaBakaData);
        } catch (error) {
            console.error('MangaBaka import error:', error);
            showError(`Error processing MangaBaka file: ${error.message}`);
        } finally {
            state.isProcessing = false;
            importTrigger.disabled = false;
            importTrigger.textContent = originalBtnContent;
        }
    }

    async function importFromMangaBaka(mangaData) {
        const elements = {
            progressText: document.getElementById('mangabaka-progress-text'),
            progressCount: document.getElementById('mangabaka-progress-count'),
            progressBar: document.getElementById('mangabaka-progress-bar'),
            resultsDiv: document.getElementById('mangabaka-results')
        };

        const normalizedEntries = mangaData.map(normalizeMangaBakaEntry);
        const supportedEntries = normalizedEntries.filter(entry => entry.listType !== null);

        const stats = {
            total: supportedEntries.length,
            processed: 0,
            successful: 0,
            failed: 0,
            skipped: mangaData.length - supportedEntries.length
        };

        elements.resultsDiv.innerHTML = '<div class="text-sm text-gray-700 dark:text-gray-300 mb-2 font-semibold">MangaBaka Import Results:</div>';

        if (stats.skipped > 0) {
            addResultItem('Info', 'info', `Skipped ${stats.skipped} entries with unsupported status or missing titles`);
        }

        for (const manga of supportedEntries) {
            updateProgress(elements, manga.displayTitle, stats);

            const listName = READING_LISTS[manga.listType];
            const result = await processSingleManga(manga, listName);

            if (result.success) {
                stats.successful++;
                addResultItem(manga.displayTitle, 'success', result.message);
            } else {
                stats.failed++;
                addResultItem(manga.displayTitle, 'error', result.message);
            }

            stats.processed++;
            await delay(200);
        }

        finalizeImport(elements, stats);
    }

    function normalizeMangaBakaEntry(item) {
        const rawStatus = normalizeStatusValue(item?.entry?.state ?? item?.state ?? item?.status);
        const titleCandidates = getTitleCandidates(item);
        const displayTitle = titleCandidates[0] || `MangaBaka #${item?.source?.mangabaka ?? 'Unknown'}`;

        return {
            raw: item,
            rawStatus,
            listType: titleCandidates.length > 0 ? (MANGABAKA_STATUS_MAP[rawStatus] ?? null) : null,
            sourceId: item?.source?.mangabaka ?? null,
            titleCandidates,
            displayTitle
        };
    }

    function normalizeStatusValue(status) {
        return String(status ?? '')
            .trim()
            .toLowerCase()
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^re reading$/, 'rereading');
    }

    function getTitleCandidates(item) {
        const titles = [
            item?.titles?.primary,
            item?.titles?.romanized,
            item?.titles?.native,
            item?.title,
            item?.name
        ];

        return [...new Set(
            titles
                .map(title => String(title ?? '').trim())
                .filter(Boolean)
        )];
    }

    async function processSingleManga(manga, listName) {
        try {
            const searchResult = await searchComicWithFallback(manga.titleCandidates);

            if (!searchResult) {
                return { success: false, message: 'No matches found on Comick' };
            }

            const followResult = await followComic(searchResult.match.id, manga.listType);

            if (followResult.success) {
                const searchedWithSuffix = searchResult.searchedWith !== manga.displayTitle
                    ? ` via ${searchResult.searchedWith}`
                    : '';

                return {
                    success: true,
                    message: `Added to ${listName}: ${searchResult.match.title}${searchedWithSuffix}`
                };
            }

            return {
                success: false,
                message: `Failed to follow (Status: ${followResult.status})`
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async function searchComicWithFallback(titleCandidates) {
        for (const title of titleCandidates) {
            const searchResults = await searchComic(title);
            if (Array.isArray(searchResults) && searchResults.length > 0) {
                return {
                    match: searchResults[0],
                    searchedWith: title
                };
            }
        }

        return null;
    }

    async function searchComic(title) {
        const params = new URLSearchParams({
            page: 1,
            limit: 15,
            showall: false,
            q: title,
            t: false
        });

        const response = await fetch(`${API_ENDPOINTS.search}?${params}`);

        if (!response.ok) {
            throw new Error(`Comick search failed: HTTP ${response.status}`);
        }

        return response.json();
    }

    async function followComic(comicId, listType) {
        try {
            const response = await fetch(API_ENDPOINTS.follow, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: comicId,
                    t: listType
                }),
                credentials: 'include'
            });

            return {
                success: response.ok,
                status: response.status,
                data: response.ok ? await response.json() : null
            };
        } catch (error) {
            console.error('Follow API error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    function updateProgress(elements, title, stats) {
        elements.progressText.textContent = `Processing: ${title}`;
        elements.progressCount.textContent = `${stats.processed}/${stats.total}`;
        elements.progressBar.style.width = `${(stats.processed / Math.max(stats.total, 1)) * 100}%`;
    }

    function finalizeImport(elements, stats) {
        elements.progressText.textContent = `MangaBaka import complete: ${stats.successful} successful, ${stats.failed} failed`;
        elements.progressCount.textContent = `${stats.processed}/${stats.total}`;
        elements.progressBar.style.width = '100%';
    }

    function addResultItem(title, type, message) {
        const resultsDiv = document.getElementById('mangabaka-results');
        const resultItem = document.createElement('div');

        let colorClass;
        if (type === 'success') {
            colorClass = 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/20';
        } else if (type === 'info') {
            colorClass = 'text-blue-700 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20';
        } else {
            colorClass = 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/20';
        }

        resultItem.className = `flex justify-between items-center py-1 px-2 text-sm rounded mb-1 ${colorClass}`;
        resultItem.innerHTML = `
            <span class="truncate flex-1 mr-2">${escapeHtml(title)}</span>
            <span class="text-xs">${escapeHtml(message)}</span>
        `;

        resultsDiv.appendChild(resultItem);
        resultsDiv.scrollTop = resultsDiv.scrollHeight;
    }

    function showError(message) {
        const resultsDiv = document.getElementById('mangabaka-results');
        resultsDiv.innerHTML = `<div class="text-red-700 dark:text-red-400 text-sm p-2 bg-red-100 dark:bg-red-900/20 rounded">${escapeHtml(message)}</div>`;
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function checkElementsExist() {
        if (!document.querySelector('img[alt="MangaBaka"]')) {
            state.iconsAdded = false;
        }
    }

    function checkAndAddButton() {
        const isImportPage = window.location.pathname === '/import';

        if (!isImportPage) {
            cleanupElements();
            return;
        }

        const hasRequiredElements =
            getImportProvidersSection() &&
            document.querySelector('h1')?.textContent.includes('Import');

        if (hasRequiredElements) {
            checkElementsExist();
            addMangaBakaIcon();

            if (!state.buttonAdded) {
                setTimeout(addMangaBakaButton, 100);
            }
        }
    }

    function cleanupElements() {
        state.buttonAdded = false;
        state.iconsAdded = false;

        const mangaBakaSection = document.getElementById('mangabaka-import-section');
        const mangaBakaIcon = document.getElementById('mangabaka-import-hero-icon');

        [mangaBakaSection, mangaBakaIcon].forEach(element => element?.remove());
    }

    function startObserver() {
        if (state.observer) {
            state.observer.disconnect();
        }

        state.observer = new MutationObserver(() => {
            checkAndAddButton();
        });

        state.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function init() {
        checkAndAddButton();
        startObserver();

        window.addEventListener('popstate', () => {
            state.buttonAdded = false;
            state.iconsAdded = false;
            setTimeout(checkAndAddButton, 200);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
