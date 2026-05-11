// ==UserScript==
// @name         WikiGacha Auto Gacha
// @namespace    https://github.com/GooglyBlox
// @version      1.0
// @description  Auto-opens packs and auto-duels on wikigachagame.org with pull/duel logging
// @author       GooglyBlox
// @match        https://wikigachagame.org/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @run-at       document-idle
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/577536/WikiGacha%20Auto%20Gacha.user.js
// @updateURL https://update.greasyfork.org/scripts/577536/WikiGacha%20Auto%20Gacha.meta.js
// ==/UserScript==

(function () {
    'use strict';

    const RARITY_ORDER = ['C', 'UC', 'R', 'SR', 'SSR', 'UR', 'LR'];
    const RARITY_COLORS = {
        C: '#b0b0b0', UC: '#4ade80', R: '#60a5fa',
        SR: '#c084fc', SSR: '#fbbf24', UR: '#fb7185', LR: '#ffd700'
    };
    const NOTIFY_FROM = 'SR';
    const NOTIFY_INDEX = RARITY_ORDER.indexOf(NOTIFY_FROM);
    const LOOP_INTERVAL_MS = 1500;
    const OPEN_WAIT_MS = 2200;
    const BACK_WAIT_MS = 900;
    const DUEL_TIMEOUT_MS = 12000;
    const NAV_COOLDOWN_MS = 4000;
    const MAX_PACKS = 10;

    const defaultStats = () => ({
        packsOpened: 0,
        cardsPulled: 0,
        duelsWon: 0,
        duelsLost: 0,
        byRarity: { C: 0, UC: 0, R: 0, SR: 0, SSR: 0, UR: 0, LR: 0 },
        rareLog: []
    });

    const prefs = {
        autoOpen: GM_getValue('wga_autoOpen', true),
        autoDuel: GM_getValue('wga_autoDuel', true),
        notifications: GM_getValue('wga_notifications', true),
        panelOpen: GM_getValue('wga_panelOpen', true)
    };

    let stats = GM_getValue('wga_stats', null);
    if (!stats || typeof stats !== 'object' || !stats.byRarity) stats = defaultStats();
    if (typeof stats.duelsWon !== 'number') stats.duelsWon = 0;
    if (typeof stats.duelsLost !== 'number') stats.duelsLost = 0;

    let lastPullKey = '';
    let lastStatus = 'Initializing';
    let pendingDuel = false;
    let pendingDuelStart = 0;
    let lastNavAt = 0;
    let loopRunning = false;

    function persistPrefs() {
        GM_setValue('wga_autoOpen', prefs.autoOpen);
        GM_setValue('wga_autoDuel', prefs.autoDuel);
        GM_setValue('wga_notifications', prefs.notifications);
        GM_setValue('wga_panelOpen', prefs.panelOpen);
    }
    function persistStats() {
        GM_setValue('wga_stats', stats);
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function isMainPage() {
        const p = window.location.pathname;
        return p === '/' || p === '' || p === '/en' || p === '/en/';
    }
    function isBattlePage() {
        return window.location.pathname.startsWith('/battle');
    }

    function safeNavigate(url) {
        if (Date.now() - lastNavAt < NAV_COOLDOWN_MS) return false;
        lastNavAt = Date.now();
        window.location.href = url;
        return true;
    }

      function getPackCountFromStorage() {
              try {
                  const raw = localStorage.getItem('wgp_state');
                  if (raw) {
                      const parsed = JSON.parse(raw);
                      if (parsed && typeof parsed.packs === 'number') return parsed.packs;
                  }
              } catch (_) {}
              try {
                  for (let i = 0; i < localStorage.length; i++) {
                      const key = localStorage.key(i);
                      if (!key) continue;
                      const val = localStorage.getItem(key);
                      if (!val || val[0] !== '{') continue;
                      let parsed;
                      try { parsed = JSON.parse(val); } catch (_) { continue; }
                      if (parsed && typeof parsed.packs === 'number') return parsed.packs;
                  }
              } catch (_) {}
              return null;
          }

        function getPackCount() {
            const el = document.getElementById('pack-count');
            if (el) {
                const n = parseInt(el.textContent, 10);
                if (!isNaN(n)) return n;
            }
            const stored = getPackCountFromStorage();
            if (stored !== null) return stored;
            return 0;
        }

    function findOpenButton() {
        return document.getElementById('open-pack-btn');
    }

    function findBackButton() {
        const actions = document.getElementById('pack-actions');
        if (!actions) return null;
        return actions.querySelector('button[onclick*="backToPacks"]')
            || actions.querySelector('button.btn-secondary')
            || actions.querySelector('button');
    }

    function resultsVisible() {
        const actions = document.getElementById('pack-actions');
        if (!actions) return false;
        const display = actions.style.display || getComputedStyle(actions).display;
        return display && display !== 'none';
    }

    function parseCardsFromDOM() {
        const root = document.getElementById('pack-results');
        if (!root) return [];
        const nodes = [...root.querySelectorAll('.card')];
        return nodes.map(n => {
            const rarityClass = [...n.classList].find(c => /^rarity-(C|UC|R|SR|SSR|UR|LR)$/.test(c));
            const rarity = rarityClass ? rarityClass.slice(7) : 'C';
            const title = (n.querySelector('.card-title')?.textContent || '').trim();
            const id = n.dataset.id || (title + ':' + rarity);
            const atkRaw = n.querySelector('.card-atk .card-stat-value')?.textContent || '0';
            const defRaw = n.querySelector('.card-def .card-stat-value')?.textContent || '0';
            const atk = parseInt(atkRaw.replace(/[,\s]/g, ''), 10) || 0;
            const def = parseInt(defRaw.replace(/[,\s]/g, ''), 10) || 0;
            return { id, rarity, title, atk, def };
        });
    }

    function recordPull(cards) {
        if (!cards || !cards.length) return false;
        const key = cards.map(c => c.id).join('|');
        if (key === lastPullKey) return false;
        lastPullKey = key;

        stats.packsOpened += 1;
        stats.cardsPulled += cards.length;

        let bestIdx = -1;
        let bestCard = null;
        for (const c of cards) {
            const r = RARITY_ORDER.includes(c.rarity) ? c.rarity : 'C';
            stats.byRarity[r] = (stats.byRarity[r] || 0) + 1;
            const idx = RARITY_ORDER.indexOf(r);
            if (idx > bestIdx) { bestIdx = idx; bestCard = c; }
            if (idx >= NOTIFY_INDEX) {
                stats.rareLog.unshift({
                    id: c.id, title: c.title, rarity: r,
                    atk: c.atk, def: c.def, when: Date.now()
                });
            }
        }
        if (stats.rareLog.length > 100) stats.rareLog.length = 100;

        if (prefs.notifications && bestIdx >= NOTIFY_INDEX && bestCard) {
            try {
                GM_notification({
                    title: bestCard.rarity + ' pull!',
                    text: bestCard.title,
                    timeout: 5000,
                    silent: false
                });
            } catch (_) {}
        }

        persistStats();
        renderPanel();
        return true;
    }

    function setupPackResultsObserver() {
        let lastFire = 0;
        const root = document.getElementById('pack-results');
        if (!root) return;
        const tryRecord = () => {
            const now = Date.now();
            if (now - lastFire < 200) return;
            const cards = parseCardsFromDOM();
            if (cards.length > 0) {
                if (recordPull(cards)) lastFire = now;
            }
        };
        const obs = new MutationObserver(() => {
            setTimeout(tryRecord, 150);
        });
        obs.observe(root, { childList: true, subtree: true });
    }

    async function doOpen() {
        const btn = findOpenButton();
        if (!btn) {
            lastStatus = 'Open button missing';
            return false;
        }
        btn.click();
        return true;
    }

    async function doBack() {
        const btn = findBackButton();
        if (!btn) return false;
        btn.click();
        return true;
    }

    function findQuickModeCard() {
        return [...document.querySelectorAll('.battle-mode-card')]
            .find(c => (c.getAttribute('onclick') || '').includes("'quick'"));
    }

    function findBackToMenuButton() {
        return document.querySelector('[onclick*="backToMenu"]');
    }

    function isQuickPanelVisible() {
        const el = document.getElementById('battle-quick');
        if (!el) return false;
        const d = el.style.display || getComputedStyle(el).display;
        return d && d !== 'none';
    }

    function getBattleResultEl() {
        return document.getElementById('battle-result');
    }

    function ensureCardSelected() {
        const selected = document.querySelector('#quick-card-select .raid-card-mini.selected');
        if (selected) return true;
        const first = document.querySelector('#quick-card-select .raid-card-mini');
        if (first) {
            first.click();
            return true;
        }
        return false;
    }

    function recordDuelResult(resultEl) {
        const isWin = resultEl.classList.contains('win');
        if (isWin) stats.duelsWon++; else stats.duelsLost++;
        persistStats();
        renderPanel();
    }

    function setupBattleResultObserver() {
        const tryAttach = () => {
            const result = getBattleResultEl();
            if (!result) return false;
            let debounceTimer;
            const obs = new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    if (!pendingDuel) return;
                    const d = result.style.display || getComputedStyle(result).display;
                    const visible = d && d !== 'none' && result.textContent.trim().length > 0;
                    if (!visible) return;
                    pendingDuel = false;
                    recordDuelResult(result);
                }, 250);
            });
            obs.observe(result, {
                childList: true, subtree: true,
                characterData: true, attributes: true,
                attributeFilter: ['style', 'class']
            });
            return true;
        };
        if (tryAttach()) return;
        const docObs = new MutationObserver(() => {
            if (tryAttach()) docObs.disconnect();
        });
        docObs.observe(document.body, { childList: true, subtree: true });
    }

    async function tickPack() {
        if (resultsVisible()) {
            lastStatus = 'Closing pack results';
            await doBack();
            await sleep(BACK_WAIT_MS);
            return;
        }
        const packs = getPackCount();
        if (packs <= 0) {
            if (prefs.autoDuel) {
                lastStatus = 'No packs, heading to duel';
                renderStatusOnly();
                await sleep(500);
                safeNavigate('/battle');
            } else {
                lastStatus = 'Waiting for packs';
            }
            return;
        }
        if (!prefs.autoOpen) {
            lastStatus = 'Auto-open paused';
            return;
        }
        lastStatus = 'Opening pack';
        renderStatusOnly();
        const ok = await doOpen();
        if (!ok) return;
        await sleep(OPEN_WAIT_MS);
        lastStatus = 'Closing pack results';
        renderStatusOnly();
        await doBack();
        await sleep(BACK_WAIT_MS);
    }

    async function tickBattle() {
        if (!prefs.autoDuel) {
            lastStatus = 'Auto-duel paused';
            return;
        }
        const packs = getPackCount();
        if (packs >= MAX_PACKS) {
            if (pendingDuel) {
                lastStatus = 'Packs full, waiting for duel to finish';
                return;
            }
            lastStatus = 'Packs full, returning';
            renderStatusOnly();
            await sleep(500);
            safeNavigate('/');
            return;
        }
        if (!isQuickPanelVisible()) {
            const card = findQuickModeCard();
            if (card) {
                lastStatus = 'Opening Quick Duel';
                card.click();
                await sleep(800);
                return;
            }
            const back = findBackToMenuButton();
            if (back) {
                lastStatus = 'Returning to battle menu';
                back.click();
                await sleep(500);
                return;
            }
            lastStatus = 'Quick mode unreachable';
            return;
        }
        if (pendingDuel) {
            if (Date.now() - pendingDuelStart > DUEL_TIMEOUT_MS) {
                pendingDuel = false;
                lastStatus = 'Duel timed out';
            } else {
                lastStatus = 'Duel in progress';
            }
            return;
        }
        if (getPackCount() >= MAX_PACKS) {
            lastStatus = 'Packs full, returning';
            renderStatusOnly();
            await sleep(500);
            safeNavigate('/');
            return;
        }
        const startBtn = document.getElementById('quick-battle-btn');
        if (!startBtn) {
            lastStatus = 'Start button missing';
            return;
        }
        if (!ensureCardSelected()) {
            lastStatus = 'No cards to duel with';
            return;
        }
        pendingDuel = true;
        pendingDuelStart = Date.now();
        lastStatus = 'Starting duel';
        startBtn.click();
    }

    async function autoLoop() {
        if (loopRunning) return;
        loopRunning = true;
        try {
            while (true) {
                await sleep(LOOP_INTERVAL_MS);
                renderStatusOnly();
                if (isBattlePage()) {
                    await tickBattle();
                } else if (isMainPage()) {
                    await tickPack();
                } else {
                    lastStatus = 'Idle (other page)';
                }
            }
        } finally {
            loopRunning = false;
        }
    }

    function injectStyles() {
        if (document.getElementById('wga-styles')) return;
        const css = `
            #wga-panel { position: fixed; bottom: 16px; right: 16px; width: 290px;
                background: #0f1115; color: #e8e8ea; border: 1px solid #2a2f3a;
                border-radius: 10px; font-family: 'Outfit', system-ui, -apple-system, sans-serif;
                font-size: 12px; z-index: 2147483600; overflow: hidden; }
            #wga-panel.collapsed { width: auto; }
            #wga-panel .wga-head { display: flex; align-items: center; justify-content: space-between;
                gap: 10px; padding: 9px 12px; background: #161922; border-bottom: 1px solid #2a2f3a;
                cursor: pointer; user-select: none; }
            #wga-panel.collapsed .wga-head { border-bottom: none; }
            #wga-panel .wga-title { font-weight: 700; letter-spacing: 0.6px;
                text-transform: uppercase; font-size: 11px; }
            #wga-panel .wga-chev { color: #8b94a7; font-size: 11px; line-height: 1; }
            #wga-panel.collapsed .wga-body { display: none; }
            #wga-panel .wga-body { padding: 10px 12px 12px; }
            #wga-panel .wga-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; }
            #wga-panel .wga-toggle { cursor: pointer; }
            #wga-panel .wga-sw { width: 30px; height: 16px; background: #2a2f3a;
                border-radius: 8px; position: relative; transition: background 0.15s; }
            #wga-panel .wga-sw::after { content: ''; position: absolute; top: 2px; left: 2px;
                width: 12px; height: 12px; background: #e8e8ea; border-radius: 50%;
                transition: left 0.15s; }
            #wga-panel .wga-sw.on { background: #4ade80; }
            #wga-panel .wga-sw.on::after { left: 16px; background: #0f1115; }
            #wga-panel .wga-section { margin-top: 8px; padding-top: 8px; border-top: 1px solid #1f2330; }
            #wga-panel .wga-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 10px; }
            #wga-panel .wga-stat { display: flex; justify-content: space-between; font-size: 11px; }
            #wga-panel .wga-stat-label { color: #8b94a7; }
            #wga-panel .wga-stat-val { color: #e8e8ea; font-weight: 600; }
            #wga-panel .wga-duels { display: flex; justify-content: space-between;
                font-size: 11px; padding: 4px 0 0; }
            #wga-panel .wga-rarities { display: flex; flex-wrap: wrap; gap: 4px; }
            #wga-panel .wga-rarity-pill { font-size: 10px; padding: 2px 6px; border-radius: 4px;
                background: #161922; border: 1px solid #232838; font-weight: 700; letter-spacing: 0.3px; }
            #wga-panel .wga-log { max-height: 170px; overflow-y: auto; margin: 0 -4px; padding: 0 4px; }
            #wga-panel .wga-log::-webkit-scrollbar { width: 6px; }
            #wga-panel .wga-log::-webkit-scrollbar-thumb { background: #2a2f3a; border-radius: 3px; }
            #wga-panel .wga-log-empty { color: #8b94a7; font-style: italic; font-size: 11px;
                padding: 6px 0; text-align: center; }
            #wga-panel .wga-log-row { display: flex; align-items: center; gap: 6px;
                padding: 4px 2px; border-bottom: 1px solid #1a1d25; font-size: 11px; }
            #wga-panel .wga-log-row:last-child { border-bottom: none; }
            #wga-panel .wga-log-rarity { font-weight: 700; font-size: 10px; padding: 1px 5px;
                border-radius: 3px; background: #161922; border: 1px solid #232838;
                flex-shrink: 0; min-width: 30px; text-align: center; }
            #wga-panel .wga-log-title { overflow: hidden; text-overflow: ellipsis;
                white-space: nowrap; flex: 1; color: #d3d6dc; }
            #wga-panel .wga-log-stats { color: #8b94a7; font-size: 10px; flex-shrink: 0; }
            #wga-panel .wga-status-row { display: flex; align-items: center; gap: 6px;
                font-size: 10px; color: #8b94a7; padding: 8px 0 0; }
            #wga-panel .wga-status-dot { width: 6px; height: 6px; border-radius: 50%;
                background: #8b94a7; flex-shrink: 0; }
            #wga-panel .wga-status-dot.active { background: #4ade80; box-shadow: 0 0 6px #4ade80; }
            #wga-panel .wga-buttons { display: flex; gap: 6px; margin-top: 8px; }
            #wga-panel .wga-btn { background: transparent; color: #8b94a7; border: 1px solid #2a2f3a;
                border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;
                font-family: inherit; flex: 1; transition: all 0.15s; }
            #wga-panel .wga-btn:hover { color: #e8e8ea; border-color: #4ade80; }
            #wga-panel .wga-btn.danger:hover { color: #fb7185; border-color: #fb7185; }
        `;
        const style = document.createElement('style');
        style.id = 'wga-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function buildPanel() {
        if (document.getElementById('wga-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'wga-panel';
        if (!prefs.panelOpen) panel.classList.add('collapsed');
        panel.innerHTML = `
            <div class="wga-head">
                <span class="wga-title">Auto Gacha</span>
                <span class="wga-chev">${prefs.panelOpen ? '\u25BE' : '\u25B8'}</span>
            </div>
            <div class="wga-body">
                <div class="wga-row">
                    <span>Auto-open packs</span>
                    <div class="wga-toggle" data-pref="autoOpen">
                        <div class="wga-sw ${prefs.autoOpen ? 'on' : ''}"></div>
                    </div>
                </div>
                <div class="wga-row">
                    <span>Auto-duel when out</span>
                    <div class="wga-toggle" data-pref="autoDuel">
                        <div class="wga-sw ${prefs.autoDuel ? 'on' : ''}"></div>
                    </div>
                </div>
                <div class="wga-row">
                    <span>Notify on ${NOTIFY_FROM}+</span>
                    <div class="wga-toggle" data-pref="notifications">
                        <div class="wga-sw ${prefs.notifications ? 'on' : ''}"></div>
                    </div>
                </div>
                <div class="wga-section wga-stats"></div>
                <div class="wga-duels"></div>
                <div class="wga-section wga-rarities"></div>
                <div class="wga-section">
                    <div class="wga-log"></div>
                </div>
                <div class="wga-status-row">
                    <span class="wga-status-dot"></span>
                    <span class="wga-status-text"></span>
                </div>
                <div class="wga-buttons">
                    <button class="wga-btn" type="button" data-action="run-now">Run Now</button>
                    <button class="wga-btn danger" type="button" data-action="reset">Reset Stats</button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        panel.querySelector('.wga-head').addEventListener('click', () => {
            prefs.panelOpen = !prefs.panelOpen;
            panel.classList.toggle('collapsed', !prefs.panelOpen);
            panel.querySelector('.wga-chev').textContent = prefs.panelOpen ? '\u25BE' : '\u25B8';
            persistPrefs();
        });

        panel.querySelectorAll('.wga-toggle').forEach(t => {
            t.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = t.dataset.pref;
                prefs[key] = !prefs[key];
                t.querySelector('.wga-sw').classList.toggle('on', prefs[key]);
                persistPrefs();
                renderPanel();
            });
        });

        panel.querySelector('[data-action="run-now"]').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (isBattlePage()) {
                if (!isQuickPanelVisible()) {
                    const card = findQuickModeCard();
                    if (card) card.click();
                    await sleep(500);
                }
                if (!ensureCardSelected()) {
                    lastStatus = 'No cards available';
                    renderStatusOnly();
                    return;
                }
                const startBtn = document.getElementById('quick-battle-btn');
                if (startBtn && !pendingDuel) {
                    pendingDuel = true;
                    pendingDuelStart = Date.now();
                    lastStatus = 'Manual duel';
                    startBtn.click();
                }
            } else if (isMainPage()) {
                const btn = findOpenButton();
                if (!btn) {
                    lastStatus = 'Open button not found';
                    renderStatusOnly();
                    return;
                }
                if (resultsVisible()) {
                    await doBack();
                    await sleep(500);
                }
                btn.click();
                lastStatus = 'Manual open';
                renderStatusOnly();
            }
        });

        panel.querySelector('[data-action="reset"]').addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Reset all tracked stats?')) return;
            stats = defaultStats();
            lastPullKey = '';
            persistStats();
            renderPanel();
        });
    }

    function escHtml(s) {
        return String(s).replace(/[<>&"']/g, ch => ({
            '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
        })[ch]);
    }

    function renderStatusOnly() {
        const panel = document.getElementById('wga-panel');
        if (!panel) return;
        const dot = panel.querySelector('.wga-status-dot');
        const text = panel.querySelector('.wga-status-text');
        if (!dot || !text) return;
        const packs = getPackCount();
        const active = (isMainPage() && prefs.autoOpen) || (isBattlePage() && prefs.autoDuel);
        dot.classList.toggle('active', active);
        const parts = [];
        if (isBattlePage()) parts.push('Battle');
        else if (isMainPage()) parts.push('Packs');
        else parts.push('Other');
        parts.push(`${packs} ready`);
        if (lastStatus) parts.push(lastStatus);
        text.textContent = parts.join(' \u2022 ');
    }

    function renderPanel() {
        const panel = document.getElementById('wga-panel');
        if (!panel) return;

        panel.querySelector('.wga-stats').innerHTML = `
            <div class="wga-stat"><span class="wga-stat-label">Packs</span><span class="wga-stat-val">${stats.packsOpened}</span></div>
            <div class="wga-stat"><span class="wga-stat-label">Cards</span><span class="wga-stat-val">${stats.cardsPulled}</span></div>
        `;

        const totalDuels = stats.duelsWon + stats.duelsLost;
        const winRate = totalDuels > 0 ? Math.round((stats.duelsWon / totalDuels) * 100) : 0;
        panel.querySelector('.wga-duels').innerHTML = `
            <span class="wga-stat-label">Duels</span>
            <span class="wga-stat-val">${stats.duelsWon}W / ${stats.duelsLost}L${totalDuels > 0 ? ` (${winRate}%)` : ''}</span>
        `;

        panel.querySelector('.wga-rarities').innerHTML = RARITY_ORDER.map(r => {
            const n = stats.byRarity[r] || 0;
            const color = RARITY_COLORS[r];
            return `<span class="wga-rarity-pill" style="color:${color};border-color:${color}55">${r} ${n}</span>`;
        }).join('');

        const logEl = panel.querySelector('.wga-log');
        if (!stats.rareLog.length) {
            logEl.innerHTML = `<div class="wga-log-empty">No ${NOTIFY_FROM}+ pulls yet</div>`;
        } else {
            logEl.innerHTML = stats.rareLog.slice(0, 30).map(c => {
                const color = RARITY_COLORS[c.rarity] || '#fff';
                const title = escHtml(c.title || '');
                const statsTxt = (c.atk || c.def)
                    ? `<span class="wga-log-stats">${(c.atk || 0).toLocaleString()}/${(c.def || 0).toLocaleString()}</span>`
                    : '';
                return `<div class="wga-log-row">
                    <span class="wga-log-rarity" style="color:${color};border-color:${color}55">${c.rarity}</span>
                    <span class="wga-log-title" title="${title}">${title}</span>
                    ${statsTxt}
                </div>`;
            }).join('');
        }

        renderStatusOnly();
    }

    function waitForBody() {
        return new Promise(resolve => {
            if (document.body) return resolve();
            const obs = new MutationObserver(() => {
                if (document.body) { obs.disconnect(); resolve(); }
            });
            obs.observe(document.documentElement, { childList: true });
        });
    }

    async function init() {
        await waitForBody();

        const start = Date.now();
        while (Date.now() - start < 15000) {
            const onMain = isMainPage() && document.getElementById('open-pack-btn');
            const onBattle = isBattlePage() && (document.getElementById('battle-modes') || document.getElementById('battle-quick'));
            const onOther = !isMainPage() && !isBattlePage();
            if (onMain || onBattle || onOther) break;
            await sleep(200);
        }

        injectStyles();
        buildPanel();
        renderPanel();

        if (isMainPage()) {
            setupPackResultsObserver();
            const initial = parseCardsFromDOM();
            if (initial.length > 0) lastPullKey = initial.map(c => c.id).join('|');
        } else if (isBattlePage()) {
            setupBattleResultObserver();
        }

        lastStatus = 'Ready';
        renderStatusOnly();

        autoLoop();
        setInterval(renderPanel, 3000);

    }

    init();
})();