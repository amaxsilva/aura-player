// CONFIGURAÇÃO DO SUPABASE (Insere aqui os teus dados copiados do painel)
const SUPABASE_URL = 'https://bnflihuudcqjehhoxjcg.supabase.co';
const SUPABASE_KEY = 'sb_publishable__HcflNHnHAf-XIpNZyLs_g_dO8sFaYx';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentCredentials = null;
let hlsInstance = null;
let currentTab = 'home';
let favoritesList = JSON.parse(localStorage.getItem('iptv_favorites') || '[]');
let currentMedia = null;

let memoryCache = {
    vod: null,
    series: null,
    vodCategories: null,
    seriesCategories: null,
    liveCategories: null,
    liveStreams: null
};

let heroSlides = [];
let currentHeroIndex = 0;
let heroInterval = null;

let pendingResumeData = null;
let currentSeriesEpisodes = [];
let currentEpisodeIndex = -1;
let countdownInterval = null;

function showLoader(text = "Carregando...") {
    document.getElementById('loader-text').innerText = text;
    document.getElementById('app-loader').style.display = 'flex';
}

function hideLoader() {
    document.getElementById('app-loader').style.display = 'none';
}

function pushHistoryState() {
    window.history.pushState({ page: 'app' }, '');
}

window.addEventListener('popstate', (e) => {
    pushHistoryState();
    handlePhysicalBackButton();
});

function handlePhysicalBackButton() {
    const playerActive = document.getElementById('player-screen').classList.contains('active');
    const detailsActive = document.getElementById('details-screen').classList.contains('active');
    const catalogActive = document.getElementById('view-catalog').style.display !== 'none';
    const modalActive = document.getElementById('track-selector-modal').style.display !== 'none';
    const resumeActive = document.getElementById('resume-prompt-modal').style.display !== 'none';

    if (resumeActive) {
        document.getElementById('resume-prompt-modal').style.display = 'none';
        initSpatialFocus();
        return;
    }
    if (modalActive) {
        closeTrackModal();
        return;
    }
    if (playerActive) {
        const overlay = document.getElementById('player-overlay');
        if (overlay.classList.contains('visible')) {
            overlay.classList.remove('visible');
            initSpatialFocus();
            return;
        }
        closePlayer();
        return;
    }
    if (detailsActive) {
        goBackToMain();
        return;
    }
    if (catalogActive) {
        switchTab('home');
        return;
    }
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    initSpatialFocus();
}

function getFocusableElements() {
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return [];

    if (document.getElementById('resume-prompt-modal').style.display === 'flex') {
        return Array.from(document.getElementById('resume-prompt-modal').querySelectorAll('.focusable, button'));
    }
    if (document.getElementById('track-selector-modal').style.display === 'flex') {
        return Array.from(document.getElementById('track-selector-modal').querySelectorAll('.focusable, button'));
    }
    if (document.getElementById('next-episode-toast').style.display === 'flex') {
        return Array.from(document.getElementById('next-episode-toast').querySelectorAll('.focusable, button'));
    }
    if (document.getElementById('player-screen').classList.contains('active')) {
        const overlay = document.getElementById('player-overlay');
        if (overlay.classList.contains('visible')) {
            return Array.from(overlay.querySelectorAll('.focusable, button')).filter(b => b.style.display !== 'none');
        }
        return [];
    }

    return Array.from(activeScreen.querySelectorAll('.focusable, input, button, .media-card, .cat-item, .season-tab, .nav-btn, .brand'))
        .filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
        });
}

function initSpatialFocus() {
    const elements = getFocusableElements();
    if (elements.length === 0) return;

    let current = elements.find(el => el.classList.contains('spatial-focused') || el === document.activeElement);
    if (!current) {
        current = elements[0];
    }
    elements.forEach(el => el.classList.remove('spatial-focused'));
    current.classList.add('spatial-focused');
    current.focus();
}

