/**
 * Video Player Engine para Vion Player (TV, Mobile Android, Tizen, webOS e Web)
 * Suporte completo a Hardware Player Nativo Android (via Bridge), Fullscreen Player,
 * Mini-Player, Hls.js e Controles Touch / Remoto.
 * Inclui: Play/Pause, Avançar/Voltar 10s, Linha do Tempo (Seekbar), Troca de Canais e Voltar.
 */

class TVVideoPlayer {
  constructor(videoElementId, osdElementId, loadingElementId, miniVideoElementId) {
    this.video = document.getElementById(videoElementId);
    this.osd = document.getElementById(osdElementId);
    this.loading = document.getElementById(loadingElementId);
    this.miniVideo = document.getElementById(miniVideoElementId || 'mini-video-element');
    this.miniLoading = document.getElementById('mini-player-loading');
    this.tapZone = document.getElementById('player-tap-zone');

    // Elementos do Overlay de Controles Touch / TV
    this.controlsOverlay = document.getElementById('player-controls-overlay');
    this.btnBack = document.getElementById('btn-player-back');
    this.ctrlTitle = document.getElementById('player-ctrl-title');
    this.ctrlCategory = document.getElementById('player-ctrl-category');
    this.ctrlBadge = document.getElementById('player-ctrl-badge');
    this.btnRewind = document.getElementById('btn-player-rewind');
    this.btnPlayPause = document.getElementById('btn-player-playpause');
    this.iconPlayPause = document.getElementById('player-icon-playpause');
    this.btnForward = document.getElementById('btn-player-forward');
    this.vodControls = document.getElementById('player-vod-controls');
    this.liveControls = document.getElementById('player-live-controls');
    this.currentTimeEl = document.getElementById('player-current-time');
    this.durationTimeEl = document.getElementById('player-duration-time');
    this.seekSlider = document.getElementById('player-seek-slider');
    this.btnPrevChannel = document.getElementById('btn-player-prev-channel');
    this.btnNextChannel = document.getElementById('btn-player-next-channel');

    this.hls = null;
    this.miniHls = null;
    this.controlsTimeout = null;
    this.loadingWatchdog = null;
    this.currentChannelList = [];
    this.currentIndex = -1;
    this.currentActiveStream = null;
    this.isSeeking = false;
    this.isVodMode = false;
    this.isNativeMode = false;

    this.initEvents();
    this.initControls();
  }

  normalizeStreamUrl(url) {
    if (!url) return '';
    return url.trim();
  }

  initEvents() {
    if (this.video) {
      this.video.addEventListener('waiting', () => this.showLoading(true));
      this.video.addEventListener('playing', () => {
        this.showLoading(false);
        this.updatePlayPauseIcon(false);
        this.resetControlsTimeout(4000);
      });
      this.video.addEventListener('canplay', () => this.showLoading(false));

      this.video.addEventListener('pause', () => {
        this.updatePlayPauseIcon(true);
        this.showControls();
      });

      this.video.addEventListener('timeupdate', () => {
        if (!this.isNativeMode && !this.isSeeking && this.video && this.video.duration) {
          const cur = this.video.currentTime || 0;
          const dur = this.video.duration || 1;
          if (this.seekSlider) {
            this.seekSlider.value = (cur / dur) * 100;
          }
          if (this.currentTimeEl) {
            this.currentTimeEl.textContent = this.formatTime(cur);
          }
        }
      });

      this.video.addEventListener('loadedmetadata', () => {
        if (!this.isNativeMode && this.durationTimeEl && this.video && !isNaN(this.video.duration)) {
          this.durationTimeEl.textContent = this.formatTime(this.video.duration);
        }
      });

      this.video.addEventListener('durationchange', () => {
        if (!this.isNativeMode && this.durationTimeEl && this.video && !isNaN(this.video.duration)) {
          this.durationTimeEl.textContent = this.formatTime(this.video.duration);
        }
      });

      this.video.addEventListener('error', (e) => {
        this.showLoading(false);
        console.warn('Vídeo HTML5 erro:', e);
      });
    }

    if (this.miniVideo) {
      this.miniWaitingDebounce = null;

      this.miniVideo.addEventListener('waiting', () => {
        clearTimeout(this.miniWaitingDebounce);
        // Só exibe spinner de buffering se o travamento persistir por mais de 1200ms
        this.miniWaitingDebounce = setTimeout(() => {
          if (this.miniVideo && !this.miniVideo.paused && this.miniVideo.readyState < 3) {
            this.showMiniLoading(true);
          }
        }, 1200);
      });

      const clearAndHide = () => {
        clearTimeout(this.miniWaitingDebounce);
        this.showMiniLoading(false);
        if (this.miniVideo) {
          if (this.miniVideo.muted) {
            this.miniVideo.muted = false;
          }
          this.miniVideo.volume = 1.0;
        }
      };

      this.miniVideo.addEventListener('playing', clearAndHide);
      this.miniVideo.addEventListener('canplay', clearAndHide);
      this.miniVideo.addEventListener('canplaythrough', clearAndHide);
      this.miniVideo.addEventListener('loadeddata', clearAndHide);
      this.miniVideo.addEventListener('timeupdate', () => {
        if (this.miniVideo && this.miniVideo.currentTime > 0) {
          clearAndHide();
        }
      });
      this.miniVideo.addEventListener('progress', () => {
        if (this.miniVideo && this.miniVideo.currentTime > 0) {
          clearAndHide();
        }
      });
      this.miniVideo.addEventListener('error', (e) => {
        clearTimeout(this.miniWaitingDebounce);
        this.showMiniLoading(false);
        console.warn('Mini-player erro de reprodução:', e);
        if (typeof this._miniFallbackTrigger === 'function') {
          const fn = this._miniFallbackTrigger;
          this._miniFallbackTrigger = null;
          fn();
        }
      });
    }
  }

