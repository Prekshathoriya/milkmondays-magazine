/**
 * Milk Mondays — Dynamic Editorial Routing Engine with Live Supabase Integration
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Application States
    let allArticles = [];
    let currentCategory = 'all';

    // ==========================================================================
    // 1. INITIALIZE SUPABASE CLIENT
    // ==========================================================================
    const SUPABASE_URL = "https://tkhfktlnfeltwrwosibd.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_Ks3oUifHdADLHYW_80TJqw_JRp2w3pb";
    
    // Initialize the global supabase object loaded via the HTML CDN tag
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Connected Production Live Cloudflare API Route for Likes
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

    // Access Gate UI Interceptors
    const gateScreenEl = document.getElementById('gate-screen');
    const mainAppWrapperEl = document.getElementById('main-app-wrapper');
    const gateFormEl = document.getElementById('gate-form');
    const gateEmailInput = document.getElementById('gate-input-email');
    const accountTriggerBtn = document.getElementById('portal-trigger-btn');

    // Account Workspace Portal Modal UI DOM Cache Elements
    const accountPortalModalEl = document.getElementById('account-portal-modal');
    const closeAccountModalBtnEl = document.getElementById('close-account-modal-btn');
    const accountDisconnectBtnEl = document.getElementById('account-portal-disconnect-btn');
    const accountDisplayEmailEl = document.getElementById('account-display-email');
    
    const fillMeterBarEl = document.getElementById('completion-meter-fill');
    const percentValLabelEl = document.getElementById('completion-percentage-value');
    
    const chkInstaBtn = document.getElementById('chk-action-insta');
    const chkFormBtn = document.getElementById('chk-action-form');
    const chkInteractNode = document.getElementById('chk-node-interaction');
    
    const linkInstaText = document.getElementById('link-node-insta');
    const linkFormText = document.getElementById('link-node-form');

    // ==========================================================================
    // 2. SUPABASE DIRECT NEWSLETTER ACCESS ENGINE & PROFILE SPACE PORTAL
    // ==========================================================================
    
    const isUnlocked = localStorage.getItem('milk_mondays_unlocked') === 'true';

    if (isUnlocked) {
        if (gateScreenEl) gateScreenEl.style.display = 'none';
        revealMainApplication(localStorage.getItem('milk_mondays_active_identity') || "subscriber.member");
    } else {
        if (gateScreenEl) {
            gateScreenEl.style.display = 'flex';
            gateScreenEl.style.opacity = '1';
        }
        if (mainAppWrapperEl) mainAppWrapperEl.style.display = 'none';
    }

    if (gateFormEl) {
        gateFormEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            const targetEmail = gateEmailInput.value.trim();
            const submitBtn = gateFormEl.querySelector('.gate-submit-btn');
            const btnText = gateFormEl.querySelector('.btn-text');
            const btnSpinner = gateFormEl.querySelector('.btn-loader-spinner');

            if (targetEmail) {
                // Trigger minimal visual loading state
                if (submitBtn) submitBtn.disabled = true;
                if (btnText) btnText.style.opacity = '0';
                if (btnSpinner) btnSpinner.classList.remove('hidden-spinner');

                try {
                    // Direct table injection to bypass email triggers entirely
                    const { error } = await supabase
                        .from('subscribers')
                        .insert([{ email: targetEmail }]);

                    if (error) {
                        console.warn('Supabase entry intercepted by RLS policy. Transitioning to local fallback:', error.message);
                    }

                } catch (err) {
                    console.error('System Pipeline Halt:', err);
                }

                // Smooth pass-through transition
                localStorage.setItem('milk_mondays_unlocked', 'true');
                localStorage.setItem('milk_mondays_active_identity', targetEmail);
                
                if (gateScreenEl) {
                    gateScreenEl.classList.add('gate-fade-out');
                    setTimeout(() => {
                        gateScreenEl.style.display = 'none';
                    }, 500);
                }

                revealMainApplication(targetEmail);
            }
        });
    }

    function revealMainApplication(userEmail) {
        if (mainAppWrapperEl) {
            mainAppWrapperEl.style.display = 'block';
            setTimeout(() => { mainAppWrapperEl.style.opacity = '1'; }, 50);
        }
        if (accountTriggerBtn) accountTriggerBtn.innerText = 'Account';
        if (accountDisplayEmailEl) accountDisplayEmailEl.innerText = userEmail;
        
        initMagazine();
        recalculateProfileIntegrity();
    }

    // ==========================================================================
    // ACCOUNT PORTAL INTEGRITY METRIC CALCULATION ENGINE
    // ==========================================================================
    function recalculateProfileIntegrity() {
        let itemsCompleted = 0;
        const totalItems = 3;

        // Condition 1: Instagram Link Click Tracking Checks
        if (localStorage.getItem('mm_meta_insta_linked') === 'true') {
            itemsCompleted++;
            if (chkInstaBtn) chkInstaBtn.classList.add('matrix-node-checked');
            if (linkInstaText) linkInstaText.classList.add('text-node-crossed');
        } else {
            if (chkInstaBtn) chkInstaBtn.classList.remove('matrix-node-checked');
            if (linkInstaText) linkInstaText.classList.remove('text-node-crossed');
        }

        // Condition 2: Digital Form Submissions Link Clicks
        if (localStorage.getItem('mm_meta_form_filed') === 'true') {
            itemsCompleted++;
            if (chkFormBtn) chkFormBtn.classList.add('matrix-node-checked');
            if (linkFormText) linkFormText.classList.add('text-node-crossed');
        } else {
            if (chkFormBtn) chkFormBtn.classList.remove('matrix-node-checked');
            if (linkFormText) linkFormText.classList.remove('text-node-crossed');
        }

        // Condition 3: Article Interactions Tracking Flags
        if (localStorage.getItem('mm_meta_feed_interacted') === 'true') {
            itemsCompleted++;
            if (chkInteractNode) chkInteractNode.classList.add('matrix-node-checked');
        } else {
            if (chkInteractNode) chkInteractNode.classList.remove('matrix-node-checked');
        }

        // Compute Percentages Elements Math
        const activeRatio = Math.round((itemsCompleted / totalItems) * 100);
        if (percentValLabelEl) percentValLabelEl.innerText = `${activeRatio}%`;
        if (fillMeterBarEl) fillMeterBarEl.style.width = `${activeRatio}%`;
    }

    // Setup Event Interceptors on Check Nodes to Set Completion States Manually
    if (chkInstaBtn) { chkInstaBtn.addEventListener('click', toggleInstaNode); }
    if (linkInstaText) { linkInstaText.addEventListener('click', () => { localStorage.setItem('mm_meta_insta_linked', 'true'); recalculateProfileIntegrity(); }); }
    
    if (chkFormBtn) { chkFormBtn.addEventListener('click', toggleFormNode); }
    if (linkFormText) { linkFormText.addEventListener('click', () => { localStorage.setItem('mm_meta_form_filed', 'true'); recalculateProfileIntegrity(); }); }

    function toggleInstaNode() {
        const active = localStorage.getItem('mm_meta_insta_linked') === 'true';
        localStorage.setItem('mm_meta_insta_linked', active ? 'false' : 'true');
        recalculateProfileIntegrity();
    }

    function toggleFormNode() {
        const active = localStorage.getItem('mm_meta_form_filed') === 'true';
        localStorage.setItem('mm_meta_form_filed', active ? 'false' : 'true');
        recalculateProfileIntegrity();
    }

    // Modal Visibility Access Controls (Replaces legacy window.confirm blocks)
    if (accountTriggerBtn) {
        accountTriggerBtn.addEventListener('click', () => {
            recalculateProfileIntegrity();
            if (accountPortalModalEl) {
                accountPortalModalEl.style.display = 'flex';
                setTimeout(() => { accountPortalModalEl.style.opacity = '1'; }, 20);
            }
        });
    }

    if (closeAccountModalBtnEl) {
        closeAccountModalBtnEl.addEventListener('click', () => {
            if (accountPortalModalEl) {
                accountPortalModalEl.style.opacity = '0';
                setTimeout(() => { accountPortalModalEl.style.display = 'none'; }, 300);
            }
        });
    }

    if (accountDisconnectBtnEl) {
        accountDisconnectBtnEl.addEventListener('click', () => {
            if (confirm("Disconnect token and clear your interface setup?")) {
                localStorage.removeItem('milk_mondays_unlocked');
                localStorage.removeItem('milk_mondays_active_identity');
                localStorage.removeItem('mm_meta_insta_linked');
                localStorage.removeItem('mm_meta_form_filed');
                localStorage.removeItem('mm_meta_feed_interacted');
                window.location.reload();
            }
        });
    }

    // ==========================================================================
    // 3. CORE EDITORIAL FEED ENGINE & INTERACTIVE SECTIONS
    // ==========================================================================

    // Inject minimal micro-interaction keyframes for the heart pop
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

    /**
     * Generates a unique, consistent dummy baseline count based on the post ID string.
     */
    function getPostBaselineLikes(postId) {
        let hash = 0;
        for (let i = 0; i < postId.length; i++) {
            hash = postId.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash % 65) + 32;
    }

    /**
     * Pulls published documents from CMS JSON outputs
     */
    async function initMagazine() {
        try {
            const response = await fetch('/content/posts.json');
            
            if (!response.ok) {
                throw new Error('Storage index endpoint empty.');
            }
            
            const data = await response.json();
            allArticles = data.posts || [];
            
            allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
            renderMagazineView();

            const urlParams = new URLSearchParams(window.location.search);
            const targetArticleId = urlParams.get('article');
            
            if (targetArticleId) {
                const targetArticle = allArticles.find(art => art.id === targetArticleId);
                if (targetArticle) {
                    launchArticleReader(targetArticle);
                }
            }
        } catch (error) {
            console.warn("Milk Mondays Content Pipe: Dynamic collection empty. Displaying curated fallback state.");
            renderInitialEmptyState();
        }
    }

    function renderInitialEmptyState() {
        if (emptyStateEl) emptyStateEl.style.display = 'flex';
        if (magazineContentEl) magazineContentEl.className = 'hidden-content';
    }

    function renderMagazineView() {
        if (!allArticles || allArticles.length === 0) {
            renderInitialEmptyState();
            return;
        }

        if (emptyStateEl) emptyStateEl.style.display = 'none';
        if (magazineContentEl) magazineContentEl.className = 'visible-content';

        const filteredArticles = currentCategory === 'all' 
            ? allArticles 
            : allArticles.filter(art => art.category.toLowerCase() === currentCategory.toLowerCase());

        if (filteredArticles.length === 0) {
            if (postsGridEl) postsGridEl.innerHTML = `<p class="empty-subtitle" style="grid-column: 1/-1; padding: 40px 0;">No edits filed under this sector yet.</p>`;
            if (heroSectionEl) heroSectionEl.style.display = 'none';
            return;
        }

        if (currentCategory === 'all') {
            if (heroSectionEl) {
                heroSectionEl.style.display = 'grid';
                renderHeroFeature(filteredArticles[0]);
            }
            if (postsGridEl) renderPostsGrid(filteredArticles.slice(1));
        } else {
            if (heroSectionEl) heroSectionEl.style.display = 'none';
            if (postsGridEl) renderPostsGrid(filteredArticles);
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
            launchArticleReader(article);
        });
    }

    function renderPostsGrid(articles) {
        postsGridEl.innerHTML = '';
        
        articles.forEach((article, index) => {
            const card = document.createElement('div');
            card.className = 'article-card';
            card.style.animationDelay = `${index * 0.1}s`;
            
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
                launchArticleReader(article);
            });

            postsGridEl.appendChild(card);
        });
    }

    async function launchArticleReader(article) {
        // Set dynamic account tracking flags on article opening actions
        localStorage.setItem('mm_meta_feed_interacted', 'true');

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
                <button id="like-action-btn" style="display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; color: #121212; background: none; border: none; cursor: pointer; padding: 0; outline: none; -webkit-tap-highlight-color: transparent;">
                    <svg id="like-icon" width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? '#F3C1C6' : 'none'}" stroke="${isLiked ? '#F3C1C6' : '#121212'}" stroke-width="1.5" style="transition: transform 0.1s ease, fill 0.2s ease, stroke 0.2s ease; display: block;">
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
                console.error("Cloud coordinate handshake broken.");
            }
        });

        shareBtn.addEventListener('click', async () => {
            const articleUrl = `${window.location.origin}${window.location.pathname}?article=${encodeURIComponent(article.id)}`;
            if (navigator.share) {
                try {
                    await navigator.share({ title: article.title, text: article.subtitle, url: articleUrl });
                } catch (err) { console.log('Native share panel closed.'); }
            } else {
                navigator.clipboard.writeText(articleUrl);
                shareBtnText.innerText = 'Link Copied!';
                setTimeout(() => { shareBtnText.innerText = 'Share Entry'; }, 2000);
            }
        });

        const targetUrl = `${window.location.origin}${window.location.pathname}?article=${encodeURIComponent(article.id)}`;
        window.history.pushState({ path: targetUrl }, '', targetUrl);

        if (articleModalEl) {
            articleModalEl.classList.add('open-modal');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeArticleReader() {
        if (articleModalEl) articleModalEl.classList.remove('open-modal');
        document.body.style.overflow = '';
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.pushState({ path: cleanUrl }, '', cleanUrl);
    }

    // ==========================================================================
    // INTERACTION RECEPTORS & REGISTERED ROUTERS
    // ==========================================================================
    categoryNavButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            if (e.target.id === 'portal-trigger-btn') return;
            categoryNavButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            currentCategory = e.target.getAttribute('data-category');
            renderMagazineView();
        });
    });

    if (homeLogoBtn) {
        homeLogoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            categoryNavButtons.forEach(btn => btn.classList.remove('active'));
            if (categoryNavButtons[0]) categoryNavButtons[0].classList.add('active');
            currentCategory = 'all';
            renderMagazineView();
        });
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeArticleReader);
    if (articleModalEl) articleModalEl.addEventListener('click', (e) => { if (e.target === articleModalEl) closeArticleReader(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && articleModalEl && articleModalEl.classList.contains('open-modal')) closeArticleReader(); });
});