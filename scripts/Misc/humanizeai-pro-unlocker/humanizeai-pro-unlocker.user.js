// ==UserScript==
// @name         HumanizeAI Pro Unlocker
// @namespace    https://github.com/GooglyBlox
// @version      1.1
// @description  Bypasses the word limit on HumanizeAI Pro by intercepting the API response and injecting the full result
// @author       GooglyBlox
// @match        https://www.humanizeai.pro/*
// @connect      www.humanizeai.pro
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/574018/HumanizeAI%20Pro%20Unlocker.user.js
// @updateURL https://update.greasyfork.org/scripts/574018/HumanizeAI%20Pro%20Unlocker.meta.js
// ==/UserScript==

(function () {
    'use strict';

    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
        const [resource] = args;
        const url = typeof resource === 'string' ? resource : resource.url;

        if (!url.includes('/api/process')) {
            return originalFetch.apply(this, args);
        }

        const response = await originalFetch.apply(this, args);
        const data = await response.json();

        if (!data.result || !data.result[0] || !data.result[0].text) {
            return new Response(JSON.stringify(data), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            });
        }

        const fullText = data.result[0].text;

        const patchedResponse = new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });

        const waitForOutput = () => {
            return new Promise(resolve => {
                const check = () => {
                    const textarea = document.querySelector('#rich-textarea');
                    const blurred = document.querySelector('[class*="WordLimitBlur_blurred"]');
                    if (textarea && blurred) {
                        resolve();
                    } else {
                        requestAnimationFrame(check);
                    }
                };
                check();
            });
        };

        waitForOutput().then(() => {
            document.querySelectorAll('[class*="WordLimitBlur_blurred"]').forEach(el => {
                const blurredClasses = Array.from(el.classList).filter(c => c.includes('blurred'));
                el.classList.remove(...blurredClasses);
                el.style.userSelect = '';
                el.style.filter = '';
                el.style.webkitFilter = '';
            });

            const popup = document.querySelector('[class*="WordLimitPrompt_wordLimitPopup"]');
            if (popup) popup.style.display = 'none';

            const warning = document.querySelector('[class*="WordLimitPrompt_limitWarning"]');
            if (warning) warning.style.display = 'none';

            const limitText = document.querySelector('[class*="TextCounter_characterCount"]');
            if (limitText) {
                const wordCount = fullText.trim().split(/\s+/).length;
                limitText.textContent = wordCount + ' words';
            }

            const textarea = document.querySelector('#rich-textarea');
            if (textarea) {
                const nativeSet = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                ).set;
                nativeSet.call(textarea, fullText);
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
                textarea.removeAttribute('readonly');
            }

            const copyButton = document.querySelector('[class*="CopyButton_copyButton"] img, [class*="OutputContainer_copyButtonWrapper"] img');
            if (copyButton) {
                const wrapper = copyButton.closest('[class*="CopyButton_copyButton"]') || copyButton.closest('[class*="OutputContainer_copyButtonWrapper"]');
                if (wrapper) {
                    const newWrapper = wrapper.cloneNode(true);
                    wrapper.parentNode.replaceChild(newWrapper, wrapper);
                    newWrapper.addEventListener('click', () => {
                        navigator.clipboard.writeText(fullText).then(() => {
                            const img = newWrapper.querySelector('img');
                            if (img) {
                                const originalTitle = img.title;
                                img.title = 'Copied!';
                                setTimeout(() => { img.title = originalTitle; }, 2000);
                            }
                        });
                    });
                }
            }
        });

        return patchedResponse;
    };
})();