// ==UserScript==
// @name         Comick Anime Planet Import
// @namespace    https://github.com/GooglyBlox
// @version      1.5
// @description  Import comics from Anime Planet JSON export
// @author       GooglyBlox
// @match        https://comick.dev/import
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/546538/Comick%20Anime%20Planet%20Import.user.js
// @updateURL https://update.greasyfork.org/scripts/546538/Comick%20Anime%20Planet%20Import.meta.js
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

    const ANIME_PLANET_STATUS_MAP = {
        'reading': 1,
        'read': 2,
        'stalled': 3,
        'dropped': 4,
        'want to read': 5
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
        return getImportProvidersSection()?.querySelector('.space-y-3, .grid.grid-cols-1.gap-4') || null;
    }

    function getProviderIconRail() {
        return Array.from(document.querySelectorAll('div.flex.flex-wrap.items-center.gap-2, div.flex.flex-wrap.items-center.gap-3')).find(container =>
            container.querySelector('.bg-auto.bg-al') && container.querySelector('.bg-auto.bg-mal')
        ) || null;
    }

    function addAnimePlanetIcon() {
        if (state.iconsAdded && document.querySelector('img[alt="Anime Planet"]')) {
            return;
        }

        const iconRail = getProviderIconRail();
        if (!iconRail) return;

        const existingAnimePlanetIcon = iconRail.querySelector('img[alt="Anime Planet"]');
        if (existingAnimePlanetIcon) {
            state.iconsAdded = true;
            return;
        }

        const animePlanetIcon = document.createElement('div');
        animePlanetIcon.className = 'flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-gray-800';
        animePlanetIcon.id = 'animeplanet-import-hero-icon';
        animePlanetIcon.innerHTML = `
            <img src="https://www.anime-planet.com/apple-touch-icon.png?v=WGowMEAKpM" class="h-5 w-5 rounded object-cover" alt="Anime Planet">
        `;

        iconRail.appendChild(animePlanetIcon);

        state.iconsAdded = true;
    }

    function createAnimePlanetSection() {
        const section = document.createElement('div');
        section.className = 'relative overflow-hidden rounded-xl py-5 pl-5 pr-4 bg-indigo-50/75 dark:bg-indigo-950/20';
        section.id = 'animeplanet-import-section';

        section.innerHTML = `
            <div class="absolute inset-y-4 left-0 w-1 rounded-r-full bg-indigo-500"></div>
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-3">
                        <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/15 overflow-hidden">
                            <img src="https://www.anime-planet.com/apple-touch-icon.png?v=WGowMEAKpM" class="h-6 w-6 rounded object-cover" alt="Anime Planet">
                        </div>
                        <div class="min-w-0">
                            <h3 class="text-lg font-semibold text-indigo-700 dark:text-indigo-300">Anime Planet</h3>
                            <p class="text-sm text-gray-600 dark:text-gray-300">Upload the exported JSON file from Anime Planet.</p>
                        </div>
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-3">
                    <div class="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        Ready to import
                    </div>
                    <div class="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        File upload
                    </div>
                </div>
            </div>
            <div class="mt-4 rounded-xl bg-gray-50/80 p-4 dark:bg-gray-800/40">
                <div class="flex flex-wrap items-center gap-2">
                    <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Upload exported file</h4>
                </div>
                <p class="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">Choose the JSON export generated by Anime Planet.</p>
                <div class="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
                    <div class="flex-1 rounded-lg bg-white px-4 py-3 dark:bg-gray-900/80">
                        <div class="items-center">
                            <input type="file" id="animeplanet-file-input" accept=".json,application/json" class="block text-sm file:mr-4 file:py-2 my-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:hover:cursor-pointer file:active:border-none">
                            <div class="flex space-x-3 items-center">
                                <div class="text-sm italic">Choose the .json file</div>
                            </div>
                        </div>
                    </div>
                    <button id="animeplanet-import-trigger" class="btn lg:mb-1" color="default" disabled>Import</button>
                </div>
            </div>
            <div id="animeplanet-progress-section" class="mt-4 hidden">
                <div class="rounded-xl bg-white px-4 py-4 dark:bg-gray-900/80">
                    <div class="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-2">
                        <span id="animeplanet-progress-text">Processing Anime Planet import...</span>
                        <span id="animeplanet-progress-count">0/0</span>
                    </div>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div id="animeplanet-progress-bar" class="bg-indigo-600 h-2 rounded-full" style="width: 0%"></div>
                    </div>
                    <div id="animeplanet-results" class="mt-4 max-h-64 overflow-y-auto"></div>
                </div>
            </div>
        `;

        return section;
    }

    function addAnimePlanetButton() {
        if (state.buttonAdded || document.getElementById('animeplanet-import-section')) {
            return;
        }

        const gridContainer = getProvidersGrid();
        if (!gridContainer) return;

        const animePlanetSection = createAnimePlanetSection();
        gridContainer.appendChild(animePlanetSection);

        state.buttonAdded = true;
        setupEventListeners();
    }

    function setupEventListeners() {
        const fileInput = document.getElementById('animeplanet-file-input');
        const importTrigger = document.getElementById('animeplanet-import-trigger');

        if (!fileInput || !importTrigger) return;

        importTrigger.addEventListener('click', async () => {
            const file = fileInput.files[0];
            if (file && !state.isProcessing) {
                await processAnimePlanetFile(file);
                fileInput.value = '';
                importTrigger.disabled = true;
            }
        });

        fileInput.addEventListener('change', () => {
            const importTrigger = document.getElementById('animeplanet-import-trigger');
            if (importTrigger) {
                importTrigger.disabled = !fileInput.files[0];
            }
        });
    }

    async function processAnimePlanetFile(file) {
        state.isProcessing = true;
        const importTrigger = document.getElementById('animeplanet-import-trigger');
        const progressSection = document.getElementById('animeplanet-progress-section');
        const originalBtnContent = importTrigger.textContent;

        importTrigger.textContent = 'Processing...';
        importTrigger.disabled = true;
        progressSection.classList.remove('hidden');

        try {
            const fileContent = await readFileAsText(file);
            const animePlanetData = JSON.parse(fileContent);

            if (!animePlanetData.entries || !Array.isArray(animePlanetData.entries)) {
                throw new Error('Invalid Anime Planet file format. Expected JSON with entries array.');
            }

            await importFromAnimePlanet(animePlanetData.entries);

        } catch (error) {
            console.error('Anime Planet import error:', error);
            showError(`Error processing Anime Planet file: ${error.message}`);
        } finally {
            state.isProcessing = false;
            importTrigger.disabled = false;
            importTrigger.textContent = originalBtnContent;
        }
    }

    async function importFromAnimePlanet(mangaData) {
        const elements = {
            progressText: document.getElementById('animeplanet-progress-text'),
            progressCount: document.getElementById('animeplanet-progress-count'),
            progressBar: document.getElementById('animeplanet-progress-bar'),
            resultsDiv: document.getElementById('animeplanet-results')
        };

        const filteredManga = mangaData.filter(manga => {
            const status = manga.status?.toLowerCase();
            return status && ANIME_PLANET_STATUS_MAP.hasOwnProperty(status);
        });

        const stats = {
            total: filteredManga.length,
            processed: 0,
            successful: 0,
            failed: 0,
            skipped: mangaData.length - filteredManga.length
        };

        elements.resultsDiv.innerHTML = `<div class="text-sm text-gray-300 mb-2 font-semibold">Anime Planet Import Results:</div>`;

        if (stats.skipped > 0) {
            addResultItem('Info', 'info', `Skipped ${stats.skipped} entries with unsupported status`);
        }

        for (const manga of filteredManga) {
            updateProgress(elements, manga.name, stats);

            const listType = ANIME_PLANET_STATUS_MAP[manga.status.toLowerCase()];
            const listName = READING_LISTS[listType];
            const result = await processSingleManga(manga, listType, listName);

            if (result.success) {
                stats.successful++;
                addResultItem(manga.name, 'success', result.message);
            } else {
                stats.failed++;
                addResultItem(manga.name, 'error', result.message);
            }

            stats.processed++;
            await delay(200);
        }

        finalizeImport(elements, stats);
    }

    async function processSingleManga(manga, listType, listName) {
        try {
            const searchResults = await searchComic(manga.name);

            if (!searchResults || searchResults.length === 0) {
                return { success: false, message: 'No matches found on Comick' };
            }

            const bestMatch = searchResults[0];
            const followResult = await followComic(bestMatch.id, listType);

            if (followResult.success) {
                return {
                    success: true,
                    message: `Added to ${listName}: ${bestMatch.title}`
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

    async function followComic(comicId, listType = 1) {
        try {
            const response = await fetch(API_ENDPOINTS.follow, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
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
        elements.progressBar.style.width = `${(stats.processed / stats.total) * 100}%`;
    }

    function finalizeImport(elements, stats) {
        elements.progressText.textContent = `Anime Planet import complete: ${stats.successful} successful, ${stats.failed} failed`;
        elements.progressCount.textContent = `${stats.processed}/${stats.total}`;
        elements.progressBar.style.width = '100%';
    }

    function addResultItem(title, type, message) {
        const resultsDiv = document.getElementById('animeplanet-results');
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
        const resultsDiv = document.getElementById('animeplanet-results');
        resultsDiv.innerHTML = `<div class="text-red-700 dark:text-red-400 text-sm p-2 bg-red-100 dark:bg-red-900/20 rounded">${escapeHtml(message)}</div>`;
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
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
        const iconExists = document.querySelector('img[alt="Anime Planet"]');

        if (!iconExists) {
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
            addAnimePlanetIcon();

            if (!state.buttonAdded) {
                setTimeout(addAnimePlanetButton, 100);
            }
        }
    }

    function cleanupElements() {
        state.buttonAdded = false;
        state.iconsAdded = false;

        const animePlanetSection = document.getElementById('animeplanet-import-section');
        const animePlanetIcon = document.getElementById('animeplanet-import-hero-icon');

        [animePlanetSection, animePlanetIcon].forEach(el => el?.remove());
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