// FOCUS MANAGER ORIGINAL RESTAURADO INTEGRALMENTE
function moveSpatialFocus(direction) {
    const elements = getFocusableElements();
    if (elements.length === 0) return;

    let current = elements.find(el => el.classList.contains('spatial-focused') || el === document.activeElement);
    if (!current) {
        current = elements[0];
        current.classList.add('spatial-focused');
        current.focus();
        return;
    }

    const curRect = current.getBoundingClientRect();
    const curCenter = { x: curRect.left + curRect.width / 2, y: curRect.top + curRect.height / 2 };

    let bestTarget = null;
    let minDistance = Infinity;

    elements.forEach(el => {
        if (el === current) return;
        const rect = el.getBoundingClientRect();
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

        let valid = false;
        let primaryDist = 0;
        let secondaryDist = 0;

        if (direction === 'left') {
            valid = center.x < curCenter.x - 5;
            primaryDist = curCenter.x - center.x;
            secondaryDist = Math.abs(center.y - curCenter.y);
        } else if (direction === 'right') {
            valid = center.x > curCenter.x + 5;
            primaryDist = center.x - curCenter.x;
            secondaryDist = Math.abs(center.y - curCenter.y);
        } else if (direction === 'up') {
            valid = center.y < curCenter.y - 5;
            primaryDist = curCenter.y - center.y;
            secondaryDist = Math.abs(center.x - curCenter.x);
        } else if (direction === 'down') {
            valid = center.y > curCenter.y + 5;
            primaryDist = center.y - curCenter.y;
            secondaryDist = Math.abs(center.x - curCenter.x);
        }

        if (valid) {
            const totalDist = primaryDist + (secondaryDist * 1.8);
            if (totalDist < minDistance) {
                minDistance = totalDist;
                bestTarget = el;
            }
        }
    });

    if (bestTarget) {
        elements.forEach(el => el.classList.remove('spatial-focused'));
        bestTarget.classList.add('spatial-focused');
        bestTarget.focus();
        bestTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

window.addEventListener('keydown', (e) => {
    pushHistoryState();

    if (['Escape', 'Esc', 'Back', 'GoBack'].includes(e.key) || e.keyCode === 10009 || e.keyCode === 27 || e.keyCode === 8 || e.keyCode === 461) {
        handlePhysicalBackButton();
        e.preventDefault();
        e.stopPropagation();
        return;
    }

    const playerActive = document.getElementById('player-screen').classList.contains('active');

    if (e.key === 'Enter' || e.keyCode === 13) {
        if (playerActive) {
            const overlay = document.getElementById('player-overlay');
            if (!overlay.classList.contains('visible')) {
                showPlayerControls();
                e.preventDefault();
                return;
            } else {
                const activeEl = document.activeElement;
                if (activeEl && activeEl.id === 'player-progress-bar-container') {
                    togglePlayPause();
                    e.preventDefault();
                    return;
                }
            }
        }
        const activeEl = document.activeElement;
        if (activeEl && activeEl !== document.body) {
            activeEl.click();
            e.preventDefault();
            return;
        }
    }

    if (playerActive) {
        const overlay = document.getElementById('player-overlay');
        const isVisible = overlay.classList.contains('visible');

        if (e.key === 'ArrowRight' || e.keyCode === 39) {
            if (isVisible && document.activeElement && document.activeElement.id === 'player-progress-bar-container') {
                skipTime(10);
                e.preventDefault();
                return;
            }
            // Atalho seguro exclusivo para mover entre Próximo Episódio e Configurações no Player
            if (isVisible) {
                const nextBtn = document.getElementById('player-next-ep-btn');
                const settingsBtn = document.getElementById('player-settings-btn');
                if (document.activeElement === nextBtn && nextBtn.style.display !== 'none') {
                    const elements = getFocusableElements();
                    elements.forEach(el => el.classList.remove('spatial-focused'));
                    settingsBtn.classList.add('spatial-focused');
                    settingsBtn.focus();
                    e.preventDefault();
                    return;
                }
            }
            skipTime(10);
            showPlayerControls();
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowLeft' || e.keyCode === 37) {
            if (isVisible && document.activeElement && document.activeElement.id === 'player-progress-bar-container') {
                skipTime(-10);
                e.preventDefault();
                return;
            }
            if (isVisible) {
                const nextBtn = document.getElementById('player-next-ep-btn');
                const settingsBtn = document.getElementById('player-settings-btn');
                if (document.activeElement === settingsBtn && nextBtn.style.display !== 'none') {
                    const elements = getFocusableElements();
                    elements.forEach(el => el.classList.remove('spatial-focused'));
                    nextBtn.classList.add('spatial-focused');
                    nextBtn.focus();
                    e.preventDefault();
                    return;
                }
            }
            skipTime(-10);
            showPlayerControls();
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowUp' || e.keyCode === 38) {
            if (isVisible) {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.id === 'player-settings-btn' || activeEl.id === 'player-next-ep-btn')) {
                    const progressBar = document.getElementById('player-progress-bar-container');
                    const elements = getFocusableElements();
                    elements.forEach(el => el.classList.remove('spatial-focused'));
                    progressBar.classList.add('spatial-focused');
                    progressBar.focus();
                    e.preventDefault();
                    return;
                }
            } else {
                showPlayerControls();
                e.preventDefault();
                return;
            }
        }
        if (e.key === 'ArrowDown' || e.keyCode === 40) {
            if (isVisible) {
                const activeEl = document.activeElement;
                if (activeEl && activeEl.id === 'player-progress-bar-container') {
                    const targetBtn = document.getElementById('player-next-ep-btn').style.display !== 'none' ? document.getElementById('player-next-ep-btn') : document.getElementById('player-settings-btn');
                    const elements = getFocusableElements();
                    elements.forEach(el => el.classList.remove('spatial-focused'));
                    targetBtn.classList.add('spatial-focused');
                    targetBtn.focus();
                    e.preventDefault();
                    return;
                }
            } else {
                overlay.classList.remove('visible');
                initSpatialFocus();
                e.preventDefault();
                return;
            }
        }
        
        if (!isVisible && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            showPlayerControls();
            e.preventDefault();
            return;
        }
    }

    if (e.key === 'ArrowLeft' || e.keyCode === 37) {
        moveSpatialFocus('left');
        e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.keyCode === 39) {
        moveSpatialFocus('right');
        e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.keyCode === 38) {
        moveSpatialFocus('up');
        e.preventDefault();
    } else if (e.key === 'ArrowDown' || e.keyCode === 40) {
        moveSpatialFocus('down');
        e.preventDefault();
    }
});

async function fetchIptvApi(action, extraParams = '') {
    if (!currentCredentials) return null;
    const { url, user, pass } = currentCredentials;
    const endpoint = `${url.replace(/\/$/, '')}/player_api.php?username=${user}&password=${pass}&action=${action}${extraParams}`;
    try {
        const response = await fetch(endpoint);
        return await response.json();
    } catch (err) {
        console.error("Erro na API IPTV:", err);
        return null;
    }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('iptv-url').value.trim();
    const user = document.getElementById('iptv-user').value.trim();
    const pass = document.getElementById('iptv-pass').value.trim();

    if (!url || !user || !pass) return alert('Preencha todos os campos!');
    currentCredentials = { url, user, pass };

    showLoader("Verificando conta...");
    const data = await fetchIptvApi('');
    hideLoader();

    if (!data || !data.user_info) {
        alert('Credenciais inválidas.');
        return;
    }

    setupUserSession(data.user_info);
    localStorage.setItem('iptv_credentials', JSON.stringify(currentCredentials));
    switchScreen('main-app-screen');
    loadHomeData();
});

