/**
 * M3U Playlist Parser Profissional para Smart TVs (Samsung Tizen e LG webOS)
 * Classificador inteligente de mídia: separa rigorosamente e com precisão cirúrgica:
 * - CANAIS AO VIVO (Live TV)
 * - FILMES (VOD Movies)
 * - SÉRIES (Series com temporadas/episódios)
 */

const TVStorage = {
  dbPromise: null,
  getDB() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      try {
        const req = indexedDB.open('VionPlayerDB', 2);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('cache')) {
            db.createObjectStore('cache');
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
    return this.dbPromise;
  },

  async set(key, value) {
    // 1. IndexedDB EM PRIMEIRO LUGAR (armazenamento nativo Chromium em disco, sem limite de 5MB e sem crash no JNI)
    try {
      const db = await this.getDB();
      if (db) {
        const saved = await new Promise((resolve) => {
          try {
            const tx = db.transaction('cache', 'readwrite');
            const store = tx.objectStore('cache');
            store.put(value, key);
            tx.oncomplete = () => {
              localStorage.setItem('vion_has_playlist', 'true');
              resolve(true);
            };
            tx.onerror = () => resolve(false);
          } catch (e) {
            resolve(false);
          }
        });
        if (saved) return true;
      }
    } catch (e) {
      console.warn('IndexedDB set warning:', e);
    }

    // 2. Android Bridge APENAS para chaves pequenas (< 500KB) - NUNCA para a lista completa de 75MB
    if (key !== 'cached_playlist' && window.AndroidDevice && typeof AndroidDevice.saveCache === 'function') {
      try {
        const str = typeof value === 'string' ? value : JSON.stringify(value);
        if (str.length < 500000) {
          AndroidDevice.saveCache(key, str);
        }
      } catch (e) {}
    }

    // 3. Fallback LocalStorage (somente para pequenos metadados)
    try {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      if (str.length < 4000000) {
        localStorage.setItem(key, str);
        localStorage.setItem('vion_has_playlist', 'true');
        return true;
      }
    } catch (e) {
      console.warn('LocalStorage limit reached');
    }
    return false;
  },

  async get(key) {
    // 1. IndexedDB EM PRIMEIRO LUGAR
    try {
      const db = await this.getDB();
      if (db) {
        const result = await new Promise((resolve) => {
          try {
            const tx = db.transaction('cache', 'readonly');
            const store = tx.objectStore('cache');
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
        if (result) return result;
      }
    } catch (e) {
      console.warn('IndexedDB get warning:', e);
    }

    // 2. Android Nativo (apenas para configurações pequenas)
    if (key !== 'cached_playlist' && window.AndroidDevice && typeof AndroidDevice.loadCache === 'function') {
      try {
        const raw = AndroidDevice.loadCache(key);
        if (raw) {
          try { return JSON.parse(raw); } catch (e) { return raw; }
        }
      } catch (e) {}
    }

    // 3. LocalStorage
    try {
      const data = localStorage.getItem(key);
      if (!data) return null;
      try { return JSON.parse(data); } catch (e) { return data; }
    } catch (e) {
      return null;
    }
  },

  async remove(key) {
    try {
      const db = await this.getDB();
      if (db) {
        const tx = db.transaction('cache', 'readwrite');
        tx.objectStore('cache').delete(key);
      }
    } catch (e) {}
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }
};

function normalizeImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let clean = url.trim();
  if (!clean.startsWith('http')) return '';

  // 1. Remove porta :80 explícita que bloqueia requisições em alguns WebViews
  clean = clean.replace(/:80\//g, '/');

  const hostAndPath = clean.replace(/^https?:\/\//i, '');

  if (clean.includes('wp.com/')) {
    return clean.replace(/^http:\/\//i, 'https://');
  }

  // 2. Provedores com suporte a aceleração e resolução IPv4/IPv6 pelo Photon CDN (WordPress Automattic)
  // Resolve timeouts em operadoras brasileiras, entrega a partir de SP/RJ em alta velocidade com SSL e CORS
  if (
    hostAndPath.includes('image.tmdb.org') || 
    hostAndPath.includes('imgur.com') || 
    hostAndPath.includes('nebo26.top') ||
    hostAndPath.includes('3xdglab.me') ||
    hostAndPath.includes('servicedovod.lat')
  ) {
    return `https://i0.wp.com/${hostAndPath}`;
  }

  return clean;
}

/**
 * Motor Profissional de Xtream Codes API (Estilo Super Play / Lazer Play)
 * Baixa categorias e dados diretamente em JSON leve, com capas oficiais TMDB,
 * sem travar o dispositivo, sem OOM e sem forçar o fechamento do app.
 */
const XtreamCodesEngine = {
  isXtreamUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();
    return (u.includes('username=') && u.includes('password='));
  },

  parseCredentials(url) {
    try {
      const u = new URL(url);
      const username = u.searchParams.get('username');
      const password = u.searchParams.get('password');
      const baseUrl = `${u.protocol}//${u.host}`;
      if (username && password) {
        return { baseUrl, username, password };
      }
    } catch (e) {}
    const userM = url.match(/[?&]username=([^&]+)/i);
    const passM = url.match(/[?&]password=([^&]+)/i);
    const hostM = url.match(/^(https?:\/\/[^\/?#]+)/i);
    if (userM && passM && hostM) {
      return {
        baseUrl: hostM[1],
        username: decodeURIComponent(userM[1]),
        password: decodeURIComponent(passM[1])
      };
    }
    return null;
  },

  async fetchJson(url) {
    const fetchPromise = async () => {
      let res;
      try {
        let urlToTry = url;
        if (url.startsWith('http://') && window.location.protocol === 'https:') {
          urlToTry = url.replace('http://', 'https://');
        }
        res = await fetch(urlToTry);
      } catch (e) {
        console.warn('Bloqueio CORS em Xtream, usando proxy...', e);
        res = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(url));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const proxyData = await res.json();
        return JSON.parse(proxyData.contents);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    };

    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de 20s')), 20000));
    return Promise.race([fetchPromise(), timeoutPromise]);
  },

  async fetchAll(url, onProgress = () => {}) {
    const creds = this.parseCredentials(url);
    if (!creds) throw new Error('Credenciais Xtream não identificadas na URL');

    const { baseUrl, username, password } = creds;
    const apiBase = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

    onProgress(15, 'Conectando ao servidor...', 'Validando conta...');
    try {
      const auth = await this.fetchJson(apiBase);
      if (auth.user_info && auth.user_info.status && auth.user_info.status.toLowerCase() !== 'active') {
        console.warn('Status da conta:', auth.user_info.status);
      }
    } catch (e) {
      console.warn('Verificação de login:', e.message);
    }

    onProgress(30, 'Carregando categorias...', 'TV, Filmes e Séries...');
    const [liveCatsRaw, vodCatsRaw, seriesCatsRaw] = await Promise.all([
      this.fetchJson(`${apiBase}&action=get_live_categories`).catch(() => []),
      this.fetchJson(`${apiBase}&action=get_vod_categories`).catch(() => []),
      this.fetchJson(`${apiBase}&action=get_series_categories`).catch(() => [])
    ]);

    // Organização de Categorias de Canais ao Vivo
    const liveCatMap = {};
    const regularLiveCats = [];
    const adultLiveCats = [];
    if (Array.isArray(liveCatsRaw)) {
      liveCatsRaw.forEach(c => {
        if (c && c.category_id && c.category_name) {
          liveCatMap[c.category_id] = c.category_name;
          if (M3UParser.isAdultItem({ category: c.category_name })) {
            adultLiveCats.push(c.category_name);
          } else {
            regularLiveCats.push(c.category_name);
          }
        }
      });
    }
    const liveCatList = ['Todos', ...regularLiveCats, ...adultLiveCats];

    // Organização e Priorização de Categorias de Filmes (Lançamentos e Populares no topo)
    const vodCatMap = {};
    const regularVodCats = [];
    const adultVodCats = [];
    if (Array.isArray(vodCatsRaw)) {
      vodCatsRaw.forEach(c => {
        if (c && c.category_id && c.category_name) {
          vodCatMap[c.category_id] = c.category_name;
          if (M3UParser.isAdultItem({ category: c.category_name })) {
            adultVodCats.push(c.category_name);
          } else {
            regularVodCats.push(c.category_name);
          }
        }
      });
    }

    // Ordena categorias de filmes: Lançamentos e Mais Assistidos no topo absoluto
    regularVodCats.sort((a, b) => {
      const aUpper = a.toUpperCase();
      const bUpper = b.toUpperCase();
      const isALanc = aUpper.includes('LANÇAMENTO') || aUpper.includes('LANCAMENTO') || aUpper.includes('MAIS ASSISTIDO');
      const isBLanc = bUpper.includes('LANÇAMENTO') || bUpper.includes('LANCAMENTO') || bUpper.includes('MAIS ASSISTIDO');
      if (isALanc && !isBLanc) return -1;
      if (!isALanc && isBLanc) return 1;
      return 0;
    });
    const vodCatList = ['Todos', ...regularVodCats, ...adultVodCats];

    // Organização e Priorização de Séries (Plataformas de Streaming no topo)
    const seriesCatMap = {};
    const regularSeriesCats = [];
    const adultSeriesCats = [];
    if (Array.isArray(seriesCatsRaw)) {
      seriesCatsRaw.forEach(c => {
        if (c && c.category_id && c.category_name) {
          seriesCatMap[c.category_id] = c.category_name;
          if (M3UParser.isAdultItem({ category: c.category_name })) {
            adultSeriesCats.push(c.category_name);
          } else {
            regularSeriesCats.push(c.category_name);
          }
        }
      });
    }

    // Prioriza plataformas famosas (Netflix, Prime, HBO, Disney, Apple, etc.)
    const topPlatforms = ['NETFLIX', 'AMAZON', 'PRIME', 'HBO', 'MAX', 'DISNEY', 'APPLE', 'PARAMOUNT', 'GLOBOPLAY', 'STAR+'];
    regularSeriesCats.sort((a, b) => {
      const aUpper = a.toUpperCase();
      const bUpper = b.toUpperCase();
      const aTop = topPlatforms.some(p => aUpper.includes(p));
      const bTop = topPlatforms.some(p => bUpper.includes(p));
      if (aTop && !bTop) return -1;
      if (!aTop && bTop) return 1;
      return 0;
    });
    const seriesCatList = ['Todos', ...regularSeriesCats, ...adultSeriesCats];

    onProgress(50, 'Sincronizando canais de TV ao vivo...', 'Buscando transmissões...');
    const liveStreams = await this.fetchJson(`${apiBase}&action=get_live_streams`).catch(() => []);

    onProgress(70, 'Sincronizando filmes e capas oficiais...', 'Mapeando catálogo de filmes...');
    const vodStreams = await this.fetchJson(`${apiBase}&action=get_vod_streams`).catch(() => []);

    onProgress(85, 'Sincronizando séries e temporadas...', 'Organizando catálogo...');
    const seriesRawList = await this.fetchJson(`${apiBase}&action=get_series`).catch(() => []);

    onProgress(95, 'Finalizando organização...', 'Gravando no dispositivo...');

    // Live Channels
    const liveItems = [];
    if (Array.isArray(liveStreams)) {
      liveStreams.forEach((st, idx) => {
        const cat = liveCatMap[st.category_id] || 'Geral';
        const ext = st.container_extension || 'ts';
        liveItems.push({
          id: `live_${st.stream_id || idx}`,
          name: st.name || `Canal ${idx + 1}`,
          category: cat,
          logo: normalizeImageUrl(st.stream_icon || ''),
          url: `${baseUrl}/live/${username}/${password}/${st.stream_id}.${ext}`,
          type: 'live'
        });
      });
    }

    // Movies (Filmes)
    const lancamentoMovies = [];
    const maisAssistidosMovies = [];
    const outrosComCapa = [];
    const moviesSemCapa = [];
    const movies4K = [];
    const adultMovies = [];
    if (Array.isArray(vodStreams)) {
      vodStreams.forEach((st, idx) => {
        const cat = vodCatMap[st.category_id] || 'Outros';
        const ext = st.container_extension || 'mp4';
        const rawIcon = (st.stream_icon || '').trim();
        const logoUrl = normalizeImageUrl(rawIcon);
        const item = {
          id: `movie_${st.stream_id || idx}`,
          name: st.name || st.title || 'Filme',
          category: cat,
          logo: logoUrl,
          url: `${baseUrl}/movie/${username}/${password}/${st.stream_id}.${ext}`,
          type: 'movie',
          rating: parseFloat(st.rating || st.rating_5based || 0) || 0,
          isAdult: M3UParser.isAdultItem({ name: st.name || st.title, category: cat })
        };

        if (item.isAdult) {
          adultMovies.push(item);
        } else {
          const hasCover = !!(logoUrl && logoUrl.startsWith('http'));
          const catUpper = cat.toUpperCase();
          const nameUpper = (item.name || '').toUpperCase();
          const is4k = catUpper.includes('4K') || catUpper.includes('UHD') || catUpper.includes('2160P') || nameUpper.includes('4K') || nameUpper.includes('UHD') || nameUpper.includes('2160P');
          const isLanc = (catUpper.includes('LANÇAMENTO') || catUpper.includes('LANCAMENTO')) && !is4k;
          const isMais = (catUpper.includes('MAIS ASSISTIDO') || catUpper.includes('POPULAR') || catUpper.includes('EM ALTA')) && !is4k;

          if (is4k) {
            movies4K.push(item);
          } else if (isLanc) {
            lancamentoMovies.push(item);
          } else if (isMais) {
            maisAssistidosMovies.push(item);
          } else if (hasCover) {
            outrosComCapa.push(item);
          } else {
            moviesSemCapa.push(item);
          }
        }
      });
    }

    // Na visualização "Todos", filmes 100% compatíveis (FHD/HD com capas oficiais) aparecem PRIMEIRO!
    // Conteúdo 4K (pesado/HEVC) fica na sua própria categoria e no final de "Todos" para evitar tela preta em TVs
    const allRegularMovies = [
      ...lancamentoMovies.filter(m => m.logo && m.logo.startsWith('http')),
      ...maisAssistidosMovies.filter(m => m.logo && m.logo.startsWith('http')),
      ...outrosComCapa,
      ...lancamentoMovies.filter(m => !m.logo || !m.logo.startsWith('http')),
      ...maisAssistidosMovies.filter(m => !m.logo || !m.logo.startsWith('http')),
      ...moviesSemCapa,
      ...movies4K
    ];

    // Series (Séries e Novelas)
    const featuredSeries = [];
    const regularSeries = [];
    const adultSeries = [];
    if (Array.isArray(seriesRawList)) {
      seriesRawList.forEach((st, idx) => {
        const cat = seriesCatMap[st.category_id] || 'Outros';
        const rawBackdrop = Array.isArray(st.backdrop_path) && st.backdrop_path.length > 0 ? st.backdrop_path[0] : (st.cover || '');
        const isAdult = M3UParser.isAdultItem({ name: st.name || st.title, category: cat });
        const item = {
          id: `series_${st.series_id || idx}`,
          seriesId: st.series_id,
          name: st.name || st.title || 'Série',
          category: cat,
          logo: normalizeImageUrl(st.cover || st.stream_icon || ''),
          backdrop: normalizeImageUrl(rawBackdrop),
          plot: st.plot || '',
          rating: parseFloat(st.rating || 0) || 0,
          type: 'series_group',
          isXtream: true,
          isAdult: isAdult,
          credentials: { baseUrl, username, password },
          episodesCount: st.episode_run_time ? parseInt(st.episode_run_time) : 0,
          seasons: {}
        };

        if (isAdult) {
          adultSeries.push(item);
        } else {
          const catUpper = cat.toUpperCase();
          if (topPlatforms.some(p => catUpper.includes(p))) {
            featuredSeries.push(item);
          } else {
            regularSeries.push(item);
          }
        }
      });
    }

    // Na visualização "Todos", séries de grandes produtoras (Netflix, Prime, HBO, Disney) aparecem PRIMEIRO!
    const allRegularSeries = [...featuredSeries, ...regularSeries];

    const allChannels = [...liveItems, ...allRegularMovies, ...adultMovies];

    return {
      _schemaVersion: 25,
      isXtream: true,
      credentials: { baseUrl, username, password },
      channels: allChannels,
      live: {
        channels: liveItems,
        categories: liveCatList
      },
      movies: {
        channels: [...allRegularMovies, ...adultMovies],
        categories: vodCatList
      },
      series: {
        channels: [...allRegularSeries, ...adultSeries],
        rawEpisodes: [],
        categories: seriesCatList
      }
    };
  },

  async fetchSeriesEpisodes(seriesGroup) {
    if (!seriesGroup || !seriesGroup.isXtream || !seriesGroup.credentials || !seriesGroup.seriesId) {
      return seriesGroup ? (seriesGroup.seasons || {}) : {};
    }
    const { baseUrl, username, password } = seriesGroup.credentials;
    const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_series_info&series_id=${seriesGroup.seriesId}`;
    try {
      const data = await this.fetchJson(url);
      if (data && data.episodes) {
        const seasons = {};
        Object.keys(data.episodes).forEach(sNum => {
          const epList = data.episodes[sNum] || [];
          seasons[sNum] = epList.map(ep => {
            const ext = ep.container_extension || 'mp4';
            return {
              id: ep.id,
              name: ep.title || `Episódio ${ep.episode_num}`,
              season: parseInt(sNum) || 1,
              episode: parseInt(ep.episode_num) || 1,
              logo: (ep.info ? ep.info.movie_image : null) || (ep.info ? ep.info.cover_big : null) || seriesGroup.logo || '',
              plot: (ep.info ? ep.info.plot : null) || '',
              url: `${baseUrl}/series/${username}/${password}/${ep.id}.${ext}`,
              type: 'series'
            };
          });
        });
        seriesGroup.seasons = seasons;
        return seasons;
      }
    } catch (e) {
      console.warn('Erro ao obter episódios da série Xtream:', e);
    }
    return seriesGroup.seasons || {};
  }
};

const M3UParser = {
  DEMO_PLAYLIST: '',

  /**
   * Converte o texto M3U e particiona com precisão:
   * live: { channels, categories }
   * movies: { channels, categories }
   * series: { channels, categories }
   */
  parse(rawText) {
    if (!rawText || !rawText.trim()) {
      return {
        _schemaVersion: 6,
        channels: [],
        live: { channels: [], categories: ['Todos'] },
        movies: { channels: [], categories: ['Todos'] },
        series: { channels: [], rawEpisodes: [], categories: ['Todos'] }
      };
    }

    const liveItems = [];
    const movieItems = [];
    const seriesItems = [];

    const liveCatSet = new Set();
    const movieCatSet = new Set();
    const seriesCatSet = new Set();

    let currentItem = null;
    let pos = 0;
    const len = rawText.length;

    while (pos < len) {
      let nextPos = rawText.indexOf('\n', pos);
      if (nextPos === -1) nextPos = len;
      let line = rawText.substring(pos, nextPos).trim();
      pos = nextPos + 1;

      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        currentItem = this.parseExtInf(line);
      } else if (!line.startsWith('#') && currentItem) {
        currentItem.url = line;

        if (!currentItem.category) {
          currentItem.category = 'Outros';
        }

        // Filtra itens de demonstração
        const uLower = currentItem.url.toLowerCase();
        if (uLower === 'demo' || uLower.includes('blender.org') || uLower.includes('test-streams.mux.dev') || uLower.includes('tears-of-steel')) {
          currentItem = null;
          continue;
        }

        // Classificação inteligente de Tipo (live, movie, series)
        const type = this.classifyItem(currentItem);
        currentItem.type = type;

        allItems.push(currentItem);

        if (type === 'movie') {
          movieItems.push(currentItem);
          movieCatSet.add(currentItem.category);
        } else if (type === 'series') {
          seriesItems.push(currentItem);
          seriesCatSet.add(currentItem.category);
        } else {
          liveItems.push(currentItem);
          liveCatSet.add(currentItem.category);
        }

        currentItem = null;
      }
    }

    const groupedSeries = this.groupSeries(seriesItems);

    // Isola conteúdo adulto (+18) dos filmes familiares/regulares
    const regularMovies = [];
    const adultMovies = [];
    const regularMovieCatSet = new Set();
    const adultMovieCatSet = new Set();

    movieItems.forEach(item => {
      if (this.isAdultItem(item)) {
        item.isAdult = true;
        adultMovies.push(item);
        adultMovieCatSet.add(item.category || 'Adultos +18');
      } else {
        item.isAdult = false;
        regularMovies.push(item);
        regularMovieCatSet.add(item.category || 'Outros');
      }
    });

    const sortedMovieCategories = [
      'Todos',
      ...Array.from(regularMovieCatSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      ...Array.from(adultMovieCatSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    ];

    // Ordena filmes regulares garantindo que itens compatíveis e com capa válida apareçam primeiro
    const sortedRegularMovies = regularMovies.slice().sort((a, b) => {
      const aCat = (a.category || '').toUpperCase();
      const bCat = (b.category || '').toUpperCase();
      const aName = (a.name || '').toUpperCase();
      const bName = (b.name || '').toUpperCase();
      const a4k = aCat.includes('4K') || aCat.includes('UHD') || aCat.includes('2160P') || aName.includes('4K') || aName.includes('UHD') || aName.includes('2160P');
      const b4k = bCat.includes('4K') || bCat.includes('UHD') || bCat.includes('2160P') || bName.includes('4K') || bName.includes('UHD') || bName.includes('2160P');
      if (a4k !== b4k) return a4k ? 1 : -1;

      const aCover = !!(a.logo && typeof a.logo === 'string' && a.logo.trim().startsWith('http'));
      const bCover = !!(b.logo && typeof b.logo === 'string' && b.logo.trim().startsWith('http'));
      if (aCover !== bCover) return aCover ? -1 : 1;
      return 0;
    });

    return {
      _schemaVersion: 25,
      channels: allItems,
      live: {
        channels: liveItems,
        categories: ['Todos', ...Array.from(liveCatSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))]
      },
      movies: {
        channels: [...sortedRegularMovies, ...adultMovies],
        categories: sortedMovieCategories
      },
      series: {
        channels: groupedSeries,
        rawEpisodes: seriesItems,
        categories: ['Todos', ...Array.from(seriesCatSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))]
      }
    };
  },

  isAdultItem(item) {
    if (!item) return false;
    const cat = (item.category || '').toLowerCase();
    const name = (item.name || '').toLowerCase();
    const str = `${cat} ${name}`;
    return /(?:xxx|\+18|\b18\+|\badulto\b|\badultos\b|\badult\b|\bporn\b|\bporno\b|\bpornô\b|\bpornochanchada\b|\bsexy\b|\bsex\b|\bsexo\b|\berotico\b|\berótico\b|\berotica\b|\berótica\b|\bplayboy\b|\bvenus\b|\bsextreme\b|\bredhot\b|\bhentai\b|\bhardcore\b|\bsafadeza\b|\bputaria\b|\bsensual\b|\bbrazzers\b|\bxvideos\b|\bcam4\b)/i.test(str);
  },

  /**
   * Mecanismo de Inteligência de Classificação Avançada
   * Analisa: atributos oficiais do EXTINF, endpoints Xtream Codes (/movie/, /series/, /live/),
   * regex de temporadas e episódios (S01E01, etc.), extensões de arquivos de vídeo e keywords semânticas.
   */
  classifyItem(item) {
    const rawType = (item.rawType || '').toLowerCase();
    const url = (item.url || '').toLowerCase();
    const cleanUrl = url.split('?')[0].split('#')[0];
    const name = (item.name || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();

    // 0. CANAIS 24 HORAS SÃO SEMPRE CANAIS AO VIVO (LIVE TV)
    if (/(?:24\s*h(?:oras)?|24hrs|\b24h\b)/i.test(cat) || /(?:24\s*h(?:oras)?|24hrs|\b24h\b)/i.test(name)) {
      return 'live';
    }

    // 1. REGRA ABSOLUTA DE IPTV: TRANSMISSÃO CONTÍNUA (.ts) OU ENDPOINT /live/ É 100% CANAL AO VIVO
    // NENHUM filme ou série usa .ts em IPTV/Xtream Codes. Canais como "TELECINE ACTION FHD",
    // "HBO 1 FHD", "ANIMAL PLANET FHD" terminam em .ts e são transmissões ao vivo.
    if (/\.ts(\?.*)?$/i.test(url) || cleanUrl.endsWith('.ts') || url.includes('/live/') || url.includes('.ts/')) {
      return 'live';
    }

    // 2. ENDPOINTS DA ARQUITETURA XTREAM CODES
    if (url.includes('/series/')) return 'series';
    if (url.includes('/movie/') || url.includes('/movies/') || url.includes('/vod/')) return 'movie';

    // 3. ATRIBUTO EXPLÍCITO NO #EXTINF (tvg-type, type, stream-type)
    if (rawType === 'movie' || rawType === 'vod') return 'movie';
    if (rawType === 'series' || rawType === 'tvshow') return 'series';
    if (rawType === 'live' || rawType === 'tv') return 'live';

    // 4. RECONHECIMENTO DE SÉRIES POR PADRÕES DE TEMPORADA / EPISÓDIO
    // Exemplos: S01 E05, S01E05, T01 E02, Temp 1 Ep 4, Season 2, Capitulo 12, etc.
    const seriesPatternRegex = /(?:s\d{1,2}\s?e\d{1,3}|t\d{1,2}\s?e\d{1,3}|temp(?:orada)?\s?\d{1,2}|season\s?\d{1,2}|ep(?:is[oó]dio)?\s?\d{1,3}|\bcap[ií]tulo\s?\d{1,3}\b|\bepisodio\b|\bepisódio\b|\bcapitulo\b|\bcapítulo\b)/i;
    if (seriesPatternRegex.test(name) || seriesPatternRegex.test(cat)) {
      return 'series';
    }

    // Palavras-chave exclusivas de Séries na Categoria
    const seriesCatKeywords = [
      'serie', 'série', 'series', 'séries', 'temporada', 'season', 'dorama', 'doramas',
      'anime', 'animes', 'novela', 'novelas', 'minissérie', 'minisserie', 'tokusatsu'
    ];
    if (seriesCatKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(cat) || cat.includes(kw))) {
      return 'series';
    }

    // 5. ARQUIVOS GRAVADOS DE VÍDEO (.mp4, .mkv, .avi, etc.)
    const isVideoFile = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v)(\?.*)?$/i.test(url);

    // 6. PALAVRAS-CHAVE EXCLUSIVAS DE CANAIS AO VIVO
    const liveKeywords = [
      'canal', 'canais', 'tv', 'ao vivo', 'aovivo', 'live', 'aberto', 'abertos',
      'noticia', 'notícia', 'noticias', 'notícias', 'esporte', 'esportes', 'sports', 'sport',
      'premiere', 'combate', 'espn', 'sportv', 'globo', 'sbt', 'record', 'band', 'rede tv',
      '24h', '24 horas', 'pluto', 'internacional', 'radios', 'rádios', 'religioso', 'religiosos',
      'ppv', 'pay-per-view', 'conmebol', 'dazn', 'ufc'
    ];
    if (liveKeywords.some(kw => cat.includes(kw))) {
      return 'live';
    }

    // 7. SE FOR ARQUIVO DE VÍDEO (.mp4/.mkv) E NÃO FOR SÉRIE, É FILME
    if (isVideoFile) {
      return 'movie';
    }

    // 8. PALAVRAS-CHAVE EXCLUSIVAS DE FILMES
    const movieCatKeywords = [
      'filme', 'filmes', 'movie', 'movies', 'lançamento', 'lancamento', 'lançamentos', 'lancamentos'
    ];
    if (movieCatKeywords.some(kw => cat.includes(kw))) {
      return 'movie';
    }

    // 9. STREAM AO VIVO (.m3u8)
    if (cleanUrl.endsWith('.m3u8') || url.includes('.m3u8')) {
      return 'live';
    }

    // Fallback seguro
    return 'live';
  },

  /**
   * Extrai metadados do #EXTINF com suporte a tvg-type / type
   */
  parseExtInf(line) {
    const item = {
      name: 'Sem Nome',
      logo: '',
      category: '',
      id: '',
      rawType: ''
    };

    const typeMatch = line.match(/(?:tvg-type|type|stream-type|stream_type)="([^"]+)"/i);
    if (typeMatch) item.rawType = typeMatch[1].toLowerCase();

    const logoMatch = line.match(/(?:tvg-logo|logo|cover|poster)=["']?([^"'\s,]+)["']?/i);
    if (logoMatch) item.logo = logoMatch[1].trim();

    const groupMatch = line.match(/group-title="([^"]+)"/i);
    if (groupMatch) item.category = groupMatch[1];

    const nameMatch = line.match(/tvg-name="([^"]+)"/i);
    if (nameMatch) item.name = nameMatch[1];

    const idMatch = line.match(/tvg-id="([^"]+)"/i);
    if (idMatch) item.id = idMatch[1];

    const commaIndex = line.lastIndexOf(',');
    if (commaIndex !== -1) {
      const channelTitle = line.substring(commaIndex + 1).trim();
      if (channelTitle) item.name = channelTitle;
    }

    return item;
  },

  async saveToCache(data) {
    try {
      await TVStorage.set('cached_playlist', data);
      await TVStorage.set('cached_playlist_time', Date.now().toString());
    } catch (e) {
      console.warn('Erro ao salvar cache:', e);
    }
  },

  async loadFromCache() {
    try {
      const data = await TVStorage.get('cached_playlist');
      if (!data) return null;

      // Garante compatibilidade caso o cache anterior não estivesse particionado
      if (data && (!data.live || !data.movies || !data.series)) {
        return this.reorganizeCachedData(data);
      }
      return data;
    } catch (e) {
      return null;
    }
  },

  extractSeriesMeta(name) {
    if (!name) return { seriesName: 'Sem Nome', season: 1, episode: 1, episodeTitle: 'Episódio 01' };

    // 1. Padrão S01 E05 / S1E5 / T01 E02 / T1E2 (Ex: "(Des)encanto S01E01" ou "Loki S01E01 - O Glorioso Propósito")
    const sMatch = name.match(/^(.*?)\s*(?:[-:|]\s*)?(?:[SsTt](\d{1,2})\s*[-_xX]?\s*[Ee](\d{1,3}))\s*(?:[-:|]\s*)?(.*)$/i);
    if (sMatch) {
      let cleanName = sMatch[1].replace(/[-:|]$/, '').trim();
      const season = parseInt(sMatch[2], 10);
      const episode = parseInt(sMatch[3], 10);
      const extra = (sMatch[4] || '').trim();
      const epStr = `Episódio ${String(episode).padStart(2, '0')}`;
      const episodeTitle = extra ? `${epStr} - ${extra}` : epStr;
      return {
        seriesName: cleanName || name,
        season,
        episode,
        episodeTitle
      };
    }

    // 2. Padrão Temporada 1 Ep 02 / Season 2 Episode 3
    const tempMatch = name.match(/^(.*?)\s*(?:[-:|]\s*)?(?:temp(?:orada)?|season)\s*(\d{1,2})\s*(?:[-_:]?\s*)?(?:ep(?:is[oó]dio)?|cap(?:[ií]tulo)?)?\s*(\d{1,3})?\s*(?:[-:|]\s*)?(.*)$/i);
    if (tempMatch) {
      let cleanName = tempMatch[1].replace(/[-:|]$/, '').trim();
      const season = parseInt(tempMatch[2], 10);
      const episode = tempMatch[3] ? parseInt(tempMatch[3], 10) : 1;
      const extra = (tempMatch[4] || '').trim();
      const epStr = `Episódio ${String(episode).padStart(2, '0')}`;
      const episodeTitle = extra ? `${epStr} - ${extra}` : epStr;
      return {
        seriesName: cleanName || name,
        season,
        episode,
        episodeTitle
      };
    }

    // 3. Padrão Ep 12 / Episodio 12 / Capitulo 12
    const epMatch = name.match(/^(.*?)\s*(?:[-:|]\s*)?(?:ep(?:is[oó]dio)?|cap(?:[ií]tulo)?)\s*(\d{1,3})\s*(?:[-:|]\s*)?(.*)$/i);
    if (epMatch) {
      let cleanName = epMatch[1].replace(/[-:|]$/, '').trim();
      const season = 1;
      const episode = parseInt(epMatch[2], 10);
      const extra = (epMatch[3] || '').trim();
      const epStr = `Episódio ${String(episode).padStart(2, '0')}`;
      const episodeTitle = extra ? `${epStr} - ${extra}` : epStr;
      return {
        seriesName: cleanName || name,
        season,
        episode,
        episodeTitle
      };
    }

    return {
      seriesName: name,
      season: 1,
      episode: 1,
      episodeTitle: name
    };
  },

  groupSeries(seriesItems) {
    const seriesMap = new Map();

    seriesItems.forEach(item => {
      const meta = this.extractSeriesMeta(item.name);
      const cat = item.category || 'Outros';
      const key = (cat + '||' + meta.seriesName).toLowerCase();

      if (!seriesMap.has(key)) {
        seriesMap.set(key, {
          id: 'series_' + seriesMap.size,
          name: meta.seriesName,
          category: cat,
          logo: item.logo || '',
          url: item.url,
          type: 'series_group',
          episodesCount: 0,
          seasons: {}
        });
      }

      const sGroup = seriesMap.get(key);
      if (!sGroup.logo && item.logo) sGroup.logo = item.logo;
      sGroup.episodesCount++;

      const sNum = meta.season || 1;
      if (!sGroup.seasons[sNum]) {
        sGroup.seasons[sNum] = [];
      }
      sGroup.seasons[sNum].push({
        ...item,
        season: sNum,
        episode: meta.episode || 1,
        cleanTitle: meta.episodeTitle || item.name
      });
    });

    seriesMap.forEach(group => {
      Object.keys(group.seasons).forEach(sNum => {
        group.seasons[sNum].sort((a, b) => a.episode - b.episode);
      });
    });

    return Array.from(seriesMap.values());
  },

  reorganizeCachedData(parsed) {
    if (!parsed) return null;

    // Se já for estrutura particionada do Xtream, normaliza todas as URLs de capas para HTTPS
    if (parsed.isXtream) {
      if (parsed.live && parsed.live.channels) {
        parsed.live.channels.forEach(ch => { if (ch && ch.logo) ch.logo = normalizeImageUrl(ch.logo); });
      }
      if (parsed.movies && parsed.movies.channels) {
        parsed.movies.channels.forEach(m => { if (m && m.logo) m.logo = normalizeImageUrl(m.logo); });
        // Prioriza filmes com capas oficiais para a categoria "Todos" (4K pesado vai para o final)
        parsed.movies.channels.sort((a, b) => {
          if (a.isAdult !== b.isAdult) return a.isAdult ? 1 : -1;
          const aCat = (a.category || '').toUpperCase();
          const bCat = (b.category || '').toUpperCase();
          const aName = (a.name || '').toUpperCase();
          const bName = (b.name || '').toUpperCase();
          const a4k = aCat.includes('4K') || aCat.includes('UHD') || aCat.includes('2160P') || aName.includes('4K') || aName.includes('UHD') || aName.includes('2160P');
          const b4k = bCat.includes('4K') || bCat.includes('UHD') || bCat.includes('2160P') || bName.includes('4K') || bName.includes('UHD') || bName.includes('2160P');
          if (a4k !== b4k) return a4k ? 1 : -1;

          const aCover = !!(a.logo && typeof a.logo === 'string' && a.logo.trim().startsWith('http'));
          const bCover = !!(b.logo && typeof b.logo === 'string' && b.logo.trim().startsWith('http'));
          if (aCover !== bCover) return aCover ? -1 : 1;

          const aLanc = aCat.includes('LANÇAMENTO') || aCat.includes('LANCAMENTO');
          const bLanc = bCat.includes('LANÇAMENTO') || bCat.includes('LANCAMENTO');
          if (aLanc !== bLanc) return aLanc ? -1 : 1;

          const aPop = aCat.includes('MAIS ASSISTIDO') || aCat.includes('POPULAR') || aCat.includes('EM ALTA');
          const bPop = bCat.includes('MAIS ASSISTIDO') || bCat.includes('POPULAR') || bCat.includes('EM ALTA');
          if (aPop !== bPop) return aPop ? -1 : 1;

          return 0;
        });
      }
      if (parsed.series && parsed.series.channels) {
        parsed.series.channels.forEach(s => {
          if (s && s.logo) s.logo = normalizeImageUrl(s.logo);
          if (s && s.backdrop) s.backdrop = normalizeImageUrl(s.backdrop);
        });
      }
      return parsed;
    }

    // Se parsed.channels existir, usamos os canais brutos;
    // se tiver rawEpisodes ou channels em series, pegamos o conjunto completo
    let channels = parsed.channels || [];
    if (parsed.series && parsed.series.rawEpisodes && parsed.series.rawEpisodes.length > 0) {
      channels = [
        ...((parsed.live ? parsed.live.channels : null) || []),
        ...((parsed.movies ? parsed.movies.channels : null) || []),
        ...parsed.series.rawEpisodes
      ];
    }

    // Filtra e remove permanentemente do cache qualquer item de teste/demo
    channels = channels.filter(ch => {
      if (!ch || !ch.url) return false;
      const u = ch.url.toLowerCase();
      if (u === 'demo' || u.includes('blender.org') || u.includes('test-streams.mux.dev') || u.includes('tears-of-steel') || u.includes('akamaized.net/hls/live/2000341')) {
        return false;
      }
      return true;
    });

    const liveItems = [];
    const movieItems = [];
    const seriesItems = [];

    const liveCatSet = new Set();
    const movieCatSet = new Set();
    const seriesCatSet = new Set();

    channels.forEach(ch => {
      const type = this.classifyItem(ch);
      ch.type = type;
      if (type === 'movie') {
        movieItems.push(ch);
        movieCatSet.add(ch.category || 'Outros');
      } else if (type === 'series') {
        seriesItems.push(ch);
        seriesCatSet.add(ch.category || 'Outros');
      } else {
        liveItems.push(ch);
        liveCatSet.add(ch.category || 'Outros');
      }
    });

    const groupedSeries = this.groupSeries(seriesItems);

    // Isola conteúdo adulto (+18) dos filmes familiares/regulares
    const regularMovies = [];
    const adultMovies = [];
    const regularMovieCatSet = new Set();
    const adultMovieCatSet = new Set();

    movieItems.forEach(item => {
      if (this.isAdultItem(item)) {
        item.isAdult = true;
        adultMovies.push(item);
        adultMovieCatSet.add(item.category || 'Adultos +18');
      } else {
        item.isAdult = false;
        regularMovies.push(item);
        regularMovieCatSet.add(item.category || 'Outros');
      }
    });

    const sortedMovieCategories = [
      'Todos',
      ...Array.from(regularMovieCatSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      ...Array.from(adultMovieCatSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    ];

    // Ordena filmes regulares garantindo que itens compatíveis e com capa válida apareçam primeiro
    const sortedRegularMovies = regularMovies.slice().sort((a, b) => {
      const aCat = (a.category || '').toUpperCase();
      const bCat = (b.category || '').toUpperCase();
      const aName = (a.name || '').toUpperCase();
      const bName = (b.name || '').toUpperCase();
      const a4k = aCat.includes('4K') || aCat.includes('UHD') || aCat.includes('2160P') || aName.includes('4K') || aName.includes('UHD') || aName.includes('2160P');
      const b4k = bCat.includes('4K') || bCat.includes('UHD') || bCat.includes('2160P') || bName.includes('4K') || bName.includes('UHD') || bName.includes('2160P');
      if (a4k !== b4k) return a4k ? 1 : -1;

      const aCover = !!(a.logo && typeof a.logo === 'string' && a.logo.trim().startsWith('http'));
      const bCover = !!(b.logo && typeof b.logo === 'string' && b.logo.trim().startsWith('http'));
      if (aCover !== bCover) return aCover ? -1 : 1;
      return 0;
    });

    const sortedChannels = [
      ...liveItems,
      ...sortedRegularMovies,
      ...adultMovies,
      ...seriesItems
    ];

    return {
      _schemaVersion: 25,
      channels: sortedChannels,
      live: {
        channels: liveItems,
        categories: ['Todos', ...Array.from(liveCatSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))]
      },
      movies: {
        channels: [...sortedRegularMovies, ...adultMovies],
        categories: sortedMovieCategories
      },
      series: {
        channels: groupedSeries,
        rawEpisodes: seriesItems,
        categories: ['Todos', ...Array.from(seriesCatSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))]
      }
    };
  },

  async fetchPlaylist(url, onProgress = () => {}) {
    if (XtreamCodesEngine.isXtreamUrl(url)) {
      return XtreamCodesEngine.fetchAll(url, onProgress);
    }
    try {
      onProgress(20, 'Baixando playlist M3U...', 'Conectando ao link...');
      let response;
      try {
        let urlToTry = url;
        if (url.startsWith('http://') && window.location.protocol === 'https:') {
          urlToTry = url.replace('http://', 'https://');
        }
        response = await fetch(urlToTry);
      } catch (e) {
        console.warn('Bloqueio CORS ou Mixed Content detectado, usando proxy...', e);
        response = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      onProgress(60, 'Processando canais e filmes...', 'Classificando categorias...');
      const text = await response.text();
      const parsed = this.parse(text);
      onProgress(95, 'Finalizando catálogo...', 'Organizando canais...');
      return parsed;
    } catch (err) {
      console.error('Erro ao baixar lista:', err);
      throw err;
    }
  }
};
