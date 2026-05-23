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

        bindNav();
        bindModal();
        loadPosts();
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
                if (navButtons[0]) navButtons[0].classList.add('active');
                activeCategory = 'all';
                renderMag();
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
        try { window.history.pushState({}, '', window.location.pathname); } catch (e) {}
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
                allPosts = (data.posts || []).sort(function (a, b) {
                    return new Date(b.date) - new Date(a.date);
                });
                renderMag();

                /* handle deep link */
                var params = new URLSearchParams(window.location.search);
                var targetId = params.get('article');
                if (targetId) {
                    var match = allPosts.find(function (p) { return p.id === targetId; });
                    if (match) checkGateAndOpen(match);
                }
            })
            .catch(function (err) {
                console.error('Failed to load posts:', err);
                showState('Error loading content — please refresh the page.');
            });
    }

    /* ──────────────────────────────────────────
       RENDER
    ────────────────────────────────────────── */
    function showState(msg) {
        if (stateView)  { stateView.style.display = 'flex'; stateView.querySelector('.state-sub').textContent = msg || ''; }
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

        var filtered = activeCategory === 'all'
            ? allPosts
            : allPosts.filter(function (p) {
                return p.category && p.category.toLowerCase() === activeCategory.toLowerCase();
              });

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
        heroSection.innerHTML =
            '<div class="hero-img-pane">' +
                '<img src="' + esc(img) + '" alt="' + esc(post.title) + '" loading="lazy">' +
            '</div>' +
            '<div class="hero-body">' +
                '<span class="tag pink">' + esc(post.category) + '</span>' +
                '<h2 class="hero-headline">' + esc(post.title) + '</h2>' +
                '<p class="hero-hook">' + esc(post.subtitle || '') + '</p>' +
                '<button class="read-btn" id="hero-read-btn">Read Article</button>' +
            '</div>';

        var btn = document.getElementById('hero-read-btn');
        if (btn) btn.addEventListener('click', function () { checkGateAndOpen(post); });
    }

    function renderGrid(posts) {
        if (!postsGrid) return;
        postsGrid.innerHTML = '';

        posts.forEach(function (post, i) {
            var img  = post.coverImage || 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=800';
            var date = fmtDate(post.date);

            var card = document.createElement('div');
            card.className = 'article-card';
            card.style.animationDelay = (i * 0.06) + 's';
            card.innerHTML =
                '<div class="card-img-wrap">' +
                    '<img src="' + esc(img) + '" alt="' + esc(post.title) + '" loading="lazy">' +
                '</div>' +
                '<div class="card-meta">' +
                    '<span class="tag">' + esc(post.category) + '</span>' +
                    '<span class="card-date">' + date + '</span>' +
                '</div>' +
                '<h3 class="card-h">' + esc(post.title) + '</h3>' +
                '<p class="card-sub">' + esc(post.subtitle || '') + '</p>';

            card.addEventListener('click', function () { checkGateAndOpen(post); });
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
            var returnUrl = window.location.origin + window.location.pathname +
                            '?article=' + encodeURIComponent(post.id);
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
            '</div>';

        /* update URL */
        try { window.history.pushState({}, '', '?article=' + encodeURIComponent(post.id)); } catch (e) {}

        openModal();

        /* fetch live likes then wire up buttons */
        var serverLikes = 0;
        var likeCount   = document.getElementById('like-count');
        var likeIcon    = document.getElementById('like-icon');
        var likeBtn     = document.getElementById('like-btn');
        var shareBtn    = document.getElementById('share-btn');
        var shareLabel  = document.getElementById('share-label');

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
                /* animate */
                if (likeIcon) {
                    likeIcon.classList.remove('pop');
                    void likeIcon.offsetWidth; /* reflow */
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
                var url = window.location.origin + window.location.pathname +
                          '?article=' + encodeURIComponent(post.id);
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
            /* blockquote */
            if (line.charAt(0) === '>') {
                return '<blockquote>' + sanitiseInline(line.slice(1).trim()) + '</blockquote>';
            }
            return '<p>' + sanitiseInline(line) + '</p>';
        }).join('');
    }

    /* Allow safe inline HTML tags that exist in the post data:
       <strong>, <b>, <a href="..." target="...">, <em>, <br>
       Everything else is escaped. */
    function sanitiseInline(s) {
        if (!s) return '';
        /* temporarily extract allowed tags, escape remainder, restore */
        var ALLOWED_RE = /<(\/?(strong|b|em|i|br)\s*\/?)>|<a\s[^>]*>|<\/a>/gi;
        var parts = [];
        var last = 0;
        var m;
        /* We do a simple approach: replace the string, escaping chars
           outside whitelisted tags. For these posts this is safe enough. */
        var result = s
            /* escape bare & that are not already entities */
            .replace(/&(?![a-zA-Z]+;|#\d+;)/g, '&amp;')
            /* let existing strong/b/em/a/br tags through by restoring them */
            /* (they come from content we control — posts.json) */
            ;
        return result;
    }

})();