function setupUserSession(userInfo) {
    let exp = "Sem limite";
    if (userInfo.exp_date && userInfo.exp_date !== "null") {
        exp = new Date(userInfo.exp_date * 1000).toLocaleDateString('pt-BR');
    }
    document.getElementById('header-user-info').innerText = userInfo.username || currentCredentials.user;
    document.getElementById('footer-expiration').innerText = `Expiração: ${exp}`;
}

function logoutSession() {
    if (confirm('Deseja sair da conta?')) {
        localStorage.removeItem('iptv_credentials');
        currentCredentials = null;
        switchScreen('login-screen');
    }
}

function activateSearchInput(input) {
    input.removeAttribute('readonly');
    input.focus();
}

async function loadHomeData() {
    showLoader("Carregando Aura Player...");
    await loadContinueWatching();

    if (!memoryCache.vod) {
        memoryCache.vod = await fetchIptvApi('get_vod_streams');
    }
    if (!memoryCache.series) {
        memoryCache.series = await fetchIptvApi('get_series');
    }
    hideLoader();

    const moviesSlider = document.getElementById('slider-recent-movies');
    const seriesSlider = document.getElementById('slider-recent-series');

    const moviesList = memoryCache.vod && Array.isArray(memoryCache.vod) ? memoryCache.vod.slice(0, 20) : [];
    const seriesList = memoryCache.series && Array.isArray(memoryCache.series) ? memoryCache.series.slice(0, 20) : [];

    renderSliderCards(moviesList, moviesSlider, 'movie');
    renderSliderCards(seriesList, seriesSlider, 'series');

    if (moviesList.length > 0) {
        heroSlides = moviesList.slice(0, 5);
        currentHeroIndex = 0;
        setupHeroBanner(heroSlides[currentHeroIndex], 'movie');
        
        if (heroInterval) clearInterval(heroInterval);
        heroInterval = setInterval(() => {
            currentHeroIndex = (currentHeroIndex + 1) % heroSlides.length;
            setupHeroBanner(heroSlides[currentHeroIndex], 'movie');
        }, 6000);
    }
}

function renderSliderCards(items, container, type, isContinue = false) {
    container.innerHTML = '';
    if (!items || items.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">Sem conteúdos disponíveis.</div>';
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'media-card focusable' + (isContinue ? ' continue-card' : '');
        card.tabIndex = 0;

        const cover = item.stream_icon || item.cover || item.poster || item.backdrop;
        if (cover) {
            card.style.backgroundImage = `url('${cover}')`;
        }

        if (isContinue) {
            const progPercent = item.duration_seconds > 0 ? Math.min(100, (item.progress_seconds / item.duration_seconds) * 100) : 0;
            
            const progressBg = document.createElement('div');
            progressBg.className = 'card-progress-bar-bg';
            const progressFill = document.createElement('div');
            progressFill.className = 'card-progress-bar-fill';
            progressFill.style.width = `${progPercent}%`;
            progressBg.appendChild(progressFill);
            card.appendChild(progressBg);

            const overlay = document.createElement('div');
            overlay.className = 'card-title-overlay';
            
            const titleSpan = document.createElement('span');
            titleSpan.innerText = item.title;
            overlay.appendChild(titleSpan);

            const timeSpan = document.createElement('span');
            timeSpan.className = 'card-subtitle-time';
            timeSpan.innerText = `${item.subtitle || 'Continuar'} • Parou em ${formatTime(item.progress_seconds)}`;
            overlay.appendChild(timeSpan);

            card.appendChild(overlay);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'focusable card-remove-btn';
            removeBtn.innerText = '✕';
            removeBtn.title = 'Remover da lista';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                removeProgressItem(item.media_id);
            };
            card.appendChild(removeBtn);
        } else {
            const overlay = document.createElement('div');
            overlay.className = 'card-title-overlay';
            overlay.innerText = item.name || item.title;
            card.appendChild(overlay);
        }

        card.onclick = () => {
            if (isContinue) {
                prepareAndOpenPlayer(item.title, item.subtitle || 'Continuar', item.url, item.media_id, item.progress_seconds, item.backdrop);
            } else {
                openDetails(item, type);
            }
        };
        container.appendChild(card);
    });

    initSpatialFocus();
}

function setupHeroBanner(item, type) {
    const title = item.name || item.title || "Destaque";
    document.getElementById('hero-title').innerText = title;
    document.getElementById('hero-description').innerText = item.plot || "Disponível no seu plano • Lançamento do catálogo";
    
    const categoryTagEl = document.getElementById('hero-category-tag');
    if (categoryTagEl) {
        categoryTagEl.innerText = type === 'movie' ? 'FILME • DESTAQUE' : 'SÉRIE • LANÇAMENTO';
    }

    // Tenta buscar a melhor imagem de fundo disponível
    const backdropImg = item.backdrop_path?.[0] || item.backdrop || item.stream_icon || item.cover || item.poster;
    
    if (backdropImg) {
        const heroBanner = document.getElementById('hero-banner');
        heroBanner.style.backgroundImage = `url('${backdropImg}')`;
    }

    document.getElementById('hero-watch-btn').onclick = () => openDetails(item, type);
    document.getElementById('hero-info-btn').onclick = () => openDetails(item, type);
}