  /**
   * Configura eventos de toque e clique nos controles da tela
   */
  initControls() {
    const screenPlayer = document.getElementById('screen-player');
    const overlay = this.controlsOverlay;
    const tapZone = this.tapZone;

    // 1. Toque em qualquer canto da tela:
    // Se controles visíveis -> esconde imediatamente!
    // Se controles ocultos -> exibe imediatamente!
    const handleScreenTap = (e) => {
      // Se clicou em um botão, link ou slider, deixa a ação do botão ocorrer
      if (e.target.closest('button, input, a, .player-back-btn, .focusable')) {
        this.resetControlsTimeout(4500);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.toggleControls();
    };

    if (tapZone) {
      tapZone.addEventListener('click', handleScreenTap);
      tapZone.addEventListener('touchend', handleScreenTap);
    }
    if (overlay) {
      overlay.addEventListener('click', handleScreenTap);
      overlay.addEventListener('touchend', handleScreenTap);
    }
    if (screenPlayer) {
      screenPlayer.addEventListener('click', handleScreenTap);
    }

    // 2. Botão Voltar do Player (no canto superior esquerdo da tela)
    const handleBackAction = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.App && typeof App.closePlayer === 'function') {
        App.closePlayer();
      }
    };
    if (this.btnBack) {
      this.btnBack.addEventListener('click', handleBackAction);
      this.btnBack.addEventListener('touchend', handleBackAction);
    }

