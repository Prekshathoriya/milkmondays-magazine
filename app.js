/**
 * Milk Mondays — Dynamic Editorial Routing Engine
 */

document.addEventListener('DOMContentLoaded', () => {
    // Application States
    let allArticles = [];
    let currentCategory = 'all';

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

    /**
     * Initializes configuration and pulls published documents from CMS outputs
     */
    async function initMagazine() {
        try {
            // Decap CMS delivers static JSON records or markdown formats to defined repos.
            // For optimized serverless delivery, we reference a static data map file.
            // If pulling individual files, point to your API index pipeline:
            const response = await fetch('/content/posts.json');
            
            if (!response.ok) {
                throw new Error('Storage index endpoint empty.');
            }
            
            const data = await response.json();
            allArticles = data.posts || [];
            
            // Re-order posts descending chronologically
            allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            renderMagazineView();
        } catch (error) {
            console.warn("Milk Mondays Content Pipe: Dynamic collection empty. Displaying curated fallback state.");
            renderInitialEmptyState();
        }
    }

    /**
     * Toggles empty states when collection dependencies are unresolved
     */
    function renderInitialEmptyState() {
        emptyStateEl.style.display = 'flex';
        magazineContentEl.className = 'hidden-content';
    }

    /**
     * Controls layout loops and presentation triggers
     */
    function renderMagazineView() {
        if (!allArticles || allArticles.length === 0) {
            renderInitialEmptyState();
            return;
        }

        // Dissolve empty loader
        emptyStateEl.style.display = 'none';
        magazineContentEl.className = 'visible-content';

        // Filter contents based on runtime target categorization
        const filteredArticles = currentCategory === 'all' 
            ? allArticles 
            : allArticles.filter(art => art.category.toLowerCase() === currentCategory.toLowerCase());

        if (filteredArticles.length === 0) {
            postsGridEl.innerHTML = `<p class="empty-subtitle" style="grid-column: 1/-1; padding: 40px 0;">No edits filed under this sector yet.</p>`;
            heroSectionEl.style.display = 'none';
            return;
        }

        // Render sections contextually based on choice selections
        if (currentCategory === 'all') {
            heroSectionEl.style.display = 'grid';
            renderHeroFeature(filteredArticles[0]);
            renderPostsGrid(filteredArticles.slice(1));
        } else {
            heroSectionEl.style.display = 'none';
            renderPostsGrid(filteredArticles);
        }
    }

    /**
     * Compiles Hero Header Pane
     */
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

    /**
     * Compiles grid loops
     */
    function renderPostsGrid(articles) {
        postsGridEl.innerHTML = '';
        
        articles.forEach((article, index) => {
            const card = document.createElement('div');
            card.className = 'article-card';
            // Stagger animations downwards cleanly
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

    /**
     * Hydrates Reader Overlays dynamically
     */
    function launchArticleReader(article) {
        const formattedDate = new Date(article.date).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        // Process line breaks cleanly for raw editorial output styling without markdown dependencies
        const htmlBodyContent = article.body.split('\n\n').map(para => {
            if (para.trim().startsWith('>')) {
                return `<blockquote>${para.replace('>', '').trim()}</blockquote>`;
            }
            return `<p>${para.trim()}</p>`;
        }).join('');

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
        `;

        articleModalEl.classList.add('open-modal');
        document.body.style.overflow = 'hidden'; // Freeze background tracking
    }

    function closeArticleReader() {
        articleModalEl.classList.remove('open-modal');
        document.body.style.overflow = '';
    }

    // ==========================================================================
    // INTERACTION RECEPTORS & REGISTERED ROUTERS
    // ==========================================================================
    
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
    
    // Close overlay if user clicks outside container wrapper boundary bounds
    articleModalEl.addEventListener('click', (e) => {
        if (e.target === articleModalEl) {
            closeArticleReader();
        }
    });

    // Escape handling
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && articleModalEl.classList.contains('open-modal')) {
            closeArticleReader();
        }
    });

    // Initialize System Engine
    initMagazine();
});