async function switchTab(tabName) {
    if (heroInterval) clearInterval(heroInterval);
    currentTab = tabName;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.nav-btn[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');

    const viewHome = document.getElementById('view-home');
    const viewCatalog = document.getElementById('view-catalog');

    if (tabName === 'home') {
        viewHome.style.display = 'block';
        viewCatalog.style.display = 'none';
        loadHomeData();
        return;
    }

    viewHome.style.display = 'none';
    viewCatalog.style.display = 'flex';

    if (tabName === 'movies') {
        await loadCategoriesAndItems('vod', 'Filmes');
    } else if (tabName === 'series') {
        await loadCategoriesAndItems('series', 'Séries');
    } else if (tabName === 'live') {
        await loadLiveTvCategories();
    } else if (tabName === 'favorites') {
        renderCategoriesSidebar([{ category_id: 'fav', category_name: 'Meus Favoritos' }]);
        renderCatalogGrid(favoritesList, 'Meus Favoritos');
    }
}

async function loadCategoriesAndItems(type, titlePrefix) {
    const isSeries = type === 'series';
    const catCacheKey = isSeries ? 'seriesCategories' : 'vodCategories';
    const streamCacheKey = isSeries ? 'series' : 'vod';

    const catAction = isSeries ? 'get_series_categories' : 'get_vod_categories';
    const streamAction = isSeries ? 'get_series' : 'get_vod_streams';

    showLoader(`Carregando ${titlePrefix}...`);
    
    if (!memoryCache[catCacheKey]) {
        memoryCache[catCacheKey] = await fetchIptvApi(catAction);
    }
    if (!memoryCache[streamCacheKey]) {
        memoryCache[streamCacheKey] = await fetchIptvApi(streamAction);
    }
    hideLoader();

    cachedCategories = memoryCache[catCacheKey] && Array.isArray(memoryCache[catCacheKey]) ? memoryCache[catCacheKey] : [];
    cachedItems = memoryCache[streamCacheKey] && Array.isArray(memoryCache[streamCacheKey]) ? memoryCache[streamCacheKey] : [];

    renderCategoriesSidebar(cachedCategories);
    
    if (cachedCategories.length > 0) {
        selectCategory(cachedCategories[0].category_id, cachedCategories[0].category_name, isSeries ? 'series' : 'movie');
    }
}

async function loadLiveTvCategories() {
    showLoader("Carregando TV ao Vivo...");
    if (!memoryCache.liveCategories) {
        memoryCache.liveCategories = await fetchIptvApi('get_live_categories');
    }
    if (!memoryCache.liveStreams) {
        memoryCache.liveStreams = await fetchIptvApi('get_live_streams');
    }
    hideLoader();

    cachedCategories = memoryCache.liveCategories || [];
    cachedItems = memoryCache.liveStreams || [];

    renderCategoriesSidebar(cachedCategories);
    if (cachedCategories.length > 0) {
        selectCategory(cachedCategories[0].category_id, cachedCategories[0].category_name, 'live');
    }
}

function renderCategoriesSidebar(categories) {
    const listEl = document.getElementById('categories-list');
    listEl.innerHTML = '';

    categories.forEach((cat, index) => {
        const catName = cat.category_name || 'Geral';
        const count = cat.category_id === 'fav' ? favoritesList.length : cachedItems.filter(i => i.category_id == cat.category_id).length;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'cat-item focusable' + (index === 0 ? ' active' : '');
        itemDiv.tabIndex = 0;
        itemDiv.innerHTML = `<span>${catName}</span> <span class="cat-count">${count}</span>`;
        itemDiv.onclick = () => {
            document.querySelectorAll('.cat-item').forEach(i => i.classList.remove('active'));
            itemDiv.classList.add('active');
            if (cat.category_id === 'fav') {
                renderCatalogGrid(favoritesList, 'Meus Favoritos');
            } else {
                const type = currentTab === 'movies' ? 'movie' : (currentTab === 'series' ? 'series' : 'live');
                selectCategory(cat.category_id, catName, type);
            }
        };
        listEl.appendChild(itemDiv);
    });

    initSpatialFocus();
}

function selectCategory(catId, catName, type) {
    const filtered = cachedItems.filter(i => i.category_id == catId);
    renderCatalogGrid(filtered, catName, type);
}

function renderCatalogGrid(itemsList, title, type) {
    document.getElementById('catalog-category-title').innerText = title;
    document.getElementById('catalog-count').innerText = `${itemsList.length} itens`;

    const gridEl = document.getElementById('catalog-grid');
    gridEl.innerHTML = '';

    if (!itemsList || itemsList.length === 0) {
        gridEl.innerHTML = '<p style="color:#64748b; padding:20px;">Nenhum conteúdo nesta categoria.</p>';
        initSpatialFocus();
        return;
    }

    itemsList.forEach(item => {
        const card = document.createElement('div');
        card.className = 'media-card focusable';
        card.tabIndex = 0;

        const cover = item.stream_icon || item.cover || item.poster;
        if (cover) card.style.backgroundImage = `url('${cover}')`;

        const overlay = document.createElement('div');
        overlay.className = 'card-title-overlay';
        overlay.innerText = item.name || item.title;
        card.appendChild(overlay);

        if (type === 'live') {
            const liveUrl = `${currentCredentials.url.replace(/\/$/, '')}/live/${currentCredentials.user}/${currentCredentials.pass}/${item.stream_id}.ts`;
            card.onclick = () => prepareAndOpenPlayer(item.name, "TV ao Vivo", liveUrl, item.stream_id, 0, cover);
        } else {
            const mediaType = type || (item.stream_id ? 'movie' : 'series');
            card.onclick = () => openDetails(item, mediaType);
        }

        gridEl.appendChild(card);
    });

    initSpatialFocus();
}

async function openDetails(item, type) {
    currentMedia = { item, type };
    const title = item.name || item.title;
    const cover = item.stream_icon || item.cover || item.poster;
    const mediaId = String(item.stream_id || item.series_id || item.id);

    showLoader("Carregando detalhes...");
    let detailedInfo = item;
    if (type === 'movie' || item.stream_id) {
        const vodInfoData = await fetchIptvApi('get_vod_info', `&vod_id=${mediaId}`);
        if (vodInfoData && vodInfoData.info) {
            detailedInfo = { ...item, ...vodInfoData.info };
        }
    } else if (type === 'series' || item.series_id) {
        const seriesInfoData = await fetchIptvApi('get_series_info', `&series_id=${mediaId}`);
        if (seriesInfoData && seriesInfoData.info) {
            detailedInfo = { ...item, ...seriesInfoData.info };
        }
    }
    hideLoader();

    document.getElementById('details-title').innerText = detailedInfo.name || detailedInfo.title || title;
    document.getElementById('details-plot').innerText = detailedInfo.plot || detailedInfo.description || "Sinopse não disponível para este título.";
    document.getElementById('details-rating').innerText = `★ ${detailedInfo.rating || detailedInfo.kinopoisk_rating || '8.0'}`;
    document.getElementById('details-year').innerText = detailedInfo.year || detailedInfo.releasedate?.substring(0, 4) || '2026';
    document.getElementById('details-genre').innerText = detailedInfo.genre || 'Gênero';

    const bgCover = detailedInfo.backdrop_path?.[0] || cover;
    if (bgCover) {
        document.getElementById('details-backdrop').style.backgroundImage = `url('${bgCover}')`;
    }

    const isFav = favoritesList.some(f => (f.stream_id === item.stream_id && item.stream_id) || (f.series_id === item.series_id && item.series_id));
    const favBtn = document.getElementById('details-fav-btn');
    favBtn.innerText = isFav ? '♥ Favoritado' : '♡ Favoritar';
    favBtn.onclick = () => {
        toggleFavorite(item);
        const updatedFav = favoritesList.some(f => (f.stream_id === item.stream_id && item.stream_id) || (f.series_id === item.series_id && item.series_id));
        favBtn.innerText = updatedFav ? '♥ Favoritado' : '♡ Favoritar';
    };

    const seasonsContainer = document.getElementById('details-seasons-container');
    const episodesViewport = document.getElementById('episodes-viewport');

    if (type === 'series' || item.series_id) {
        seasonsContainer.style.display = 'block';
        episodesViewport.style.display = 'block';
        await loadSeriesInfo(mediaId, bgCover);
    } else {
        seasonsContainer.style.display = 'none';
        episodesViewport.style.display = 'none';
        
        const playUrl = `${currentCredentials.url.replace(/\/$/, '')}/movie/${currentCredentials.user}/${currentCredentials.pass}/${mediaId}.${item.container_extension || 'mp4'}`;
        const savedProg = await getSavedProgress(mediaId);
        
        const playBtn = document.getElementById('details-play-btn');
        playBtn.innerText = savedProg > 15 ? '▶ Continuar assistindo' : '▶ Assistir';
        
        playBtn.onclick = async () => {
            if (savedProg > 15) {
                pendingResumeData = { title, subtitle: "Filme", url: playUrl, mediaId: mediaId, start: savedProg, backdrop: bgCover };
                document.getElementById('resume-time-label').innerText = `Parou em ${formatTime(savedProg)}`;
                document.getElementById('resume-prompt-modal').style.display = 'flex';
                initSpatialFocus();
            } else {
                prepareAndOpenPlayer(title, "Filme", playUrl, mediaId, 0, bgCover);
            }
        };
    }

    switchScreen('details-screen');
}

function confirmResume(shouldResume) {
    document.getElementById('resume-prompt-modal').style.display = 'none';
    if (pendingResumeData) {
        const start = shouldResume ? pendingResumeData.start : 0;
        prepareAndOpenPlayer(pendingResumeData.title, pendingResumeData.subtitle, pendingResumeData.url, pendingResumeData.mediaId, start, pendingResumeData.backdrop);
        pendingResumeData = null;
    }
}

function goBackToMain() {
    switchScreen('main-app-screen');
    if (currentTab === 'home') {
        document.getElementById('view-home').style.display = 'block';
        document.getElementById('view-catalog').style.display = 'none';
        loadHomeData();
    } else {
        document.getElementById('view-home').style.display = 'none';
        document.getElementById('view-catalog').style.display = 'flex';
    }
    initSpatialFocus();
}

async function loadSeriesInfo(seriesId, seriesCover) {
    showLoader("Carregando episódios...");
    const data = await fetchIptvApi('get_series_info', `&series_id=${seriesId}`);
    hideLoader();

    if (!data || !data.episodes) return;

    const episodesObj = data.episodes;
    const seasonsTabs = document.getElementById('seasons-tabs');
    seasonsTabs.innerHTML = '';

    const seasons = Object.keys(episodesObj);
    seasons.forEach((seasonNum, index) => {
        const tab = document.createElement('button');
        tab.className = 'focusable season-tab' + (index === 0 ? ' active' : '');
        tab.innerText = `Temporada ${seasonNum}`;
        tab.onclick = () => {
            document.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderEpisodesGrid(episodesObj[seasonNum], seriesCover);
        };
        seasonsTabs.appendChild(tab);
    });

    if (seasons.length > 0) {
        renderEpisodesGrid(episodesObj[seasons[0]], seriesCover);
    }
}

function renderEpisodesGrid(episodesList, seriesCover) {
    currentSeriesEpisodes = episodesList;
    const slider = document.getElementById('slider-episodes');
    slider.innerHTML = '';

    episodesList.forEach((ep, idx) => {
        const card = document.createElement('div');
        card.className = 'media-card focusable';
        card.tabIndex = 0;

        const cover = ep.cover_big || ep.info?.movie_image || seriesCover;
        if (cover) {
            card.style.backgroundImage = `url('${cover}')`;
        }

        const overlay = document.createElement('div');
        overlay.className = 'card-title-overlay';
        overlay.innerText = `T${ep.season} E${ep.episode_num}: ${ep.title}`;
        card.appendChild(overlay);

        const epId = String(ep.id);
        const playUrl = `${currentCredentials.url.replace(/\/$/, '')}/series/${currentCredentials.user}/${currentCredentials.pass}/${epId}.${ep.container_extension || 'mp4'}`;
        card.onclick = async () => {
            currentEpisodeIndex = idx;
            const savedProg = await getSavedProgress(epId);
            if (savedProg > 15) {
                pendingResumeData = { title: ep.title, subtitle: `T${ep.season} E${ep.episode_num}`, url: playUrl, mediaId: epId, start: savedProg, backdrop: cover };
                document.getElementById('resume-time-label').innerText = `Parou em ${formatTime(savedProg)}`;
                document.getElementById('resume-prompt-modal').style.display = 'flex';
                initSpatialFocus();
            } else {
                prepareAndOpenPlayer(ep.title, `T${ep.season} E${ep.episode_num}`, playUrl, epId, 0, cover);
            }
        };

        slider.appendChild(card);
    });

    initSpatialFocus();
}

function toggleFavorite(item) {
    const index = favoritesList.findIndex(f => (f.stream_id === item.stream_id && item.stream_id) || (f.series_id === item.series_id && item.series_id));
    if (index >= 0) {
        favoritesList.splice(index, 1);
    } else {
        favoritesList.push(item);
    }
    localStorage.setItem('iptv_favorites', JSON.stringify(favoritesList));
}

let videoElement = null;
let saveProgressInterval = null;
let controlsTimeout = null;
let currentMediaId = null;
let currentMediaBackdrop = '';
let currentMediaTitle = '';
let currentMediaSubtitle = '';
let currentMediaStreamUrl = '';

function prepareAndOpenPlayer(title, subtitle, url, mediaId, startSeconds = 0, backdrop = '') {
    currentMediaId = String(mediaId);
    currentMediaBackdrop = backdrop;
    currentMediaTitle = title;
    currentMediaSubtitle = subtitle;
    currentMediaStreamUrl = url;
    openPlayer(title, subtitle, url, startSeconds, backdrop);
}

function openPlayer(title, subtitle, url, startSeconds = 0, backdrop = '') {
    document.getElementById('player-title').innerText = `${title} • ${subtitle}`;
    
    const nextEpBtn = document.getElementById('player-next-ep-btn');
    if (currentSeriesEpisodes.length > 0 && currentEpisodeIndex < currentSeriesEpisodes.length - 1) {
        nextEpBtn.style.display = 'block';
    } else {
        nextEpBtn.style.display = 'none';
    }

    switchScreen('player-screen');

    videoElement = document.getElementById('video-player');
    if (hlsInstance) hlsInstance.destroy();

    if (Hls.isSupported() && url.includes('.m3u8')) {
        hlsInstance = new Hls();
        hlsInstance.loadSource(url);
        hlsInstance.attachMedia(videoElement);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            if (startSeconds > 0) videoElement.currentTime = startSeconds;
            videoElement.play();
        });
    } else {
        videoElement.src = url;
        videoElement.onloadedmetadata = () => {
            if (startSeconds > 0) videoElement.currentTime = startSeconds;
            videoElement.play();
        };
    }

    if (saveProgressInterval) clearInterval(saveProgressInterval);
    saveProgressInterval = setInterval(() => {
        if (videoElement && videoElement.currentTime > 5 && videoElement.duration > 0) {
            saveProgressLocallyAndRemote(currentMediaId, currentMediaTitle, currentMediaSubtitle, currentMediaStreamUrl, currentMediaBackdrop, videoElement.currentTime, videoElement.duration);
        }
    }, 5000);

    videoElement.ontimeupdate = () => {
        if (videoElement.duration) {
            const current = videoElement.currentTime;
            const duration = videoElement.duration;
            const pct = (current / duration) * 100;
            document.getElementById('player-progress-bar').style.width = pct + '%';
            document.getElementById('player-current-time').innerText = formatTime(current);
            document.getElementById('player-total-time').innerText = formatTime(duration);

            const remaining = duration - current;
            if (remaining <= 20 && remaining > 18 && currentSeriesEpisodes.length > 0 && currentEpisodeIndex !== -1 && currentEpisodeIndex < currentSeriesEpisodes.length - 1) {
                showNextEpisodeToast();
            }
        }
    };
}

