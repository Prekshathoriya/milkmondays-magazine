/* Milk Mondays Patreon promotion.
   Watches the existing JavaScript-rendered reader without changing app.js. */
(function () {
    'use strict';

    var SESSION_KEY = 'mm_patreon_promo_seen_v1';
    var READ_THRESHOLD = 0.8;
    var MIN_READING_TIME_MS = 4000;

    var articleModal;
    var modalPanel;
    var modalBody;
    var promo;
    var activeArticleBody = null;
    var articleStartedAt = 0;
    var initialModalScroll = 0;
    var initialPanelScroll = 0;
    var hasScrolled = false;
    var memorySeen = false;

    function hasBeenSeenThisSession() {
        if (memorySeen) return true;
        try {
            return window.sessionStorage.getItem(SESSION_KEY) === 'true';
        } catch (error) {
            return memorySeen;
        }
    }

    function markSeenThisSession() {
        memorySeen = true;
        try {
            window.sessionStorage.setItem(SESSION_KEY, 'true');
        } catch (error) {}
    }

    function buildPromo() {
        promo = document.createElement('aside');
        promo.id = 'mm-patreon-promo';
        promo.setAttribute('aria-label', 'Milk Mondays Patreon exclusives');
        promo.setAttribute('aria-hidden', 'true');
        promo.innerHTML =
            '<button class="mm-patreon-promo__close" type="button" aria-label="Close Patreon promotion">' +
                '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">' +
                    '<line x1="18" y1="6" x2="6" y2="18"></line>' +
                    '<line x1="6" y1="6" x2="18" y2="18"></line>' +
                '</svg>' +
            '</button>' +
            '<span class="mm-patreon-promo__label">MILK MONDAYS EXCLUSIVES ♡</span>' +
            '<div class="mm-patreon-promo__rule" aria-hidden="true"></div>' +
            '<h2 class="mm-patreon-promo__title">psst... there\'s a members-only side 👀</h2>' +
            '<p class="mm-patreon-promo__description">more theories, deeper gossip, and exclusive stories you won\'t find in the free magazine. all over on patreon ♡</p>' +
            '<div class="mm-patreon-promo__actions">' +
                '<a class="mm-patreon-promo__cta" href="https://www.patreon.com/cw/milkmondays" target="_blank" rel="noopener noreferrer">explore the exclusives ↗</a>' +
                '<button class="mm-patreon-promo__later" type="button">maybe later</button>' +
            '</div>';

        document.body.appendChild(promo);

        promo.querySelector('.mm-patreon-promo__close').addEventListener('click', hidePromo);
        promo.querySelector('.mm-patreon-promo__later').addEventListener('click', hidePromo);
        promo.querySelector('.mm-patreon-promo__cta').addEventListener('click', hidePromo);
    }

    function showPromo() {
        if (!promo || hasBeenSeenThisSession()) return;
        markSeenThisSession();
        promo.setAttribute('aria-hidden', 'false');
        promo.classList.add('mm-patreon-promo--visible');
    }

    function hidePromo() {
        if (!promo) return;
        promo.classList.remove('mm-patreon-promo--visible');
        promo.setAttribute('aria-hidden', 'true');
    }

    function articleIsOpen() {
        return Boolean(
            articleModal &&
            articleModal.classList.contains('open') &&
            activeArticleBody &&
            activeArticleBody.isConnected
        );
    }

    function visibleReadingProgress(scrollContainer) {
        if (!activeArticleBody || !scrollContainer) return 0;

        var bodyRect = activeArticleBody.getBoundingClientRect();
        var containerRect = scrollContainer.getBoundingClientRect();
        var viewportBottom = Math.min(containerRect.bottom, window.innerHeight);

        if (!bodyRect.height) return 0;
        return Math.max(0, Math.min(1, (viewportBottom - bodyRect.top) / bodyRect.height));
    }

    function handleReaderScroll(event) {
        if (!articleIsOpen() || hasBeenSeenThisSession()) return;

        var scrollContainer = event.currentTarget;
        var startingScroll = scrollContainer === modalPanel ? initialPanelScroll : initialModalScroll;

        if (Math.abs(scrollContainer.scrollTop - startingScroll) > 16) {
            hasScrolled = true;
        }

        if (!hasScrolled || Date.now() - articleStartedAt < MIN_READING_TIME_MS) return;

        if (visibleReadingProgress(scrollContainer) >= READ_THRESHOLD) {
            showPromo();
        }
    }

    function refreshActiveArticle() {
        var nextArticleBody = modalBody ? modalBody.querySelector('#reader-body-content') : null;
        if (nextArticleBody === activeArticleBody) return;

        hidePromo();
        activeArticleBody = nextArticleBody;
        articleStartedAt = Date.now();
        initialModalScroll = articleModal ? articleModal.scrollTop : 0;
        initialPanelScroll = modalPanel ? modalPanel.scrollTop : 0;
        hasScrolled = false;
    }

    function initialise() {
        articleModal = document.getElementById('article-modal');
        modalPanel = document.getElementById('modal-panel');
        modalBody = document.getElementById('modal-body');

        if (!articleModal || !modalPanel || !modalBody) return;

        buildPromo();

        articleModal.addEventListener('scroll', handleReaderScroll, { passive: true });
        modalPanel.addEventListener('scroll', handleReaderScroll, { passive: true });

        new MutationObserver(refreshActiveArticle).observe(modalBody, {
            childList: true,
            subtree: true
        });

        new MutationObserver(function () {
            if (!articleModal.classList.contains('open')) hidePromo();
            refreshActiveArticle();
        }).observe(articleModal, {
            attributes: true,
            attributeFilter: ['class']
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && promo.classList.contains('mm-patreon-promo--visible')) {
                event.preventDefault();
                event.stopImmediatePropagation();
                hidePromo();
            }
        }, true);

        refreshActiveArticle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialise, { once: true });
    } else {
        initialise();
    }
}());
