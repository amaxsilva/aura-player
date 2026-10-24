// CONFIGURAÇÃO DO SUPABASE (Insere aqui os teus dados copiados do painel)
const SUPABASE_URL = 'https://bnflihuudcqjehhoxjcg.supabase.co';
const SUPABASE_KEY = '';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentCredentials = null;
let hlsInstance = null;
let currentTab = 'home';
let favoritesList = JSON.parse(localStorage.getItem('iptv_favorites') || '[]');
let currentMedia = null;

let focusableElements = [];
let currentFocusIndex = 0;

// CACHE EM MEMÓRIA PARA EVITAR RECARREGAMENTOS LENTOS
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
    const trailerActive = document.getElementById('trailer-modal').style.display !== 'none';

    if (trailerActive) {
        closeTrailerModal();
        return;
    }

    if (modalActive) {
        closeTrackModal();
        return;
    }

    if (playerActive) {
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
    initFocusableElements();
}

function initFocusableElements() {
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return;
    
    const trailerActive = document.getElementById('trailer-modal').style.display !== 'none';
    const modalActive = document.getElementById('track-selector-modal').style.display !== 'none';

    if (trailerActive) {
        focusableElements = Array.from(document.getElementById('trailer-modal').querySelectorAll('.focusable, button'));
    } else if (modalActive) {
        focusableElements = Array.from(document.getElementById('track-selector-modal').querySelectorAll('.focusable, button'));
    } else if (document.getElementById('player-screen').classList.contains('active')) {
        const overlay = document.getElementById('player-overlay');
        if (overlay.classList.contains('visible')) {
            focusableElements = Array.from(overlay.querySelectorAll('.focusable, button'));
        } else {
            focusableElements = [];
        }
    } else {
        focusableElements = Array.from(activeScreen.querySelectorAll('.focusable, input, button, .media-card, .cat-item, .season-tab'));
    }

    if (focusableElements.length > 0) {
        if (currentFocusIndex >= focusableElements.length) {
            currentFocusIndex = 0;
        }
        focusableElements[currentFocusIndex].focus();
    }
}

// GESTÃO DE TECLADO E D-PAD CORRIGIDA
window.addEventListener('keydown', (e) => {
    pushHistoryState();

    if (e.key === 'Escape' || e.keyCode === 10009 || e.keyCode === 27 || e.keyCode === 8 || e.keyCode === 461 || e.key === 'Back') {
        handlePhysicalBackButton();
        e.preventDefault();
        e.stopPropagation();
        return;
    }

    const playerActive = document.getElementById('player-screen').classList.contains('active');
    const detailsActive = document.getElementById('details-screen').classList.contains('active');
    const catalogActive = document.getElementById('view-catalog').style.display !== 'none';

    if (e.key === 'Enter' || e.keyCode === 13) {
        if (playerActive && document.getElementById('track-selector-modal').style.display === 'none') {
            const activeEl = document.activeElement;
            if (activeEl && activeEl.classList.contains('player-btn-minimal')) {
                activeEl.click();
            } else {
                togglePlayPause();
            }
            e.preventDefault();
            return;
        }
        const activeEl = document.activeElement;
        if (activeEl && activeEl !== document.body) {
            activeEl.click();
            e.preventDefault();
            return;
        }
    }

    if (playerActive && document.getElementById('track-selector-modal').style.display === 'none') {
        if (e.key === 'ArrowRight' || e.keyCode === 39) {
            skipTime(10);
            showPlayerControls();
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowLeft' || e.keyCode === 37) {
            skipTime(-10);
            showPlayerControls();
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowUp' || e.keyCode === 38 || e.key === 'ArrowDown' || e.keyCode === 40) {
            showPlayerControls();
            e.preventDefault();
            return;
        }
    }

    if (focusableElements.length === 0) return;

    const activeEl = document.activeElement;
    const isNavbar = activeEl && activeEl.classList.contains('nav-btn');

    // Se estiver na Navbar e carregar para baixo, vai para o Hero ou menu lateral
    if (isNavbar && (e.key === 'ArrowDown' || e.keyCode === 40)) {
        if (catalogActive) {
            const firstCat = document.querySelector('.cat-item');
            if (firstCat) {
                currentFocusIndex = focusableElements.indexOf(firstCat);
                if (currentFocusIndex !== -1) focusableElements[currentFocusIndex].focus();
            }
        } else {
            const watchBtn = document.getElementById('hero-watch-btn');
            if (watchBtn) {
                currentFocusIndex = focusableElements.indexOf(watchBtn);
                if (currentFocusIndex !== -1) focusableElements[currentFocusIndex].focus();
            }
        }
        e.preventDefault();
        return;
    }

    // Navegação vertical entre sliders na Home ou catálogo
    if (e.key === 'ArrowDown' || e.keyCode === 40) {
        // Encontra o próximo elemento na vertical (salto por linha ou índice lógico)
        currentFocusIndex = Math.min(currentFocusIndex + 1, focusableElements.length - 1);
        focusableElements[currentFocusIndex].focus();
        scrollIntoViewIfNeeded(focusableElements[currentFocusIndex]);
        e.preventDefault();
        return;
    } else if (e.key === 'ArrowUp' || e.keyCode === 38) {
        currentFocusIndex = Math.max(currentFocusIndex - 1, 0);
        focusableElements[currentFocusIndex].focus();
        scrollIntoViewIfNeeded(focusableElements[currentFocusIndex]);
        e.preventDefault();
        return;
    }

    if (e.key === 'ArrowRight' || e.keyCode === 39) {
        currentFocusIndex = (currentFocusIndex + 1) % focusableElements.length;
        focusableElements[currentFocusIndex].focus();
        scrollIntoViewIfNeeded(focusableElements[currentFocusIndex]);
        e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.keyCode === 37) {
        currentFocusIndex = (currentFocusIndex - 1 + focusableElements.length) % focusableElements.length;
        focusableElements[currentFocusIndex].focus();
        scrollIntoViewIfNeeded(focusableElements[currentFocusIndex]);
        e.preventDefault();
    }
});