function showNextEpisodeToast() {
    const toast = document.getElementById('next-episode-toast');
    if (toast.style.display === 'flex') return;

    let countdown = 15;
    document.getElementById('next-ep-title-label').innerText = `Próximo episódio em ${countdown}s`;
    toast.style.display = 'flex';

    const btnNow = document.getElementById('btn-next-ep-now');
    const elements = getFocusableElements();
    elements.forEach(el => el.classList.remove('spatial-focused'));
    btnNow.classList.add('spatial-focused');
    btnNow.focus();

    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            document.getElementById('next-ep-title-label').innerText = `Próximo episódio em ${countdown}s`;
        } else {
            clearInterval(countdownInterval);
            toast.style.display = 'none';
            playNextEpisodeNow();
        }
    }, 1000);
}

function cancelNextEpisode() {
    if (countdownInterval) clearInterval(countdownInterval);
    document.getElementById('next-episode-toast').style.display = 'none';
    showPlayerControls();
}

function playNextEpisodeNow() {
    cancelNextEpisode();
    if (currentSeriesEpisodes.length > 0 && currentEpisodeIndex < currentSeriesEpisodes.length - 1) {
        currentEpisodeIndex++;
        const nextEp = currentSeriesEpisodes[currentEpisodeIndex];
        const nextId = String(nextEp.id);
        const playUrl = `${currentCredentials.url.replace(/\/$/, '')}/series/${currentCredentials.user}/${currentCredentials.pass}/${nextId}.${nextEp.container_extension || 'mp4'}`;
        prepareAndOpenPlayer(nextEp.title, `T${nextEp.season} E${nextEp.episode_num}`, playUrl, nextId, 0, currentMediaBackdrop);
    }
}