    // 3. Play / Pause
    const handlePlayPause = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.togglePlayPause();
    };
    if (this.btnPlayPause) {
      this.btnPlayPause.addEventListener('click', handlePlayPause);
      this.btnPlayPause.addEventListener('touchend', handlePlayPause);
    }

    // 4. Retroceder 10 segundos
    const handleRewind = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.seekRelative(-10);
    };
    if (this.btnRewind) {
      this.btnRewind.addEventListener('click', handleRewind);
      this.btnRewind.addEventListener('touchend', handleRewind);
    }

    // 5. Avançar 10 segundos
    const handleForward = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.seekRelative(10);
    };
    if (this.btnForward) {
      this.btnForward.addEventListener('click', handleForward);
      this.btnForward.addEventListener('touchend', handleForward);
    }

    // 6. Linha do Tempo / Barra de Avanço (Seekbar)
    if (this.seekSlider) {
      this.seekSlider.addEventListener('input', (e) => {
        e.stopPropagation();
        this.isSeeking = true;
        const percent = parseFloat(e.target.value);
        let duration = 0;
        if (this.isNativeMode && window.AndroidPlayer && typeof AndroidPlayer.getDuration === 'function') {
          duration = AndroidPlayer.getDuration();
        } else if (this.video && this.video.duration) {
          duration = this.video.duration;
        }

        if (duration > 0 && this.currentTimeEl) {
          const targetTime = (percent / 100) * duration;
          this.currentTimeEl.textContent = this.formatTime(targetTime);
        }
        this.resetControlsTimeout(8000);
      });

      this.seekSlider.addEventListener('change', (e) => {
        e.stopPropagation();
        const percent = parseFloat(e.target.value);
        let duration = 0;
        if (this.isNativeMode && window.AndroidPlayer && typeof AndroidPlayer.getDuration === 'function') {
          duration = AndroidPlayer.getDuration();
          if (duration > 0) {
            const targetSec = Math.floor((percent / 100) * duration);
            AndroidPlayer.seekTo(targetSec);
          }
        } else if (this.video && this.video.duration) {
          duration = this.video.duration;
          this.video.currentTime = (percent / 100) * duration;
        }
        this.isSeeking = false;
        this.resetControlsTimeout(4500);
      });
    }

    // 7. Navegação de canais (Live TV)
    this.btnPrevChannel?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.previousChannel();
    });

    this.btnNextChannel?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.nextChannel();
    });
  }

  // ===================================================================
  // CALLBACKS DO PLAYER NATIVO ANDROID (Disparados pelo Java)
  // ===================================================================
  onNativePrepared(durationSec) {
    this.showLoading(false);
    clearTimeout(this.loadingWatchdog);
    this.updatePlayPauseIcon(false);
    this.resetControlsTimeout(4000);

    if (this.durationTimeEl) {
      if (this.isVodMode && durationSec > 0) {
        this.durationTimeEl.textContent = this.formatTime(durationSec);
      } else {
        this.durationTimeEl.textContent = 'AO VIVO';
      }
    }
  }

  onNativeCompletion() {
    this.showLoading(false);
    this.updatePlayPauseIcon(true);
    this.showControls();
    if (!this.isVodMode) {
      // Se live cair temporariamente, reconecta automaticamente
      setTimeout(() => {
        if (App.currentScreen === 'player' && this.currentActiveStream) {
          this.loadStream(
            this.currentActiveStream.url,
            this.currentActiveStream.name,
            this.currentActiveStream.category,
            this.currentActiveStream.channelNumber,
            false
          );
        }
      }, 2500);
    }
  }

  onNativeError(what) {
    this.showLoading(false);
    console.warn('Native player error code:', what);
  }

  onNativeTimeUpdate(curSec, durSec) {
    if (!this.isSeeking) {
      if (durSec > 0 && this.seekSlider) {
        this.seekSlider.value = (curSec / durSec) * 100;
      }
      if (this.currentTimeEl) {
        this.currentTimeEl.textContent = this.formatTime(curSec);
      }
      if (this.durationTimeEl && durSec > 0 && this.isVodMode) {
        this.durationTimeEl.textContent = this.formatTime(durSec);
      }
    }
  }

  // ===================================================================
  // MÉTODOS DE CONTROLE DO PLAYER
  // ===================================================================
  togglePlayPause() {
    if (this.isNativeMode && window.AndroidPlayer && typeof AndroidPlayer.isPlaying === 'function') {
      if (AndroidPlayer.isPlaying()) {
        AndroidPlayer.pause();
        this.updatePlayPauseIcon(true);
        this.showControls();
      } else {
        AndroidPlayer.resume();
        this.updatePlayPauseIcon(false);
        this.resetControlsTimeout(4000);
      }
      return;
    }

    if (!this.video) return;
    if (this.video.paused) {
      this.video.play();
      this.updatePlayPauseIcon(false);
      this.resetControlsTimeout(4000);
    } else {
      this.video.pause();
      this.updatePlayPauseIcon(true);
      this.showControls();
    }
  }

  updatePlayPauseIcon(isPaused) {
    if (this.iconPlayPause) {
      this.iconPlayPause.textContent = isPaused ? '▶' : '❚❚';
    }
  }

  seekRelative(seconds) {
    if (this.isNativeMode && window.AndroidPlayer && typeof AndroidPlayer.getCurrentPosition === 'function') {
      const cur = AndroidPlayer.getCurrentPosition();
      const dur = AndroidPlayer.getDuration();
      if (dur > 0) {
        const target = Math.max(0, Math.min(dur, cur + seconds));
        AndroidPlayer.seekTo(target);
        if (this.currentTimeEl) this.currentTimeEl.textContent = this.formatTime(target);
        if (this.seekSlider) this.seekSlider.value = (target / dur) * 100;
        this.showControls();
        this.resetControlsTimeout(4500);
      }
      return;
    }

    if (!this.video) return;
    const dur = this.video.duration || 0;
    if (dur > 0) {
      const targetTime = Math.max(0, Math.min(dur, (this.video.currentTime || 0) + seconds));
      this.video.currentTime = targetTime;
      if (this.currentTimeEl) {
        this.currentTimeEl.textContent = this.formatTime(targetTime);
      }
      if (this.seekSlider) {
        this.seekSlider.value = (targetTime / dur) * 100;
      }
      this.showControls();
      this.resetControlsTimeout(4500);
    }
  }

  showControls() {
    clearTimeout(this.controlsTimeout);
    if (this.controlsOverlay) {
      this.controlsOverlay.classList.remove('hidden');
    }
    this.resetControlsTimeout(4500);
  }

  hideControls() {
    clearTimeout(this.controlsTimeout);
    if (this.controlsOverlay) {
      this.controlsOverlay.classList.add('hidden');
    }
  }

  toggleControls() {
    if (!this.controlsOverlay) return;
    if (this.controlsOverlay.classList.contains('hidden')) {
      this.showControls();
    } else {
      this.hideControls();
    }
  }

  resetControlsTimeout(delayMs = 4500) {
    clearTimeout(this.controlsTimeout);
    this.controlsTimeout = setTimeout(() => {
      this.hideControls();
    }, delayMs);
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  setPlaylist(channels) {
    this.currentChannelList = channels || [];
  }

  playChannelByIndex(index) {
    if (!this.currentChannelList || index < 0 || index >= this.currentChannelList.length) {
      return;
    }
    this.currentIndex = index;
    const channel = this.currentChannelList[index];
    this.loadStream(channel.url, channel.name, channel.category, index + 1, false);
  }

  nextChannel() {
    if (this.currentChannelList.length === 0) return;
    const nextIdx = (this.currentIndex + 1) % this.currentChannelList.length;
    this.playChannelByIndex(nextIdx);
  }

  previousChannel() {
    if (this.currentChannelList.length === 0) return;
    const prevIdx = (this.currentIndex - 1 + this.currentChannelList.length) % this.currentChannelList.length;
    this.playChannelByIndex(prevIdx);
  }

  /**
   * Reproduz no Mini-Player (Coluna 3 do Guia de Canais ao Vivo)
   */
  playMiniStream(url, channelName, category) {
    if (!this.miniVideo) return;
    const cleanUrl = this.normalizeStreamUrl(url);
    this.currentActiveStream = { url: cleanUrl, name: channelName, category };
    this.showMiniLoading(true);

    this.stopMini();

    const isHls = cleanUrl.toLowerCase().includes('.m3u8');
    let m3u8Candidate = cleanUrl;
    if (!isHls) {
      if (cleanUrl.toLowerCase().includes('.ts')) {
        m3u8Candidate = cleanUrl.replace(/\.ts(\?.*)?$/i, '.m3u8$1');
      } else if (cleanUrl.includes('?')) {
        m3u8Candidate = cleanUrl.replace('?', '.m3u8?');
      } else {
        m3u8Candidate = cleanUrl + '.m3u8';
      }
    }

    const startPlay = () => {
      this.miniVideo.muted = false;
      this.miniVideo.volume = 1.0;
      const p = this.miniVideo.play();
      if (p !== undefined && typeof p.then === 'function') {
        p.then(() => {
          this.showMiniLoading(false);
          this.miniVideo.muted = false;
          this.miniVideo.volume = 1.0;
        }).catch(e => {
          if (e && (e.name === 'AbortError' || (e.message && e.message.includes('interrupted')))) {
            // Canal trocado pelo controle remoto: NÃO muta o áudio!
            return;
          }
          console.warn('Autoplay mini player aviso:', e);
          if (e && e.name === 'NotAllowedError') {
            this.miniVideo.muted = true;
            const retry = this.miniVideo.play();
            if (retry && typeof retry.then === 'function') {
              retry.then(() => {
                this.showMiniLoading(false);
                setTimeout(() => {
                  try {
                    this.miniVideo.muted = false;
                    this.miniVideo.volume = 1.0;
                  } catch (err) {}
                }, 300);
              }).catch(() => {});
            }
          }
        });
      } else {
        this.showMiniLoading(false);
      }
    };

    // 1. Reprodução mpegts.js otimizada para canais IPTV (.ts) - SD, HD e FHD
    const tryMpegts = (onFail, useWorker = true, hasAudio = true) => {
      let mpegtsFailed = false;
      let mpegtsWatchdog = null;

      const cleanupAndFail = () => {
        if (mpegtsFailed) return;
        mpegtsFailed = true;
        clearTimeout(mpegtsWatchdog);
        if (this._miniFallbackTrigger === cleanupAndFail) {
          this._miniFallbackTrigger = null;
        }
        if (this.miniMpegts) {
          try {
            this.miniMpegts.pause();
            this.miniMpegts.unload();
            this.miniMpegts.detachMediaElement();
            this.miniMpegts.destroy();
          } catch (e) {}
          this.miniMpegts = null;
        }
        if (typeof onFail === 'function') onFail();
        else this.showMiniLoading(false);
      };

      this._miniFallbackTrigger = cleanupAndFail;

      if (window.mpegts && typeof mpegts.isSupported === 'function' && mpegts.isSupported()) {
        try {
          this.miniMpegts = mpegts.createPlayer({
            type: 'm2ts',
            isLive: true,
            url: cleanUrl,
            cors: false,
            hasAudio: hasAudio
          }, {
            enableWorker: useWorker,
            lazyLoad: false,
            enableStashBuffer: false,
            stashInitialSize: 128 * 1024,
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 12,
            autoCleanupMinBackwardDuration: 6,
            liveBufferLatencyChasing: false,
            reuseRedirectedURL: true
          });

          this.miniMpegts.attachMediaElement(this.miniVideo);
          this.miniMpegts.load();
          startPlay();

          // Watchdog ágil: 3.5s no worker, 4.5s sem worker
          const timeoutMs = useWorker ? 3500 : 4500;
          mpegtsWatchdog = setTimeout(() => {
            if (this.miniMpegts && this.miniVideo && this.miniVideo.readyState < 2) {
              console.warn(`mpegts (worker=${useWorker}, audio=${hasAudio}) não iniciou em ${timeoutMs}ms, acionando fallback`);
              cleanupAndFail();
            }
          }, timeoutMs);

          const onMpegtsReady = () => {
            clearTimeout(mpegtsWatchdog);
            this._miniFallbackTrigger = null;
            this.showMiniLoading(false);
            if (this.miniVideo) {
              this.miniVideo.muted = false;
              this.miniVideo.volume = 1.0;
            }
          };
          this.miniVideo.addEventListener('playing', onMpegtsReady, { once: true });
          this.miniVideo.addEventListener('canplay', onMpegtsReady, { once: true });
          this.miniVideo.addEventListener('loadeddata', onMpegtsReady, { once: true });
          this.miniVideo.addEventListener('timeupdate', () => {
            if (this.miniVideo && this.miniVideo.currentTime > 0) onMpegtsReady();
          }, { once: true });

          this.miniMpegts.on(mpegts.Events.ERROR, (errType, errDetail) => {
            console.warn(`mpegts (worker=${useWorker}, audio=${hasAudio}) erro fatal:`, errType, errDetail);
            cleanupAndFail();
          });
          return;
        } catch (e) {
          console.warn(`mpegts (worker=${useWorker}, audio=${hasAudio}) falhou na inicialização:`, e);
          cleanupAndFail();
          return;
        }
      }
      cleanupAndFail();
    };

    // 2. Reprodução HLS (.m3u8)
    const tryHls = (src, onFail) => {
      let hlsWatchdog = null;
      let hlsFailed = false;

      const cleanupAndFail = () => {
        if (hlsFailed) return;
        hlsFailed = true;
        clearTimeout(hlsWatchdog);
        if (this._miniFallbackTrigger === cleanupAndFail) {
          this._miniFallbackTrigger = null;
        }
        if (this.miniHls) {
          try { this.miniHls.destroy(); } catch (e) {}
          this.miniHls = null;
        }
        if (typeof onFail === 'function') onFail();
        else this.showMiniLoading(false);
      };

      this._miniFallbackTrigger = cleanupAndFail;

      if (window.Hls && Hls.isSupported()) {
        try {
          this.miniHls = new Hls({
            enableWorker: false,
            lowLatencyMode: false,
            backBufferLength: 6,
            maxBufferLength: 8,
            maxMaxBufferLength: 14,
            maxBufferSize: 16 * 1024 * 1024,
            maxBufferHole: 0.5,
            highBufferWatchdogPeriod: 2,
            nudgeOffset: 0.2,
            nudgeMaxRetry: 3,
            manifestLoadingTimeOut: 3500,
            manifestLoadingMaxRetry: 1,
            levelLoadingTimeOut: 3500,
            levelLoadingMaxRetry: 1,
            fragLoadingTimeOut: 4000,
            fragLoadingMaxRetry: 2
          });

          this.miniHls.loadSource(src);
          this.miniHls.attachMedia(this.miniVideo);

          hlsWatchdog = setTimeout(() => {
            if (this.miniHls && this.miniVideo && this.miniVideo.readyState < 2) {
              console.warn('HLS timeout (4s), acionando fallback');
              cleanupAndFail();
            }
          }, 4000);

          this.miniHls.on(Hls.Events.MANIFEST_PARSED, () => {
            startPlay();
          });

          this.miniHls.on(Hls.Events.FRAG_LOADED, () => {
            clearTimeout(hlsWatchdog);
            this._miniFallbackTrigger = null;
            this.showMiniLoading(false);
            if (this.miniVideo) {
              this.miniVideo.muted = false;
              this.miniVideo.volume = 1.0;
            }
          });

          let netRetries = 0;
          this.miniHls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  netRetries++;
                  if (netRetries <= 1) {
                    try { this.miniHls.startLoad(); } catch (e) { cleanupAndFail(); }
                  } else {
                    cleanupAndFail();
                  }
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  try {
                    this.miniHls.recoverMediaError();
                  } catch (e) {
                    cleanupAndFail();
                  }
                  break;
                default:
                  cleanupAndFail();
                  break;
              }
            }
          });
          return;
        } catch (e) {
          console.warn('Erro ao inicializar Hls.js:', e);
          cleanupAndFail();
          return;
        }
      }

      if (this.miniVideo && this.miniVideo.canPlayType('application/vnd.apple.mpegurl')) {
        this.miniVideo.src = src;
        startPlay();
      } else {
        cleanupAndFail();
      }
    };

    // 3. Fallback nativo direto no HTML5 video tag
    const tryNativeDirect = (src, onFail) => {
      if (!this.miniVideo) return;
      this.miniVideo.src = src;
      this.miniVideo.muted = false;
      this.miniVideo.volume = 1.0;

      let hasPlayed = false;
      let nativeStallTimer = setTimeout(() => {
        if (!hasPlayed && this.miniVideo && this.miniVideo.readyState < 2) {
          if (typeof onFail === 'function') onFail();
        }
      }, 3500);

      const onNativePlaying = () => {
        hasPlayed = true;
        clearTimeout(nativeStallTimer);
        this.showMiniLoading(false);
        if (this.miniVideo) {
          this.miniVideo.muted = false;
          this.miniVideo.volume = 1.0;
        }
      };
      this.miniVideo.addEventListener('playing', onNativePlaying, { once: true });
      this.miniVideo.addEventListener('timeupdate', onNativePlaying, { once: true });

      const p = this.miniVideo.play();
      if (p !== undefined && typeof p.catch === 'function') {
        p.catch(() => {
          this.miniVideo.muted = true;
          this.miniVideo.play().catch(() => {
            clearTimeout(nativeStallTimer);
            if (typeof onFail === 'function') onFail();
          });
        });
      }
    };

    // FLUXO DE REPRODUÇÃO RESILIENTE DE CANAIS AO VIVO:
    // Estágio 1: mpegts com Worker + áudio (ultra-baixo uso de CPU)
    // Estágio 2: mpegts inline/sem Worker + áudio (contorna restrições CORS de WebWorker)
    // Estágio 3: HLS (.m3u8 transcodificado para AAC pelo servidor IPTV)
    // Estágio 4: mpegts vídeo direto (hasAudio: false - garante que imagem NUNCA fique preta)
    // Estágio 5: HTML5 direto (decodificador nativo do navegador/WebView)
    const startMpegtsChain = (finalFail) => {
      tryMpegts(() => {
        tryMpegts(() => {
          tryHls(m3u8Candidate, () => {
            tryMpegts(() => {
              tryNativeDirect(cleanUrl, finalFail);
            }, false, false);
          });
        }, false, true);
      }, true, true);
    };

    if (isHls) {
      tryHls(cleanUrl, () => startMpegtsChain(null));
    } else {
      startMpegtsChain(null);
    }

    clearTimeout(this.miniLoadingTimer);
    this.miniLoadingTimer = setTimeout(() => {
      this.showMiniLoading(false);
    }, 7000);
  }

  /**
   * Expansão instantânea do canal em prévia para tela cheia:
   * Mantém o stream rodando 100% contínuo, sem reconectar e sem buffering!
   */
  expandMiniFullscreen(title, category, channelNumber) {
    const box = document.getElementById('mini-player-container');
    if (!box) return;

    // Guarda o foco atual para restaurá-lo ao sair da tela cheia
    if (!this.isMiniFullscreen) {
      this._fsPrevFocus = document.querySelector('.focused') ||
        (document.activeElement && document.activeElement !== document.body
          ? document.activeElement : null);
    }

    this.isMiniFullscreen = true;
    box.classList.add('fullscreen-mode');

    // Desmuta áudio imediatamente para a experiência de TV em tela cheia
    if (this.miniVideo) {
      this.miniVideo.muted = false;
      this.miniVideo.volume = 1.0;
    }

    const osdTitle = document.getElementById('mini-fs-title');
    const osdCat = document.getElementById('mini-fs-cat');
    const osdNum = document.getElementById('mini-fs-num');
    if (osdTitle) osdTitle.textContent = title || '';
    if (osdCat) osdCat.textContent = category || '';
    if (osdNum) osdNum.textContent = channelNumber ? `Canal ${channelNumber}` : '';

    const osdTopTitle = document.getElementById('mini-fs-topbar-title');
    if (osdTopTitle) osdTopTitle.textContent = title || '';

    this.showMiniFullscreenOsd(true);
    clearTimeout(this.miniFsOsdTimer);
    this.miniFsOsdTimer = setTimeout(() => this.showMiniFullscreenOsd(false), 4500);

    const backBtn = document.getElementById('btn-mini-fs-back');
    if (backBtn && !backBtn._hasFsClick) {
      backBtn._hasFsClick = true;
      const handleBack = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.collapseMiniFullscreen();
      };
      backBtn.addEventListener('click', handleBack);
      backBtn.addEventListener('touchend', handleBack);
    }

    // Ao clicar ou tocar na tela cheia:
    // Se a barra/HUD estiver visível, ela some imediatamente e o canal continua rodando sem interrupção!
    // Se estiver oculta, ela reaparece imediatamente com o botão Voltar!
    if (box && !box._hasFsToggle) {
      box._hasFsToggle = true;
      const handleToggle = (e) => {
        if (!this.isMiniFullscreen) return;
        if (e.target && e.target.closest('#btn-mini-fs-back, .mini-fs-back-btn')) return;
        this.toggleMiniFullscreenOsd();
      };
      box.addEventListener('click', handleToggle);
      box.addEventListener('touchend', (e) => {
        if (!this.isMiniFullscreen) return;
        if (e.target && e.target.closest('#btn-mini-fs-back, .mini-fs-back-btn')) return;
        this.toggleMiniFullscreenOsd();
      });
      if (this.miniVideo) {
        this.miniVideo.addEventListener('click', handleToggle);
      }
    }
  }

  toggleMiniFullscreenOsd() {
    const osd = document.getElementById('mini-fs-osd');
    const topbar = document.getElementById('mini-fs-topbar');
    if (!osd && !topbar) return;
    const isVisible = (topbar && topbar.classList.contains('active')) || (osd && osd.classList.contains('active'));
    this.showMiniFullscreenOsd(!isVisible);
    if (!isVisible) {
      clearTimeout(this.miniFsOsdTimer);
      this.miniFsOsdTimer = setTimeout(() => this.showMiniFullscreenOsd(false), 4500);
    }
  }

  showMiniFullscreenOsd(show) {
    const osd = document.getElementById('mini-fs-osd');
    const topbar = document.getElementById('mini-fs-topbar');
    const backBtn = document.getElementById('btn-mini-fs-back');

    if (osd) {
      osd.classList.toggle('active', !!show);
    }

    // A barra superior (botão Voltar) acompanha o OSD: some depois do
    // tempo sem interação e reaparece quando o usuário toca/clica na tela.
    if (topbar) {
      topbar.classList.toggle('active', !!show);
    }

    if (backBtn) {
      if (show) {
        // Volta a ficar focado: OK do remoto = voltar uma etapa
        if (typeof RemoteControl !== 'undefined') {
          RemoteControl.setFocus(backBtn, false);
        } else {
          backBtn.classList.add('focused');
        }
      } else {
        // Oculto: remove foco/pointer-events para não "prender" a tecla OK
        backBtn.classList.remove('focused');
        if (document.activeElement === backBtn &&
            typeof backBtn.blur === 'function') {
          backBtn.blur();
        }
      }
    }
  }

  collapseMiniFullscreen() {
    const box = document.getElementById('mini-player-container');
    if (!box) return;

    this.isMiniFullscreen = false;
    box.classList.remove('fullscreen-mode');
    this.showMiniFullscreenOsd(false);

    // Devolve o foco ao item que estava selecionado antes da tela cheia
    const backBtn = document.getElementById('btn-mini-fs-back');
    if (backBtn) backBtn.classList.remove('focused');
    const prevFocus = this._fsPrevFocus;
    this._fsPrevFocus = null;
    if (prevFocus && typeof RemoteControl !== 'undefined' && document.contains(prevFocus)) {
      RemoteControl.setFocus(prevFocus, false);
    }

    // Mantém o SOM da prévia ao voltar (bug: a prévia ficava muda)
    if (this.miniVideo) {
      this.miniVideo.muted = false;
    }
  }

  /**
   * Reproduz no Player Fullscreen
   * @param {string} url - URL do stream
   * @param {string} channelName - Título do vídeo ou canal
   * @param {string} category - Categoria ou Série
   * @param {number} channelNumber - Número do canal
   * @param {boolean} [isVod] - Verdadeiro se for filme ou série sob demanda
   */
  loadStream(url, channelName, category, channelNumber, isVod) {
    const cleanUrl = this.normalizeStreamUrl(url);

    // .ts é SEMPRE canal ao vivo (nunca VOD)
    if (cleanUrl.includes('.ts')) {
      this.isVodMode = false;
    } else if (isVod !== undefined) {
      this.isVodMode = isVod;
    } else {
      this.isVodMode = cleanUrl.includes('/movie/') || cleanUrl.includes('/series/') || /\.(mp4|mkv|avi|mov)$/i.test(cleanUrl);
    }

    this.currentActiveStream = { url: cleanUrl, name: channelName, category, channelNumber };

    // Para o mini player se estiver tocando
    this.stopMini();

    // Configura interface dos controles
    if (this.ctrlTitle) this.ctrlTitle.textContent = channelName || 'Sem Título';
    if (this.ctrlCategory) this.ctrlCategory.textContent = category || 'Geral';
    if (this.ctrlBadge) this.ctrlBadge.textContent = this.isVodMode ? 'VOD' : 'LIVE';

    if (this.vodControls && this.liveControls) {
      if (this.isVodMode) {
        this.vodControls.style.display = 'flex';
        this.liveControls.style.display = 'none';
        if (this.btnRewind) this.btnRewind.style.display = 'flex';
        if (this.btnForward) this.btnForward.style.display = 'flex';
      } else {
        this.vodControls.style.display = 'none';
        this.liveControls.style.display = 'flex';
        if (this.btnRewind) this.btnRewind.style.display = 'none';
        if (this.btnForward) this.btnForward.style.display = 'none';
      }
    }

    // Reseta timeline
    if (this.seekSlider) this.seekSlider.value = 0;
    if (this.currentTimeEl) this.currentTimeEl.textContent = '00:00';
    if (this.durationTimeEl) this.durationTimeEl.textContent = this.isVodMode ? '--:--' : 'AO VIVO';

    this.showLoading(true);
    this.showControls();
    this.updatePlayPauseIcon(false);

    // Watchdog timer: garante que o loading nunca fique travado eternamente
    clearTimeout(this.loadingWatchdog);
    this.loadingWatchdog = setTimeout(() => {
      this.showLoading(false);
    }, 7000);

    // Prioridade 1: Se estiver rodando no Android Nativo, abre a PlayerActivity de hardware nativo do Android
    if (window.AndroidDevice && typeof AndroidDevice.openPlayer === 'function') {
      this.stopHtmlVideo();
      this.showLoading(false);
      AndroidDevice.openPlayer(cleanUrl, channelName, category, this.isVodMode);
      return;
    }

    if (window.AndroidPlayer && typeof AndroidPlayer.play === 'function') {
      this.isNativeMode = true;
      this.stopHtmlVideo();
      AndroidPlayer.play(cleanUrl, this.isVodMode);
      return;
    }

    // Prioridade 2: Smart TVs (Samsung Tizen, LG webOS) e Web Browser
    this.isNativeMode = false;
    if (!this.video) return;

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    const startPlayFullscreen = () => {
      this.video.muted = false;
      const p = this.video.play();
      if (p !== undefined) {
        p.then(() => {
          this.showLoading(false);
          clearTimeout(this.loadingWatchdog);
          this.updatePlayPauseIcon(false);
          this.resetControlsTimeout(4500);
        }).catch(err => {
          console.warn('Autoplay com som bloqueado, tentando com mute:', err);
          this.video.muted = true;
          this.video.play().then(() => {
            this.showLoading(false);
            clearTimeout(this.loadingWatchdog);
            this.updatePlayPauseIcon(false);
            this.resetControlsTimeout(4500);
          }).catch(() => {});
        });
      }
    };

    const isRealM3u8 = cleanUrl.includes('.m3u8');

    if (window.Hls && Hls.isSupported() && isRealM3u8) {
      this.hls = new Hls({
        enableWorker: false,
        lowLatencyMode: true,
        backBufferLength: 60
      });

      this.hls.loadSource(cleanUrl);
      this.hls.attachMedia(this.video);

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        startPlayFullscreen();
        setTimeout(() => this.showLoading(false), 500);
      });

      this.hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.warn('HLS erro fatal, caindo para reprodução nativa HTML5:', data.type);
          this.hls.destroy();
          this.hls = null;
          this.video.src = cleanUrl;
          startPlayFullscreen();
        }
      });
    } else {
      this.video.src = cleanUrl;
      startPlayFullscreen();
    }
  }

  showLoading(isLoading) {
    if (!this.loading) return;
    this.loading.style.display = isLoading ? 'flex' : 'none';
  }

  showMiniLoading(isLoading) {
    if (!this.miniLoading) return;
    if (isLoading) {
      this.miniLoading.style.display = 'flex';
      this.miniLoading.style.opacity = '1';
    } else {
      this.miniLoading.style.opacity = '0';
      setTimeout(() => {
        if (this.miniLoading && this.miniLoading.style.opacity === '0') {
          this.miniLoading.style.display = 'none';
        }
      }, 200);
    }
  }

  stopMini() {
    clearTimeout(this.miniWaitingDebounce);
    clearTimeout(this.miniLoadingTimer);
    if (this.miniHls) {
      try { this.miniHls.destroy(); } catch (e) {}
      this.miniHls = null;
    }
    if (this.miniMpegts) {
      try {
        this.miniMpegts.pause();
        this.miniMpegts.unload();
        this.miniMpegts.detachMediaElement();
        this.miniMpegts.destroy();
      } catch (e) {}
      this.miniMpegts = null;
    }
    if (this.miniVideo) {
      try {
        this.miniVideo.pause();
        this.miniVideo.removeAttribute('src');
        this.miniVideo.load();
      } catch (e) {}
    }
  }

  stopHtmlVideo() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
  }

  stop() {
    clearTimeout(this.controlsTimeout);
    clearTimeout(this.loadingWatchdog);
    this.showLoading(false);
    if (this.controlsOverlay) {
      this.controlsOverlay.classList.add('hidden');
    }
    if (window.AndroidPlayer && typeof AndroidPlayer.stop === 'function') {
      try {
        AndroidPlayer.stop();
      } catch (e) {
        console.warn('Erro ao parar AndroidPlayer nativo:', e);
      }
    }
    this.stopHtmlVideo();
  }
}