function scrollIntoViewIfNeeded(element) {
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

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

// LOGIN
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

// ATIVAR CAMPO DE PESQUISA COM OK
function activateSearchInput(input) {
    input.removeAttribute('readonly');
    input.focus();
}

// CARREGAMENTO DA HOME COM CACHE E SLIDE HERO
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
        card.className = 'media-card focusable';
        card.tabIndex = 0;

        const cover = item.stream_icon || item.cover || item.poster || item.backdrop;
        if (cover) {
            card.style.backgroundImage = `url('${cover}')`;
        }

        const overlay = document.createElement('div');
        overlay.className = 'card-title-overlay';
        overlay.innerText = item.name || item.title;
        card.appendChild(overlay);

        if (isContinue) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'focusable card-remove-btn';
            removeBtn.innerText = '✕';
            removeBtn.title = 'Remover da lista';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                removeProgressItem(item.media_id);
            };
            card.appendChild(removeBtn);
        }

        card.onclick = () => {
            if (isContinue) {
                openPlayer(item.title, item.subtitle || 'Continuar', item.media_id, item.progress_seconds, item.backdrop);
            } else {
                openDetails(item, type);
            }
        };
        container.appendChild(card);
    });

    initFocusableElements();
}

function setupHeroBanner(item, type) {
    document.getElementById('hero-title').innerText = item.name || item.title;
    document.getElementById('hero-description').innerText = item.plot || "Disponível no seu plano • Destaque Aura";
    const cover = item.stream_icon || item.cover || item.poster;
    if (cover) {
        document.getElementById('hero-banner').style.backgroundImage = `url('${cover}')`;
    }
    document.getElementById('hero-watch-btn').onclick = () => openDetails(item, type);
    document.getElementById('hero-info-btn').onclick = () => openDetails(item, type);
}

function openHeroTrailer() {
    const currentItem = heroSlides[currentHeroIndex];
    if (currentItem) {
        openTrailerModal(currentItem.name || currentItem.title);
    }
}

function openDetailTrailer() {
    if (currentMedia && currentMedia.item) {
        openTrailerModal(currentMedia.item.name || currentMedia.item.title);
    }
}

function openTrailerModal(queryTitle) {
    const modal = document.getElementById('trailer-modal');
    const iframe = document.getElementById('trailer-iframe');
    document.getElementById('trailer-title').innerText = `Trailer: ${queryTitle}`;
    iframe.src = `https://www.youtube.com/embed?autoplay=1&search_query=${encodeURIComponent(queryTitle + ' trailer oficial')}`;
    modal.style.display = 'flex';
    initFocusableElements();
}