function showPlayerControls() {
    const overlay = document.getElementById('player-overlay');
    overlay.classList.add('visible');
    
    const progressBar = document.getElementById('player-progress-bar-container');
    const elements = getFocusableElements();
    elements.forEach(el => el.classList.remove('spatial-focused'));
    progressBar.classList.add('spatial-focused');
    progressBar.focus();

    if (controlsTimeout) clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
        if (!videoElement.paused && document.getElementById('track-selector-modal').style.display === 'none' && document.getElementById('next-episode-toast').style.display !== 'flex') {
            overlay.classList.remove('visible');
            initSpatialFocus();
        }
    }, 6000);
}

function togglePlayPause() {
    if (!videoElement) return;
    if (videoElement.paused) {
        videoElement.play();
    } else {
        videoElement.pause();
    }
    showPlayerControls();
}

function skipTime(seconds) {
    if (!videoElement) return;
    videoElement.currentTime = Math.max(0, Math.min(videoElement.duration, videoElement.currentTime + seconds));
    showPlayerControls();
}

function openSettingsModal() {
    const modal = document.getElementById('track-selector-modal');
    const container = document.getElementById('modal-track-options');
    container.innerHTML = '';

    const offSubBtn = document.createElement('button');
    offSubBtn.className = 'focusable track-option-btn';
    offSubBtn.innerText = "❌ Desativar Legendas";
    offSubBtn.onclick = () => {
        if (hlsInstance) hlsInstance.subtitleTrack = -1;
        alert("Legendas desativadas.");
        closeTrackModal();
    };
    container.appendChild(offSubBtn);

    const ptSubBtn = document.createElement('button');
    ptSubBtn.className = 'focusable track-option-btn';
    ptSubBtn.innerText = "🇧🇷 Português";
    ptSubBtn.onclick = () => {
        if (hlsInstance && hlsInstance.subtitleTracks && hlsInstance.subtitleTracks.length > 0) {
            hlsInstance.subtitleTrack = 0;
            alert("Legenda PT-BR ativada.");
        } else {
            alert("Legenda PT-BR aplicada (servidor).");
        }
        closeTrackModal();
    };
    container.appendChild(ptSubBtn);

    const enSubBtn = document.createElement('button');
    enSubBtn.className = 'focusable track-option-btn';
    enSubBtn.innerText = "🇺🇸 English";
    enSubBtn.onclick = () => {
        alert("English subtitles enabled.");
        closeTrackModal();
    };
    container.appendChild(enSubBtn);

    const esSubBtn = document.createElement('button');
    esSubBtn.className = 'focusable track-option-btn';
    esSubBtn.innerText = "🇪🇸 Español";
    esSubBtn.onclick = () => {
        alert("Subtítulos en Español habilitados.");
        closeTrackModal();
    };
    container.appendChild(esSubBtn);

    const audioBtn = document.createElement('button');
    audioBtn.className = 'focusable track-option-btn';
    audioBtn.innerText = "🔊 Áudio Original / Estéreo";
    audioBtn.onclick = () => {
        if (hlsInstance && hlsInstance.audioTracks && hlsInstance.audioTracks.length > 0) {
            hlsInstance.audioTrack = 0;
            alert("Áudio alternado.");
        } else {
            alert("Áudio padrão ativo.");
        }
        closeTrackModal();
    };
    container.appendChild(audioBtn);

    modal.style.display = 'flex';
    initSpatialFocus();
}

