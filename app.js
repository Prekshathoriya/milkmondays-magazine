/**
 * Milk Mondays — Simplified & Debuggable
 */

console.log('app.js loaded');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired');

    let allArticles = [];
    let currentCategory = 'all';
    const LIKES_API_BASE = 'https://muddy-shadow-6c19.milkmondaysbiz.workers.dev';

    // Get elements with safety checks
    const emptyStateEl = document.getElementById('empty-state');
    const magazineContentEl = document.getElementById('magazine-content');
    const heroSectionEl = document.getElementById('hero-feature');
    const postsGridEl = document.getElementById('posts-grid');
    const articleModalEl = document.getElementById('article-modal');
    const modalBodyEl = document.getElementById('modal-article-body');
    const closeModalBtn = document.querySelector('.close-modal-btn');
    const categoryNavButtons = document.querySelectorAll('.nav-btn');
    const homeLogoBtn = document.getElementById('home-logo-btn');

    console.log('Elements found:', {
        emptyStateEl: !!emptyStateEl,
        magazineContentEl: !!magazineContentEl,
        heroSectionEl: !!heroSectionEl,
        postsGridEl: !!postsGridEl,
        articleModalEl: !!articleModalEl,
        modalBodyEl: !!modalBodyEl,
        categoryNavButtons: categoryNavButtons.length,
        homeLogoBtn: !!homeLogoBtn
    });

    // Inject animation styles
    if (!document.getElementById('mm-like-animation-styles')) {
        const style = document.createElement('style');
        style.id = 'mm-like-animation-styles';
        style.innerText = `@keyframes heartPop{0%{transform:scale(1)}14%{transform:scale(0.7)}28%{transform:scale(1.2)}42%{transform:scale(1.1)}70%{transform:scale(1)}}.animate-pop{animation:heartPop 0.45s cubic-bezier(0.175,0.885,0.32,1.275)}`;
        document.head.appendChild(style);
        console.log('Animation styles injected');
    }

    function getPostBaselineLikes(id) {
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
        return Math.abs(hash % 65) + 32;
    }

    async function initMagazine() {
        console.log('initMagazine started');
        try {
            console.log('Fetching /content/posts.json');
            const res = await fetch('/content/posts.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            allArticles = data.posts || [];
            console.log(`Loaded ${allArticles.length} articles`);
            allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
            renderMagazineView();

            const urlParams = new URLSearchParams(window.location.search);
            const targetId = urlParams.get('article');
            if (targetId) {
                console.log('Deep link article:', targetId);
                const article = allArticles.find(a => a.id === targetId);
                if (article) {
                    checkGateAndOpenArticle(article);
                } else {
                    console.warn('Article not found:', targetId);
                }
            }
        } catch (err) {
            console.error('initMagazine error:', err);
            if (emptyStateEl) {
                emptyStateEl.style.display = 'flex';
                const errorDiv = document.createElement('div');
                errorDiv.className = 'empty-subtitle';
                errorDiv.style.color = '#c0392b';
                errorDiv.innerText = 'Error loading content: ' + err.message;
                emptyStateEl.querySelector('.empty-state-content')?.appendChild(errorDiv);
            }
        }
    }

    function checkGateAndOpenArticle(article) {
        console.log('checkGateAndOpenArticle for:', article.id);
        const gatePassed = localStorage.getItem('mm_gate_passed') === 'true';
        if (gatePassed) {
            console.log('Gate passed, opening article');
            launchArticleReader(article);
        } else {
            console.log('Gate not passed, redirecting to gate-form');
            const returnUrl = `${window.location.origin}${window.location.pathname}?article=${encodeURIComponent(article.id)}`;
            window.location.href = `gate-form.html?redirect=${encodeURIComponent(returnUrl)}`;
        }
    }

    function renderMagazineView() {
        console.log('renderMagazineView called, articles count:', allArticles.length);
        if (!allArticles.length) {
            if (emptyStateEl) emptyStateEl.style.display = 'flex';
            if (magazineContentEl) magazineContentEl.className = 'hidden-content';
            return;
        }
        if (emptyStateEl) emptyStateEl.style.display = 'none';
        if (magazineContentEl) magazineContentEl.className = 'visible-content';

        const filtered = currentCategory === 'all' ? allArticles : allArticles.filter(a => a.category.toLowerCase() === currentCategory.toLowerCase());
        console.log('Filtered articles:', filtered.length);
        if (!filtered.length) {
            if (postsGridEl) postsGridEl.innerHTML = `<p class="empty-subtitle" style="grid-column:1/-1;padding:40px 0;">No posts in this sector.</p>`;
            if (heroSectionEl) heroSectionEl.style.display = 'none';
            return;
        }
        if (currentCategory === 'all') {
            if (heroSectionEl) heroSectionEl.style.display = 'grid';
            renderHeroFeature(filtered[0]);
            renderPostsGrid(filtered.slice(1));
        } else {
            if (heroSectionEl) heroSectionEl.style.display = 'none';
            renderPostsGrid(filtered);
        }
    }

    function renderHeroFeature(article) {
        if (!heroSectionEl) return;
        heroSectionEl.innerHTML = `
            <div class="hero-image-pane"><img src="${article.coverImage || 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1000'}" alt="${escapeHtml(article.title)}"></div>
            <div class="hero-content-pane">
                <span class="tag-label pink-tag">${escapeHtml(article.category)}</span>
                <h2 class="hero-headline">${escapeHtml(article.title)}</h2>
                <p class="hero-hook">${escapeHtml(article.subtitle || '')}</p>
                <button class="editorial-btn read-more-trigger">Read Article</button>
            </div>
        `;
        const btn = heroSectionEl.querySelector('.read-more-trigger');
        if (btn) btn.addEventListener('click', () => checkGateAndOpenArticle(article));
    }

    function renderPostsGrid(articles) {
        if (!postsGridEl) return;
        postsGridEl.innerHTML = '';
        articles.forEach((a, i) => {
            const card = document.createElement('div');
            card.className = 'article-card';
            card.style.animationDelay = `${i * 0.05}s`;
            const d = new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            card.innerHTML = `
                <div class="card-image-box"><img src="${a.coverImage || 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1000'}" alt="${escapeHtml(a.title)}"></div>
                <div class="card-meta"><span class="tag-label">${escapeHtml(a.category)}</span><span class="card-date">${d}</span></div>
                <h3 class="card-title">${escapeHtml(a.title)}</h3>
                <p class="card-description">${escapeHtml(a.subtitle || '')}</p>
            `;
            card.addEventListener('click', () => checkGateAndOpenArticle(a));
            postsGridEl.appendChild(card);
        });
        console.log(`Rendered ${articles.length} cards`);
    }

    async function launchArticleReader(article) {
        console.log('launchArticleReader for:', article.id);
        const formattedDate = new Date(article.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        let bodyHtml = '';
        if (article.body) {
            bodyHtml = article.body.split('\n').map(p => {
                p = p.trim();
                if (!p) return '';
                if (p.startsWith('>')) return `<blockquote>${escapeHtml(p.slice(1).trim())}</blockquote>`;
                return `<p>${escapeHtml(p)}</p>`;
            }).join('');
        } else bodyHtml = '<p>Content not available.</p>';

        const localLikeKey = `mm_liked_${article.id}`;
        const isLiked = localStorage.getItem(localLikeKey) === 'true';
        const baseline = getPostBaselineLikes(article.id);
        if (!modalBodyEl) {
            console.error('modalBodyEl not found');
            return;
        }
        modalBodyEl.innerHTML = `
            <header class="reader-header"><span class="tag-label pink-tag">${escapeHtml(article.category)}</span><h1 class="reader-title">${escapeHtml(article.title)}</h1><span class="reader-date">${formattedDate}</span></header>
            <img class="reader-hero-img" src="${article.coverImage || ''}" alt="${escapeHtml(article.title)}" onerror="this.src='https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1000'">
            <div class="reader-rich-text">${bodyHtml}</div>
            <div style="display:flex; gap:35px; margin:60px 0 30px; padding:22px 0; border-top:1px solid #121212; border-bottom:1px solid #121212;">
                <button id="like-action-btn" style="display:flex; gap:8px; background:none; border:none; cursor:pointer;"><svg id="like-icon" width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? '#F3C1C6' : 'none'}" stroke="${isLiked ? '#F3C1C6' : '#121212'}" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>Liked by <span id="like-counter">${baseline}</span></span></button>
                <button id="share-action-btn" style="display:flex; gap:8px; background:none; border:none; cursor:pointer;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#121212" stroke-width="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg><span id="share-btn-text">Share Entry</span></button>
            </div>
        `;
        const likeBtn = document.getElementById('like-action-btn');
        const likeIcon = document.getElementById('like-icon');
        const likeCounter = document.getElementById('like-counter');
        const shareBtn = document.getElementById('share-action-btn');
        const shareText = document.getElementById('share-btn-text');
        let serverLikes = 0;
        try {
            const res = await fetch(`${LIKES_API_BASE}?postId=${encodeURIComponent(article.id)}&_cb=${Date.now()}`);
            if (res.ok) serverLikes = parseInt((await res.json()).likes, 10) || 0;
            if (likeCounter) likeCounter.innerText = baseline + serverLikes;
        } catch (e) { console.error('Like fetch error:', e); }
        if (likeBtn) {
            likeBtn.addEventListener('click', async () => {
                const liked = localStorage.getItem(localLikeKey) === 'true';
                if (likeIcon) { likeIcon.classList.remove('animate-pop'); void likeIcon.offsetWidth; likeIcon.classList.add('animate-pop'); }
                if (!liked) {
                    localStorage.setItem(localLikeKey, 'true');
                    serverLikes++;
                    if (likeIcon) { likeIcon.setAttribute('fill', '#F3C1C6'); likeIcon.setAttribute('stroke', '#F3C1C6'); }
                } else {
                    localStorage.setItem(localLikeKey, 'false');
                    serverLikes = Math.max(0, serverLikes - 1);
                    if (likeIcon) { likeIcon.setAttribute('fill', 'none'); likeIcon.setAttribute('stroke', '#121212'); }
                }
                if (likeCounter) likeCounter.innerText = baseline + serverLikes;
                try {
                    await fetch(`${LIKES_API_BASE}?postId=${encodeURIComponent(article.id)}&_cb=${Date.now()}`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: liked ? 'unlike' : 'like' })
                    });
                } catch (e) { console.error('Like sync error:', e); }
            });
        }
        if (shareBtn) {
            shareBtn.addEventListener('click', () => {
                const url = `${window.location.origin}${window.location.pathname}?article=${encodeURIComponent(article.id)}`;
                if (navigator.share) navigator.share({ title: article.title, url });
                else { navigator.clipboard.writeText(url); if (shareText) { shareText.innerText = 'Copied!'; setTimeout(() => shareText.innerText = 'Share Entry', 2000); } }
            });
        }
        window.history.pushState({}, '', `?article=${encodeURIComponent(article.id)}`);
        if (articleModalEl) articleModalEl.classList.add('open-modal');
        document.body.style.overflow = 'hidden';
    }

    function closeArticleReader() {
        if (articleModalEl) articleModalEl.classList.remove('open-modal');
        document.body.style.overflow = '';
        window.history.pushState({}, '', window.location.pathname);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
    }

    // Attach event listeners
    if (categoryNavButtons.length) {
        categoryNavButtons.forEach(btn => {
            btn.addEventListener('click', e => {
                categoryNavButtons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentCategory = e.target.dataset.category;
                renderMagazineView();
            });
        });
    }
    if (homeLogoBtn) {
        homeLogoBtn.addEventListener('click', e => {
            e.preventDefault();
            categoryNavButtons.forEach(b => b.classList.remove('active'));
            if (categoryNavButtons[0]) categoryNavButtons[0].classList.add('active');
            currentCategory = 'all';
            renderMagazineView();
        });
    }
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeArticleReader);
    if (articleModalEl) {
        articleModalEl.addEventListener('click', e => { if (e.target === articleModalEl) closeArticleReader(); });
    }
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && articleModalEl && articleModalEl.classList.contains('open-modal')) closeArticleReader(); });

    initMagazine();
});