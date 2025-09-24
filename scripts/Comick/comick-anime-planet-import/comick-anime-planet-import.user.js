// ==UserScript==
// @name         Comick Anime Planet Import
// @namespace    https://github.com/GooglyBlox
// @version      1.1
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
        headingUpdated: false,
        isProcessing: false
    };

    function addAnimePlanetIcon() {
        if (state.iconsAdded && document.querySelector('img[alt="Anime Planet"]')) {
            return;
        }

        const iconContainer = document.querySelector('.flex.items-center .bg-auto.bg-al');
        if (!iconContainer) return;

        const existingAnimePlanetIcon = iconContainer.parentNode.querySelector('img[alt="Anime Planet"]');
        if (existingAnimePlanetIcon) {
            state.iconsAdded = true;
            return;
        }

        const animePlanetIcon = document.createElement('div');
        animePlanetIcon.className = 'h-6 w-6 ml-2 rounded overflow-hidden';
        animePlanetIcon.innerHTML = '<img src="https://www.anime-planet.com/apple-touch-icon.png?v=WGowMEAKpM" class="h-full w-full object-cover" alt="Anime Planet">';

        const mangaUpdatesIcon = iconContainer.parentNode.querySelector('img[alt="MangaUpdates"]');
        if (mangaUpdatesIcon) {
            mangaUpdatesIcon.parentNode.insertAdjacentElement('afterend', animePlanetIcon);
        } else {
            iconContainer.parentNode.insertBefore(animePlanetIcon, iconContainer.nextSibling);
        }

        state.iconsAdded = true;
    }

    function updateHeading() {
        const heading = document.querySelector('h3');
        if (!heading || !heading.textContent.includes('Import comics - manga from Myanimelist, Anilist')) return;

        if (heading.textContent.includes('Anime Planet')) {
            state.headingUpdated = true;
            return;
        }

        let currentText = heading.textContent;
        if (!currentText.includes('Anime Planet')) {
            if (currentText.includes('MangaUpdates')) {
                heading.textContent = currentText.replace('MangaUpdates', 'MangaUpdates, Anime Planet');
            } else {
                heading.textContent = 'Import comics - manga from Myanimelist, Anilist, Anime Planet';
            }
        }
        state.headingUpdated = true;
    }

    function createAnimePlanetButton() {
        const container = document.createElement('div');
        container.className = 'flex items-center mt-3';

        container.innerHTML = `
            <button id="animeplanet-import-btn" class="btn flex w-44 justify-start">
                <img src="https://www.anime-planet.com/apple-touch-icon.png?v=WGowMEAKpM" class="h-6 w-6 mx-2 rounded" alt="Anime Planet">
                <div>Anime Planet</div>
            </button>
            <input type="file" id="animeplanet-file-input" accept=".json" style="display: none;">
        `;

        return container;
    }

    function createProgressSection() {
        const section = document.createElement('div');
        section.id = 'animeplanet-progress-section';
        section.className = 'mt-4 hidden';

        section.innerHTML = `
            <div class="p-4 bg-gray-800 rounded-lg border border-gray-600">
                <div class="flex justify-between text-sm text-gray-300 mb-2">
                    <span id="animeplanet-progress-text">Processing Anime Planet import...</span>
                    <span id="animeplanet-progress-count">0/0</span>
                </div>
                <div class="w-full bg-gray-700 rounded-full h-2">
                    <div id="animeplanet-progress-bar" class="bg-blue-600 h-2 rounded-full" style="width: 0%"></div>
                </div>
                <div id="animeplanet-results" class="mt-4 max-h-64 overflow-y-auto"></div>
            </div>
        `;

        return section;
    }

    function addAnimePlanetButton() {
        if (state.buttonAdded || document.getElementById('animeplanet-import-btn')) {
            return;
        }

        const importContainer = document.querySelector('.xl\\:container');
        if (!importContainer) return;

        const mangaUpdatesButton = document.getElementById('mangaupdates-import-btn')?.closest('.flex.items-center.mt-3');
        const mangaUpdatesProgress = document.getElementById('mangaupdates-progress-section');

        let insertAfter;
        if (mangaUpdatesProgress) {
            insertAfter = mangaUpdatesProgress;
        } else if (mangaUpdatesButton) {
            insertAfter = mangaUpdatesButton;
        } else {
            const lastButtonContainer = importContainer.querySelector('.flex.items-center.mt-3:last-of-type');
            if (!lastButtonContainer) return;
            insertAfter = lastButtonContainer;
        }

        const animePlanetButton = createAnimePlanetButton();
        const progressSection = createProgressSection();

        insertAfter.insertAdjacentElement('afterend', animePlanetButton);
        animePlanetButton.insertAdjacentElement('afterend', progressSection);

        state.buttonAdded = true;
        setupEventListeners();
    }

    function setupEventListeners() {
        const importBtn = document.getElementById('animeplanet-import-btn');
        const fileInput = document.getElementById('animeplanet-file-input');

        if (!importBtn || !fileInput) return;

        importBtn.addEventListener('click', () => {
            if (!state.isProcessing) {
                fileInput.click();
            }
        });

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file && !state.isProcessing) {
                await processAnimePlanetFile(file);
                e.target.value = '';
            }
        });
    }

    async function processAnimePlanetFile(file) {
        state.isProcessing = true;
        const importBtn = document.getElementById('animeplanet-import-btn');
        const progressSection = document.getElementById('animeplanet-progress-section');
        const originalBtnContent = importBtn.innerHTML;

        importBtn.textContent = 'Processing...';
        importBtn.disabled = true;
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
            importBtn.disabled = false;
            importBtn.innerHTML = originalBtnContent;
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
            colorClass = 'text-green-400 bg-green-900/20';
        } else if (type === 'info') {
            colorClass = 'text-blue-400 bg-blue-900/20';
        } else {
            colorClass = 'text-red-400 bg-red-900/20';
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
        resultsDiv.innerHTML = `<div class="text-red-400 text-sm p-2 bg-red-900/20 rounded">${escapeHtml(message)}</div>`;
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
        const headingExists = document.querySelector('h3')?.textContent.includes('Anime Planet');

        if (!iconExists) {
            state.iconsAdded = false;
        }
        if (!headingExists) {
            state.headingUpdated = false;
        }
    }

    function checkAndAddButton() {
        const isImportPage = window.location.pathname === '/import';

        if (!isImportPage) {
            cleanupElements();
            return;
        }

        const hasRequiredElements =
            document.querySelector('.xl\\:container') &&
            document.querySelector('h1')?.textContent.includes('Import Your Comics');

        if (hasRequiredElements) {
            checkElementsExist();
            addAnimePlanetIcon();
            updateHeading();

            if (!state.buttonAdded) {
                setTimeout(addAnimePlanetButton, 100);
            }
        }
    }

    function cleanupElements() {
        state.buttonAdded = false;
        state.iconsAdded = false;
        state.headingUpdated = false;

        const animePlanetButton = document.getElementById('animeplanet-import-btn')?.closest('.flex');
        const animePlanetProgress = document.getElementById('animeplanet-progress-section');
        const animePlanetIcon = document.querySelector('img[alt="Anime Planet"]')?.closest('.h-6.w-6.ml-2.rounded.overflow-hidden');

        [animePlanetButton, animePlanetProgress, animePlanetIcon].forEach(el => el?.remove());
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
            state.headingUpdated = false;
            setTimeout(checkAndAddButton, 200);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();