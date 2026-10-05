/**
 * Vion Player - Controlador Principal do Aplicativo
 * Versão Super Play Oficial:
 * - Live TV: 3 Colunas (Categorias, Lista de Canais, Mini-Player ao Vivo + EPG) - Imagem 4
 * - Filmes e Séries: Grade de Posters Verticais (Aspecto 2:3) com Sidebar de Categorias - Imagem 3
 * - Séries Agrupadas por Nome com Modal de Temporadas e Episódios (sem duplicar 248 mil séries)
 * - Suporte a testes imediatos de reprodução e compatibilidade Samsung Tizen / LG webOS / Navegador.
/**
 * Motor de Resolução de Capas e Metadados do TMDB (TheMovieDb)
 * Busca capas oficiais em português em alta resolução quando a lista IPTV
 * não fornecer ou tiver links quebrados/bloqueados.
 */
const TmdbResolver = {
  _cache: new Map(),
  _pending: new Map(),

  init() {
    try {
      const stored = localStorage.getItem('vion_tmdb_posters');
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.entries(parsed).forEach(([k, v]) => this._cache.set(k, v));
      }
    } catch(e) {}
  },

  save() {
    try {
      const obj = {};
      let count = 0;
      this._cache.forEach((v, k) => {
        if (v && count < 800) { obj[k] = v; count++; }
      });
      localStorage.setItem('vion_tmdb_posters', JSON.stringify(obj));
    } catch(e) {}
  },

  cleanTitle(raw) {
    if (!raw) return '';
    let s = String(raw).trim();
    // Remove "1 - ", "01. ", "01 - "
    s = s.replace(/^\s*\d+\s*[-–—.:]\s*/i, '');
    // Remove quality and audio tags
    s = s.replace(/\b(?:4K|UHD|FHD|HD|SD|1080p|720p|HDR|HDR10|DV|H264|H265|HEVC|DUBLADO|LEGENDADO|NACIONAL|HYBRID)\b/gi, '');
    // Remove brackets / parens
    s = s.replace(/\[.*?\]|\(.*?\)/g, '');
    s = s.replace(/[-–—_.]+/g, ' ');
    return s.trim();
  },

  async resolve(itemName, isSeries = false) {
    const clean = this.cleanTitle(itemName);
    if (!clean || clean.length < 2) return null;
    const cacheKey = (isSeries ? 'tv:' : 'mv:') + clean.toLowerCase();

    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    if (this._pending.has(cacheKey)) {
      return this._pending.get(cacheKey);
    }

    const promise = (async () => {
      try {
        const endpoint = isSeries ? 'search/tv' : 'search/movie';
        const url = `https://api.themoviedb.org/3/${endpoint}?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb&query=${encodeURIComponent(clean)}&language=pt-BR`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const first = data.results[0];
          const poster = first.poster_path ? `https://image.tmdb.org/t/p/w500${first.poster_path}` : null;
          const backdrop = first.backdrop_path ? `https://image.tmdb.org/t/p/original${first.backdrop_path}` : null;
          const meta = {
            poster,
            backdrop,
            plot: first.overview || '',
            rating: first.vote_average ? Number(first.vote_average.toFixed(1)) : 0,
            year: (first.release_date || first.first_air_date || '').substring(0, 4)
          };
          this._cache.set(cacheKey, meta);
          this.save();
          return meta;
        }
      } catch (err) {}
      this._cache.set(cacheKey, null);
      return null;
    })();

    this._pending.set(cacheKey, promise);
    return promise;
  }
};
TmdbResolver.init();