function closeTrackModal() {
    document.getElementById('track-selector-modal').style.display = 'none';
    showPlayerControls();
}

function saveProgressLocallyAndRemote(mediaId, title, subtitle, url, backdrop, current, duration) {
    if (!currentCredentials || !mediaId) return;
    const storageKey = `aura_progress_${currentCredentials.user}`;
    let allProgress = JSON.parse(localStorage.getItem(storageKey) || '{}');
    
    allProgress[mediaId] = {
        media_id: mediaId,
        title,
        subtitle,
        url,
        backdrop,
        progress_seconds: current,
        duration_seconds: duration,
        updated_at: new Date().toISOString()
    };
    
    localStorage.setItem(storageKey, JSON.stringify(allProgress));

    supabaseClient.from('user_progress').upsert({
        user_id: currentCredentials.user,
        media_id: mediaId,
        title,
        subtitle,
        url,
        backdrop,
        progress_seconds: current,
        duration_seconds: duration,
        updated_at: new Date()
    }, { onConflict: 'user_id,media_id' }).then(() => {});
}

async function getSavedProgress(mediaId) {
    if (!currentCredentials || !mediaId) return 0;
    const storageKey = `aura_progress_${currentCredentials.user}`;
    let allProgress = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (allProgress[mediaId]) {
        return allProgress[mediaId].progress_seconds;
    }

    try {
        const { data } = await supabaseClient
            .from('user_progress')
            .select('progress_seconds')
            .eq('user_id', currentCredentials.user)
            .eq('media_id', String(mediaId))
            .single();
        return data ? data.progress_seconds : 0;
    } catch(e) {
        return 0;
    }
}

async function loadContinueWatching() {
    if (!currentCredentials) return;
    const storageKey = `aura_progress_${currentCredentials.user}`;
    let allProgress = JSON.parse(localStorage.getItem(storageKey) || '{}');
    
    let items = Object.values(allProgress).filter(i => i.progress_seconds > 10);

    try {
        const { data } = await supabaseClient
            .from('user_progress')
            .select('*')
            .eq('user_id', currentCredentials.user)
            .order('updated_at', { ascending: false });
        
        if (data && data.length > 0) {
            data.forEach(d => {
                if (d.progress_seconds > 10) {
                    allProgress[d.media_id] = d;
                }
            });
            localStorage.setItem(storageKey, JSON.stringify(allProgress));
            items = Object.values(allProgress).filter(i => i.progress_seconds > 10);
        }
    } catch(e) {}

    items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    const slider = document.getElementById('slider-continue');
    slider.innerHTML = '';

    if (items.length > 0) {
        document.getElementById('row-continue-container').style.display = 'block';
        renderSliderCards(items, slider, 'movie', true);
    } else {
        document.getElementById('row-continue-container').style.display = 'none';
    }
}

