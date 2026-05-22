/**
 * Milk Mondays — Dynamic Editorial Routing Engine with Live Cloudflare Interactions
 */

document.addEventListener('DOMContentLoaded', () => {
    // Application States
    let allArticles = [];
    let currentCategory = 'all';

    // Connected Production Live Cloudflare API Route
    const LIKES_API_BASE = 'https://muddy-shadow-6c19.milkmondaysbiz.workers.dev';

    // UI Cache Registry
    const emptyStateEl = document.getElementById('empty-state');
    const magazineContentEl = document.getElementById('magazine-content');
    const heroSectionEl = document.getElementById('hero-feature');
    const postsGridEl = document.getElementById('posts-grid');
    const articleModalEl = document.getElementById('article-modal');
    const modalBodyEl = document.getElementById('modal-article-body');
    const closeModalBtn = document.querySelector('.close-modal-btn');
    const categoryNavButtons = document.querySelectorAll('.nav-btn');
    const homeLogoBtn = document.getElementById('home-logo-btn');

    // Inject animation styles
    if (!document.getElementById('mm-like-animation-styles')) {
        const styleSheet = document.createElement("style");
        styleSheet.id = 'mm-like-animation-styles';
        styleSheet.innerText = `
            @keyframes heartPop {
                0% { transform: scale(1); }
                14% { transform: scale(0.7); }
                28% { transform: scale(1.2); }
                42% { transform: scale(1.1); }
                70% { transform: scale(1); }
            }
            .animate-pop {
                animation: heartPop 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
        `;
        document.head.appendChild(styleSheet);
    }

    function getPostBaselineLikes(postId) {
        let hash = 0;
        for (let i = 0; i < postId.length; i++) {
            hash = postId.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash % 65) + 32;
    }

    async function initMagazine() {
        try {
            const response = await fetch('/content/posts.json');
            if (!response.ok) throw new Error('Storage index endpoint empty.');
            const data = await response.json();
            allArticles = data.posts || [];
            allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
            renderMagazineView();

            // Deep linking: if article param present, open it (but only if gate passed? No, we'll check inside open function)
            const urlParams = new URLSearchParams(window.location.search);
            const targetArticleId = urlParams.get('article');
            if (targetArticleId) {
                const targetArticle = allArticles.find(art => art.id === targetArticleId);
                if (targetArticle) {
                    // Check gate before opening
                    checkGateAndOpenArticle(targetArticle);
                }
            }
        } catch (error) {
            console.warn("Milk Mondays Content Pipe: Dynamic collection empty.");
            renderInitialEmptyState();
        }
    }

    // NEW: Gate check wrapper
    function checkGateAndOpenArticle(article) {
        if (localStorage.getItem('mm_gate_passed') === 'true') {
            // Gate passed, open article directly
            launchArticleReader(article);
        } else {
            // Gate not passed, redirect to gate form with return URL
            const returnUrl = `${window.location.origin}${window.location.pathname}?article=${encodeURIComponent(article.id)}`;
            window.location.href = `gate-form.html?redirect=${encodeURIComponent(returnUrl)}`;
        }
    }

    function renderInitialEmptyState() {
        emptyStateEl.style.display = 'flex';
        magazineContentEl.className = 'hidden-content';
    }

    function renderMagazineView() {
        if (!allArticles || allArticles.length === 0) {
            renderInitialEmptyState();
            return;
        }

        emptyStateEl.style.display = 'none';
        magazineContentEl.className = 'visible-content';

        const filteredArticles = currentCategory === 'all' 
            ? allArticles 
            : allArticles.filter(art => art.category.toLowerCase() === currentCategory.toLowerCase());

        if (filteredArticles.length === 0) {
            postsGridEl.innerHTML = `<p class="empty-subtitle" style="grid-column: 1/-1; padding: 40px 0;">No edits filed under this sector yet.</p>`;
            heroSectionEl.style.display = 'none';
            return;
        }

        if (currentCategory === 'all') {
            heroSectionEl.style.display = 'grid';
            renderHeroFeature(filteredArticles[0]);
            renderPostsGrid(filteredArticles.slice(1));
        } else {
            heroSectionEl.style.display = 'none';
            renderPostsGrid(filteredArticles);
        }
    }

    function renderHeroFeature(article) {
        heroSectionEl.innerHTML = `
            <div class="hero-image-pane">
                <img src="${article.coverImage || 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1000'}" alt="${article.title}">
            </div>
            <div class="hero-content-pane">
                <span class="tag-label pink-tag">${article.category}</span>
                <h2 class="hero-headline">${article.title}</h2>
                <p class="hero-hook">${article.subtitle || ''}</p>
                <button class="editorial-btn read-more-trigger" data-id="${article.id}">Read Article</button>
            </div>
        `;
        heroSectionEl.querySelector('.read-more-trigger').addEventListener('click', () => {
            checkGateAndOpenArticle(article);
        });
    }

    function renderPostsGrid(articles) {
        postsGridEl.innerHTML = '';
        articles.forEach((article, index) => {
            const card = document.createElement('div');
            card.className = 'article-card';
            card.style.animationDelay = `${index * 0.05}s`;
            
            const formattedDate = new Date(article.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            card.innerHTML = `
                <div class="card-image-box">
                    <img src="${article.coverImage || 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1000'}" alt="${article.title}">
                </div>
                <div class="card-meta">
                    <span class="tag-label">${article.category}</span>
                    <span class="card-date">${formattedDate}</span>
                </div>
                <h3 class="card-title">${article.title}</h3>
                <p class="card-description">${article.subtitle || ''}</p>
            `;

            card.addEventListener('click', () => {
                checkGateAndOpenArticle(article);
            });

            postsGridEl.appendChild(card);
        });
    }

    async function launchArticleReader(article) {
        const formattedDate = new Date(article.date).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        const htmlBodyContent = article.body.split('\n').map(para => {
            const trimmed = para.trim();
            if (!trimmed) return '';
            if (trimmed.startsWith('>')) {
                return `<blockquote>${trimmed.replace('>', '').trim()}</blockquote>`;
            }
            return `<p>${trimmed}</p>`;
        }).join('');

        const localLikeKey = `mm_liked_${article.id}`;
        const isLiked = localStorage.getItem(localLikeKey) === 'true';
        const baselineLikes = getPostBaselineLikes(article.id);

        modalBodyEl.innerHTML = `
            <header class="reader-header">
                <span class="tag-label pink-tag">${article.category}</span>
                <h1 class="reader-title">${article.title}</h1>
                <span class="reader-date">${formattedDate}</span>
            </header>
            <img class="reader-hero-img" src="${article.coverImage}" alt="${article.title}">
            <div class="reader-rich-text">
                ${htmlBodyContent}
            </div>
            <div style="display: flex; gap: 35px; align-items: center; margin-top: 60px; margin-bottom: 30px; padding: 22px 0; border-top: 1px solid #121212; border-bottom: 1px solid #121212;">
                <button id="like-action-btn" style="display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; color: #121212; background: none; border: none; cursor: pointer; padding: 0;">
                    <svg id="like-icon" width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? '#F3C1C6' : 'none'}" stroke="${isLiked ? '#F3C1C6' : '#121212'}" stroke-width="1.5">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>Liked by <span id="like-counter">${baselineLikes}</span></span>
                </button>
                <button id="share-action-btn" style="display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; color: #121212; background: none; border: none; cursor: pointer; padding: 0;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#121212" stroke-width="1.5">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    <span id="share-btn-text">Share Entry</span>
                </button>
            </div>
        `;

        const likeBtn = document.getElementById('like-action-btn');
        const likeIcon = document.getElementById('like-icon');
        const likeCounter = document.getElementById('like-counter');
        const shareBtn = document.getElementById('share-action-btn');
        const shareBtnText = document.getElementById('share-btn-text');

        let serverLikesCount = 0;
        try {
            const getRes = await fetch(`${LIKES_API_BASE}?postId=${encodeURIComponent(article.id)}&_cb=${Date.now()}`);
            if (getRes.ok) {
                const data = await getRes.json();
                serverLikesCount = parseInt(data.likes, 10) || 0;
                likeCounter.innerText = baselineLikes + serverLikesCount;
            }
        } catch (err) {
            console.error("Database sync error.", err);
        }

        likeBtn.addEventListener('click', async () => {
            const stateActive = localStorage.getItem(localLikeKey) === 'true';
            const actionType = stateActive ? 'unlike' : 'like';
            likeIcon.classList.remove('animate-pop');
            void likeIcon.offsetWidth;
            likeIcon.classList.add('animate-pop');

            if (!stateActive) {
                localStorage.setItem(localLikeKey, 'true');
                serverLikesCount += 1;
                likeIcon.setAttribute('fill', '#F3C1C6');
                likeIcon.setAttribute('stroke', '#F3C1C6');
            } else {
                localStorage.setItem(localLikeKey, 'false');
                serverLikesCount = Math.max(0, serverLikesCount - 1);
                likeIcon.setAttribute('fill', 'none');
                likeIcon.setAttribute('stroke', '#121212');
            }
            likeCounter.innerText = baselineLikes + serverLikesCount;

            try {
                const postRes = await fetch(`${LIKES_API_BASE}?postId=${encodeURIComponent(article.id)}&_cb=${Date.now()}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: actionType })
                });
                if (postRes.ok) {
                    const data = await postRes.json();
                    const updatedServerLikes = parseInt(data.likes, 10) || 0;
                    likeCounter.innerText = baselineLikes + updatedServerLikes;
                }
            } catch (err) {
                console.error("Cloud sync failed.");
            }
        });

        shareBtn.addEventListener('click', async () => {
            const articleUrl = `${window.location.origin}${window.location.pathname}?article=${encodeURIComponent(article.id)}`;
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: article.title,
                        text: article.subtitle,
                        url: articleUrl
                    });
                } catch (err) {}
            } else {
                navigator.clipboard.writeText(articleUrl);
                shareBtnText.innerText = 'Link Copied!';
                setTimeout(() => { shareBtnText.innerText = 'Share Entry'; }, 2000);
            }
        });

        const targetUrl = `${window.location.origin}${window.location.pathname}?article=${encodeURIComponent(article.id)}`;
        window.history.pushState({ path: targetUrl }, '', targetUrl);
        articleModalEl.classList.add('open-modal');
        document.body.style.overflow = 'hidden';
    }

    function closeArticleReader() {
        articleModalEl.classList.remove('open-modal');
        document.body.style.overflow = '';
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.pushState({ path: cleanUrl }, '', cleanUrl);
    }

    // Event Listeners
    categoryNavButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            categoryNavButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            currentCategory = e.target.getAttribute('data-category');
            renderMagazineView();
        });
    });

    homeLogoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        categoryNavButtons.forEach(btn => btn.classList.remove('active'));
        categoryNavButtons[0].classList.add('active');
        currentCategory = 'all';
        renderMagazineView();
    });

    closeModalBtn.addEventListener('click', closeArticleReader);
    articleModalEl.addEventListener('click', (e) => {
        if (e.target === articleModalEl) closeArticleReader();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && articleModalEl.classList.contains('open-modal')) closeArticleReader();
    });

    initMagazine();
});