function closeTrailerModal() {
    document.getElementById('trailer-modal').style.display = 'none';
    document.getElementById('trailer-iframe').src = '';
    initFocusableElements();
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

    initFocusableElements();
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
        initFocusableElements();
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
            card.onclick = () => openPlayer(item.name, "TV ao Vivo", liveUrl, 0, cover);
        } else {
            const mediaType = type || (item.stream_id ? 'movie' : 'series');
            card.onclick = () => openDetails(item, mediaType);
        }

        gridEl.appendChild(card);
    });

    initFocusableElements();
}

async function openDetails(item, type) {
    currentMedia = { item, type };
    const title = item.name || item.title;
    const cover = item.stream_icon || item.cover || item.poster;

    document.getElementById('details-title').innerText = title;
    document.getElementById('details-plot').innerText = item.plot || "Sinopse não disponível para este título.";
    document.getElementById('details-rating').innerText = `★ ${item.rating || '8.0'}`;
    document.getElementById('details-year').innerText = item.year || '2026';
    
    if (cover) {
        document.getElementById('details-backdrop').style.backgroundImage = `url('${cover}')`;
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
        await loadSeriesInfo(item.series_id || item.id, cover);
    } else {
        seasonsContainer.style.display = 'none';
        episodesViewport.style.display = 'none';
        
        const savedProg = await getSavedProgress(item.stream_id);
        const playBtn = document.getElementById('details-play-btn');
        playBtn.innerText = savedProg > 5 ? '▶ Continuar assistindo' : '▶ Assistir';
        
        playBtn.onclick = () => {
            const playUrl = `${currentCredentials.url.replace(/\/$/, '')}/movie/${currentCredentials.user}/${currentCredentials.pass}/${item.stream_id}.${item.container_extension || 'mp4'}`;
            openPlayer(title, "Filme", playUrl, savedProg, cover);
        };
    }

    switchScreen('details-screen');
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
    initFocusableElements();
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
    const slider = document.getElementById('slider-episodes');
    slider.innerHTML = '';

    episodesList.forEach(ep => {
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

        const playUrl = `${currentCredentials.url.replace(/\/$/, '')}/series/${currentCredentials.user}/${currentCredentials.pass}/${ep.id}.${ep.container_extension || 'mp4'}`;
        card.onclick = () => openPlayer(ep.title, `T${ep.season} E${ep.episode_num}`, playUrl, 0, cover);

        slider.appendChild(card);
    });

    initFocusableElements();
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

// PLAYER DE VÍDEO
let videoElement = null;
let saveProgressInterval = null;
let controlsTimeout = null;

function openPlayer(title, subtitle, url, startSeconds = 0, backdrop = '') {
    document.getElementById('player-title').innerText = `${title} • ${subtitle}`;
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
        if (videoElement && videoElement.currentTime > 0 && videoElement.duration > 0) {
            saveProgressToSupabase(url, title, subtitle, backdrop, videoElement.currentTime, videoElement.duration);
        }
    }, 5000);

    videoElement.ontimeupdate = () => {
        if (videoElement.duration) {
            const pct = (videoElement.currentTime / videoElement.duration) * 100;
            document.getElementById('player-progress-bar').style.width = pct + '%';
            document.getElementById('player-current-time').innerText = formatTime(videoElement.currentTime);
            document.getElementById('player-total-time').innerText = formatTime(videoElement.duration);
        }
    };

    showPlayerControls();
}

function showPlayerControls() {
    const overlay = document.getElementById('player-overlay');
    overlay.classList.add('visible');
    initFocusableElements();

    if (controlsTimeout) clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
        if (!document.getElementById('video-player').paused && document.getElementById('track-selector-modal').style.display === 'none') {
            overlay.classList.remove('visible');
            initFocusableElements();
        }
    }, 5000);
}

function togglePlayPause() {
    if (!videoElement) return;
    const btn = document.getElementById('player-play-pause-btn');
    if (videoElement.paused) {
        videoElement.play();
        btn.innerText = '⏸ Pausar';
        showPlayerControls();
    } else {
        videoElement.pause();
        btn.innerText = '▶ Reproduzir';
        showPlayerControls();
    }
}

function skipTime(seconds) {
    if (!videoElement) return;
    videoElement.currentTime = Math.max(0, Math.min(videoElement.duration, videoElement.currentTime + seconds));
    showPlayerControls();
}