async function removeProgressItem(mediaId) {
    if (!currentCredentials) return;
    const storageKey = `aura_progress_${currentCredentials.user}`;
    let allProgress = JSON.parse(localStorage.getItem(storageKey) || '{}');
    delete allProgress[mediaId];
    localStorage.setItem(storageKey, JSON.stringify(allProgress));

    await supabaseClient
        .from('user_progress')
        .delete()
        .eq('user_id', currentCredentials.user)
        .eq('media_id', String(mediaId));
    loadContinueWatching();
}

function closePlayer() {
    if (saveProgressInterval) clearInterval(saveProgressInterval);
    if (controlsTimeout) clearTimeout(controlsTimeout);
    if (countdownInterval) clearInterval(countdownInterval);
    document.getElementById('next-episode-toast').style.display = 'none';
    document.getElementById('player-overlay').classList.remove('visible');

    if (videoElement && videoElement.currentTime > 5 && videoElement.duration > 0) {
        saveProgressLocallyAndRemote(currentMediaId, currentMediaTitle, currentMediaSubtitle, currentMediaStreamUrl, currentMediaBackdrop, videoElement.currentTime, videoElement.duration);
    }
    if (videoElement) {
        videoElement.pause();
        videoElement.src = '';
    }
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    goBackToMain();
    loadContinueWatching();
}

function handleGlobalSearch(query) {
    if (!query || query.trim() === '') return;
    const q = query.toLowerCase();
    const allItems = [...(memoryCache.vod || []), ...(memoryCache.series || [])];
    const filtered = allItems.filter(i => i.name && i.name.toLowerCase().includes(q));
    renderCatalogGrid(filtered, `Pesquisa: "${query}"`, 'movie');
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

window.addEventListener('DOMContentLoaded', async () => {
    pushHistoryState();
    const saved = localStorage.getItem('iptv_credentials');
    if (saved) {
        currentCredentials = JSON.parse(saved);
        document.getElementById('iptv-url').value = currentCredentials.url;
        document.getElementById('iptv-user').value = currentCredentials.user;
        document.getElementById('iptv-pass').value = currentCredentials.pass;

        showLoader("Conectando ao servidor...");
        const data = await fetchIptvApi('');
        hideLoader();

        if (data && data.user_info) {
            setupUserSession(data.user_info);
            switchScreen('main-app-screen');
            loadHomeData();
        } else {
            switchScreen('login-screen');
        }
    } else {
        switchScreen('login-screen');
    }
});

// Abertura dinâmica e real das legendas sincronizadas com o Player
function openSettingsModal() {
    const modal = document.getElementById('track-selector-modal');
    const container = document.getElementById('modal-track-options');
    container.innerHTML = '';

    // Opção para desativar legendas
    const offSubBtn = document.createElement('button');
    offSubBtn.className = 'focusable track-option-btn';
    offSubBtn.innerText = "❌ Desativar Legendas";
    offSubBtn.onclick = () => {
        if (hlsInstance) {
            hlsInstance.subtitleTrack = -1;
        } else if (videoElement) {
            for (let i = 0; i < videoElement.textTracks.length; i++) {
                videoElement.textTracks[i].mode = 'hidden';
            }
        }
        alert("Legendas desativadas.");
        closeTrackModal();
    };
    container.appendChild(offSubBtn);

    // Verifica se existem legendas disponíveis no HLS ou no vídeo
    let subTracks = [];
    if (hlsInstance && hlsInstance.subtitleTracks) {
        subTracks = hlsInstance.subtitleTracks;
    }

    if (subTracks.length > 0) {
        subTracks.forEach((sub, idx) => {
            const subBtn = document.createElement('button');
            subBtn.className = 'focusable track-option-btn';
            subBtn.innerText = `💬 ${sub.name || 'Legenda ' + (idx + 1)}`;
            subBtn.onclick = () => {
                hlsInstance.subtitleTrack = idx;
                alert(`Legenda ${sub.name || (idx + 1)} ativada.`);
                closeTrackModal();
            };
            container.appendChild(subBtn);
        });
    } else {
        // Fallback inteligente para idiomas padrões caso o stream suporte faixas embutidas
        const languages = [
            { label: "🇧🇷 Português", lang: "pt" },
            { label: "🇺🇸 English", lang: "en" },
            { label: "🇪🇸 Español", lang: "es" }
        ];

        languages.forEach(l => {
            const btn = document.createElement('button');
            btn.className = 'focusable track-option-btn';
            btn.innerText = l.label;
            btn.onclick = () => {
                if (videoElement && videoElement.textTracks.length > 0) {
                    let found = false;
                    for (let i = 0; i < videoElement.textTracks.length; i++) {
                        if (videoElement.textTracks[i].language.includes(l.lang)) {
                            videoElement.textTracks[i].mode = 'showing';
                            found = true;
                        } else {
                            videoElement.textTracks[i].mode = 'hidden';
                        }
                    }
                    if (found) {
                        alert(`Legenda ${l.label} sincronizada.`);
                    } else {
                        alert(`Faixa de legenda ${l.label} não encontrada neste arquivo de vídeo.`);
                    }
                } else {
                    alert(`Nenhuma legenda embutida ativa suportada pelo servidor para ${l.label}.`);
                }
                closeTrackModal();
            };
            container.appendChild(btn);
        });
    }

    // Configuração de Áudio
    const audioBtn = document.createElement('button');
    audioBtn.className = 'focusable track-option-btn';
    audioBtn.innerText = "🔊 Áudio Principal / Estéreo";
    audioBtn.onclick = () => {
        if (hlsInstance && hlsInstance.audioTracks && hlsInstance.audioTracks.length > 0) {
            hlsInstance.audioTrack = 0;
            alert("Áudio alternado.");
        } else {
            alert("Áudio padrão ativo.");
        }
        closeTrackModal();
    };
    container.appendChild(audioBtn);

    modal.style.display = 'flex';
    initSpatialFocus();
}