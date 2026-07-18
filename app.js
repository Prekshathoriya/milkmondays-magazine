/**
 * Milk Mondays — app.js
 * Handles: post loading, category filtering, gate check, article modal,
 *          likes (server + local), share, deep-link via ?article=
 */

(function () {
    'use strict';

    /* ── CONFIG ── */
    var LIKES_API = 'https://muddy-shadow-6c19.milkmondaysbiz.workers.dev';
    var POSTS_URL = 'https://milkmondays-magazine.pages.dev/content/posts.json';

    /* ── STATE ── */
    var allPosts      = [];
    var activeCategory = 'all';

    /* ── DOM REFS (set after DOMContentLoaded) ── */
    var stateView, magContent, heroSection, postsGrid;
    var modalBg, modalPanel, modalBody, closeBtn;
    var navButtons, logoBtn;
    var shareStoryBtn;

    /* ──────────────────────────────────────────
       INIT
    ────────────────────────────────────────── */
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

        /* ── BACK TO TOP BUTTON ── */
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

    /* ──────────────────────────────────────────
       HELPERS
    ────────────────────────────────────────── */
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

    /* ── SAVE FOR LATER HELPERS ── */
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

    /* ──────────────────────────────────────────
       STORY TIME SUBMISSION CTA
    ────────────────────────────────────────── */
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

    /* ──────────────────────────────────────────
       NAV BINDING
    ────────────────────────────────────────── */
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

    /* ──────────────────────────────────────────
       SEARCH
       Self-contained: reads from the existing
       #site-search input/results markup if present
       in the page. If that markup isn't there yet,
       this quietly does nothing — safe no-op.
    ────────────────────────────────────────── */
    function bindSearch() {
        var input   = document.getElementById('site-search-input');
        var results = document.getElementById('site-search-results');
        if (!input || !results) return; /* markup not on this page — no-op */

        var debounceTimer;

        input.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            var q = input.value.trim();
            if (!q) {
                results.innerHTML = '';
                results.classList.remove('open');
                return;
            }
            debounceTimer = setTimeout(function () { runSearch(q); }, 150);
        });

        document.addEventListener('click', function (e) {
            if (!e.target.closest('.site-search-wrap')) {
                results.classList.remove('open');
            }
        });

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
                results.classList.add('open');
                return;
            }

            results.innerHTML = matches.map(function (p) {
                return '<button class="site-search-result" data-id="' + esc(p.id) + '">' +
                    '<span class="site-search-result-cat">' + esc(p.category) + '</span>' +
                    '<span class="site-search-result-title">' + esc(p.title) + '</span>' +
                '</button>';
            }).join('');
            results.classList.add('open');

            results.querySelectorAll('.site-search-result').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var p = allPosts.find(function (post) { return post.id === btn.dataset.id; });
                    if (p) {
                        checkGateAndOpen(p);
                        input.value = '';
                        results.innerHTML = '';
                        results.classList.remove('open');
                    }
                });
            });
        }
    }

    /* ──────────────────────────────────────────
       MODAL BINDING
    ────────────────────────────────────────── */
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
        modalBg.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        if (!modalBg) return;
        modalBg.classList.remove('open');
        document.body.style.overflow = '';
        /* restore URL */
        try { window.history.pushState({}, '', '/magazine'); } catch (e) {}
    }

    /* ──────────────────────────────────────────
       LOAD POSTS
    ────────────────────────────────────────── */
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
                    showState('Something went wrong loading the archive — please refresh and try again.');
                }
            });
    }

    /* ──────────────────────────────────────────
       RENDER
    ────────────────────────────────────────── */
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
            showState('Check back soon — new content is on its way.');
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

    /* ──────────────────────────────────────────
       GATE
    ────────────────────────────────────────── */
    function checkGateAndOpen(post) {
        if (gatePassed()) {
            launchReader(post);
        } else {
            var returnUrl = window.location.origin + '/magazine/' + encodeURIComponent(post.id);
            window.location.href = 'gate-form.html?redirect=' + encodeURIComponent(returnUrl);
        }
    }

    /* ──────────────────────────────────────────
       ARTICLE READER
    ────────────────────────────────────────── */
    function launchReader(post) {
        if (!modalBody) return;

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
            '</div>' +
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

        /* Scroll the reader back to the top on every open.
           #article-modal (modalBg) is the actual scroll container
           (overflow-y: auto in CSS) — modalPanel itself doesn't scroll,
           so resetting modalPanel.scrollTop was a no-op. */
        if (modalBg) modalBg.scrollTop = 0;
    }

    /* ──────────────────────────────────────────
       RECIRCULATION (related articles, read next,
       topic links) — appended below the action bar
       in launchReader(). Pure read from allPosts,
       no network calls, no new data source needed.
    ────────────────────────────────────────── */
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
                if (p) checkGateAndOpen(p);
                return;
            }
            if (relatedCard) {
                var p2 = allPosts.find(function (post) { return post.id === relatedCard.dataset.id; });
                if (p2) checkGateAndOpen(p2);
                return;
            }
            if (topicPill) {
                openTopicResults(topicPill.dataset.tag);
                return;
            }
        });
    }

    /* ──────────────────────────────────────────
       TOPIC RESULTS (shown inside the reader when
       a "More <Franchise>" pill is clicked)
    ────────────────────────────────────────── */
    function openTopicResults(tag) {
        if (!modalBody) return;
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

    /* ──────────────────────────────────────────
       BODY PARSER
       Supports: > blockquote, HTML tags passthrough,
       plain paragraphs
    ────────────────────────────────────────── */
    function buildBodyHtml(raw) {
        if (!raw) return '<p>Content not available.</p>';

        return raw.split('\n').map(function (line) {
            line = line.trim();
            if (!line) return '';
            if (line.charAt(0) === '>') {
                return '<blockquote>' + sanitiseInline(line.slice(1).trim()) + '</blockquote>';
            }
            return '<p>' + sanitiseInline(line) + '</p>';
        }).join('');
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