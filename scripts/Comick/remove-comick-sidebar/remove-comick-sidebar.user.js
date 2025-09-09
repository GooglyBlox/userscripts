// ==UserScript==
// @name         Remove Comick Sidebar
// @namespace    https://github.com/GooglyBlox
// @version      1.0
// @description  Removes sidebar div and extends main to take its place exactly
// @author       GooglyBlox
// @match        https://comick.io/
// @match        https://comick.io/home2
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/534227/Remove%20Comick%20Sidebar.user.js
// @updateURL https://update.greasyfork.org/scripts/534227/Remove%20Comick%20Sidebar.meta.js
// ==/UserScript==

(function() {
    'use strict';

    function adjustLayout() {
        const mainElement = document.querySelector('main[id="main"]');

        const sidebarDiv = document.querySelector('div.float-right.w-4\\/12.xl\\:w-3\\/12');

        if (mainElement && sidebarDiv) {
            sidebarDiv.remove();

            mainElement.classList.remove('md:w-8/12', 'xl:w-9/12');
            mainElement.classList.add('md:w-12/12', 'xl:w-12/12');

            mainElement.classList.remove('md:float-left');
        }
    }

    adjustLayout();

    const observer = new MutationObserver(function(mutations) {
        adjustLayout();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();