const App = {
  currentScreen: 'reseller-login',
  screenHistory: [],
  player: null,
  playlistData: null,
  activeSection: 'channels', // 'channels' (Live TV) | 'movies' | 'series'
  activeCategory: 'Todos',
  activeChannelIndex: 0,
  filteredItems: [],
  renderedCount: 0,
  PAGE_SIZE: 60,
  activeSeries: null,
  activeSeason: 1,
  clockInterval: null,
  dialogCallback: null,

  // Servidores cadastrados para Provedores
  PROVIDER_SERVERS: {
    'VION': 'http://server.vionplayer.app:8080',
    'VION2026': 'http://server.vionplayer.app:8080',
    'TOURO': 'http://projetotourov2.pro',
    'PARCEIRO': 'http://server.parceiro.com:8080',
    'DEMO': 'demo'
  },

  DEMO_STREAMS: {
    live: [],
    movie: []
  },

  setSplashProgress(percent, title, status) {
    const bar = document.getElementById('splash-progress-bar');
    const pct = document.getElementById('splash-percent-text');
    const txt = document.getElementById('splash-status-text');
    if (bar && percent !== undefined) bar.style.width = `${Math.min(100, Math.max(5, percent))}%`;
    if (pct && percent !== undefined) pct.textContent = `${Math.min(100, Math.max(0, Math.round(percent)))}%`;
    if (txt && title) txt.textContent = status ? `${title} • ${status}` : title;
  },

  async queryPortalPlaylists(mac) {
    if (!mac) return null;
    const apiUrls = [
      `/api/device?mac=${encodeURIComponent(mac)}`,
      `https://vion.gestorpro.app.br/api/device?mac=${encodeURIComponent(mac)}`,
      `http://192.168.1.197:3000/api/device?mac=${encodeURIComponent(mac)}`,
      `http://localhost:3000/api/device?mac=${encodeURIComponent(mac)}`
    ];
    for (const url of apiUrls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data && data.device) {
            this.handleDeviceSyncData(data.device);
          }
          if (data && Array.isArray(data.playlists) && data.playlists.length > 0) {
            localStorage.setItem(`vion_playlists_${mac}`, JSON.stringify(data.playlists));
            localStorage.setItem('vion_has_playlist', 'true');
            return data.playlists[0];
          }
        }
      } catch (e) {}
    }
    const stored = localStorage.getItem(`vion_playlists_${mac}`);
    if (stored) {
      try {
        const list = JSON.parse(stored);
        if (Array.isArray(list) && list.length > 0) return list[0];
      } catch (e) {}
    }
    return null;
  },

  async init() {
    this.goToScreen('loading');
    this.setSplashProgress(12, 'Iniciando Vion Player...', 'Configurando sistema');
    this.setupDeviceInfo();
    this.player = new TVVideoPlayer('video-element', 'player-osd', 'player-loading', 'mini-video-element');
    RemoteControl.init();

    this.startClockTimer();
    this.bindEvents();
    this.initCinemaBackdropSlideshow();
    this.setupPlatformLifecycle();
    this.updateEpgCalendar();
    setTimeout(() => { this.checkAndroidAppUpdate(); }, 4000);

    const mac = localStorage.getItem('vion_mac_address');

    // 1. Verifica cache local do dispositivo
    this.setSplashProgress(25, 'Verificando catálogo salvo...', 'Lendo armazenamento local');
    let cached = null;
    try {
      cached = await M3UParser.loadFromCache();
    } catch (e) {
      console.warn('Erro ao carregar cache local:', e);
    }

    // Validação estrita da integridade do cache:
    // Exige _schemaVersion === 25 e formato Xtream com live, movies e series válidos
    const isCacheFresh = cached && 
      cached._schemaVersion === 25 && 
      cached.channels && 
      cached.channels.length > 0 &&
      cached.movies && 
      cached.movies.channels &&
      cached.series &&
      cached.series.channels;

    if (isCacheFresh) {
      this.setSplashProgress(80, 'Carregando canais e filmes...', 'Quase pronto...');
      this.playlistData = cached;
      this.activePlaylistUrl = localStorage.getItem('vion_active_playlist_url') || '';
      this.updateDashboardCounters();
      this.setSplashProgress(100, 'Bem-vindo ao Vion Player!', 'Pronto');
      await new Promise(r => setTimeout(r, 350));
      if (this.isDeviceExpired()) {
        this.goToScreen('expired');
      } else {
        this.goToScreen('home');
      }

      // Em segundo plano silencioso, verifica se houve alteração de lista no portal
      setTimeout(() => this.checkPortalUpdatesSilently(), 4000);
      return;
    } else {
      // Se for cache legado antigo com capas ausentes ou desordenadas, limpa para sincronizar fresh
      if (cached) {
        console.log('Cache legado detectado. Limpando para baixar catálogo Xtream com capas oficiais TMDB...');
        await TVStorage.remove('cached_playlist');
        cached = null;
      }
    }

    // 2. Se não tem cache, busca lista vinculada ao MAC no portal
    this.setSplashProgress(35, 'Conectando ao Portal...', 'Verificando lista vinculada ao MAC');
    let portalPlaylist = await this.queryPortalPlaylists(mac);

    if (portalPlaylist && portalPlaylist.url) {
      this.setSplashProgress(45, `Sincronizando ${portalPlaylist.name || 'Playlist'}`, 'Iniciando download...');
      try {
        await this.activatePlaylistByUrl(portalPlaylist.url, portalPlaylist.name || 'Playlist', false, true);
        return;
      } catch (e) {
        console.warn('Erro ao sincronizar playlist do portal:', e);
      }
    }

    // 3. Somente se não houver cache nem lista vinculada no portal, vai para login
    this.setSplashProgress(100, 'Nenhuma playlist vinculada.', 'Redirecionando...');
    await new Promise(r => setTimeout(r, 600));
    if (this.isDeviceExpired()) {
      this.goToScreen('expired');
    } else {
      this.goToScreen('reseller-login');
      this.startPortalAutoPolling();
    }
  },

  async checkPortalUpdatesSilently() {
    const mac = localStorage.getItem('vion_mac_address');
    if (!mac) return;
    const portalList = await this.queryPortalPlaylists(mac);
    if (portalList && portalList.url && portalList.url !== this.activePlaylistUrl) {
      console.log('Nova lista detectada no portal:', portalList.name);
      this.activatePlaylistByUrl(portalList.url, portalList.name, true, false);
    }
  },

  startClockTimer() {
    const updateClock = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const timeStr = `${h}:${m}`;

      const homeClock = document.getElementById('digital-clock');
      if (homeClock) homeClock.textContent = timeStr;

      const liveClock = document.getElementById('live-digital-clock');
      if (liveClock) liveClock.textContent = timeStr;

      this.updateTrialDisplay();
    };
    updateClock();
    if (this.clockInterval) clearInterval(this.clockInterval);
    this.clockInterval = setInterval(updateClock, 1000);
  },

  setupDeviceInfo() {
    let mac = null;
    let key = null;

    // 1. Android Native Bridge (persistente e permanente baseado no hardware do aparelho)
    if (window.AndroidDevice) {
      try {
        if (typeof AndroidDevice.getMacAddress === 'function') {
          mac = AndroidDevice.getMacAddress();
        }
        if (typeof AndroidDevice.getDeviceKey === 'function') {
          key = AndroidDevice.getDeviceKey();
        }
      } catch (e) {
        console.warn('Erro ao obter MAC do AndroidDevice:', e);
      }
    }

    // 2. Tizen TV Hardware MAC
    if (!mac && window.tizen && window.tizen.systeminfo) {
      try {
        tizen.systeminfo.getPropertyValue('ETHERNET_NETWORK', (network) => {
          if (network && network.macAddress) {
            mac = network.macAddress.toUpperCase();
            localStorage.setItem('vion_mac_address', mac);
            this.updateDeviceDisplay(mac, key);
          }
        });
      } catch (e) {
        console.log('Tizen hardware MAC fallback:', e);
      }
    }

    // 3. Fallback localStorage
    if (!mac) {
      mac = localStorage.getItem('vion_mac_address');
    }
    if (!key) {
      key = localStorage.getItem('vion_device_key');
    }

    // 4. Se ainda não tiver (ex: navegador Web no PC pela primeira vez), gera identificador fixo e determinístico
    if (!mac) {
      const seed = (navigator.userAgent || '') + (screen.width || '') + (screen.height || '') + (navigator.language || '');
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
      }
      const hex = Math.abs(hash).toString(16).padStart(12, '0').toUpperCase();
      const macParts = [];
      for (let i = 0; i < 6; i++) {
        macParts.push(hex.substr(i * 2, 2));
      }
      mac = macParts.join(':');
    }

    if (!key) {
      key = (Math.abs(mac.split(':').reduce((acc, part) => acc + parseInt(part, 16), 0) * 19) % 9000 + 1000).toString();
    }

    localStorage.setItem('vion_mac_address', mac);
    localStorage.setItem('vion_device_key', key);

    this.updateDeviceDisplay(mac, key);
    this.registerDeviceWithServer(mac, key);
  },

  registerDeviceWithServer(mac, key) {
    if (!mac) return;
    const endpoints = [
      '/api/device/register',
      'https://vion.gestorpro.app.br/api/device/register',
      'http://192.168.1.197:3000/api/device/register',
      'http://localhost:3000/api/device/register'
    ];
    for (const ep of endpoints) {
      try {
        fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mac, key })
        }).then(r => r.json()).then(data => {
          if (data && data.device) this.handleDeviceSyncData(data.device);
        }).catch(() => {});
      } catch (e) {}
    }
  },

  handleDeviceSyncData(device) {
    if (!device) return;
    const isLicenseActive = !!(device.active || device.activated);
    const plan = device.plan || (device.expiresAt ? 'anual' : 'vitalicio');
    const expiry = device.expiryDate || device.expiresAt || null;

    localStorage.setItem('vion_license_active', isLicenseActive ? 'true' : 'false');
    localStorage.setItem('vion_license_plan', plan);
    if (expiry) localStorage.setItem('vion_license_expiry', expiry.toString());
    if (device.registeredAt) localStorage.setItem('vion_registered_at', device.registeredAt.toString());

    this.updateTrialDisplay();
  },

  isDeviceExpired() {
    const isLicenseActive = localStorage.getItem('vion_license_active') === 'true';
    if (isLicenseActive) {
      const plan = localStorage.getItem('vion_license_plan');
      if (plan === 'vitalicio' || plan === 'lifetime') return false;
      const expiry = parseInt(localStorage.getItem('vion_license_expiry'), 10);
      if (expiry && !isNaN(expiry) && Date.now() > expiry) return true;
      return false;
    }

    const trial = this.getTrialInfo();
    return !!trial.expired;
  },

  async verifyLicenseNow(showToasts = true) {
    const mac = localStorage.getItem('vion_mac_address');
    if (!mac) return false;
    if (showToasts) this.showToast('🔄 Consultando status da licença no servidor...');
    const endpoints = [
      `https://vion.gestorpro.app.br/api/device?mac=${encodeURIComponent(mac)}`,
      `/api/device?mac=${encodeURIComponent(mac)}`,
      `http://192.168.1.197:3000/api/device?mac=${encodeURIComponent(mac)}`,
      `http://localhost:3000/api/device?mac=${encodeURIComponent(mac)}`
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data && data.device) {
            this.handleDeviceSyncData(data.device);
            if (!this.isDeviceExpired()) {
              if (this._expiredPollTimer) clearInterval(this._expiredPollTimer);
              this.showToast('🎉 Parabéns! Aparelho ativado com sucesso!');
              this.goToScreen('home');
              return true;
            }
          }
        }
      } catch(e) {}
    }

    if (showToasts) {
      this.showToast('⚠️ Licença ainda não ativada. Conclua o pagamento em vion.gestorpro.app.br');
    }
    return false;
  },

  startExpiredScreenPolling() {
    if (this._expiredPollTimer) clearInterval(this._expiredPollTimer);
    this._expiredPollTimer = setInterval(async () => {
      if (this.currentScreen !== 'expired') {
        clearInterval(this._expiredPollTimer);
        return;
      }
      await this.verifyLicenseNow(false);
    }, 3500);
  },

  getTrialInfo() {
    const isLicenseActive = localStorage.getItem('vion_license_active') === 'true';
    if (isLicenseActive) {
      const plan = localStorage.getItem('vion_license_plan');
      if (plan === 'vitalicio' || plan === 'lifetime') {
        return {
          expired: false,
          days: 99999,
          hours: 0,
          minutes: 0,
          dateFormatted: 'Vitalícia',
          text: '⭐ Licença Vitalícia Ativa'
        };
      }
      const expiry = parseInt(localStorage.getItem('vion_license_expiry'), 10);
      if (expiry && !isNaN(expiry)) {
        const expDate = new Date(expiry);
        const pad = (n) => String(n).padStart(2, '0');
        const dateFormatted = `${pad(expDate.getDate())}.${pad(expDate.getMonth() + 1)}.${expDate.getFullYear()}`;
        const remainingMs = expiry - Date.now();
        if (remainingMs <= 0) {
          return {
            expired: true,
            days: 0,
            hours: 0,
            minutes: 0,
            dateFormatted,
            text: 'Licença Anual Expirada • Renovar'
          };
        }
        return {
          expired: false,
          days: Math.floor(remainingMs / (24 * 60 * 60 * 1000)),
          hours: 0,
          minutes: 0,
          dateFormatted,
          text: `Licença Anual (até ${dateFormatted})`
        };
      }
    }

    const mac = localStorage.getItem('vion_mac_address') || 'default';
    const trialKey = `vion_trial_expire_${mac}`;
    let expireTimestamp = parseInt(localStorage.getItem(trialKey), 10);

    const registeredAt = parseInt(localStorage.getItem('vion_registered_at'), 10);
    if (registeredAt && !isNaN(registeredAt)) {
      expireTimestamp = registeredAt + (7 * 24 * 60 * 60 * 1000);
      localStorage.setItem(trialKey, expireTimestamp.toString());
    } else if (!expireTimestamp || isNaN(expireTimestamp)) {
      expireTimestamp = Date.now() + (7 * 24 * 60 * 60 * 1000);
      localStorage.setItem(trialKey, expireTimestamp.toString());
    }

    const now = Date.now();
    const remainingMs = expireTimestamp - now;
    const expDate = new Date(expireTimestamp);

    const pad = (n) => String(n).padStart(2, '0');
    const expH = pad(expDate.getHours());
    const expM = pad(expDate.getMinutes());
    const dateFormatted = `${pad(expDate.getDate())}.${pad(expDate.getMonth() + 1)}.${expDate.getFullYear()} ${expH}:${expM}`;

    if (remainingMs <= 0) {
      return {
        expired: true,
        days: 0,
        hours: 0,
        minutes: 0,
        dateFormatted,
        text: 'Teste Expirado • Ativar Licença'
      };
    }

    const totalDays = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
    const totalHours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const totalMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

    let countdownText = '';
    if (totalDays > 1) {
      countdownText = `${totalDays} dias restantes`;
    } else if (totalDays === 1) {
      countdownText = `1 dia e ${totalHours}h restantes`;
    } else if (totalHours > 0) {
      countdownText = `${totalHours}h restantes`;
    } else {
      countdownText = `${totalMinutes}min restantes`;
    }

    return {
      expired: false,
      days: totalDays,
      hours: totalHours,
      minutes: totalMinutes,
      dateFormatted,
      text: `Teste Grátis: ${countdownText}`
    };
  },

  updateTrialDisplay() {
    const info = this.getTrialInfo();
    const expireEl = document.getElementById('val-trial-expire');
    if (expireEl) {
      expireEl.textContent = info.text;
      expireEl.style.color = info.expired ? '#ef4444' : '#facc15';
    }
  },

  updateDeviceDisplay(mac, key) {
    document.querySelectorAll('.val-mac-address').forEach(el => el.textContent = mac);
    document.querySelectorAll('.val-device-key').forEach(el => el.textContent = key);
    if (mac) {
      const portalUrl = `https://vion.gestorpro.app.br/?mac=${encodeURIComponent(mac)}#activation`;
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(portalUrl)}`;
      document.querySelectorAll('.login-qr-code-img, .expired-qr-code-img').forEach(img => {
        img.src = qrSrc;
      });
    }
    this.updateTrialDisplay();
  },

  updateDashboardCounters() {
    if (!this.playlistData) return;

    if (!this.playlistData.live || !this.playlistData.movies || !this.playlistData.series || !this.playlistData.series.rawEpisodes) {
      this.playlistData = M3UParser.reorganizeCachedData(this.playlistData);
    }

    const liveCount = (this.playlistData.live?.channels?.length || 0);
    const movieCount = (this.playlistData.movies?.channels?.length || 0);
    // Para Séries, mostra o número REAL de séries agrupadas (e não 248 mil episódios!)
    const seriesCount = (this.playlistData.series?.channels?.length || 0);

    const elLive = document.getElementById('dash-count-live');
    if (elLive) elLive.textContent = `${liveCount.toLocaleString('pt-BR')} Canais`;

    const elMovies = document.getElementById('dash-count-movies');
    if (elMovies) elMovies.textContent = `${movieCount.toLocaleString('pt-BR')} Filmes`;

    const elSeries = document.getElementById('dash-count-series');
    if (elSeries) elSeries.textContent = `${seriesCount.toLocaleString('pt-BR')} Séries`;

    const mac = localStorage.getItem('vion_mac_address');
    const storedPortal = localStorage.getItem(`vion_playlists_${mac}`);
    const playlists = storedPortal ? JSON.parse(storedPortal) : [];
    const elPlaylists = document.getElementById('dash-count-playlists');
    if (elPlaylists) elPlaylists.textContent = `${playlists.length || 1} Ativa`;
  },

  // Cenas cinematográficas épicas e em alta definição (16:9 Widescreen)
  CINEMA_BACKDROPS: [
    'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1920&auto=format&fit=crop', // Sala de Cinema e Luzes
    'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=1920&auto=format&fit=crop', // Duna / Deserto Sci-Fi
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1920&auto=format&fit=crop', // Interestelar / Espaço Cósmico
    'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?q=80&w=1920&auto=format&fit=crop', // Cyberpunk / Cidade Noturna
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1920&auto=format&fit=crop', // Épico Fantasia / Natureza
    'https://images.unsplash.com/photo-1514565131-fce0801e5785?q=80&w=1920&auto=format&fit=crop', // Gotham / Metrópole Noturna
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1920&auto=format&fit=crop', // Cinema Clássico
    'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=1920&auto=format&fit=crop'  // Ação e Aventura
  ],
  backdropIndex: 0,
  backdropInterval: null,

  initCinemaBackdropSlideshow() {
    const l1 = document.getElementById('cinema-backdrop-1');
    const l2 = document.getElementById('cinema-backdrop-2');
    if (!l1 || !l2) return;

    let activeLayer = l1;
    let nextLayer = l2;

    // Define a primeira cena cinematográfica imediatamente
    activeLayer.style.backgroundImage = `url("${this.CINEMA_BACKDROPS[0]}")`;
    activeLayer.classList.add('active');

    if (this.backdropInterval) clearInterval(this.backdropInterval);

    // Faz transição suave entre cenas de filmes a cada 8.5 segundos
    this.backdropInterval = setInterval(() => {
      this.backdropIndex = (this.backdropIndex + 1) % this.CINEMA_BACKDROPS.length;
      const nextUrl = this.CINEMA_BACKDROPS[this.backdropIndex];

      const img = new Image();
      img.onload = () => {
        nextLayer.style.backgroundImage = `url("${nextUrl}")`;
        nextLayer.classList.add('active');
        activeLayer.classList.remove('active');

        // Alterna camadas ativas para crossfade suave
        const temp = activeLayer;
        activeLayer = nextLayer;
        nextLayer = temp;
      };
      img.src = nextUrl;
    }, 8500);
  },

  getActiveSectionData() {
    if (!this.playlistData) {
      return { channels: [], categories: ['Todos'] };
    }
    if (!this.playlistData.live || !this.playlistData.movies || !this.playlistData.series || !this.playlistData.series.rawEpisodes) {
      this.playlistData = M3UParser.reorganizeCachedData(this.playlistData);
    }

    if (this.activeSection === 'movies') {
      return this.playlistData.movies || { channels: [], categories: ['Todos'] };
    } else if (this.activeSection === 'series') {
      return this.playlistData.series || { channels: [], categories: ['Todos'] };
    } else {
      return this.playlistData.live || { channels: [], categories: ['Todos'] };
    }
  },

  bindEvents() {
    // 1. Alternador de Abas de Login (Xtream Codes vs Link M3U)
    document.getElementById('tab-login-xtream')?.addEventListener('click', () => {
      document.getElementById('tab-login-xtream')?.classList.add('active');
      document.getElementById('tab-login-m3u')?.classList.remove('active');
      const xtreamForm = document.getElementById('reseller-login-form');
      const m3uForm = document.getElementById('m3u-login-form');
      if (xtreamForm) xtreamForm.style.display = 'block';
      if (m3uForm) m3uForm.style.display = 'none';
    });

    document.getElementById('tab-login-m3u')?.addEventListener('click', () => {
      document.getElementById('tab-login-m3u')?.classList.add('active');
      document.getElementById('tab-login-xtream')?.classList.remove('active');
      const xtreamForm = document.getElementById('reseller-login-form');
      const m3uForm = document.getElementById('m3u-login-form');
      if (xtreamForm) xtreamForm.style.display = 'none';
      if (m3uForm) m3uForm.style.display = 'block';
    });

    // Login do Provedor (Xtream Codes)
    const form = document.getElementById('reseller-login-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleProviderLogin();
    });

    // Login com Link M3U Direto
    const m3uForm = document.getElementById('m3u-login-form');
    m3uForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleM3uLogin();
    });

    // 2. Pular e Ir para o Início
    document.getElementById('btn-skip-login')?.addEventListener('click', () => {
      this.goToScreen('home');
    });

    // Alternar visibilidade da senha na tela de login
    document.getElementById('btn-toggle-login-pass')?.addEventListener('click', (e) => {
      e.preventDefault();
      const passInput = document.getElementById('input-reseller-pass');
      const eyeBtn = document.getElementById('btn-toggle-login-pass');
      if (!passInput) return;
      if (passInput.type === 'password') {
        passInput.type = 'text';
        if (eyeBtn) eyeBtn.textContent = '🙈';
      } else {
        passInput.type = 'password';
        if (eyeBtn) eyeBtn.textContent = '👁️';
      }
    });

    // Ajuda na tela de login
    document.getElementById('link-login-help')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showToast('Use as credenciais do seu provedor ou escaneie o QR Code para gerenciar pelo site.');
    });

    // Restaurar credenciais salvas se houver
    try {
      const savedCode = localStorage.getItem('vion_saved_provider_code');
      const savedUser = localStorage.getItem('vion_saved_provider_user');
      if (savedCode && document.getElementById('input-reseller-code')) {
        document.getElementById('input-reseller-code').value = savedCode;
      }
      if (savedUser && document.getElementById('input-reseller-user')) {
        document.getElementById('input-reseller-user').value = savedUser;
      }
    } catch (e) {}

    // Ir para Login a partir de Configurações
    document.getElementById('btn-goto-login')?.addEventListener('click', () => {
      this.goToScreen('reseller-login');
    });

    // 3. Topo Dashboard: Reload & Exit
    document.getElementById('btn-top-reload')?.addEventListener('click', () => {
      this.syncPlaylistsFromPortal(true, true);
    });

    document.getElementById('btn-top-exit')?.addEventListener('click', () => {
      this.openDialog('Sair do Aplicativo?', 'Deseja realmente fechar o Vion Player?', () => {
        if (window.AndroidDevice && typeof AndroidDevice.exitApp === 'function') {
          AndroidDevice.exitApp();
          return;
        }
        if (window.tizen) { try { tizen.application.getCurrentApplication().exit(); } catch(e) {} return; }
        if (window.webOS) { try { window.close(); } catch(e) {} return; }
        window.close();
      });
    });

    // Botão de Favoritos na tela ao vivo
    document.getElementById('btn-live-favorites')?.addEventListener('click', () => {
      this.openFavoritesSection();
    });

    // 4. Cards Oficiais (Live Tv, Movies, Series, Playlist, Settings)
    document.querySelectorAll('.dream-circle-item, .superplay-card, [data-action]').forEach(card => {
      card.addEventListener('click', (e) => {
        e.preventDefault();
        const action = card.getAttribute('data-action');
        if (action === 'channels' || action === 'movies' || action === 'series') {
          this.openSection(action);
        } else if (action === 'playlists') {
          this.openPlaylistsManager();
        } else if (action === 'settings') {
          this.goToScreen('settings');
        }
      });
    });

    // Botões de Voltar
    document.getElementById('btn-back-from-live')?.addEventListener('click', () => {
      this.player.stopMini();
      this.goToScreen('home');
    });

    document.getElementById('btn-back-from-vod')?.addEventListener('click', () => {
      this.goToScreen('home');
    });

    document.getElementById('btn-back-from-playlists')?.addEventListener('click', () => {
      this.goToScreen('home');
    });

    document.getElementById('btn-back-from-settings')?.addEventListener('click', () => {
      if (this.isDeviceExpired()) {
        this.goToScreen('expired');
      } else {
        this.goToScreen('home');
      }
    });

    // Botões da Tela de Licença Expirada (#screen-expired)
    document.getElementById('btn-expired-check')?.addEventListener('click', () => {
      this.verifyLicenseNow(true);
    });

    document.getElementById('btn-expired-settings')?.addEventListener('click', () => {
      this.goToScreen('settings');
    });

    document.getElementById('btn-expired-exit')?.addEventListener('click', () => {
      this.openDialog('Sair do Aplicativo?', 'Deseja realmente fechar o Vion Player?', () => {
        if (window.AndroidDevice && typeof AndroidDevice.exitApp === 'function') {
          AndroidDevice.exitApp();
          return;
        }
        if (window.tizen) { try { tizen.application.getCurrentApplication().exit(); } catch(e) {} return; }
        if (window.webOS) { try { window.close(); } catch(e) {} return; }
        window.close();
      });
    });

    document.getElementById('btn-reload-playlists-tv')?.addEventListener('click', () => {
      this.syncPlaylistsFromPortal(true, true);
    });

    // Expansão para Tela Cheia a partir do Mini-Player
    document.getElementById('btn-expand-fullscreen')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.expandMiniToFullscreen();
    });
    document.getElementById('mini-player-container')?.addEventListener('click', (e) => {
      // Se clicou no botão voltar da tela cheia ou se já está em tela cheia, não dispara expansão!
      if (e.target && e.target.closest('#btn-mini-fs-back, .mini-fs-topbar')) return;
      if (!this.player || !this.player.isMiniFullscreen) {
        this.expandMiniToFullscreen();
      }
    });

    // Modal de Séries - Fechar e Navegação de Temporadas
    document.getElementById('btn-close-series-modal')?.addEventListener('click', () => {
      this.closeSeriesModal();
    });
    document.getElementById('modal-series-details')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-series-details') {
        this.closeSeriesModal();
      }
    });

    // Modal de Detalhes de Filmes (Dream TV)
    document.getElementById('btn-movie-play')?.addEventListener('click', () => {
      this.playSelectedMovie();
    });
    document.getElementById('btn-movie-close')?.addEventListener('click', () => {
      this.closeMovieDetails();
    });
    document.getElementById('modal-movie-details')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-movie-details') {
        this.closeMovieDetails();
      }
    });

    // Modal de Trailer
    document.getElementById('btn-close-trailer')?.addEventListener('click', () => {
      this.closeTrailerModal();
    });

    document.getElementById('btn-season-prev')?.addEventListener('click', () => {
      const tabs = document.getElementById('series-seasons-tabs');
      if (tabs) tabs.scrollBy({ left: -260, behavior: 'smooth' });
    });

    document.getElementById('btn-season-next')?.addEventListener('click', () => {
      const tabs = document.getElementById('series-seasons-tabs');
      if (tabs) tabs.scrollBy({ left: 260, behavior: 'smooth' });
    });

    // Busca ao Vivo
    const liveSearchInput = document.getElementById('input-live-search');
    const liveClearBtn = document.getElementById('btn-clear-live-search');

    liveSearchInput?.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (liveClearBtn) liveClearBtn.style.display = q ? 'flex' : 'none';
      if (!q) {
        // Ao limpar a busca, mostra todos os canais da categoria ativa sem mudar o player
        const liveData = this.playlistData?.live || { channels: [] };
        this.filteredItems = liveData.channels.filter(c => this.activeCategory === 'Todos' || c.category === this.activeCategory);
        this.renderLiveChannelsList(this.filteredItems);
        return;
      }
      this.filterLiveChannelsBySearch(q);
    });

    liveClearBtn?.addEventListener('click', () => {
      if (liveSearchInput) {
        liveSearchInput.value = '';
        liveClearBtn.style.display = 'none';
        const liveData = this.playlistData?.live || { channels: [] };
        this.filteredItems = liveData.channels.filter(c => this.activeCategory === 'Todos' || c.category === this.activeCategory);
        this.renderLiveChannelsList(this.filteredItems);
        liveSearchInput.focus();
      }
    });

    // Busca VOD
    const vodSearchInput = document.getElementById('input-vod-search');
    const vodClearBtn = document.getElementById('btn-clear-vod-search');

    vodSearchInput?.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (vodClearBtn) vodClearBtn.style.display = q ? 'flex' : 'none';
      if (!q) {
        // Ao limpar a busca, mostra todos os itens da categoria ativa sem navegar
        const sectionData = this.getActiveSectionData();
        this.filteredItems = sectionData.channels.filter(c => this.activeCategory === 'Todos' || c.category === this.activeCategory);
        const badgeEl = document.getElementById('vod-count-badge');
        if (badgeEl) badgeEl.textContent = `${this.filteredItems.length.toLocaleString('pt-BR')} ${this.activeSection === 'movies' ? 'filmes' : 'séries'}`;
        this.renderedCount = 0;
        const grid = document.getElementById('vod-grid');
        if (grid) {
          grid.innerHTML = '';
          grid.scrollTop = 0;
        }
        this.renderMoreVodItems();
        return;
      }
      this.filterVodBySearch(q);
    });

    vodClearBtn?.addEventListener('click', () => {
      if (vodSearchInput) {
        vodSearchInput.value = '';
        vodClearBtn.style.display = 'none';
        const sectionData = this.getActiveSectionData();
        this.filteredItems = sectionData.channels.filter(c => this.activeCategory === 'Todos' || c.category === this.activeCategory);
        const badgeEl = document.getElementById('vod-count-badge');
        if (badgeEl) badgeEl.textContent = `${this.filteredItems.length.toLocaleString('pt-BR')} ${this.activeSection === 'movies' ? 'filmes' : 'séries'}`;
        this.renderedCount = 0;
        const grid = document.getElementById('vod-grid');
        if (grid) {
          grid.innerHTML = '';
          grid.scrollTop = 0;
        }
        this.renderMoreVodItems();
        vodSearchInput.focus();
      }
    });

    // Desconectar Provedor
    document.getElementById('btn-clear-playlist')?.addEventListener('click', () => {
      this.openDialog('Desconectar Provedor?', 'Deseja desconectar a lista e sair da conta atual?', async () => {
        await TVStorage.remove('cached_playlist');
        await TVStorage.remove('cached_playlist_time');
        const mac = localStorage.getItem('vion_mac_address');
        localStorage.removeItem(`vion_playlists_${mac}`);
        this.playlistData = null;
        this.showToast('Conta desconectada com sucesso.');
        this.goToScreen('reseller-login');
      });
    });

    // Diálogo Customizado
    document.getElementById('btn-dialog-cancel')?.addEventListener('click', () => {
      this.closeDialog();
    });

    document.getElementById('btn-dialog-confirm')?.addEventListener('click', () => {
      if (typeof this.dialogCallback === 'function') {
        this.dialogCallback();
      }
      this.closeDialog();
    });

    // Rolagem infinita para a grade VOD
    const vodGrid = document.getElementById('vod-grid');
    vodGrid?.addEventListener('scroll', () => {
      if (vodGrid.scrollTop + vodGrid.clientHeight >= vodGrid.scrollHeight - 150) {
        this.renderMoreVodItems();
      }
    });
  },

  // ===================================================================
  // CÓDIGOS DE PARCERIA (CONSUMO NO APP TV - GERENCIADOS NO PAINEL WEB)
  // ===================================================================

  getPartnershipCodes() {
    try {
      const stored = localStorage.getItem('vion_partnership_codes');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch(e) {}

    // Padrão com o código TOURO cadastrado pelo administrador
    const defaultCodes = [
      {
        id: 'code_touro',
        code: 'TOURO',
        name: 'Projeto Touro',
        server: 'http://projetotourov2.pro',
        active: true,
        createdAt: 1728000000000
      }
    ];
    this.savePartnershipCodes(defaultCodes);
    return defaultCodes;
  },

  savePartnershipCodes(codes) {
    try {
      localStorage.setItem('vion_partnership_codes', JSON.stringify(codes || []));
    } catch(e) {}
  },

  async syncPartnershipsSilently() {
    const apiUrls = [
      '/api/partnerships',
      'https://vion.gestorpro.app.br/api/partnerships',
      'http://192.168.1.197:3000/api/partnerships',
      'http://localhost:3000/api/partnerships'
    ];
    for (const u of apiUrls) {
      try {
        const res = await fetch(u, { cache: 'no-cache' });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.partnerships)) {
            this.savePartnershipCodes(data.partnerships);
            return;
          }
        }
      } catch(e) {}
    }
  },

  async handleProviderLogin() {
    const rawInput = document.getElementById('input-reseller-code').value.trim();
    const codeUpper = rawInput.toUpperCase().replace(/\s+/g, '');
    const user = document.getElementById('input-reseller-user').value.trim();
    const pass = document.getElementById('input-reseller-pass').value.trim();

    if (!rawInput || !user || !pass) {
      this.showToast('Preencha o código, usuário e senha.');
      return;
    }

    // Tenta atualizar parcerias do painel do administrador em tempo real
    try { await this.syncPartnershipsSilently(); } catch(e) {}

    // 1. Busca nos códigos de parceria cadastrados pelo administrador
    const partnershipCodes = this.getPartnershipCodes();
    const partner = partnershipCodes.find(p => (p.code || '').trim().toUpperCase() === codeUpper);

    // Se o código NÃO existir: bloqueia completamente!
    if (!partner) {
      this.showToast(`❌ Código de parceria "${rawInput}" não cadastrado!`);
      return;
    }

    // Se o código existir mas estiver DESATIVADO pelo administrador: bloqueia o login!
    if (!partner.active) {
      this.showToast(`⚠️ O código de parceria "${partner.code}" está desativado!`);
      return;
    }

    // Código válido e ATIVO: conecta ao servidor correspondente
    this.showToast(`Conectando ao provedor (${partner.name || partner.code})...`);

    const serverUrl = partner.server.replace(/\/+$/, '');
    let playlistUrl = `${serverUrl}/get.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&type=m3u_plus`;

    if (partner.server === 'demo' || codeUpper === 'DEMO' || user.toLowerCase() === 'demo') {
      playlistUrl = 'demo';
    }

    const mac = localStorage.getItem('vion_mac_address');
    const newPlaylist = {
      id: Date.now().toString(),
      name: `${partner.name || partner.code} (${user})`,
      url: playlistUrl,
      providerCode: partner.code,
      user: user
    };

    localStorage.setItem(`vion_playlists_${mac}`, JSON.stringify([newPlaylist]));

    // Lembrar dados se o checkbox estiver ativo
    try {
      const chk = document.getElementById('chk-remember-login');
      if (chk && chk.checked) {
        localStorage.setItem('vion_saved_provider_code', rawInput);
        localStorage.setItem('vion_saved_provider_user', user);
      } else {
        localStorage.removeItem('vion_saved_provider_code');
        localStorage.removeItem('vion_saved_provider_user');
      }
    } catch (e) {}

    this.activatePlaylistByUrl(playlistUrl, newPlaylist.name, true);

    setTimeout(() => {
      this.goToScreen('home');
    }, 400);
  },

  handleM3uLogin() {
    const nameInput = document.getElementById('input-m3u-name');
    const urlInput = document.getElementById('input-m3u-url');
    const name = (nameInput?.value.trim()) || 'Minha Lista M3U';
    const url = (urlInput?.value.trim()) || '';

    if (!url) {
      this.showToast('Por favor, informe a URL da playlist M3U.');
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      this.showToast('A URL deve começar com http:// ou https://');
      return;
    }

    this.showToast(`Conectando à playlist M3U...`);

    const mac = localStorage.getItem('vion_mac_address');
    const newPlaylist = {
      id: Date.now().toString(),
      name: name,
      url: url,
      type: 'm3u'
    };

    localStorage.setItem(`vion_playlists_${mac}`, JSON.stringify([newPlaylist]));
    this.activatePlaylistByUrl(url, name, true);

    setTimeout(() => {
      this.goToScreen('home');
    }, 400);
  },

  async activateEvaluationMode() {
    this.showToast('Iniciando modo de avaliação oficial...');
    const demo = M3UParser.parse(M3UParser.DEMO_PLAYLIST);
    this.playlistData = demo;
    await M3UParser.saveToCache(demo);

    const mac = localStorage.getItem('vion_mac_address');
    const evalPlaylist = {
      id: 'eval_1',
      name: 'Demonstração Pública (Creative Commons)',
      url: 'demo'
    };
    localStorage.setItem(`vion_playlists_${mac}`, JSON.stringify([evalPlaylist]));
    this.updateDashboardCounters();

    this.showToast('✔ Ambiente de avaliação pronto para testes!');
    setTimeout(() => {
      this.goToScreen('home');
    }, 300);
  },

  showSyncProgress(title, status, subtitle) {
    const modal = document.getElementById('modal-sync-progress');
    const titleEl = document.getElementById('sync-modal-title');
    const statusEl = document.getElementById('sync-modal-status');
    const subEl = document.getElementById('sync-modal-subtitle');
    if (!modal) return;
    if (title && titleEl) titleEl.textContent = title;
    if (status && statusEl) statusEl.textContent = status;
    if (subtitle && subEl) subEl.textContent = subtitle;
    modal.classList.add('active');
  },

  hideSyncProgress() {
    const modal = document.getElementById('modal-sync-progress');
    if (modal) modal.classList.remove('active');
  },

  activatePlaylistByUrl(url, name, notify = true, isInitialSplash = false, forceSync = false) {
    if (this.isSyncing) return Promise.resolve(this.playlistData);

    // Se já estiver com essa URL carregada, dados em memória e schema 25 válido, só pula se NÃO for forçado
    if (!forceSync && this.activePlaylistUrl === url && this.playlistData && this.playlistData.channels && this.playlistData.channels.length > 0 && this.playlistData._schemaVersion === 25) {
      if (this.currentScreen === 'reseller-login' || this.currentScreen === 'loading') {
        this.goToScreen('home');
      }
      return Promise.resolve(this.playlistData);
    }

    if (url === 'demo') {
      const demo = M3UParser.parse(M3UParser.DEMO_PLAYLIST);
      this.playlistData = demo;
      this.activePlaylistUrl = 'demo';
      M3UParser.saveToCache(demo);
      this.updateDashboardCounters();
      this.goToScreen('home');
      if (notify) this.showToast(`✔ Conectado à demonstração!`);
      return Promise.resolve(demo);
    }

    this.isSyncing = true;

    const onProgress = (percent, title, status) => {
      if (isInitialSplash || this.currentScreen === 'loading') {
        this.setSplashProgress(percent, title, status);
      } else {
        this.showSyncProgress(title, status, `Progresso: ${percent}%`);
        const fill = document.getElementById('sync-progress-bar-fill');
        if (fill) fill.style.width = `${percent}%`;
      }
    };

    onProgress(10, `Sincronizando ${name}`, 'Iniciando conexão...');

    return M3UParser.fetchPlaylist(url, onProgress)
      .then(async (parsed) => {
        onProgress(90, `Sincronizando ${name}`, 'Gravando catálogo no dispositivo...');
        this.playlistData = parsed;
        this.activePlaylistUrl = url;
        localStorage.setItem('vion_has_playlist', 'true');
        localStorage.setItem('vion_active_playlist_url', url);

        await M3UParser.saveToCache(parsed);
        this.updateDashboardCounters();

        const liveCount = parsed.live?.channels?.length || 0;
        const movieCount = parsed.movies?.channels?.length || 0;
        const seriesCount = parsed.series?.channels?.length || 0;

        onProgress(100, '✔ Sincronização Concluída!', `${liveCount} canais • ${movieCount} filmes • ${seriesCount} séries`);

        await new Promise(r => setTimeout(r, 600));
        this.hideSyncProgress();
        if (this.isDeviceExpired()) {
          this.goToScreen('expired');
        } else {
          this.goToScreen('home');
        }

        return parsed;
      })
      .catch(err => {
        console.warn('Erro ao carregar lista da URL:', err);
        if (isInitialSplash || this.currentScreen === 'loading') {
          this.setSplashProgress(100, 'Falha ao sincronizar', err.message || 'Verifique o servidor');
          setTimeout(() => this.goToScreen('reseller-login'), 1800);
        } else {
          this.showSyncProgress(`❌ Falha na Sincronização`, err.message || 'Verifique o link ou se o servidor está ativo', 'Tentando novamente...');
          setTimeout(() => this.hideSyncProgress(), 3200);
        }
        this.showToast(`Falha ao sincronizar: ${err.message || 'Verifique o link'}`);
      })
      .finally(() => {
        this.isSyncing = false;
      });
  },

  async syncPlaylistsFromPortal(notify = true, forceSync = false) {
    if (this.isSyncing) return;
    const mac = localStorage.getItem('vion_mac_address');
    if (!mac) return;

    if (notify) this.showToast('Buscando atualizações no Portal...');
    const first = await this.queryPortalPlaylists(mac);
    if (first && first.url) {
      if (!forceSync && this.activePlaylistUrl === first.url && this.playlistData && this.playlistData.channels && this.playlistData.channels.length > 0 && this.playlistData._schemaVersion === 25) {
        if (this.currentScreen === 'reseller-login') this.goToScreen('home');
        if (notify) this.showToast('Playlist já está sincronizada e ativa.');
        return;
      }
      if (notify) this.showToast(`Carregando "${first.name}" do Portal...`);
      await this.activatePlaylistByUrl(first.url, first.name, notify, false, forceSync);
    } else {
      if (notify) this.showToast('Nenhuma playlist nova encontrada no portal.');
    }
  },

  startPortalAutoPolling() {
    if (this.portalAutoPollTimer) clearInterval(this.portalAutoPollTimer);
    this.portalAutoPollTimer = setInterval(async () => {
      // Só pesquisa se ainda NÃO tiver playlist carregada e estiver na tela de login
      if (this.currentScreen === 'reseller-login' && !this.isSyncing && (!this.playlistData || !this.playlistData.channels || this.playlistData.channels.length === 0)) {
        const mac = localStorage.getItem('vion_mac_address');
        const p = await this.queryPortalPlaylists(mac);
        if (p && p.url && !this.isSyncing) {
          this.activatePlaylistByUrl(p.url, p.name || 'Portal Playlist', true, false);
        }
      }
    }, 4000);
  },

  openPlaylistsManager() {
    this.goToScreen('playlists');

    const mac = localStorage.getItem('vion_mac_address');
    const container = document.getElementById('tv-playlists-list');
    if (!container) return;

    container.innerHTML = '';
    const stored = localStorage.getItem(`vion_playlists_${mac}`);
    let playlists = stored ? JSON.parse(stored) : [];

    if (playlists.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:30px;font-size:14px;">Nenhuma playlist ativa no dispositivo.<br>Adicione pelo portal ou via provedor.</div>';
      return;
    }

    playlists.forEach(p => {
      const item = document.createElement('div');
      item.className = 'playlist-tv-item focusable';
      item.setAttribute('tabindex', '0');

      item.innerHTML = `
        <div class="playlist-tv-left">
          <span class="playlist-tv-badge">${escapeHtml(p.name)}</span>
          <div>
            <div class="playlist-tv-title">${escapeHtml(p.name)}</div>
            <div class="playlist-tv-status">● Lista Ativa no Dispositivo</div>
          </div>
        </div>
        <div class="pill-btn" style="padding: 6px 16px; font-size: 13px;">Recarregar</div>
      `;

      item.addEventListener('click', () => {
        this.activatePlaylistByUrl(p.url, p.name, true);
        setTimeout(() => this.goToScreen('home'), 400);
      });

      container.appendChild(item);
    });
  },

  // ===================================================================
  // NAVEGAÇÃO E ABERTURA DE SEÇÕES (LIVE TV vs FILMES vs SÉRIES)
  // ===================================================================
  openSection(sectionType) {
    if (this.isDeviceExpired()) {
      this.goToScreen('expired');
      return;
    }

    if (!this.playlistData || !this.playlistData.channels || this.playlistData.channels.length === 0) {
      this.showToast('Nenhuma lista ativa. Adicione em Playlists ou conecte um provedor.');
      this.openPlaylistsManager();
      return;
    }

    if (!this.playlistData.live || !this.playlistData.movies || !this.playlistData.series || !this.playlistData.series.rawEpisodes) {
      this.playlistData = M3UParser.reorganizeCachedData(this.playlistData);
    }

    this.activeSection = sectionType;

    if (sectionType === 'channels') {
      // Abre Tela de Canais ao Vivo Super Play (Imagem 4: 3 Colunas)
      this.setupLiveTvScreen();
      this.goToScreen('channels');
    } else {
      // Abre Tela de Filmes ou Séries Super Play (Imagem 3: Posters Verticais)
      this.setupVodScreen(sectionType);
      this.goToScreen('vod');
    }
  },

  // ===================================================================
  // 1. TELA DE CANAIS AO VIVO (3 COLUNAS - IDÊNTICO À IMAGEM 4)
  // ===================================================================
  setupLiveTvScreen() {
    const liveData = this.playlistData.live || { channels: [], categories: ['Todos'] };
    const categoriesContainer = document.getElementById('live-categories-list');
    if (!categoriesContainer) return;

    categoriesContainer.innerHTML = '';

    // Insere categorias
    const cats = liveData.categories && liveData.categories.length > 0 ? liveData.categories : ['Todos'];

    cats.forEach((cat, idx) => {
      const pill = document.createElement('div');
      pill.className = `live-cat-pill focusable ${idx === 0 ? 'active-cat' : ''}`;
      pill.setAttribute('tabindex', '0');
      pill.textContent = cat;

      pill.addEventListener('click', () => {
        this.selectLiveCategory(cat, pill);
      });

      categoriesContainer.appendChild(pill);
    });

    // Seleciona a primeira categoria
    this.selectLiveCategory(cats[0], categoriesContainer.firstChild);
  },

  selectLiveCategory(categoryName, pillElement) {
    this.activeCategory = categoryName;

    // Atualiza pills de categoria
    document.querySelectorAll('.live-cat-pill').forEach(el => el.classList.remove('active-cat'));
    if (pillElement) pillElement.classList.add('active-cat');

    const titleEl = document.getElementById('live-active-cat-title');
    if (titleEl) titleEl.textContent = categoryName;

    const liveData = this.playlistData.live || { channels: [] };

    let baseList = [];
    if (categoryName === 'Todos') {
      baseList = liveData.channels;
    } else {
      baseList = liveData.channels.filter(c => c.category === categoryName);
    }

    this.filteredItems = baseList;
    this.renderLiveChannelsList(this.filteredItems);

    // Toca o primeiro canal automaticamente no Mini-Player e carrega o EPG
    if (this.filteredItems.length > 0) {
      this.activeChannelIndex = 0;
      const firstCh = this.filteredItems[0];
      this.player.playMiniStream(firstCh.url, firstCh.name, firstCh.category);
      this.updateChannelEpgSchedule(firstCh);
    }
  },

  renderLiveChannelsList(channels) {
    const container = document.getElementById('live-channels-list');
    if (!container) return;

    container.innerHTML = '';
    this.renderedChannelsCount = 0;
    this.currentLiveList = channels || [];

    this.renderMoreLiveChannels();
  },

  renderMoreLiveChannels() {
    const container = document.getElementById('live-channels-list');
    if (!container || !this.currentLiveList) return;
    if (this.renderedChannelsCount >= this.currentLiveList.length) return;

    const CHUNK_SIZE = 60;
    const batch = this.currentLiveList.slice(this.renderedChannelsCount, this.renderedChannelsCount + CHUNK_SIZE);
    const fragment = document.createDocumentFragment();

    batch.forEach((ch, localIdx) => {
      const idx = this.renderedChannelsCount + localIdx;
      const row = document.createElement('div');
      row.className = `live-ch-row focusable ${idx === this.activeChannelIndex ? 'active-playing' : ''}`;
      row.setAttribute('tabindex', '0');

      const rawLogo = (ch.logo || '').trim();
      const cleanLogo = (typeof normalizeImageUrl === 'function') ? normalizeImageUrl(rawLogo) : rawLogo;
      const logoImg = cleanLogo 
        ? `<img src="${cleanLogo}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<span style=\\'font-size: 16px;\\'>📺</span>';" />`
        : `<span style="font-size: 16px;">📺</span>`;

      row.innerHTML = `
        <div class="live-ch-num">${idx + 1}</div>
        <div class="live-ch-logo">${logoImg}</div>
        <div class="live-ch-info">
          <div class="live-ch-name">${escapeHtml(ch.name)}</div>
          <div class="live-ch-sub">${escapeHtml(ch.category)}</div>
        </div>
      `;

      // Ao navegar pelo controle da TV (Cima/Baixo): apenas atualiza o EPG/guia, SEM trocar o canal da transmissão!
      row.addEventListener('focus', () => {
        clearTimeout(this.previewFocusTimer);
        this.previewFocusTimer = setTimeout(() => {
          if (this.currentScreen === 'channels') {
            this.updateChannelEpgSchedule(ch);
          }
        }, 120);

        // Se estiver chegando perto do fim da lista renderizada, carrega próximo lote automaticamente
        if (idx >= this.renderedChannelsCount - 12 && this.renderedChannelsCount < this.currentLiveList.length) {
          this.renderMoreLiveChannels();
        }
      });

      // Ao clicar ou pressionar OK/Enter no controle remoto: troca de canal, ou abre tela cheia se já for o ativo
      row.addEventListener('click', () => {
        clearTimeout(this.previewFocusTimer);
        if (this.activeChannelIndex === idx) {
          // Se clicou no canal que já está tocando, expande para tela cheia
          this.expandMiniToFullscreen();
        } else {
          // Canal novo: muda o canal ativo, inicia o stream no mini-player e atualiza o EPG
          this.activeChannelIndex = idx;
          document.querySelectorAll('.live-ch-row').forEach(r => r.classList.remove('active-playing'));
          row.classList.add('active-playing');

          this.player.playMiniStream(ch.url, ch.name, ch.category);
          this.updateChannelEpgSchedule(ch);
        }
      });

      // Duplo clique ou duplo toque rápido: abre tela cheia instantaneamente
      row.addEventListener('dblclick', () => {
        this.activeChannelIndex = idx;
        this.expandMiniToFullscreen();
      });

      fragment.appendChild(row);
    });

    container.appendChild(fragment);
    this.renderedChannelsCount += batch.length;
  },

  filterLiveChannelsBySearch(query) {
    const q = (query || '').toLowerCase().trim();
    const liveData = this.playlistData.live || { channels: [] };

    if (!q) {
      this.selectLiveCategory(this.activeCategory);
      return;
    }

    const matched = liveData.channels.filter(c => 
      c.name.toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q)
    );

    this.filteredItems = matched;
    this.renderLiveChannelsList(matched);
  },

  expandMiniToFullscreen() {
    if (!this.filteredItems || this.filteredItems.length === 0) return;
    const current = this.filteredItems[this.activeChannelIndex] || this.filteredItems[0];
    
    // 1. Android TV: Abre PlayerActivity de hardware nativo do Android (1080p60 FHD impecável, sem travamentos)
    if (window.AndroidDevice && typeof AndroidDevice.openPlayer === 'function') {
      this.player.stopMini();
      AndroidDevice.openPlayer(current.url, current.name, current.category, false);
      return;
    }

    // 2. Outras plataformas (LG webOS, Tizen, Web):
    this.player.expandMiniFullscreen(current.name, current.category, this.activeChannelIndex + 1);
  },

  nextMiniChannel() {
    if (!this.filteredItems || this.filteredItems.length === 0) return;
    this.activeChannelIndex = (this.activeChannelIndex + 1) % this.filteredItems.length;
    this.updateActiveChannelUiAndStream(true);
  },

  previousMiniChannel() {
    if (!this.filteredItems || this.filteredItems.length === 0) return;
    this.activeChannelIndex = (this.activeChannelIndex - 1 + this.filteredItems.length) % this.filteredItems.length;
    this.updateActiveChannelUiAndStream(true);
  },

  updateActiveChannelUiAndStream(unmuted = false) {
    const ch = this.filteredItems[this.activeChannelIndex];
    if (!ch) return;

    this.updateChannelEpgSchedule(ch);

    document.querySelectorAll('.live-ch-row').forEach((r, idx) => {
      r.classList.toggle('active-playing', idx === this.activeChannelIndex);
    });

    this.player.playMiniStream(ch.url, ch.name, ch.category);

    if (unmuted && this.player && this.player.isMiniFullscreen) {
      if (this.player.miniVideo) {
        this.player.miniVideo.muted = false;
      }
      const osdTitle = document.getElementById('mini-fs-title');
      const osdCat = document.getElementById('mini-fs-cat');
      const osdNum = document.getElementById('mini-fs-num');
      if (osdTitle) osdTitle.textContent = ch.name;
      if (osdCat) osdCat.textContent = ch.category;
      if (osdNum) osdNum.textContent = `Canal ${this.activeChannelIndex + 1}`;
      this.player.showMiniFullscreenOsd(true);
      clearTimeout(this.player.miniFsOsdTimer);
      this.player.miniFsOsdTimer = setTimeout(() => this.player.showMiniFullscreenOsd(false), 4000);
    }
  },

  // ===================================================================
  // 2. TELA DE FILMES E SÉRIES VOD (POSTERS VERTICAIS 2:3 - IMAGEM 3)
  // ===================================================================
  getCategoryIcon(catName) {
    const name = (catName || '').toLowerCase().trim();
    if (name === 'todos' || name === 'recently added') return '🌟';
    if (name.includes('netflix')) return '🔴';
    if (name.includes('prime') || name.includes('amazon')) return '🔵';
    if (name.includes('disney')) return '✨';
    if (name.includes('hbo') || name.includes('max')) return '🟣';
    if (name.includes('apple')) return '⚪';
    if (name.includes('globo')) return '🟠';
    if (name.includes('paramount')) return '⭐';
    if (name.includes('star')) return '⚡';
    if (name.includes('brasil paralelo')) return '🟢';
    if (name.includes('discovery')) return '🌍';
    if (name.includes('sbt')) return '🟡';
    if (name.includes('anime')) return '⚡';
    if (name.includes('4k') || name.includes('uhd')) return '💎';
    if (name.includes('novela')) return '📺';
    if (name.includes('infantil') || name.includes('kids') || name.includes('desenho')) return '🎈';
    if (name.includes('ação') || name.includes('acao')) return '💥';
    if (name.includes('comédia') || name.includes('comedia')) return '🎭';
    if (name.includes('terror') || name.includes('suspense')) return '👻';
    if (name.includes('ficção') || name.includes('ficcao') || name.includes('sci-fi')) return '🚀';
    if (name.includes('document')) return '📜';
    if (name.includes('guerra') || name.includes('faroeste')) return '⚔️';
    if (name.includes('romance') || name.includes('drama')) return '🌹';
    return '🎬';
  },

  setupVodScreen(type) {
    this.activeSection = type;
    const sectionData = type === 'movies' ? this.playlistData.movies : this.playlistData.series;
    if (!sectionData) return;

    const headingEl = document.getElementById('vod-section-heading');
    if (headingEl) {
      headingEl.textContent = type === 'movies' ? 'Movies | Recently Added' : 'Series | Recently Added';
    }

    // Calcula a contagem de cada categoria
    const catCounts = {};
    (sectionData.channels || []).forEach(item => {
      const cat = item.category || 'Outros';
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    });

    // Atualiza contadores das categorias rápidas (Imagem 2)
    const favs = this.getFavorites().filter(f => f.type === type);
    const countFavsEl = document.getElementById('count-favorites');
    if (countFavsEl) countFavsEl.textContent = favs.length;

    const countRecentEl = document.getElementById('count-recently-added');
    if (countRecentEl) countRecentEl.textContent = Math.min(100, (sectionData.channels || []).length);

    const countContinueEl = document.getElementById('count-continue-watching');
    if (countContinueEl) countContinueEl.textContent = '0';

    // Eventos das categorias rápidas (Imagem 2)
    const quickContinue = document.getElementById('cat-continue-watching');
    if (quickContinue) {
      quickContinue.onclick = () => {
        this.selectQuickCategory('continue', quickContinue);
      };
    }
    const quickFav = document.getElementById('cat-favorites');
    if (quickFav) {
      quickFav.onclick = () => {
        this.selectQuickCategory('favorites', quickFav);
      };
    }
    const quickRecent = document.getElementById('cat-recently-added');
    if (quickRecent) {
      quickRecent.onclick = () => {
        this.selectQuickCategory('recent', quickRecent);
      };
    }

    const categoriesContainer = document.getElementById('vod-categories-list');
    if (!categoriesContainer) return;

    categoriesContainer.innerHTML = '';
    const cats = sectionData.categories && sectionData.categories.length > 0 ? sectionData.categories : ['Todos'];

    cats.forEach((cat) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'vod-sidebar-item focusable';
      itemEl.setAttribute('tabindex', '0');
      const count = catCounts[cat] || (cat === 'Todos' ? (sectionData.channels || []).length : 0);
      itemEl.innerHTML = `
        <span class="vod-cat-name">${escapeHtml(cat)}</span>
        <span class="vod-cat-count">${count}</span>
      `;

      itemEl.addEventListener('click', () => {
        this.selectVodCategory(cat, itemEl);
      });

      categoriesContainer.appendChild(itemEl);
    });

    // Inicia na primeira categoria dinâmica
    if (categoriesContainer.firstChild) {
      this.selectVodCategory(cats[0], categoriesContainer.firstChild);
    }
  },

  selectQuickCategory(type, el) {
    document.querySelectorAll('.vod-sidebar-item').forEach(item => item.classList.remove('active-cat'));
    if (el) el.classList.add('active-cat');

    const sectionData = this.getActiveSectionData();
    const headingEl = document.getElementById('vod-section-heading');

    if (type === 'favorites') {
      if (headingEl) headingEl.textContent = `${this.activeSection === 'movies' ? 'Movies' : 'Series'} | Favorites`;
      const favs = this.getFavorites().filter(f => f.type === this.activeSection);
      const favKeys = new Set(favs.map(f => f.url || f.name));
      let matches = (sectionData.channels || []).filter(c => favKeys.has(c.url || c.name));
      if (matches.length === 0) matches = favs;
      this.filteredItems = matches;
    } else if (type === 'recent') {
      if (headingEl) headingEl.textContent = `${this.activeSection === 'movies' ? 'Movies' : 'Series'} | Recently Added`;
      this.filteredItems = (sectionData.channels || []).slice(0, 100);
    } else if (type === 'continue') {
      if (headingEl) headingEl.textContent = `${this.activeSection === 'movies' ? 'Movies' : 'Series'} | Continue Watching`;
      this.filteredItems = [];
    }

    const badgeEl = document.getElementById('vod-count-badge');
    if (badgeEl) {
      badgeEl.textContent = `${this.filteredItems.length} itens`;
    }

    this.renderedCount = 0;
    const grid = document.getElementById('vod-grid');
    if (grid) {
      grid.innerHTML = '';
      grid.scrollTop = 0;
    }
    this.renderMoreVodItems();
  },

  updateVodFavoritesCount() {
    const favs = this.getFavorites().filter(f => f.type === this.activeSection);
    const countFavsEl = document.getElementById('count-favorites');
    if (countFavsEl) countFavsEl.textContent = favs.length;
  },

  selectVodCategory(categoryName, pillElement) {
    this.activeCategory = categoryName;

    document.querySelectorAll('.vod-sidebar-item').forEach(el => el.classList.remove('active-cat'));
    if (pillElement) pillElement.classList.add('active-cat');

    const headingEl = document.getElementById('vod-section-heading');
    if (headingEl) headingEl.textContent = categoryName;

    const sectionData = this.getActiveSectionData();
    let baseList = [];

    if (categoryName === 'Todos' || categoryName === 'Recently added') {
      if (this.activeSection === 'movies') {
        // "Todos" filtra e não exibe filmes de conteúdo adulto (+18) logo de cara
        baseList = sectionData.channels.filter(c => !c.isAdult);
      } else {
        // "Todos" em séries também filtra e não exibe animes/hentai +18 logo de cara
        baseList = sectionData.channels.filter(c => !c.isAdult);
      }
    } else {
      baseList = sectionData.channels.filter(c => c.category === categoryName);
    }

    this.filteredItems = baseList;
    const badgeEl = document.getElementById('vod-count-badge');
    if (badgeEl) {
      const unit = this.activeSection === 'movies' ? 'filmes' : 'séries';
      badgeEl.textContent = `${this.filteredItems.length.toLocaleString('pt-BR')} ${unit}`;
    }

    this.renderedCount = 0;
    const grid = document.getElementById('vod-grid');
    if (grid) {
      grid.innerHTML = '';
      grid.scrollTop = 0;
    }
    this.renderMoreVodItems();

    if (this.filteredItems.length > 0) {
      const firstItem = this.filteredItems[0];
      const bg = document.getElementById('vod-dynamic-backdrop');
      if (bg) {
        const raw = (firstItem.backdrop || firstItem.logo || '').trim();
        const clean = (typeof normalizeImageUrl === 'function') ? normalizeImageUrl(raw) : raw;
        if (clean && clean.startsWith('http')) {
          bg.style.backgroundImage = `url("${clean}")`;
          bg.classList.add('visible');
        }
      }
    }
  },

  renderMoreVodItems() {
    const grid = document.getElementById('vod-grid');
    if (!grid || this.renderedCount >= this.filteredItems.length) return;

    const batch = this.filteredItems.slice(this.renderedCount, this.renderedCount + this.PAGE_SIZE);
    const fragment = document.createDocumentFragment();

    batch.forEach((item, idx) => {
      const realIndex = this.renderedCount + idx;
      const card = document.createElement('div');
      card.className = 'vod-poster-card focusable';
      card.setAttribute('tabindex', '0');

      const isSeries = this.activeSection === 'series' || item.type === 'series_group';
      const defaultIcon = isSeries ? '🍿' : '🎬';


      const createFallbackCover = () => {
        const fallback = document.createElement('div');
        fallback.className = 'poster-fallback-cover';
        fallback.innerHTML = `
          <span class="fallback-icon">${defaultIcon}</span>
          <span class="fallback-title">${escapeHtml(item.name)}</span>
        `;
        return fallback;
      };

      const thumbContainer = document.createElement('div');
      thumbContainer.className = 'vod-poster-thumb';

      // 1. Capa fallback base com ícone e título (fica sempre por baixo a z-index: 1)
      thumbContainer.appendChild(createFallbackCover());

      // 2. Imagem oficial do poster (sobrepõe o fallback a z-index: 2 quando carrega)
      const rawLogo = (item.logo || '').trim();
      const logoUrl = (typeof normalizeImageUrl === 'function') ? normalizeImageUrl(rawLogo) : rawLogo;

      const img = document.createElement('img');
      img.alt = item.name;
      img.referrerPolicy = 'no-referrer';
      img.loading = 'lazy';
      img.decoding = 'async';

      img.onload = () => {
        img.classList.remove('img-hidden');
        img.style.opacity = '1';
        img.style.display = 'block';
      };

      let triedTmdb = false;
      const fetchTmdbCover = () => {
        if (triedTmdb) return;
        triedTmdb = true;
        TmdbResolver.resolve(item.name, isSeries).then(meta => {
          if (meta && meta.poster) {
            item.logo = meta.poster;
            if (meta.backdrop && !item.backdrop) item.backdrop = meta.backdrop;
            if (meta.plot && !item.plot) item.plot = meta.plot;
            if (meta.rating && !item.rating) item.rating = meta.rating;
            img.classList.remove('img-hidden');
            img.style.display = 'block';
            img.style.opacity = '1';
            img.src = meta.poster;
          } else {
            if (logoUrl && logoUrl.startsWith('http')) {
              const cleanHostPath = logoUrl.replace(/^https?:\/\/(?:i[0-3]\.wp\.com\/)?/i, '');
              img.classList.remove('img-hidden');
              img.style.display = 'block';
              img.style.opacity = '1';
              img.src = `https://wsrv.nl/?url=${encodeURIComponent(cleanHostPath)}&w=300&output=jpg`;
            } else {
              img.classList.add('img-hidden');
              img.style.display = 'none';
            }
          }
        }).catch(() => {
          if (logoUrl && logoUrl.startsWith('http')) {
            const cleanHostPath = logoUrl.replace(/^https?:\/\/(?:i[0-3]\.wp\.com\/)?/i, '');
            img.classList.remove('img-hidden');
            img.style.display = 'block';
            img.style.opacity = '1';
            img.src = `https://wsrv.nl/?url=${encodeURIComponent(cleanHostPath)}&w=300&output=jpg`;
          } else {
            img.classList.add('img-hidden');
            img.style.display = 'none';
          }
        });
      };

      img.onerror = () => {
        if (!triedTmdb) {
          fetchTmdbCover();
        } else {
          img.classList.add('img-hidden');
          img.style.display = 'none';
        }
      };

      if (logoUrl && logoUrl.startsWith('http')) {
        img.src = logoUrl;
        if (img.complete && img.naturalWidth > 0) {
          img.classList.remove('img-hidden');
          img.style.opacity = '1';
          img.style.display = 'block';
        }
      } else {
        // Logo ausente na lista IPTV: busca automaticamente no TMDB!
        fetchTmdbCover();
      }
      thumbContainer.appendChild(img);


      const titleEl = document.createElement('div');
      titleEl.className = 'vod-poster-title';
      titleEl.title = item.name;
      titleEl.textContent = item.name;

      card.appendChild(thumbContainer);
      card.appendChild(titleEl);

      card.addEventListener('click', () => {
        if (isSeries) {
          this.openSeriesDetails(item);
        } else {
          this.openMovieDetails(item, realIndex);
        }
      });

      // Atualiza o fundo da tela com o pôster/fanart do filme ou série em foco
      const updateVodBackdrop = () => {
        clearTimeout(this._vodBackdropTimer);
        this._vodBackdropTimer = setTimeout(() => {
          const bg = document.getElementById('vod-dynamic-backdrop');
          if (!bg) return;
          const raw = (item.backdrop || item.logo || '').trim();
          const clean = (typeof normalizeImageUrl === 'function') ? normalizeImageUrl(raw) : raw;
          if (clean && clean.startsWith('http')) {
            bg.style.backgroundImage = `url("${clean}")`;
            bg.classList.add('visible');
          }
        }, 80);
      };
      card.addEventListener('focus', updateVodBackdrop);
      card.addEventListener('mouseenter', updateVodBackdrop);

      fragment.appendChild(card);
    });

    grid.appendChild(fragment);
    this.renderedCount += batch.length;
  },

  filterVodBySearch(query) {
    const q = (query || '').toLowerCase().trim();
    const sectionData = this.getActiveSectionData();

    if (!q) {
      this.selectVodCategory(this.activeCategory);
      return;
    }

    const matched = sectionData.channels.filter(item => 
      item.name.toLowerCase().includes(q) || (item.category || '').toLowerCase().includes(q)
    );

    this.filteredItems = matched;
    const badgeEl = document.getElementById('vod-count-badge');
    if (badgeEl) badgeEl.textContent = `${matched.length} encontrados`;

    this.renderedCount = 0;
    const grid = document.getElementById('vod-grid');
    if (grid) {
      grid.innerHTML = '';
      grid.scrollTop = 0;
    }
    this.renderMoreVodItems();
  },

  // ===================================================================
  // 3. TELA CINEMATOGRÁFICA DE SÉRIES (ESTILO NETFLIX / HBO MAX)
  // ===================================================================
  async openSeriesDetails(seriesGroup) {
    this.activeSeries = seriesGroup;
    const overlay = document.getElementById('modal-series-details');
    if (!overlay) return;

    // Título, Categoria e Metas
    const titleEl = document.getElementById('series-modal-title');
    if (titleEl) titleEl.textContent = seriesGroup.name;

    const catEl = document.getElementById('series-modal-category');
    if (catEl) catEl.textContent = seriesGroup.category || 'Séries';

    const posterEl = document.getElementById('series-hero-poster');
    const bgBackdrop = document.getElementById('series-modal-bg');
    const plotEl = document.getElementById('series-modal-plot');
    const ratingEl = document.getElementById('series-modal-rating');

    const rawLogo = (seriesGroup.logo || '').trim();
    const cleanLogo = (typeof normalizeImageUrl === 'function') ? normalizeImageUrl(rawLogo) : rawLogo;
    if (posterEl) {
      if (cleanLogo && cleanLogo.startsWith('http')) {
        posterEl.src = cleanLogo;
        posterEl.style.display = 'block';
      } else {
        posterEl.style.display = 'none';
      }
    }

    const backdropSrc = seriesGroup.backdrop || cleanLogo || '';
    if (bgBackdrop) {
      bgBackdrop.style.backgroundImage = backdropSrc ? `url("${backdropSrc}")` : 'none';
    }

    if (plotEl) {
      plotEl.textContent = seriesGroup.plot || `Acompanhe todos os episódios de ${seriesGroup.name} com reprodução em alta definição no Vion Player.`;
    }

    if (ratingEl) {
      ratingEl.textContent = seriesGroup.rating ? `★ ${seriesGroup.rating}` : '★ 8.5';
    }

    // Busca automática no TMDB para completar capa, backdrop, sinopse e nota se faltarem
    TmdbResolver.resolve(seriesGroup.name, true).then(meta => {
      if (meta) {
        if (meta.poster && posterEl && (!posterEl.src || posterEl.style.display === 'none')) {
          posterEl.src = meta.poster;
          posterEl.style.display = 'block';
          seriesGroup.logo = meta.poster;
        }
        if (meta.backdrop && bgBackdrop && (!seriesGroup.backdrop || bgBackdrop.style.backgroundImage === 'none')) {
          bgBackdrop.style.backgroundImage = `url("${meta.backdrop}")`;
          seriesGroup.backdrop = meta.backdrop;
        }
        if (meta.plot && plotEl && (!seriesGroup.plot || seriesGroup.plot.length < 10)) {
          plotEl.textContent = meta.plot;
          seriesGroup.plot = meta.plot;
        }
        if (meta.rating && ratingEl && !seriesGroup.rating) {
          ratingEl.textContent = `★ ${meta.rating}`;
          seriesGroup.rating = meta.rating;
        }
      }
    });

    // Se for série Xtream e ainda não tiver episódios carregados, busca via API
    if (seriesGroup.isXtream && (!seriesGroup.seasons || Object.keys(seriesGroup.seasons).length === 0)) {
      const episodesList = document.getElementById('series-episodes-list');
      if (episodesList) {
        episodesList.innerHTML = `
          <div class="series-loading-card">
            <div class="spinner-small"></div>
            <span>Sincronizando temporadas e episódios com o servidor...</span>
          </div>
        `;
      }
      overlay.classList.add('active');
      if (typeof XtreamCodesEngine !== 'undefined') {
        await XtreamCodesEngine.fetchSeriesEpisodes(seriesGroup);
      }
    }

    // Identifica todas as temporadas disponíveis ou informadas
    const rawKeys = Object.keys(seriesGroup.seasons || {}).map(Number).filter(n => !isNaN(n) && n > 0);
    let seasonKeys = [];
    if (rawKeys.length > 0) {
      const maxSeason = Math.max(...rawKeys);
      for (let s = 1; s <= maxSeason; s++) {
        seasonKeys.push(String(s));
      }
    } else {
      seasonKeys = ['1'];
    }

    let totalEps = 0;
    Object.keys(seriesGroup.seasons || {}).forEach(k => {
      totalEps += (seriesGroup.seasons[k] || []).length;
    });

    const totalSeasons = seasonKeys.length;
    const badgeEl = document.getElementById('series-modal-badge');
    if (badgeEl) {
      badgeEl.textContent = `${totalSeasons} Temporada${totalSeasons > 1 ? 's' : ''} • ${totalEps || seriesGroup.episodesCount || 0} Episódio(s)`;
    }

    // Controle de exibição dos botões laterais de navegação de temporadas
    const prevBtn = document.getElementById('btn-season-prev');
    const nextBtn = document.getElementById('btn-season-next');
    if (prevBtn && nextBtn) {
      const hasMultipleSeasons = totalSeasons > 1;
      prevBtn.style.display = hasMultipleSeasons ? 'flex' : 'none';
      nextBtn.style.display = hasMultipleSeasons ? 'flex' : 'none';
    }

    // Abas de Temporada com rolagem suave e centralização automática no foco (Imagem 3)
    const tabsContainer = document.getElementById('series-seasons-tabs');
    tabsContainer.innerHTML = '';
    tabsContainer.scrollLeft = 0;

    const initialSeason = seasonKeys.find(s => (seriesGroup.seasons && seriesGroup.seasons[s] && seriesGroup.seasons[s].length > 0)) || seasonKeys[0];
    let initialSeasonBtn = null;

    seasonKeys.forEach((sNum) => {
      const btn = document.createElement('button');
      const isInitial = (sNum === initialSeason);
      btn.className = `season-tab-btn focusable ${isInitial ? 'active-season' : ''}`;
      btn.setAttribute('tabindex', '0');
      btn.textContent = `Season ${sNum}`;

      if (isInitial) initialSeasonBtn = btn;

      btn.addEventListener('focus', () => {
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });

      btn.addEventListener('click', () => {
        document.querySelectorAll('.season-tab-btn').forEach(b => b.classList.remove('active-season'));
        btn.classList.add('active-season');
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        this.renderSeriesEpisodes(sNum);
      });

      tabsContainer.appendChild(btn);
    });

    // Configuração dos Botões de Ação da Série (Imagem 4: PLAY, PLAY TRAILER, + FAVORITES)
    const btnPlayFirst = document.getElementById('btn-series-play-first');
    const btnTrailer = document.getElementById('btn-series-trailer');
    const btnFav = document.getElementById('btn-series-fav');
    const favText = document.getElementById('series-fav-text');

    const favs = this.getFavorites();
    const isFav = favs.some(f => (f.url || f.name) === (seriesGroup.url || seriesGroup.name));
    if (favText) favText.textContent = isFav ? '✓ IN FAVORITES' : 'FAVORITES';

    const initialEps = (seriesGroup.seasons && seriesGroup.seasons[initialSeason]) || [];
    if (btnPlayFirst) {
      btnPlayFirst.onclick = () => {
        const firstEp = initialEps[0] || { url: seriesGroup.url, name: seriesGroup.name };
        const seriesTitle = seriesGroup.name || 'Série';
        const epTitle = firstEp.cleanTitle || 'Episódio 01';
        this.closeSeriesModal();
        if (window.AndroidDevice && typeof AndroidDevice.openPlayer === 'function') {
          AndroidDevice.openPlayer(firstEp.url, `${seriesTitle} - ${epTitle}`, seriesTitle, true);
          return;
        }
        this.player.setPlaylist(initialEps.length > 0 ? initialEps : [seriesGroup]);
        this.goToScreen('player');
        this.player.loadStream(firstEp.url, `${seriesTitle} - ${epTitle}`, seriesTitle, 1, true);
      };
    }

    if (btnTrailer) {
      btnTrailer.onclick = () => {
        this.playTrailer(seriesGroup);
      };
    }

    if (btnFav) {
      btnFav.onclick = () => {
        this.toggleFavorite(seriesGroup);
        const upFavs = this.getFavorites();
        const upIsFav = upFavs.some(f => (f.url || f.name) === (seriesGroup.url || seriesGroup.name));
        if (favText) favText.textContent = upIsFav ? '✓ IN FAVORITES' : 'FAVORITES';
        this.updateVodFavoritesCount();
      };
    }

    overlay.classList.add('active');
    this.renderSeriesEpisodes(initialSeason);

    setTimeout(() => {
      if (btnPlayFirst && window.RemoteControl) {
        RemoteControl.setFocus(btnPlayFirst);
      } else if (initialSeasonBtn && window.RemoteControl) {
        RemoteControl.setFocus(initialSeasonBtn);
      }
    }, 60);
  },

  // Renderiza Episódios em Cards Widescreen 16:9 com "..." e legenda "S1 E1" (Imagem 3)
  renderSeriesEpisodes(seasonNum) {
    const listContainer = document.getElementById('series-episodes-list');
    if (!listContainer || !this.activeSeries) return;

    listContainer.innerHTML = '';
    const episodes = (this.activeSeries.seasons && this.activeSeries.seasons[seasonNum]) || [];

    if (episodes.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-season-card">
          <div class="empty-season-title" style="color: #94a3b8; font-size: 16px; padding: 20px;">Temporada ${seasonNum} Indisponível</div>
        </div>
      `;
      return;
    }

    episodes.forEach((ep, idx) => {
      const item = document.createElement('div');
      item.className = 'episode-item focusable';
      item.setAttribute('tabindex', '0');

      const epNum = ep.episode || (idx + 1);
      const labelSE = `S${seasonNum} E${epNum}`;

      const rawLogo = (ep.logo || this.activeSeries.logo || '').trim();
      const cleanLogo = (typeof normalizeImageUrl === 'function') ? normalizeImageUrl(rawLogo) : rawLogo;

      item.innerHTML = `
        <div class="episode-widescreen-thumb">
          ${cleanLogo && cleanLogo.startsWith('http') ? `<img src="${cleanLogo}" loading="lazy" decoding="async" alt="${labelSE}" onerror="this.remove();" />` : ''}
        </div>
        <div class="episode-label-s-e">${labelSE}</div>
      `;

      item.addEventListener('click', () => {
        const seriesTitle = (this.activeSeries && this.activeSeries.name) ? this.activeSeries.name : 'Série';
        const epTitle = ep.cleanTitle || `Episódio ${epNum}`;
        this.closeSeriesModal();
        if (window.AndroidDevice && typeof AndroidDevice.openPlayer === 'function') {
          AndroidDevice.openPlayer(ep.url, `${seriesTitle} - ${epTitle}`, seriesTitle, true);
          return;
        }
        this.player.setPlaylist(episodes);
        this.goToScreen('player');
        this.player.loadStream(ep.url, `${seriesTitle} - ${epTitle}`, seriesTitle, idx + 1, true);
      });

      listContainer.appendChild(item);
    });
  },

  closeSeriesModal() {
    const overlay = document.getElementById('modal-series-details');
    if (overlay) overlay.classList.remove('active');
    this.activeSeries = null;
    setTimeout(() => {
      const activeCard = document.querySelector('#vod-grid .vod-poster-card.focused') || document.querySelector('#vod-grid .vod-poster-card');
      if (activeCard && window.RemoteControl) {
        RemoteControl.setFocus(activeCard);
      }
    }, 60);
  },

  // Modal de Detalhes do Filme com PLAY, PLAY TRAILER, + FAVORITES (Imagem 4)
  openMovieDetails(item, realIndex) {
    this.selectedMovie = item;
    this.selectedMovieIndex = realIndex;

    const modal = document.getElementById('modal-movie-details');
    if (!modal) {
      if (window.AndroidDevice && typeof AndroidDevice.openPlayer === 'function') {
        AndroidDevice.openPlayer(item.url, item.name, item.category, true);
        return;
      }
      this.player.setPlaylist(this.filteredItems);
      this.goToScreen('player');
      this.player.loadStream(item.url, item.name, item.category, realIndex + 1, true);
      return;
    }

    const titleEl = document.getElementById('movie-details-title');
    const catEl = document.getElementById('movie-details-category');
    const backdropEl = document.getElementById('movie-details-backdrop');
    const synopsisEl = document.getElementById('movie-details-synopsis');
    const yearEl = document.getElementById('movie-details-year');
    const durEl = document.getElementById('movie-details-duration');

    if (titleEl) titleEl.textContent = item.name || 'Filme';
    if (catEl) catEl.textContent = item.category || 'Filmes';
    if (yearEl) {
      const yearMatch = (item.name || '').match(/\b(19\d\d|20\d\d)\b/);
      yearEl.textContent = yearMatch ? yearMatch[1] : '2024';
    }
    if (durEl) durEl.textContent = '⏱ HD 1080p';
    if (synopsisEl) {
      synopsisEl.textContent = `Assista ${item.name} com reprodução em alta definição no Vion Player.`;
    }
    if (backdropEl) {
      const rawLogo = (item.logo || '').trim();
      const cleanLogo = (typeof normalizeImageUrl === 'function') ? normalizeImageUrl(rawLogo) : rawLogo;
      if (cleanLogo.startsWith('http')) {
        backdropEl.style.backgroundImage = `url('${cleanLogo}')`;
      } else {
        backdropEl.style.backgroundImage = 'none';
      }
    }

    // Configura botões de ação (Imagem 4)
    const btnPlay = document.getElementById('btn-movie-play');
    const btnTrailer = document.getElementById('btn-movie-trailer');
    const btnFav = document.getElementById('btn-movie-fav');
    const favText = document.getElementById('movie-fav-text');

    const favs = this.getFavorites();
    const isFav = favs.some(f => (f.url || f.name) === (item.url || item.name));
    if (favText) favText.textContent = isFav ? '✓ IN FAVORITES' : 'FAVORITES';

    if (btnPlay) {
      btnPlay.onclick = () => {
        this.playSelectedMovie();
      };
    }

    if (btnTrailer) {
      btnTrailer.onclick = () => {
        this.playTrailer(item);
      };
    }

    if (btnFav) {
      btnFav.onclick = () => {
        this.toggleFavorite(item);
        const upFavs = this.getFavorites();
        const upIsFav = upFavs.some(f => (f.url || f.name) === (item.url || item.name));
        if (favText) favText.textContent = upIsFav ? '✓ IN FAVORITES' : 'FAVORITES';
        this.updateVodFavoritesCount();
      };
    }

    modal.classList.add('active');
    setTimeout(() => {
      if (btnPlay && window.RemoteControl) {
        RemoteControl.setFocus(btnPlay);
      }
    }, 50);
  },

  closeMovieDetails() {
    const modal = document.getElementById('modal-movie-details');
    if (modal) modal.classList.remove('active');
    this.selectedMovie = null;
  },

  playSelectedMovie() {
    if (!this.selectedMovie) return;
    const item = this.selectedMovie;
    const realIndex = this.selectedMovieIndex || 0;
    this.closeMovieDetails();

    if (window.AndroidDevice && typeof AndroidDevice.openPlayer === 'function') {
      AndroidDevice.openPlayer(item.url, item.name, item.category, true);
      return;
    }
    this.player.setPlaylist(this.filteredItems);
    this.goToScreen('player');
    this.player.loadStream(item.url, item.name, item.category, realIndex + 1, true);
  },

  // ===================================================================
  // REPRODUÇÃO DE TRAILER VIA TMDB E YOUTUBE
  // ===================================================================
  async playTrailer(item) {
    if (!item) return;
    const isSeries = this.activeSection === 'series' || item.type === 'series_group';
    const clean = TmdbResolver.cleanTitle(item.name);
    this.showToast(`Buscando trailer de ${clean}...`);
    try {
      const searchType = isSeries ? 'tv' : 'movie';
      const searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb&query=${encodeURIComponent(clean)}&language=pt-BR`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) throw new Error('Falha na busca TMDB');
      const searchData = await searchRes.json();
      const tmdbItem = searchData.results && searchData.results[0];
      if (!tmdbItem || !tmdbItem.id) {
        this.showToast('Trailer não disponível no catálogo.');
        return;
      }
      let vidUrl = `https://api.themoviedb.org/3/${searchType}/${tmdbItem.id}/videos?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb&language=pt-BR`;
      let vidRes = await fetch(vidUrl);
      let vidData = await vidRes.json();
      let videos = (vidData.results || []).filter(v => v.site === 'YouTube');
      if (videos.length === 0) {
        vidUrl = `https://api.themoviedb.org/3/${searchType}/${tmdbItem.id}/videos?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb&language=en-US`;
        vidRes = await fetch(vidUrl);
        vidData = await vidRes.json();
        videos = (vidData.results || []).filter(v => v.site === 'YouTube');
      }
      if (videos.length === 0) {
        this.showToast('Nenhum trailer encontrado para este título.');
        return;
      }
      const trailer = videos.find(v => v.type === 'Trailer') || videos[0];
      this.openTrailerModal(trailer.key, item.name);
    } catch (e) {
      this.showToast('Trailer indisponível no momento.');
    }
  },

  openTrailerModal(ytKey, title) {
    const modal = document.getElementById('modal-trailer-player');
    const iframe = document.getElementById('trailer-iframe');
    const titleEl = document.getElementById('trailer-title');
    if (!modal || !iframe) return;
    if (titleEl) titleEl.textContent = `Trailer • ${title}`;
    iframe.src = `https://www.youtube.com/embed/${ytKey}?autoplay=1&controls=1&rel=0&showinfo=0`;
    modal.classList.add('active');
    const btnClose = document.getElementById('btn-close-trailer');
    if (btnClose && window.RemoteControl) {
      RemoteControl.setFocus(btnClose);
    }
  },

  closeTrailerModal() {
    const modal = document.getElementById('modal-trailer-player');
    const iframe = document.getElementById('trailer-iframe');
    if (iframe) iframe.src = '';
    if (modal) modal.classList.remove('active');
  },

  // ===================================================================
  // GERENCIAMENTO DE TELAS E CONTROLE REMOTO
  // ===================================================================
  closePlayer() {
    this.player.stop();
    if (this.activeSection === 'channels') {
      this.goToScreen('channels');
    } else if (this.activeSection === 'movies' || this.activeSection === 'series') {
      this.goToScreen('vod');
    } else {
      this.goToScreen('home');
    }
  },

  goToScreen(screenId) {
    if (this.currentScreen !== screenId) {
      this.screenHistory.push(this.currentScreen);
    }
    this.currentScreen = screenId;

    if (screenId === 'expired') {
      this.startExpiredScreenPolling();
    } else {
      if (this._expiredPollTimer) {
        clearInterval(this._expiredPollTimer);
        this._expiredPollTimer = null;
      }
    }

    // Economia de CPU e GPU na Smart TV: Pausa o slideshow de 1080p quando fora da tela Home
    if (screenId === 'home') {
      if (!this.backdropInterval) {
        this.initCinemaBackdropSlideshow();
      }
    } else {
      if (this.backdropInterval) {
        clearInterval(this.backdropInterval);
        this.backdropInterval = null;
      }
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${screenId}`);
    if (target) {
      target.classList.add('active');

      setTimeout(() => {
        const firstFocus = target.querySelector('.focusable');
        if (firstFocus) {
          RemoteControl.setFocus(firstFocus);
        }
      }, 50);
    }
  },

  _lastBackTs: 0,
  handleBack() {
    const now = Date.now();
    if (now - this._lastBackTs < 220) return;
    this._lastBackTs = now;

    // Se um campo de texto estiver em foco, desfoque-o
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
      ae.blur();
    }

    // 0. Fecha trailer de vídeo se estiver aberto
    const trailerModal = document.getElementById('modal-trailer-player');
    if (trailerModal && trailerModal.classList.contains('active')) {
      this.closeTrailerModal();
      return;
    }

    // 1. Fecha diálogo de confirmação se estiver aberto
    const confirmOverlay = document.getElementById('tv-confirm-dialog');
    if (confirmOverlay && confirmOverlay.classList.contains('active')) {
      this.closeDialog();
      return;
    }

    // 2. Fecha modal de filme ou série se estiver aberto
    const movieModal = document.getElementById('modal-movie-details');
    if (movieModal && movieModal.classList.contains('active')) {
      this.closeMovieDetails();
      return;
    }

    const seriesModal = document.getElementById('modal-series-details');
    if (seriesModal && seriesModal.classList.contains('active')) {
      this.closeSeriesModal();
      return;
    }

    // 3. Se estiver no player de vídeo HTML5 em tela cheia, fecha o player
    if (this.currentScreen === 'player') {
      this.closePlayer();
      return;
    }

    // 4. Se o mini player estiver expandido em tela cheia (canal ao vivo)
    if (this.player && this.player.isMiniFullscreen) {
      this.player.collapseMiniFullscreen();
      return;
    }

    // 5. Se estiver em canais ao vivo, para a prévia e volta imediatamente para o início
    if (this.currentScreen === 'channels') {
      this.player.stopMini();
      this.goToScreen('home');
      return;
    }

    // 6. Se estiver em filmes ou séries:
    if (this.currentScreen === 'vod') {
      const activeEl = document.querySelector('.screen.active .focused') || document.activeElement;
      const isInsideGrid = activeEl && (activeEl.classList.contains('vod-poster-card') || (activeEl.closest && activeEl.closest('#vod-grid')));
      if (isInsideGrid) {
        // Se estiver nos cards de filmes/séries, apertar Voltar foca na categoria da barra lateral!
        const targetPill = document.querySelector('.vod-sidebar-item.active-cat') || document.querySelector('.vod-sidebar-item');
        if (targetPill && window.RemoteControl) {
          RemoteControl.setFocus(targetPill);
          return;
        }
      }
      this.goToScreen('home');
      return;
    }

    // 7. Se estiver na tela de bloqueio por expiração, pede confirmação para sair
    if (this.currentScreen === 'expired') {
      this.openDialog('Sair do Aplicativo?', 'Deseja realmente fechar o Vion Player?', () => {
        if (window.AndroidDevice && typeof AndroidDevice.exitApp === 'function') {
          AndroidDevice.exitApp();
          return;
        }
        if (window.tizen) { try { tizen.application.getCurrentApplication().exit(); } catch(e) {} return; }
        if (window.webOS) { try { window.close(); } catch(e) {} return; }
        window.close();
      });
      return;
    }

    // 8. Se estiver em playlists, configurações ou login, volta para o início (ou expired se expirado)
    if (this.currentScreen === 'playlists' || this.currentScreen === 'settings' || this.currentScreen === 'reseller-login') {
      if (this.isDeviceExpired()) {
        this.goToScreen('expired');
      } else {
        this.goToScreen('home');
      }
      return;
    }

    // 9. Se estiver na home, pede confirmação para sair
    if (this.currentScreen === 'home') {
      this.openDialog('Sair do Aplicativo?', 'Deseja realmente fechar o Vion Player?', () => {
        if (window.AndroidDevice && typeof AndroidDevice.exitApp === 'function') {
          AndroidDevice.exitApp();
          return;
        }
        if (window.tizen) { try { tizen.application.getCurrentApplication().exit(); } catch(e) {} return; }
        if (window.webOS) { try { window.close(); } catch(e) {} return; }
        window.close();
      });
      return;
    }
  },

  openDialog(title, desc, callback) {
    const overlay = document.getElementById('modal-tv-dialog');
    const titleEl = document.getElementById('dialog-title');
    const descEl = document.getElementById('dialog-desc');
    if (!overlay) return;

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;

    this.dialogCallback = callback;
    overlay.classList.add('active');

    const cancelBtn = document.getElementById('btn-dialog-cancel');
    if (cancelBtn) RemoteControl.setFocus(cancelBtn);
  },

  closeDialog() {
    const overlay = document.getElementById('modal-tv-dialog');
    if (overlay) overlay.classList.remove('active');
    this.dialogCallback = null;
  },

  // ===================================================================
  // FAVORITOS (Tecla Verde/Amarela do controle remoto)
  // ===================================================================
  getFavorites() {
    try { return JSON.parse(localStorage.getItem('vion_favorites') || '[]'); }
    catch(e) { return []; }
  },

  saveFavorites(favs) {
    try { localStorage.setItem('vion_favorites', JSON.stringify(favs)); } catch(e) {}
  },

  toggleFavorite(item) {
    const favs = this.getFavorites();
    const key = item.url || item.name;
    const idx = favs.findIndex(f => (f.url || f.name) === key);
    if (idx >= 0) {
      favs.splice(idx, 1);
      this.showToast(`Removido dos Favoritos: ${item.name}`);
    } else {
      favs.push({ name: item.name, url: item.url, logo: item.logo, category: item.category, type: this.activeSection });
      this.showToast(`⭐ Adicionado aos Favoritos: ${item.name}`);
    }
    this.saveFavorites(favs);
    this.renderFavoritesBadges();
  },

  toggleFavoriteFocused() {
    const focused = document.querySelector('.focused');
    if (!focused) return;
    if (this.currentScreen === 'channels') {
      const rows = Array.from(document.querySelectorAll('.live-ch-row'));
      const idx = rows.indexOf(focused);
      if (idx >= 0 && this.filteredItems[idx]) { this.toggleFavorite(this.filteredItems[idx]); return; }
    }
    if (this.currentScreen === 'vod') {
      const cards = Array.from(document.querySelectorAll('.vod-poster-card'));
      const idx = cards.indexOf(focused);
      if (idx >= 0 && this.filteredItems[idx]) { this.toggleFavorite(this.filteredItems[idx]); return; }
    }
  },

  showInfoFocused() {
    if (this.currentScreen === 'vod') {
      const cards = Array.from(document.querySelectorAll('.vod-poster-card'));
      const focused = document.querySelector('.focused');
      const idx = focused ? cards.indexOf(focused) : -1;
      if (idx >= 0 && this.filteredItems[idx]) {
        const item = this.filteredItems[idx];
        const isSeries = this.activeSection === 'series' || item.type === 'series_group';
        if (isSeries) this.openSeriesDetails(item);
        else this.openMovieDetails(item, idx);
      }
    }
  },

  renderFavoritesBadges() {
    const favs = this.getFavorites();
    const favKeys = new Set(favs.map(f => f.url || f.name));
    document.querySelectorAll('.live-ch-row').forEach((row, idx) => {
      if (this.filteredItems[idx]) {
        const key = this.filteredItems[idx].url || this.filteredItems[idx].name;
        row.classList.toggle('is-favorite', favKeys.has(key));
      }
    });
  },

  openFavoritesSection() {
    const favs = this.getFavorites();
    const liveFavs = favs.filter(f => !f.type || f.type === 'channels');
    if (liveFavs.length === 0) {
      this.showToast('Nenhum favorito. Use a tecla Amarela ⭐ para favoritar um canal.');
      return;
    }
    this.filteredItems = liveFavs;
    this.renderLiveChannelsList(liveFavs);
    this.showToast(`⭐ ${liveFavs.length} canais favoritos`);
  },

  // ===================================================================
  // LIFECYCLE DE PLATAFORMA (webOS, Tizen, Android TV)
  // ===================================================================
  setupPlatformLifecycle() {
    if (window.webOS) {
      try { webOS.platformBack(); } catch(e) {}
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.player) {
          try { if (this.player.miniVideo) this.player.miniVideo.pause(); } catch(e) {}
        } else if (this.player) {
          try { if (this.player.miniVideo && this.player.miniVideo.paused) this.player.miniVideo.play(); } catch(e) {}
        }
      });
    }
    // Cursor invisivel em TV
    document.documentElement.style.cursor = 'none';
    document.documentElement.setAttribute('data-platform', 'tv');
  },

  // ===================================================================
  // GUIA DE PROGRAMAÇÃO EPG DINÂMICO E REALISTA
  // ===================================================================
  updateChannelEpgSchedule(channel, dayOffset = 0) {
    const scheduleContainer = document.getElementById('live-epg-schedule');
    if (!scheduleContainer) return;

    if (!channel) {
      scheduleContainer.innerHTML = `
        <div class="epg-row"><span class="epg-dot">⚪</span> <span class="epg-time">--:-- • --:--</span> <span class="epg-name">Selecione um canal</span></div>
      `;
      return;
    }

    const chName = (channel.name || '').trim();
    const chCat = (channel.category || '').toLowerCase();
    const chLower = chName.toLowerCase();

    const now = new Date();
    if (dayOffset !== 0) {
      now.setDate(now.getDate() + dayOffset);
    }
    const curHour = now.getHours();
    const curMin = now.getMinutes();
    const totalMinutesNow = curHour * 60 + curMin;

    // Identificação inteligente do perfil do canal
    let profile = 'general';
    if (/(?:sport|espn|futebol|globoesporte|premiere|combate|dazn|fox|bandsports|conmebol|tnt sports|cazé|caze|arena|ufc|nba)/i.test(chLower) || /(?:esporte|sports|futebol|luta)/i.test(chCat)) {
      profile = 'sports';
    } else if (/(?:news|noticia|notícia|cnn|jovem pan|globonews|bandnews|record news|recordnews)/i.test(chLower) || /(?:noticia|notícia|noticias|news)/i.test(chCat)) {
      profile = 'news';
    } else if (/(?:telecine|hbo|cinema|cine|movie|warner|max|megapix|paramount|space|sony|universal|tnt\b|cinemax|studio)/i.test(chLower) || /(?:filme|filmes|cinema|series)/i.test(chCat)) {
      profile = 'movies';
    } else if (/(?:cartoon|kids|infantil|gloob|disney|nick|discovery kids|boing|toons|animax)/i.test(chLower) || /(?:infantil|kids|desenho|animacao)/i.test(chCat)) {
      profile = 'kids';
    } else if (/(?:discovery|natgeo|history|animal planet|curta|investigação|investigacao|science)/i.test(chLower) || /(?:documentario|documentários|doc)/i.test(chCat)) {
      profile = 'doc';
    } else if (/(?:globo|sbt|record|band\b|rede tv|redetv|cultura)/i.test(chLower) || /(?:aberto|abertos|variedades)/i.test(chCat)) {
      profile = 'open';
    } else if (/(?:24\s*h|24hrs|24 horas)/i.test(chLower) || /(?:24\s*h|24hrs|24 horas)/i.test(chCat)) {
      profile = '24h';
    }

    const programTemplates = {
      sports: [
        { title: "Pré-Jogo Especial & Análise Tática", dur: 60, desc: "Aquecimento completo com escalações e entrevistas exclusivas" },
        { title: `${chName} - Transmissão Ao Vivo`, dur: 120, desc: "A cobertura completa da partida lance a lance em Full HD 60fps" },
        { title: "Linha de Passe - Debate & Melhores Momentos", dur: 90, desc: "Comentários e análise aprofundada dos lances da rodada" },
        { title: "SportsCenter Noturno - Giro Mundial", dur: 60, desc: "Os principais gols, resultados e notícias de todos os esportes" },
        { title: "Melhores Momentos & Gols da Rodada", dur: 60, desc: "Compacto dos melhores lances e jogadas decisivas" }
      ],
      news: [
        { title: `Edição em Tempo Real - ${curHour}h`, dur: 60, desc: "As manchetes urgentes do Brasil e do mundo ao vivo" },
        { title: "Análise Econômica & Mercado Financeiro", dur: 60, desc: "Bolsa de valores, cotação das moedas e o cenário do dia" },
        { title: "Plantão Especial de Notícias", dur: 90, desc: "Cobertura aprofundada dos principais fatos da política nacional" },
        { title: "Jornal da Noite - Panorama Completo", dur: 60, desc: "Resumo com os principais acontecimentos e reportagens exclusivas" },
        { title: "Debate & Opinião dos Especialistas", dur: 60, desc: "Mesa redonda sobre os temas que movimentaram o dia" }
      ],
      movies: [
        { title: "Sessão Premium: As Maiores Bilheterias", dur: 120, desc: "Cinema de tirar o fôlego em alta definição 4K HDR com áudio 5.1" },
        { title: "Cine Ação & Suspense Sem Intervalos", dur: 110, desc: "Histórias eletrizantes com elenco estelar e muita adrenalina" },
        { title: "Super Estreia da Noite - Edição Especial", dur: 130, desc: "O grande lançamento do mês nas melhores telas de cinema" },
        { title: "Cinema da Madrugada: Cult & Clássicos", dur: 105, desc: "Sucessos aclamados pela crítica e pelo público" },
        { title: "Maratona Cinema: Cine Pipoca", dur: 95, desc: "Diversão e aventura garantida para toda a família curtir" }
      ],
      kids: [
        { title: "Clube da Animação: Aventuras Mágicas", dur: 45, desc: "Os personagens favoritos dos pequenos em historinhas divertidas" },
        { title: "Hora dos Toons: Super Heróis em Ação", dur: 45, desc: "Muita risada, descobertas e episódios inéditos cheios de energia" },
        { title: "Cine Kids: Animação Especial", dur: 90, desc: "Longa-metragem animado cheio de aventuras, magia e canções" },
        { title: "Turma da Fantasia: Novos Episódios", dur: 45, desc: "Desenhos educativos que divertem e ensinam brincando" }
      ],
      doc: [
        { title: "Planeta Selvagem: Predadores da Terra", dur: 60, desc: "A vida secreta da fauna selvagem em florestas tropicais" },
        { title: "Grandes Mistérios da História Antiga", dur: 60, desc: "Descobertas arqueológicas e civilizações perdidas no tempo" },
        { title: "Mega Construções & Engenharia Extrema", dur: 60, desc: "As obras mais grandiosas e inovadoras do planeta" },
        { title: "Cosmos & Segredos do Universo", dur: 60, desc: "Uma viagem pelas galáxias e mistérios da astronomia moderna" }
      ],
      open: [
        { title: "Jornal Regional - Edição Ao Vivo", dur: 75, desc: "Fatos locais, trânsito, clima e as notícias da sua região" },
        { title: "Programa de Variedades & Entretenimento", dur: 90, desc: "Entrevistas, música, culinária e histórias emocionantes" },
        { title: "Novela das Oito - Capítulo do Dia", dur: 60, desc: "As reviravoltas da trama mais acompanhada do Brasil" },
        { title: "Grande Jornal Nacional Ao Vivo", dur: 50, desc: "O resumo das notícias mais importantes do país e do mundo" },
        { title: "Sessão Cinema / Futebol Especial", dur: 120, desc: "Grandes partidas ou superproduções premiadas da TV aberta" }
      ],
      '24h': [
        { title: `Maratona 24H: ${chName}`, dur: 120, desc: `Transmissão sem intervalos dos melhores episódios ininterruptos` },
        { title: "Sessão Contínua: Melhores Momentos", dur: 120, desc: "Seleção especial de episódios mais assistidos pelos fãs" },
        { title: "Sequência de Clássicos 24 Horas", dur: 120, desc: "Reviva as temporadas que marcaram época com qualidade Full HD" },
        { title: "Especial Noturno 24H Sem Cortes", dur: 120, desc: "Programação contínua exclusiva sem comerciais" }
      ],
      general: [
        { title: `Transmissão Ao Vivo: ${chName}`, dur: 90, desc: `Programação ao vivo com sinal Full HD de ${chName}` },
        { title: "Próxima Atração em Alta Definição", dur: 90, desc: "Conteúdo exclusivo com imagem e áudio digital impecáveis" },
        { title: "Programação Especial da Noite", dur: 120, desc: "Os destaques mais esperados da grade de programação" },
        { title: "Sessão Madrugada Premium", dur: 120, desc: "Variedades, cultura e entretenimento de qualidade superior" }
      ]
    };

    const list = programTemplates[profile] || programTemplates.general;

    const prog1Dur = list[0].dur || 90;
    const prog1StartMin = Math.max(0, totalMinutesNow - Math.floor(prog1Dur * 0.45));
    const prog1EndMin = prog1StartMin + prog1Dur;
    const prog1Elapsed = totalMinutesNow - prog1StartMin;
    const prog1Progress = dayOffset === 0 ? Math.min(95, Math.max(10, Math.round((prog1Elapsed / prog1Dur) * 100))) : 0;

    const formatHour = (mins) => {
      const h = Math.floor((mins % 1440) / 60);
      const m = Math.floor(mins % 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const slots = [];
    slots.push({
      time: `${formatHour(prog1StartMin)} - ${formatHour(prog1EndMin)}`,
      name: list[0].title,
      desc: list[0].desc,
      isNow: dayOffset === 0,
      progress: prog1Progress
    });

    let currentSlotStart = prog1EndMin;
    for (let i = 1; i < 4; i++) {
      const prog = list[i % list.length];
      const slotEnd = currentSlotStart + (prog.dur || 60);
      slots.push({
        time: `${formatHour(currentSlotStart)} - ${formatHour(slotEnd)}`,
        name: prog.title,
        desc: prog.desc,
        isNow: false
      });
      currentSlotStart = slotEnd;
    }

    let html = '';
    slots.forEach(slot => {
      if (slot.isNow) {
        html += `
          <div class="epg-row epg-row-active">
            <div class="epg-header-line">
              <span class="epg-badge-live">● NO AR</span>
              <span class="epg-time epg-time-active">${slot.time}</span>
            </div>
            <div class="epg-name epg-name-active">${escapeHtml(slot.name)}</div>
            <div class="epg-progress-bar-wrap">
              <div class="epg-progress-bar-fill" style="width: ${slot.progress}%"></div>
            </div>
            <div class="epg-desc">${escapeHtml(slot.desc)}</div>
          </div>
        `;
      } else {
        html += `
          <div class="epg-row epg-row-upcoming">
            <div class="epg-upcoming-time">${slot.time}</div>
            <div class="epg-upcoming-content">
              <div class="epg-name">${escapeHtml(slot.name)}</div>
              <div class="epg-desc-sub">${escapeHtml(slot.desc)}</div>
            </div>
          </div>
        `;
      }
    });

    scheduleContainer.innerHTML = html;
  },

  // ===================================================================
  // CALENDÁRIO EPG COM DATAS REAIS E SELEÇÃO INTERATIVA
  // ===================================================================
  updateEpgCalendar() {
    const cal = document.getElementById('live-epg-calendar');
    if (!cal) return;
    cal.innerHTML = '';
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const pill = document.createElement('div');
      pill.className = 'calendar-pill focusable' + (i === 0 ? ' active-cal' : '');
      pill.setAttribute('tabindex', '0');
      pill.setAttribute('data-day-offset', i.toString());
      pill.innerHTML = `<span class="cal-day">${d.getDate()}</span><span class="cal-wday">${days[d.getDay()]}</span>`;

      pill.addEventListener('click', () => {
        document.querySelectorAll('.calendar-pill').forEach(p => p.classList.remove('active-cal'));
        pill.classList.add('active-cal');
        const activeCh = (this.filteredItems && this.filteredItems[this.activeChannelIndex]) || null;
        if (activeCh) this.updateChannelEpgSchedule(activeCh, i);
      });

      cal.appendChild(pill);
    }
  },

  showToast(message) {

    const toast = document.getElementById('toast-notice');
    const msgEl = document.getElementById('toast-message');
    if (!toast || !msgEl) return;

    msgEl.textContent = message;
    toast.classList.add('show');

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 4000);
  },

  // ===================================================================
  // ATUALIZAÇÃO AUTOMÁTICA (ANDROID TV / FIRE TV IN-APP UPDATER)
  // ===================================================================
  async checkAndroidAppUpdate(isManual = false) {
    if (!window.AndroidDevice || typeof window.AndroidDevice.downloadAndInstallUpdate !== 'function') {
      if (isManual) this.showToast('Esta função está disponível no aplicativo Android TV.');
      return;
    }

    const currentVersionCode = typeof window.AndroidDevice.getAppVersionCode === 'function'
      ? window.AndroidDevice.getAppVersionCode()
      : 19;

    try {
      const res = await fetch('https://vion.gestorpro.app.br/api/app/version');
      if (!res.ok) return;
      const data = await res.json();

      if (data && data.success && data.versionCode > currentVersionCode) {
        this.showUpdateDialog(data);
      } else if (isManual) {
        this.showToast('✔ Seu Vion Player já está na versão mais recente!');
      }
    } catch (e) {
      if (isManual) this.showToast('Não foi possível verificar atualizações no momento.');
    }
  },

  showUpdateDialog(data) {
    const title = `🚀 Nova Versão Disponível (${data.versionName || 'Atualização'})`;
    const desc = (data.releaseNotes || 'Uma nova versão do Vion Player está disponível com melhorias de velocidade e estabilidade.') + '\n\nDeseja atualizar agora diretamente pela TV?';

    this.openDialog(title, desc, () => {
      this.startAppUpdateDownload(data.apkUrl);
    });
  },

  startAppUpdateDownload(apkUrl) {
    this.showUpdateModal();
    if (window.AndroidDevice && typeof window.AndroidDevice.downloadAndInstallUpdate === 'function') {
      window.AndroidDevice.downloadAndInstallUpdate(apkUrl);
    }
  },

  showUpdateModal() {
    let modal = document.getElementById('tv-update-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'tv-update-modal';
      modal.className = 'tv-dialog-overlay active';
      modal.innerHTML = `
        <div class="tv-dialog-box" style="max-width: 500px; text-align: center;">
          <div style="font-size: 42px; margin-bottom: 12px;">⬇️</div>
          <h3 id="update-modal-title" style="color: var(--primary-yellow); font-size: 22px; margin-bottom: 10px;">Baixando Atualização...</h3>
          <p id="update-modal-desc" style="font-size: 15px; color: #cbd5e1; margin-bottom: 20px;">Preparando o download da nova versão...</p>
          <div style="background: rgba(255,255,255,0.1); border-radius: 999px; height: 12px; width: 100%; overflow: hidden; margin-bottom: 14px;">
            <div id="update-progress-bar" style="background: var(--grad-gold); height: 100%; width: 5%; transition: width 0.3s ease;"></div>
          </div>
          <span id="update-progress-percent" style="font-size: 16px; font-weight: 800; color: #fff;">5%</span>
        </div>
      `;
      document.body.appendChild(modal);
    } else {
      modal.classList.add('active');
    }
  },

  onUpdateProgress(percent, message) {
    const bar = document.getElementById('update-progress-bar');
    const txt = document.getElementById('update-progress-percent');
    const desc = document.getElementById('update-modal-desc');
    if (bar) bar.style.width = Math.min(100, Math.max(0, percent)) + '%';
    if (txt) txt.textContent = percent + '%';
    if (desc && message) desc.textContent = message;
    if (percent >= 100) {
      const title = document.getElementById('update-modal-title');
      if (title) title.textContent = 'Instalando Atualização...';
      setTimeout(() => {
        const modal = document.getElementById('tv-update-modal');
        if (modal) modal.classList.remove('active');
      }, 3000);
    }
  },

  onUpdateError(error) {
    const modal = document.getElementById('tv-update-modal');
    if (modal) modal.classList.remove('active');
    this.showToast('⚠️ ' + error);
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
