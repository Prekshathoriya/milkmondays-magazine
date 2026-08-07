/**
 * Milk Mondays â€” app.js
 * Handles: post loading, category filtering, gate check, article modal,
 *          likes (server + local), share, deep-link via ?article=
 */

(function () {
    'use strict';

    /* â”€â”€ CONFIG â”€â”€ */
    var LIKES_API = 'https://muddy-shadow-6c19.milkmondaysbiz.workers.dev';
    var POSTS_URL = 'https://milkmondays-magazine.pages.dev/content/posts.json';
    var COMMENTS_API = '/api/comments';
    var COMMENTS_REFRESH_MS = 10000;
    var COMMENTS_MAX_LENGTH = 1200;

    /* â”€â”€ STATE â”€â”€ */
    var allPosts      = [];
    var activeCategory = 'all';
    var activeCommentsArticleId = '';
    var commentsRefreshTimer = null;
    var commentProfile = null;
    var commentTurnstileSiteKey = '';
    var commentTurnstileToken = '';
    var commentTurnstileWidgetId = null;

    /* â”€â”€ DOM REFS (set after DOMContentLoaded) â”€â”€ */
    var stateView, magContent, heroSection, postsGrid;
    var modalBg, modalPanel, modalBody, closeBtn;
    var navButtons, logoBtn;
    var shareStoryBtn;

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       INIT
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    document.addEventListener('DOMContentLoaded', function () {
        stateView   = document.getElementById('state-view');
        magContent  = document.getElementById('mag-content');
        heroSection = document.getElementById('hero-section');
        postsGrid   = document.getElementById('posts-grid');
        modalBg     = document.getElementById('article-modal');
        modalPanel  = document.getElementById('modal-panel');
        modalBody   = document.getElementById('modal-body');
        closeBtn    = document.getElementById('modal-close');
        navButtons  = document.querySelectorAll('.nav-btn');
        logoBtn     = document.getElementById('logo-btn');
        shareStoryBtn = document.getElementById('share-story-btn');

        bindNav();
        bindModal();
        bindShareStory();
        bindSearch();
        loadPosts();

        /* â”€â”€ BACK TO TOP BUTTON â”€â”€ */
        var backToTopBtn = document.getElementById('back-to-top');
        if (backToTopBtn) {
            window.addEventListener('scroll', function () {
                if (window.scrollY > 400) {
                    backToTopBtn.classList.add('show');
                } else {
                    backToTopBtn.classList.remove('show');
                }
            });
            backToTopBtn.addEventListener('click', function () {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }
    });

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       HELPERS
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function esc(s) {
        if (!s) return '';
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function gatePassed() {
        try { return localStorage.getItem('mm_gate_passed') === 'true'; } catch (e) { return false; }
    }

    function baselineLikes(id) {
        var h = 0;
        for (var i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
        return (Math.abs(h) % 65) + 32;
    }

    function isLiked(id) {
        try { return localStorage.getItem('mm_liked_' + id) === 'true'; } catch (e) { return false; }
    }

    function setLiked(id, val) {
        try { localStorage.setItem('mm_liked_' + id, val ? 'true' : 'false'); } catch (e) {}
    }

    function fmtDate(iso, opts) {
        opts = opts || { month: 'short', day: 'numeric', year: 'numeric' };
        try { return new Date(iso).toLocaleDateString('en-US', opts); } catch (e) { return iso; }
    }

    /* â”€â”€ SAVE FOR LATER HELPERS â”€â”€ */
    function getSavedIds() {
        try {
            var saved = localStorage.getItem('mm_saved_posts');
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    }

    function savePost(id) {
        var saved = getSavedIds();
        if (!saved.includes(id)) {
            saved.push(id);
            localStorage.setItem('mm_saved_posts', JSON.stringify(saved));
        }
    }

    function unsavePost(id) {
        var saved = getSavedIds();
        var newSaved = saved.filter(function(s) { return s !== id; });
        localStorage.setItem('mm_saved_posts', JSON.stringify(newSaved));
    }

    function isSaved(id) {
        return getSavedIds().includes(id);
    }

    function toggleSave(id, btnElement) {
        if (isSaved(id)) {
            unsavePost(id);
            if (btnElement) btnElement.classList.remove('saved');
        } else {
            savePost(id);
            if (btnElement) btnElement.classList.add('saved');
        }
        if (activeCategory === 'saved') {
            renderMag();
        }
    }

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       STORY TIME SUBMISSION CTA
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function bindShareStory() {
        if (!shareStoryBtn) return;

        shareStoryBtn.addEventListener('click', function () {
            try { localStorage.setItem('mm_story_submit_clicked', 'true'); } catch (e) {}
        });

        shareStoryBtn.addEventListener('error', function () {
            var fallback = shareStoryBtn.getAttribute('data-fallback-href');
            if (fallback) shareStoryBtn.setAttribute('href', fallback);
        }, true);
    }

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       NAV BINDING
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function bindNav() {
        navButtons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                navButtons.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                activeCategory = btn.dataset.category || 'all';
                renderMag();
            });
        });

        if (logoBtn) {
            logoBtn.addEventListener('click', function (e) {
                e.preventDefault();
                navButtons.forEach(function (b) { b.classList.remove('active'); });
                var homeBtn = document.querySelector('.nav-btn[data-category="all"]');
                if (homeBtn) homeBtn.classList.add('active');
                activeCategory = 'all';
                renderMag();
            });
        }
    }

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       SEARCH
       Self-contained: reads from the existing
       #site-search input/results markup if present
       in the page. If that markup isn't there yet,
       this quietly does nothing â€” safe no-op.
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function bindSearch() {
        var input    = document.getElementById('site-search-input');
        var results  = document.getElementById('site-search-results');
        var backdrop = document.getElementById('site-search-backdrop');
        if (!input || !results) return; /* markup not on this page â€” no-op */

        var debounceTimer;

        /* .site-header has its own z-index (creates a stacking context),
           so no z-index on a child inside it can ever beat elements
           outside that context â€” like the article modal â€” no matter how
           high that child's z-index number is. Moving the dropdown and
           its backdrop to be direct children of <body> escapes that trap
           entirely, so they always render above absolutely everything,
           including an already-open article. Position is recalculated
           against the search box's real screen location every time it
           opens or the window resizes. */
        if (results.parentNode !== document.body) document.body.appendChild(results);
        if (backdrop && backdrop.parentNode !== document.body) document.body.appendChild(backdrop);

        function positionResults() {
            var rect = input.getBoundingClientRect();
            results.style.position = 'fixed';
            results.style.top      = (rect.bottom + 8) + 'px';
            results.style.left     = rect.left + 'px';
            results.style.width    = rect.width + 'px';
        }

        function openResults() {
            positionResults();
            results.classList.add('open');
            if (backdrop) backdrop.classList.add('open');
        }

        function closeResults() {
            results.classList.remove('open');
            if (backdrop) backdrop.classList.remove('open');
        }

        window.addEventListener('resize', function () {
            if (results.classList.contains('open')) positionResults();
        });

        input.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            var q = input.value.trim();
            if (!q) {
                results.innerHTML = '';
                closeResults();
                return;
            }
            debounceTimer = setTimeout(function () { runSearch(q); }, 150);
        });

        document.addEventListener('click', function (e) {
            if (!e.target.closest('.site-search-wrap') && !e.target.closest('#site-search-results')) closeResults();
        });
        if (backdrop) backdrop.addEventListener('click', closeResults);

        function runSearch(q) {
            var qLower = q.toLowerCase();
            var matches = allPosts.filter(function (p) {
                var haystack = (
                    (p.title || '') + ' ' +
                    (p.subtitle || '') + ' ' +
                    (p.category || '') + ' ' +
                    (p.tags || []).join(' ')
                ).toLowerCase();
                return haystack.indexOf(qLower) !== -1;
            }).slice(0, 6);

            if (!matches.length) {
                results.innerHTML = '<p class="site-search-empty">No matches for &ldquo;' + esc(q) + '&rdquo;.</p>';
                openResults();
                return;
            }

            results.innerHTML = matches.map(function (p) {
                return '<button class="site-search-result" data-id="' + esc(p.id) + '">' +
                    '<span class="site-search-result-cat">' + esc(p.category) + '</span>' +
                    '<span class="site-search-result-title">' + esc(p.title) + '</span>' +
                '</button>';
            }).join('');
            openResults();

            results.querySelectorAll('.site-search-result').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var p = allPosts.find(function (post) { return post.id === btn.dataset.id; });
                    if (p) {
                        checkGateAndOpen(p);
                        input.value = '';
                        results.innerHTML = '';
                        closeResults();
                    }
                });
            });
        }
    }

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       MODAL BINDING
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function bindModal() {
        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        if (modalBg) {
            modalBg.addEventListener('click', function (e) {
                if (e.target === modalBg) closeModal();
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modalBg && modalBg.classList.contains('open')) closeModal();
        });
    }

    function openModal() {
        if (!modalBg) return;
        /* If search is open when an article opens (e.g. clicking a
           search result), make sure it's closed â€” they should never
           both be visible at once. */
        var searchResults = document.getElementById('site-search-results');
        var searchBackdrop = document.getElementById('site-search-backdrop');
        if (searchResults) searchResults.classList.remove('open');
        if (searchBackdrop) searchBackdrop.classList.remove('open');

        modalBg.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        if (!modalBg) return;
        stopComments();
        modalBg.classList.remove('open');
        document.body.style.overflow = '';
        /* restore URL */
        try { window.history.pushState({}, '', '/magazine'); } catch (e) {}
    }

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       LOAD POSTS
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function loadPosts() {
        fetch(POSTS_URL)
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) {
                if (typeof window.mm_hideSkeleton === 'function') window.mm_hideSkeleton();

                allPosts = (data.posts || []).sort(function (a, b) {
                    return new Date(b.date) - new Date(a.date);
                });

                /* handle category deep link, e.g. magazine.html?category=skincare */
                var params = new URLSearchParams(window.location.search);
                var targetCategory = params.get('category');
                if (targetCategory) {
                    var targetBtn = document.querySelector('.nav-btn[data-category="' + targetCategory.toLowerCase() + '"]');
                    if (targetBtn) {
                        navButtons.forEach(function (b) { b.classList.remove('active'); });
                        targetBtn.classList.add('active');
                        activeCategory = targetCategory.toLowerCase();
                    }
                }

                renderMag();

                /* handle article deep link */
                var targetId = params.get('article');
                /* Fallback: articles are now served directly at
                   /magazine/<id> (see functions/magazine/[id].js), so the
                   id may be in the URL path instead of a ?article= query
                   string. window.__mmArticleId is set by that Function;
                   the pathname match below covers any other case where
                   the page was reached without it (e.g. cached HTML). */
                if (!targetId && typeof window.__mmArticleId === 'string' && window.__mmArticleId) {
                    targetId = window.__mmArticleId;
                }
                if (!targetId) {
                    var pathMatch = window.location.pathname.match(/^\/magazine\/([^\/?#]+)/);
                    if (pathMatch) targetId = decodeURIComponent(pathMatch[1]);
                }
                if (targetId) {
                    var match = allPosts.find(function (p) { return p.id === targetId; });
                    if (match) checkGateAndOpen(match);
                }
            })
            .catch(function (err) {
                console.error('Failed to load posts:', err);
                if (typeof window.mm_showFetchError === 'function') {
                    window.mm_showFetchError();
                } else {
                    showState('Something went wrong loading the archive â€” please refresh and try again.');
                }
            });
    }

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       RENDER
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function showState(msg) {
        if (stateView) {
            stateView.style.display = 'flex';
            var subEl = stateView.querySelector('.state-sub');
            if (subEl) subEl.textContent = msg || '';
        }
        if (magContent) magContent.style.display = 'none';
    }

    function hideState() {
        if (stateView)  stateView.style.display = 'none';
        if (magContent) magContent.style.display = 'block';
    }

    function renderMag() {
        if (!allPosts.length) {
            showState('Check back soon â€” new content is on its way.');
            return;
        }
        hideState();

        var filtered;
        if (activeCategory === 'saved') {
            var savedIds = getSavedIds();
            filtered = allPosts.filter(function(p) { return savedIds.includes(p.id); });
        } else {
            filtered = activeCategory === 'all'
                ? allPosts
                : allPosts.filter(function (p) {
                    return p.category && p.category.toLowerCase() === activeCategory.toLowerCase();
                  });
        }

        /* update active page indicator */
        var indicatorSpan = document.getElementById('active-category-name');
        if (indicatorSpan) {
            if (activeCategory === 'all') {
                indicatorSpan.textContent = 'All posts';
            } else if (activeCategory === 'saved') {
                indicatorSpan.textContent = 'Saved posts';
            } else {
                indicatorSpan.textContent = activeCategory;
            }
        }

        if (!filtered.length) {
            if (heroSection) heroSection.style.display = 'none';
            if (postsGrid)   postsGrid.innerHTML = '<p style="grid-column:1/-1;padding:40px 0;color:var(--grey);text-align:center;">No posts in this category yet.</p>';
            return;
        }

        if (activeCategory === 'all') {
            if (heroSection) heroSection.style.display = 'grid';
            renderHero(filtered[0]);
            renderGrid(filtered.slice(1));
        } else {
            if (heroSection) heroSection.style.display = 'none';
            renderGrid(filtered);
        }
    }

    function renderHero(post) {
        if (!heroSection) return;
        var img = post.coverImage || 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1000';
        var savedClass = isSaved(post.id) ? 'saved' : '';
        heroSection.innerHTML =
            '<div class="hero-img-pane">' +
                '<img src="' + esc(img) + '" alt="' + esc(post.title) + '" loading="lazy">' +
            '</div>' +
            '<div class="hero-body">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">' +
                    '<span class="tag pink">' + esc(post.category) + '</span>' +
                    '<button class="save-btn ' + savedClass + '" data-id="' + esc(post.id) + '" aria-label="Save for later">' +
                        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                            '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>' +
                        '</svg>' +
                    '</button>' +
                '</div>' +
                '<h2 class="hero-headline">' + esc(post.title) + '</h2>' +
                '<p class="hero-hook">' + esc(post.subtitle || '') + '</p>' +
                '<button class="read-btn" data-id="' + esc(post.id) + '">Read Article</button>' +
            '</div>';

        var readBtn = heroSection.querySelector('.read-btn');
        if (readBtn) readBtn.addEventListener('click', function () {
            var id = readBtn.dataset.id;
            var p = allPosts.find(function(post) { return post.id === id; });
            if (p) checkGateAndOpen(p);
        });

        var saveBtnHero = heroSection.querySelector('.save-btn');
        if (saveBtnHero) {
            saveBtnHero.addEventListener('click', function(e) {
                e.stopPropagation();
                var id = saveBtnHero.dataset.id;
                toggleSave(id, saveBtnHero);
            });
        }
    }

    function renderGrid(posts) {
        if (!postsGrid) return;
        postsGrid.innerHTML = '';

        posts.forEach(function (post, i) {
            var img  = post.coverImage || 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=800';
            var date = fmtDate(post.date);
            var savedClass = isSaved(post.id) ? 'saved' : '';

            var card = document.createElement('div');
            card.className = 'article-card';
            card.style.animationDelay = (i * 0.06) + 's';
            card.innerHTML =
                '<div class="card-img-wrap">' +
                    '<img src="' + esc(img) + '" alt="' + esc(post.title) + '" loading="lazy">' +
                '</div>' +
                '<div class="card-meta">' +
                    '<span class="tag">' + esc(post.category) + '</span>' +
                    '<button class="save-btn ' + savedClass + '" data-id="' + esc(post.id) + '" aria-label="Save for later">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                            '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>' +
                        '</svg>' +
                    '</button>' +
                '</div>' +
                '<h3 class="card-h">' + esc(post.title) + '</h3>' +
                '<p class="card-sub">' + esc(post.subtitle || '') + '</p>';

            card.addEventListener('click', function (e) {
                if (e.target.closest('.save-btn')) return;
                checkGateAndOpen(post);
            });

            var saveBtn = card.querySelector('.save-btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var id = saveBtn.dataset.id;
                    toggleSave(id, saveBtn);
                });
            }

            postsGrid.appendChild(card);
        });
    }

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       GATE
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function checkGateAndOpen(post, scrollToTop) {
        if (gatePassed()) {
            launchReader(post, scrollToTop);
        } else {
            var returnUrl = window.location.origin + '/magazine/' + encodeURIComponent(post.id);
            window.location.href = 'gate-form.html?redirect=' + encodeURIComponent(returnUrl);
        }
    }

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       ARTICLE READER
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function launchReader(post, scrollToTop) {
        if (!modalBody) return;
        stopComments();

        var fullDate = fmtDate(post.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        var img      = post.coverImage || '';
        var bodyHtml = buildBodyHtml(post.body || '');
        var liked    = isLiked(post.id);
        var base     = baselineLikes(post.id);
        var heartFill   = liked ? '#F3C1C6' : 'none';
        var heartStroke = liked ? '#F3C1C6' : '#121212';
        var savedInitial = isSaved(post.id);

        modalBody.innerHTML =
            '<header class="reader-header">' +
                '<span class="tag pink">' + esc(post.category) + '</span>' +
                '<h1 class="reader-title">' + esc(post.title) + '</h1>' +
                '<span class="reader-date">' + fullDate + '</span>' +
            '</header>' +
            (img ? '<img class="reader-hero" src="' + esc(img) + '" alt="' + esc(post.title) + '" onerror="this.style.display=\'none\'">' : '') +
            '<div class="reader-body" id="reader-body-content">' + bodyHtml + '</div>' +
            '<div class="actions-bar">' +
                '<button class="action-btn" id="like-btn">' +
                    '<svg id="like-icon" width="16" height="16" viewBox="0 0 24 24" fill="' + heartFill + '" stroke="' + heartStroke + '" stroke-width="1.5">' +
                        '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>' +
                    '</svg>' +
                    '<span>Liked by <span id="like-count">' + base + '</span></span>' +
                '</button>' +
                '<button class="action-btn" id="share-btn">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                        '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
                        '<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>' +
                    '</svg>' +
                    '<span id="share-label">Share Entry</span>' +
                '</button>' +
                '<button class="action-btn" id="modal-save-btn" data-id="' + esc(post.id) + '">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="' + (savedInitial ? '#F3C1C6' : 'none') + '" stroke="currentColor" stroke-width="1.5">' +
                        '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>' +
                    '</svg>' +
                    '<span id="modal-save-label">' + (savedInitial ? 'Saved' : 'Save for later') + '</span>' +
                '</button>' +
                '<button class="action-btn" id="mm-comments-toggle" type="button" aria-expanded="false" aria-controls="mm-comments">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                        '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>' +
                    '</svg>' +
                    '<span>Comments <span id="mm-comments-count">0</span></span>' +
                '</button>' +
            '</div>' +
            buildCommentsShellHtml(post) +
            buildRecircHtml(post);

        /* update URL */
        try { window.history.pushState({}, '', '/magazine/' + encodeURIComponent(post.id)); } catch (e) {}

        openModal();

        /* fetch live likes then wire up buttons */
        var serverLikes = 0;
        var likeCount   = document.getElementById('like-count');
        var likeIcon    = document.getElementById('like-icon');
        var likeBtn     = document.getElementById('like-btn');
        var shareBtn    = document.getElementById('share-btn');
        var shareLabel  = document.getElementById('share-label');
        var modalSaveBtn = document.getElementById('modal-save-btn');
        var modalSaveLabel = document.getElementById('modal-save-label');
        var modalSaveIcon = modalSaveBtn ? modalSaveBtn.querySelector('svg') : null;

        fetch(LIKES_API + '?postId=' + encodeURIComponent(post.id) + '&_=' + Date.now())
            .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
            .then(function (d) {
                serverLikes = parseInt(d.likes, 10) || 0;
                if (likeCount) likeCount.textContent = base + serverLikes;
            })
            .catch(function () {});

        if (likeBtn) {
            likeBtn.addEventListener('click', function () {
                var currentlyLiked = isLiked(post.id);
                if (likeIcon) {
                    likeIcon.classList.remove('pop');
                    void likeIcon.offsetWidth;
                    likeIcon.classList.add('pop');
                }
                if (!currentlyLiked) {
                    setLiked(post.id, true);
                    serverLikes++;
                    if (likeIcon) { likeIcon.setAttribute('fill', '#F3C1C6'); likeIcon.setAttribute('stroke', '#F3C1C6'); }
                } else {
                    setLiked(post.id, false);
                    serverLikes = Math.max(0, serverLikes - 1);
                    if (likeIcon) { likeIcon.setAttribute('fill', 'none'); likeIcon.setAttribute('stroke', '#121212'); }
                }
                if (likeCount) likeCount.textContent = base + serverLikes;

                fetch(LIKES_API + '?postId=' + encodeURIComponent(post.id) + '&_=' + Date.now(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: currentlyLiked ? 'unlike' : 'like' })
                }).catch(function () {});
            });
        }

        if (shareBtn) {
            shareBtn.addEventListener('click', function () {
                var url = window.location.origin + '/magazine/' + encodeURIComponent(post.id);
                if (navigator.share) {
                    navigator.share({ title: post.title, url: url }).catch(function () {});
                } else {
                    navigator.clipboard.writeText(url).then(function () {
                        if (shareLabel) {
                            shareLabel.textContent = 'Copied!';
                            setTimeout(function () { shareLabel.textContent = 'Share Entry'; }, 2000);
                        }
                    }).catch(function () {});
                }
            });
        }

        if (modalSaveBtn) {
            function updateModalSaveButton() {
                var saved = isSaved(post.id);
                if (modalSaveIcon) {
                    modalSaveIcon.setAttribute('fill', saved ? '#F3C1C6' : 'none');
                }
                if (modalSaveLabel) {
                    modalSaveLabel.textContent = saved ? 'Saved' : 'Save for later';
                }
                var gridSaveBtn = document.querySelector('.save-btn[data-id="' + post.id + '"]');
                if (gridSaveBtn) {
                    if (saved) gridSaveBtn.classList.add('saved');
                    else gridSaveBtn.classList.remove('saved');
                }
            }
            updateModalSaveButton();

            modalSaveBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleSave(post.id, null);
                updateModalSaveButton();
            });
        }

        bindRecircClicks();
        initComments(post);

        /* Always reset the reader's own internal scroll position so the
           article content itself starts from its top â€” this matters
           whenever a new article is swapped into an already-open modal
           (e.g. "Read Next" / related-article clicks).
           On desktop, #article-modal (modalBg) is the scroll container.
           On mobile (<=768px), CSS switches .modal-panel itself to
           overflow-y:auto/max-height:92vh instead â€” so modalPanel becomes
           the scroll container there. Reset both so it's correct
           regardless of viewport or browser quirks. */
        if (modalBg) modalBg.scrollTop = 0;
        if (modalPanel) modalPanel.scrollTop = 0;

        /* When opened from "Keep Reading" / "You Might Also Like", the
           background listing page must NOT jump to the top â€” it should
           move to wherever the newly opened article's own card sits in
           the listing (never a global scroll-to-top). Opening normally
           from the listing (grid card, hero, search, deep link) leaves
           the background scroll position untouched entirely. */
        if (scrollToTop) {
            scrollListingToPost(post.id);
        }
    }

    /* Finds the listing card/hero for a given post id and scrolls the
       background page so that card is in view. Used only for articles
       opened via the recirc "Keep Reading" / "You Might Also Like"
       section â€” never for normal listing opens. */
    function scrollListingToPost(postId) {
        var btns = document.querySelectorAll('.save-btn[data-id]');
        var target = null;
        for (var i = 0; i < btns.length; i++) {
            if (btns[i].dataset.id === postId) { target = btns[i]; break; }
        }
        var el = target ? (target.closest('.article-card') || target.closest('.hero-body')) : null;
        if (el && el.scrollIntoView) {
            el.scrollIntoView({ block: 'center' });
        }
    }

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       RECIRCULATION (related articles, read next,
       topic links) â€” appended below the action bar
       in launchReader(). Pure read from allPosts,
       no network calls, no new data source needed.
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function buildRecircHtml(post) {
        var related = getRelatedPosts(post, 3);
        var nextPost = getNextPost(post);
        var tags = post.tags || [];

        var html = '<div class="recirc" id="reader-recirc">';

        /* Read Next */
        if (nextPost) {
            var nextImg = nextPost.coverImage || '';
            html += '<div class="recirc-nextup">' +
                '<span class="recirc-nextup-label">Keep reading</span>' +
                '<button class="recirc-next-btn" data-id="' + esc(nextPost.id) + '">' +
                    (nextImg ? '<img class="recirc-next-btn-img" src="' + esc(nextImg) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
                    '<span class="recirc-next-btn-text">' +
                        '<span class="recirc-next-btn-eyebrow">Read Next</span>' +
                        '<span class="recirc-next-btn-title">' + esc(nextPost.title) + '</span>' +
                    '</span>' +
                    '<svg class="recirc-next-btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>' +
                '</button>' +
            '</div>';
        }

        /* Topic links (franchise tags) */
        if (tags.length) {
            html += '<div class="recirc-topics">' +
                tags.map(function (t) {
                    return '<button class="recirc-topic-pill" data-tag="' + esc(t) + '">More ' + esc(t) + '</button>';
                }).join('') +
            '</div>';
        }

        /* Related articles */
        if (related.length) {
            html += '<div class="recirc-related">' +
                '<span class="recirc-related-label">You might also like</span>' +
                '<div class="recirc-related-grid">' +
                related.map(function (p) {
                    var img = p.coverImage || '';
                    return '<button class="recirc-related-card" data-id="' + esc(p.id) + '">' +
                        (img ? '<img src="' + esc(img) + '" alt="' + esc(p.title) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
                        '<span class="recirc-related-tag">' + esc(p.category) + '</span>' +
                        '<span class="recirc-related-title">' + esc(p.title) + '</span>' +
                    '</button>';
                }).join('') +
                '</div>' +
            '</div>';
        }

        html += '</div>';
        return html;
    }

    /* Related = same category, most recent first, excluding current post */
    function getRelatedPosts(post, count) {
        if (!allPosts.length) return [];
        var sameCategory = allPosts.filter(function (p) {
            return p.id !== post.id &&
                p.category && post.category &&
                p.category.toLowerCase() === post.category.toLowerCase();
        });
        return sameCategory.slice(0, count);
    }

    /* Next = next post after this one in the already-sorted allPosts list (wraps to start) */
    function getNextPost(post) {
        if (!allPosts.length) return null;
        var idx = allPosts.findIndex(function (p) { return p.id === post.id; });
        if (idx === -1) return null;
        var nextIdx = (idx + 1) % allPosts.length;
        return allPosts[nextIdx].id !== post.id ? allPosts[nextIdx] : null;
    }

    function bindRecircClicks() {
        var recirc = document.getElementById('reader-recirc');
        if (!recirc) return;

        recirc.addEventListener('click', function (e) {
            var nextBtn = e.target.closest('.recirc-next-btn');
            var relatedCard = e.target.closest('.recirc-related-card');
            var topicPill = e.target.closest('.recirc-topic-pill');

            if (nextBtn) {
                var p = allPosts.find(function (post) { return post.id === nextBtn.dataset.id; });
                if (p) checkGateAndOpen(p, true);
                return;
            }
            if (relatedCard) {
                var p2 = allPosts.find(function (post) { return post.id === relatedCard.dataset.id; });
                if (p2) checkGateAndOpen(p2, true);
                return;
            }
            if (topicPill) {
                openTopicResults(topicPill.dataset.tag);
                return;
            }
        });
    }

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       LIVE COMMENTS
       Persistent Cloudflare D1 comments with a
       one-time public display-name choice.
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function buildCommentsShellHtml(post) {
        return '<section class="mm-comments" id="mm-comments" data-article-id="' + esc(post.id) + '" hidden>' +
            '<div class="mm-comments-panel-heading">' +
                '<h2 class="mm-comments-title">Comments</h2>' +
                '<button class="mm-comments-panel-close" id="mm-comments-panel-close" type="button">Close</button>' +
            '</div>' +
            '<form class="mm-comment-form" id="mm-comment-form" novalidate>' +
                '<label class="mm-comment-label" for="mm-comment-body">Add a comment</label>' +
                '<textarea class="mm-comment-textarea" id="mm-comment-body" maxlength="' + COMMENTS_MAX_LENGTH + '" rows="3" placeholder="Write your comment..." aria-describedby="mm-comment-help"></textarea>' +
                '<div class="mm-comment-form-bottom">' +
                    '<span class="mm-comment-help" id="mm-comment-help"><span id="mm-comment-char-count">0</span>/' + COMMENTS_MAX_LENGTH + '</span>' +
                    '<button class="mm-comment-submit" id="mm-comment-submit" type="submit">Post comment</button>' +
                '</div>' +
                '<div class="mm-comment-turnstile" id="mm-comment-turnstile"></div>' +
                '<p class="mm-comment-message" id="mm-comment-message" role="status" aria-live="polite"></p>' +
            '</form>' +
            '<div class="mm-comments-list" id="mm-comments-list" aria-live="polite">' +
                '<p class="mm-comments-loading">Loading comments...</p>' +
            '</div>' +
        '</section>';
    }

    function initComments(post) {
        var section = document.getElementById('mm-comments');
        var toggle = document.getElementById('mm-comments-toggle');
        var panelClose = document.getElementById('mm-comments-panel-close');
        var form = document.getElementById('mm-comment-form');
        var textarea = document.getElementById('mm-comment-body');
        var sort = document.getElementById('mm-comments-sort');

        if (!section || !form || !textarea) return;

        activeCommentsArticleId = post.id;
        commentProfile = null;
        commentTurnstileToken = '';

        function setCommentsPanelOpen(shouldOpen) {
            section.hidden = !shouldOpen;
            if (toggle) {
                toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
                toggle.classList.toggle('active', shouldOpen);
            }
            if (shouldOpen && commentTurnstileSiteKey) {
                ensureCommentTurnstile();
            }
        }

        if (toggle) {
            toggle.addEventListener('click', function () {
                setCommentsPanelOpen(section.hidden);
            });
        }

        if (panelClose) {
            panelClose.addEventListener('click', function () {
                setCommentsPanelOpen(false);
                if (toggle) toggle.focus();
            });
        }

        textarea.addEventListener('input', updateCommentCharacterCount);
        textarea.addEventListener('focus', function () {
            ensureCommentProfile().catch(function (error) {
                if (error && error.message !== 'Name choice cancelled.') {
                    setCommentMessage(error.message, true);
                }
            });
        }, { once: true });

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            submitComment(post.id);
        });

        if (sort) {
            sort.addEventListener('change', function () {
                loadComments(post.id, true);
            });
        }

        section.addEventListener('click', function (event) {
            var reportButton = event.target.closest('.mm-comment-report');
            if (reportButton) {
                reportComment(post.id, reportButton);
            }
        });

        loadComments(post.id, true);
        commentsRefreshTimer = window.setInterval(function () {
            if (activeCommentsArticleId === post.id &&
                modalBg && modalBg.classList.contains('open') &&
                !document.hidden) {
                loadComments(post.id, false);
            }
        }, COMMENTS_REFRESH_MS);
    }

    function stopComments() {
        activeCommentsArticleId = '';
        commentProfile = null;
        commentTurnstileToken = '';
        commentTurnstileSiteKey = '';

        if (commentsRefreshTimer) {
            window.clearInterval(commentsRefreshTimer);
            commentsRefreshTimer = null;
        }

        if (commentTurnstileWidgetId !== null &&
            window.turnstile && typeof window.turnstile.remove === 'function') {
            try { window.turnstile.remove(commentTurnstileWidgetId); } catch (error) {}
        }
        commentTurnstileWidgetId = null;

        var chooser = document.getElementById('mm-comment-name-overlay');
        if (chooser && chooser.parentNode) chooser.parentNode.removeChild(chooser);
    }

    function getReaderIdentity() {
        var name = '';
        var email = '';
        try {
            name = String(localStorage.getItem('mm_user_name') || '').trim();
            email = String(localStorage.getItem('mm_user_email') || '').trim().toLowerCase();
        } catch (error) {}

        if (!email && gatePassed()) {
            var legacyCommentId =
                'v1-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
            try {
                legacyCommentId =
                    localStorage.getItem('mm_comment_legacy_id') || legacyCommentId;
                localStorage.setItem('mm_comment_legacy_id', legacyCommentId);
            } catch (legacyStorageError) {}
            email = 'legacy-' + legacyCommentId + '@comments.milkmondays.local';
        }

        if (!email) {
            throw new Error('Please unlock the article before joining the comments.');
        }

        return { gateName: name, email: email };
    }

    function ensureCommentProfile() {
        if (commentProfile) return Promise.resolve(commentProfile);

        var identity;
        try {
            identity = getReaderIdentity();
        } catch (error) {
            return Promise.reject(error);
        }

        return commentsRequest({
            action: 'get_profile',
            email: identity.email
        }).then(function (data) {
            if (data.profile) {
                commentProfile = data.profile;
                rememberCommentName(data.profile.displayName);
                return commentProfile;
            }

            return openCommentNameChooser(identity).then(function (displayName) {
                if (!displayName) throw new Error('Name choice cancelled.');

                return commentsRequest({
                    action: 'set_profile',
                    email: identity.email,
                    displayName: displayName
                }).then(function (saved) {
                    commentProfile = saved.profile;
                    rememberCommentName(saved.profile.displayName);
                    return commentProfile;
                });
            });
        });
    }

    function rememberCommentName(displayName) {
        try {
            localStorage.setItem('mm_comment_name_locked', displayName);
        } catch (error) {}
    }

    function openCommentNameChooser(identity) {
        return new Promise(function (resolve) {
            var oldChooser = document.getElementById('mm-comment-name-overlay');
            if (oldChooser && oldChooser.parentNode) oldChooser.parentNode.removeChild(oldChooser);

            var hasGateName = Boolean(identity.gateName);
            var overlay = document.createElement('div');
            overlay.className = 'mm-comment-name-overlay';
            overlay.id = 'mm-comment-name-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'mm-comment-name-title');

            overlay.innerHTML =
                '<div class="mm-comment-name-card">' +
                    '<button class="mm-comment-name-close" type="button" aria-label="Close">&times;</button>' +
                    '<h2 class="mm-comment-name-title" id="mm-comment-name-title">Choose your comment name</h2>' +
                    '<p class="mm-comment-name-copy">This name will appear with every comment you post. Choose carefully because it cannot be changed later.</p>' +
                    '<form class="mm-comment-name-form" id="mm-comment-name-form">' +
                        '<label class="mm-comment-name-option' + (hasGateName ? ' selected' : ' disabled') + '">' +
                            '<input type="radio" name="comment-display-name" value="gate"' + (hasGateName ? ' checked' : ' disabled') + '>' +
                            '<span class="mm-comment-option-copy">' +
                                '<span class="mm-comment-option-label">Use my name</span>' +
                                '<span class="mm-comment-option-value">' + (hasGateName ? esc(identity.gateName) : 'No saved gate name found') + '</span>' +
                            '</span>' +
                        '</label>' +
                        '<label class="mm-comment-name-option' + (hasGateName ? '' : ' selected') + '">' +
                            '<input type="radio" name="comment-display-name" value="custom"' + (hasGateName ? '' : ' checked') + '>' +
                            '<span class="mm-comment-option-copy">' +
                                '<span class="mm-comment-option-label">Choose a different name</span>' +
                                '<input class="mm-comment-custom-name" id="mm-comment-custom-name" type="text" minlength="2" maxlength="30" autocomplete="nickname" placeholder="Enter a comment name">' +
                            '</span>' +
                        '</label>' +
                        '<p class="mm-comment-name-error" id="mm-comment-name-error" role="alert"></p>' +
                        '<button class="mm-comment-name-confirm" type="submit">Save name</button>' +
                    '</form>' +
                '</div>';

            document.body.appendChild(overlay);

            var form = overlay.querySelector('#mm-comment-name-form');
            var customInput = overlay.querySelector('#mm-comment-custom-name');
            var close = overlay.querySelector('.mm-comment-name-close');
            var radios = overlay.querySelectorAll('input[name="comment-display-name"]');
            var settled = false;

            function settle(value) {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', onKeydown);
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                resolve(value);
            }

            function onKeydown(event) {
                if (event.key === 'Escape') settle(null);
            }

            function updateOptions() {
                var options = overlay.querySelectorAll('.mm-comment-name-option');
                for (var i = 0; i < options.length; i++) {
                    var radio = options[i].querySelector('input[type="radio"]');
                    options[i].classList.toggle('selected', Boolean(radio && radio.checked));
                }

                var selected = overlay.querySelector('input[name="comment-display-name"]:checked');
                if (selected && selected.value === 'custom') {
                    customInput.removeAttribute('disabled');
                    customInput.focus();
                }
            }

            for (var i = 0; i < radios.length; i++) {
                radios[i].addEventListener('change', updateOptions);
            }

            close.addEventListener('click', function () { settle(null); });
            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) settle(null);
            });
            document.addEventListener('keydown', onKeydown);

            form.addEventListener('submit', function (event) {
                event.preventDefault();
                var selected = overlay.querySelector('input[name="comment-display-name"]:checked');
                var error = overlay.querySelector('#mm-comment-name-error');
                var chosen = selected && selected.value === 'custom'
                    ? customInput.value.replace(/\s+/g, ' ').trim()
                    : identity.gateName;

                if (chosen.length < 2 || chosen.length > 30) {
                    error.textContent = 'Choose a name between 2 and 30 characters.';
                    if (selected && selected.value === 'custom') customInput.focus();
                    return;
                }

                error.textContent = '';
                settle(chosen);
            });

            window.setTimeout(function () {
                var firstChoice = overlay.querySelector('input[name="comment-display-name"]:checked');
                if (firstChoice) firstChoice.focus();
                updateOptions();
            }, 50);
        });
    }

    function loadComments(articleId, showLoading) {
        if (activeCommentsArticleId !== articleId) return;

        var list = document.getElementById('mm-comments-list');
        var sort = document.getElementById('mm-comments-sort');
        var order = sort ? sort.value : 'newest';

        if (showLoading && list) {
            list.innerHTML = '<p class="mm-comments-loading">Opening the conversation...</p>';
        }

        fetch(COMMENTS_API + '?articleId=' + encodeURIComponent(articleId) +
            '&order=' + encodeURIComponent(order) + '&_=' + Date.now(), {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        })
            .then(readCommentsResponse)
            .then(function (data) {
                if (activeCommentsArticleId !== articleId) return;
                commentTurnstileSiteKey = data.turnstileSiteKey || '';
                renderComments(data.comments || []);
                var commentsPanel = document.getElementById('mm-comments');
                if (commentTurnstileSiteKey && commentsPanel && !commentsPanel.hidden) {
                    ensureCommentTurnstile();
                }
            })
            .catch(function (error) {
                if (!showLoading || !list || activeCommentsArticleId !== articleId) return;
                list.innerHTML = '';
                var message = document.createElement('p');
                message.className = 'mm-comments-error';
                message.textContent = error.message || 'The comments are taking a tiny break.';
                list.appendChild(message);
            });
    }

    function renderComments(comments) {
        var list = document.getElementById('mm-comments-list');
        var count = document.getElementById('mm-comments-count');
        if (!list) return;

        if (count) {
            count.textContent = comments.length;
        }

        list.innerHTML = '';
        if (!comments.length) {
            var empty = document.createElement('p');
            empty.className = 'mm-comments-empty-line';
            empty.textContent = 'No comments yet.';
            list.appendChild(empty);
            return;
        }

        var fragment = document.createDocumentFragment();
        comments.forEach(function (comment) {
            var item = document.createElement('article');
            item.className = 'mm-comment';
            item.dataset.commentId = comment.id;

            var header = document.createElement('header');
            header.className = 'mm-comment-header';

            var avatar = document.createElement('span');
            avatar.className = 'mm-comment-avatar';
            avatar.setAttribute('aria-hidden', 'true');
            avatar.textContent = String(comment.displayName || '?').charAt(0).toUpperCase();

            var meta = document.createElement('span');
            meta.className = 'mm-comment-meta';

            var name = document.createElement('strong');
            name.className = 'mm-comment-author';
            name.textContent = comment.displayName;

            var time = document.createElement('time');
            time.className = 'mm-comment-time';
            time.dateTime = new Date(Number(comment.createdAt)).toISOString();
            time.textContent = formatCommentTime(comment.createdAt);

            var report = document.createElement('button');
            report.className = 'mm-comment-report';
            report.type = 'button';
            report.dataset.commentId = comment.id;
            report.textContent = 'Report';
            report.setAttribute('aria-label', 'Report comment by ' + comment.displayName);

            var body = document.createElement('p');
            body.className = 'mm-comment-body';
            body.textContent = comment.body;

            meta.appendChild(name);
            meta.appendChild(time);
            header.appendChild(avatar);
            header.appendChild(meta);
            header.appendChild(report);
            item.appendChild(header);
            item.appendChild(body);
            fragment.appendChild(item);
        });

        list.appendChild(fragment);
    }

    function submitComment(articleId) {
        var textarea = document.getElementById('mm-comment-body');
        var submit = document.getElementById('mm-comment-submit');
        var text = textarea ? textarea.value.trim() : '';

        if (!text) {
            setCommentMessage('Write something before posting.', true);
            if (textarea) textarea.focus();
            return;
        }

        if (text.length > COMMENTS_MAX_LENGTH) {
            setCommentMessage('Keep your comment under ' + COMMENTS_MAX_LENGTH + ' characters.', true);
            return;
        }

        if (submit) {
            submit.disabled = true;
            submit.textContent = 'Posting...';
        }
        setCommentMessage('', false);

        ensureCommentProfile()
            .then(function () {
                var identity = getReaderIdentity();
                return commentsRequest({
                    action: 'post_comment',
                    articleId: articleId,
                    email: identity.email,
                    body: text,
                    turnstileToken: commentTurnstileToken
                });
            })
            .then(function () {
                if (textarea) textarea.value = '';
                updateCommentCharacterCount();
                setCommentMessage('Posted. Your thought is officially in the archive.', false);
                resetCommentTurnstile();
                return loadComments(articleId, false);
            })
            .catch(function (error) {
                if (error && error.message !== 'Name choice cancelled.') {
                    setCommentMessage(error.message || 'Your comment could not be posted.', true);
                }
            })
            .finally(function () {
                if (submit) {
                    submit.disabled = false;
                    submit.textContent = 'Post comment';
                }
            });
    }

    function reportComment(articleId, button) {
        if (button.disabled || button.dataset.reported === 'true') return;

        var identity;
        try {
            identity = getReaderIdentity();
        } catch (error) {
            setCommentMessage(error.message, true);
            return;
        }

        button.disabled = true;
        commentsRequest({
            action: 'report_comment',
            articleId: articleId,
            commentId: button.dataset.commentId,
            email: identity.email,
            reason: 'reader_report'
        })
            .then(function () {
                button.dataset.reported = 'true';
                button.textContent = 'Reported';
            })
            .catch(function (error) {
                button.disabled = false;
                setCommentMessage(error.message || 'That report could not be sent.', true);
            });
    }

    function commentsRequest(payload) {
        return fetch(COMMENTS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        }).then(readCommentsResponse);
    }

    function readCommentsResponse(response) {
        return response.json().catch(function () {
            return { ok: false, error: 'The comments returned an unreadable response.' };
        }).then(function (data) {
            if (!response.ok || !data.ok) {
                var error = new Error(data.error || 'The comments are taking a tiny break.');
                error.status = response.status;
                throw error;
            }
            return data;
        });
    }

    function updateCommentCharacterCount() {
        var textarea = document.getElementById('mm-comment-body');
        var count = document.getElementById('mm-comment-char-count');
        if (count) count.textContent = textarea ? textarea.value.length : 0;
    }

    function setCommentMessage(message, isError) {
        var element = document.getElementById('mm-comment-message');
        if (!element) return;
        element.textContent = message || '';
        element.classList.toggle('error', Boolean(isError));
        element.classList.toggle('success', Boolean(message && !isError));
    }

    function formatCommentTime(timestamp) {
        var value = Number(timestamp);
        var diffSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000));

        if (diffSeconds < 10) return 'just now';
        if (diffSeconds < 60) return diffSeconds + 's ago';

        var minutes = Math.floor(diffSeconds / 60);
        if (minutes < 60) return minutes + 'm ago';

        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + 'h ago';

        var days = Math.floor(hours / 24);
        if (days < 7) return days + 'd ago';

        return fmtDate(new Date(value).toISOString(), {
            month: 'short',
            day: 'numeric',
            year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
        });
    }

    function ensureCommentTurnstile() {
        var container = document.getElementById('mm-comment-turnstile');
        if (!container || !commentTurnstileSiteKey || commentTurnstileWidgetId !== null) return;

        loadTurnstileScript().then(function () {
            if (!window.turnstile || !document.getElementById('mm-comment-turnstile')) return;
            commentTurnstileWidgetId = window.turnstile.render('#mm-comment-turnstile', {
                sitekey: commentTurnstileSiteKey,
                theme: 'light',
                size: 'flexible',
                appearance: 'interaction-only',
                callback: function (token) {
                    commentTurnstileToken = token;
                },
                'expired-callback': function () {
                    commentTurnstileToken = '';
                },
                'error-callback': function () {
                    commentTurnstileToken = '';
                }
            });
        }).catch(function () {
            setCommentMessage('The quick human check could not load. Please refresh and try again.', true);
        });
    }

    function loadTurnstileScript() {
        if (window.turnstile) return Promise.resolve();

        var existing = document.getElementById('mm-turnstile-script');
        if (existing) {
            return new Promise(function (resolve, reject) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
            });
        }

        return new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.id = 'mm-turnstile-script';
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.defer = true;
            script.addEventListener('load', resolve, { once: true });
            script.addEventListener('error', reject, { once: true });
            document.head.appendChild(script);
        });
    }

    function resetCommentTurnstile() {
        commentTurnstileToken = '';
        if (commentTurnstileWidgetId !== null &&
            window.turnstile && typeof window.turnstile.reset === 'function') {
            try { window.turnstile.reset(commentTurnstileWidgetId); } catch (error) {}
        }
    }

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       TOPIC RESULTS (shown inside the reader when
       a "More <Franchise>" pill is clicked)
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function openTopicResults(tag) {
        if (!modalBody) return;
        stopComments();
        var matches = allPosts.filter(function (p) {
            return (p.tags || []).indexOf(tag) !== -1;
        });

        var html = '<header class="reader-header">' +
                '<span class="tag pink">Topic</span>' +
                '<h1 class="reader-title">More ' + esc(tag) + '</h1>' +
            '</header>' +
            '<div class="recirc-related-grid recirc-topic-grid">' +
            matches.map(function (p) {
                var img = p.coverImage || '';
                return '<button class="recirc-related-card" data-id="' + esc(p.id) + '">' +
                    (img ? '<img src="' + esc(img) + '" alt="' + esc(p.title) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
                    '<span class="recirc-related-tag">' + esc(p.category) + '</span>' +
                    '<span class="recirc-related-title">' + esc(p.title) + '</span>' +
                '</button>';
            }).join('') +
            '</div>';

        modalBody.innerHTML = html;
        if (modalBg) modalBg.scrollTop = 0;
        if (modalPanel) modalPanel.scrollTop = 0;
        window.scrollTo(0, 0);

        modalBody.addEventListener('click', function handler(e) {
            var card = e.target.closest('.recirc-related-card');
            if (card) {
                var p = allPosts.find(function (post) { return post.id === card.dataset.id; });
                if (p) {
                    modalBody.removeEventListener('click', handler);
                    checkGateAndOpen(p);
                }
            }
        });
    }

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       BODY PARSER
       Supports: > blockquote, HTML tags passthrough,
       plain paragraphs
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function buildBodyHtml(raw) {
        if (!raw) return '<p>Content not available.</p>';

        /* Inline image marker format (unlimited, AI-placed):
             [IMG|https://image-url.jpg|left|medium]
           Pipe-delimited to avoid clashing with colon in https://.
           Side : left | right   (AI decides per image)
           Size : small (28%) | medium (42%) | large (56%)  (AI decides per image)
           Old posts with none of these markers are completely unaffected. */
        var hasFloat = false;
        var IMG_RE = /^\[IMG\|([^|\[\]]+)\|(left|right)\|(small|medium|large)\]$/i;

        var parts = raw.split('\n').map(function (line) {
            line = line.trim();
            if (!line) return '';

            var m = line.match(IMG_RE);
            if (m) {
                var src = m[1].trim();
                if (!src) return '';
                hasFloat = true;
                return '<figure class="body-float-img body-float-' + m[2].toLowerCase() +
                       ' body-float-' + m[3].toLowerCase() + '">' +
                           '<img src="' + esc(src) + '" alt="" loading="lazy"' +
                           ' onerror="this.parentNode.style.display=\'none\'">' +
                       '<\/figure>';
            }

            if (line.charAt(0) === '>') {
                return '<blockquote>' + sanitiseInline(line.slice(1).trim()) + '</blockquote>';
            }
            return '<p>' + sanitiseInline(line) + '</p>';
        });

        var html = parts.join('');
        return hasFloat ? html + '<div class="body-float-clear"><\/div>' : html;
    }

    function sanitiseInline(s) {
        if (!s) return '';
        var ALLOWED_RE = /<(\/?(strong|b|em|i|br)\s*\/?)>|<a\s[^>]*>|<\/a>/gi;
        var parts = [];
        var last = 0;
        var m;
        var result = s
            .replace(/&(?![a-zA-Z]+;|#\d+;)/g, '&amp;');
        return result;
    }

})();