function openAudioModal() {
    const modal = document.getElementById('track-selector-modal');
    const title = document.getElementById('modal-track-title');
    const container = document.getElementById('modal-track-options');

    title.innerText = "Selecionar Áudio";
    container.innerHTML = '';

    if (hlsInstance && hlsInstance.audioTracks && hlsInstance.audioTracks.length > 0) {
        hlsInstance.audioTracks.forEach((track, index) => {
            const btn = document.createElement('button');
            btn.className = 'focusable track-option-btn';
            btn.innerText = track.name || `Áudio ${index + 1}`;
            btn.onclick = () => {
                hlsInstance.audioTrack = index;
                closeTrackModal();
            };
            container.appendChild(btn);
        });
    } else {
        const btn = document.createElement('button');
        btn.className = 'focusable track-option-btn';
        btn.innerText = "Áudio Padrão (Estéreo)";
        btn.onclick = () => closeTrackModal();
        container.appendChild(btn);
    }

    modal.style.display = 'flex';
    initFocusableElements();
}

function openSubModal() {
    const modal = document.getElementById('track-selector-modal');
    const title = document.getElementById('modal-track-title');
    const container = document.getElementById('modal-track-options');

    title.innerText = "Selecionar Legenda (PT-BR)";
    container.innerHTML = '';

    const offBtn = document.createElement('button');
    offBtn.className = 'focusable track-option-btn';
    offBtn.innerText = "❌ Desativar Legendas";
    offBtn.onclick = () => {
        if (hlsInstance) hlsInstance.subtitleTrack = -1;
        closeTrackModal();
    };
    container.appendChild(offBtn);

    const ptBtn = document.createElement('button');
    ptBtn.className = 'focusable track-option-btn';
    ptBtn.innerText = "🇧🇷 Português (Brasil)";
    ptBtn.onclick = () => {
        if (hlsInstance && hlsInstance.subtitleTracks.length > 0) {
            hlsInstance.subtitleTrack = 0;
        }
        alert("Legenda em Português ativada.");
        closeTrackModal();
    };
    container.appendChild(ptBtn);

    modal.style.display = 'flex';
    initFocusableElements();
}

function closeTrackModal() {
    document.getElementById('track-selector-modal').style.display = 'none';
    showPlayerControls();
}

async function saveProgressToSupabase(mediaId, title, subtitle, backdrop, current, duration) {
    if (!currentCredentials) return;
    await supabaseClient.from('user_progress').upsert({
        user_id: currentCredentials.user,
        media_id: mediaId,
        title,
        subtitle,
        backdrop,
        progress_seconds: current,
        duration_seconds: duration,
        updated_at: new Date()
    }, { onConflict: 'user_id,media_id' });
}

async function getSavedProgress(mediaId) {
    if (!currentCredentials) return 0;
    const { data } = await supabaseClient
        .from('user_progress')
        .select('progress_seconds')
        .eq('user_id', currentCredentials.user)
        .eq('media_id', mediaId)
        .single();
    return data ? data.progress_seconds : 0;
}

async function loadContinueWatching() {
    if (!currentCredentials) return;
    const { data } = await supabaseClient
        .from('user_progress')
        .select('*')
        .eq('user_id', currentCredentials.user)
        .order('updated_at', { ascending: false });

    const slider = document.getElementById('slider-continue');
    slider.innerHTML = '';

    if (data && data.length > 0) {
        document.getElementById('row-continue-container').style.display = 'block';
        renderSliderCards(data, slider, 'movie', true);
    } else {
        document.getElementById('row-continue-container').style.display = 'none';
    }
}

async function removeProgressItem(mediaId) {
    if (!currentCredentials) return;
    await supabaseClient
        .from('user_progress')
        .delete()
        .eq('user_id', currentCredentials.user)
        .eq('media_id', mediaId);
    loadContinueWatching();
}

function closePlayer() {
    if (saveProgressInterval) clearInterval(saveProgressInterval);
    if (controlsTimeout) clearTimeout(controlsTimeout);
    if (videoElement && videoElement.currentTime > 0 && videoElement.duration > 0) {
        saveProgressToSupabase(currentMedia?.item?.stream_id || 'url', document.getElementById('player-title').innerText, '', '', videoElement.currentTime, videoElement.duration);
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
    switchTab('movies');
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