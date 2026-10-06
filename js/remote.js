/**
 * Gerenciador de Controle Remoto para Smart TV - Vion Player
 * Suporte total: Samsung Tizen, LG webOS, Android TV, Fire TV e Teclado PC
 * App 100% focado em televisões - 10-foot UI
 */

const RemoteControl = {
  KEYS: {
    LEFT:       [37],
    UP:         [38],
    RIGHT:      [39],
    DOWN:       [40],
    ENTER:      [13, 32],
    BACK:       [4, 10009, 461, 27, 8, 166, 227, 228],
    CH_UP:      [427, 33, 117],
    CH_DOWN:    [428, 34, 118],
    PLAY:       [415, 179],
    PAUSE:      [19],
    PLAY_PAUSE: [10252, 463],
    STOP:       [413],
    FF:         [417],
    RW:         [412],
    RED:        [403, 116],
    GREEN:      [404, 115],
    YELLOW:     [405, 121],
    BLUE:       [406, 120],
    INFO:       [457, 73],
    MENU:       [18, 36],
    GUIDE:      [458]
  },

  _numBuffer: '',
  _numTimer: null,

  init() {
    this.registerTizenKeys();
    this.registerWebOSKeys();
    window.addEventListener('keydown', (e) => this.handleKeyDown(e), { passive: false });

    // Escuta popstate para capturar botão Voltar físico de controles de Smart TV no navegador
    window.addEventListener('popstate', () => {
      App.handleBack && App.handleBack();
    });

    // Escuta backbutton nativo de Smart TV
    document.addEventListener('backbutton', (e) => {
      e.preventDefault();
      App.handleBack && App.handleBack();
    });

    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest ? e.target.closest('.focusable') : null;
      if (el && !el.classList.contains('focused')) {
        this.setFocus(el, false);
      }
    }, { passive: true });

    document.addEventListener('click', (e) => {
      const el = e.target.closest ? e.target.closest('.focusable') : null;
      if (el) this.setFocus(el, false);
    }, { passive: true });
  },

  registerTizenKeys() {
    if (window.tizen && window.tizen.tvinputdevice) {
      const keys = [
        'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
        'MediaFastForward', 'MediaRewind',
        'ChannelUp', 'ChannelDown',
        'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
        'Info', 'Menu', 'Guide',
        '0','1','2','3','4','5','6','7','8','9'
      ];
      keys.forEach(k => {
        try { window.tizen.tvinputdevice.registerKey(k); } catch(e) {}
      });
    }
    window.addEventListener('tizenhwkey', (e) => {
      if (e.keyName === 'back') {
        e.preventDefault();
        App.handleBack && App.handleBack();
      }
    });
  },

  registerWebOSKeys() {
    // webOS não deve chamar platformBack() na inicialização pois fecha o app
  },

  isBackKey(code, e) {
    if (this.KEYS.BACK.includes(code)) return true;
    if (code === 461 || code === 10009 || code === 4 || code === 27 || code === 8 || code === 166 || code === 227 || code === 228) return true;
    if (e && (e.key === 'Back' || e.key === 'BrowserBack' || e.key === 'GoBack' || e.key === 'Escape')) return true;
    return false;
  },

  isEditingText(el) {
    if (!el) return false;
    return (el === document.activeElement) && (el.tagName === 'TEXTAREA' || el.isContentEditable === true || (el.tagName === 'INPUT' && el.type !== 'range'));
  },

  handleKeyDown(e) {
    const code = e.keyCode;

    // Proteção contra buffer/fila de repetição de teclas do controle remoto da TV
    const now = performance.now();
    const isArrow = this.KEYS.UP.includes(code) || this.KEYS.DOWN.includes(code) || this.KEYS.LEFT.includes(code) || this.KEYS.RIGHT.includes(code);
    if (isArrow && this._lastArrowTime && (now - this._lastArrowTime < 45)) {
      e.preventDefault();
      return;
    }
    if (isArrow) this._lastArrowTime = now;

    // 1. Tecla Voltar do controle remoto (Android TV, webOS, Tizen, Fire TV, PC Escape/Backspace)
    if (this.isBackKey(code, e)) {
      const parentalModal = document.getElementById('modal-parental-pin');
      if (parentalModal && parentalModal.style.display !== 'none') {
        e.preventDefault();
        if (typeof ParentalControl !== 'undefined') ParentalControl.closePinModal();
        return;
      }

      const tracksModal = document.getElementById('modal-player-tracks');
      if (tracksModal && tracksModal.style.display !== 'none') {
        e.preventDefault();
        if (App.player) App.player.closeTracksModal();
        return;
      }

      const quickGuide = document.getElementById('mini-fs-quick-guide');
      if (quickGuide && quickGuide.classList.contains('active')) {
        e.preventDefault();
        if (App.player) App.player.toggleQuickGuide(false);
        return;
      }

      const trailerModal = document.getElementById('modal-trailer-player');
      if (trailerModal && trailerModal.classList.contains('active')) {
        e.preventDefault();
        App.closeTrailerModal && App.closeTrailerModal();
        return;
      }

      const ae = document.activeElement;
      // Se estiver editando texto e apertar Backspace (8) com texto para apagar:
      if (code === 8 && this.isEditingText(ae) && ae.value && ae.value.length > 0) {
        return; // Deixa o navegador apagar o texto normalmente
      }
      e.preventDefault();
      e.stopPropagation();
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
        ae.blur();
      }
      App.handleBack && App.handleBack();
      return;
    }

    // Teclas numéricas para o PIN de Controle Parental
    const parentalModal = document.getElementById('modal-parental-pin');
    if (parentalModal && parentalModal.style.display !== 'none') {
      const numCodes = [48,49,50,51,52,53,54,55,56,57];
      const numpadCodes = [96,97,98,99,100,101,102,103,104,105];
      let digit = null;
      if (numCodes.includes(code)) digit = String(code - 48);
      else if (numpadCodes.includes(code)) digit = String(code - 96);
      if (digit !== null) {
        e.preventDefault();
        if (typeof ParentalControl !== 'undefined') ParentalControl.handleDigit(digit);
        return;
      }
    }

    // 2. Se o usuário estiver focado em um input de busca e usar o D-Pad:
    const ae = document.activeElement;
    const isInputActive = this.isEditingText(ae);

    if (isInputActive) {
      const isUp = this.KEYS.UP.includes(code);
      const isDown = this.KEYS.DOWN.includes(code);
      const isRight = this.KEYS.RIGHT.includes(code);
      const isLeft = this.KEYS.LEFT.includes(code);

      if (isUp || isDown || isRight || isLeft) {
        let shouldExitField = false;
        if (isUp || isDown) {
          shouldExitField = true;
        } else if (isRight && (ae.selectionStart === (ae.value ? ae.value.length : 0) || !ae.value)) {
          shouldExitField = true;
        } else if (isLeft && (ae.selectionStart === 0 || !ae.value)) {
          shouldExitField = true;
        }

        if (shouldExitField) {
          ae.blur();
          // Prossegue diretamente para o D-Pad abaixo sem travar no campo!
        } else {
          return;
        }
      } else if (code === 8 || code === 46) {
        // Backspace / Delete no texto
        return;
      }
    }

    // Teclas coloridas (qualquer tela)
    if (this.KEYS.GREEN.includes(code) || this.KEYS.YELLOW.includes(code)) {
      e.preventDefault();
      App.toggleFavoriteFocused && App.toggleFavoriteFocused();
      return;
    }
    if (this.KEYS.RED.includes(code)) {
      e.preventDefault();
      if (App.currentScreen === 'home') {
        App.syncPlaylistsFromPortal && App.syncPlaylistsFromPortal(true, true);
      }
      return;
    }
    if (this.KEYS.INFO.includes(code) || this.KEYS.BLUE.includes(code)) {
      e.preventDefault();
      App.showInfoFocused && App.showInfoFocused();
      return;
    }
    if (this.KEYS.GUIDE.includes(code)) {
      e.preventDefault();
      if (App.currentScreen === 'home') App.openSection && App.openSection('channels');
      return;
    }
    if (this.KEYS.MENU.includes(code)) {
      e.preventDefault();
      if (App.currentScreen !== 'home') App.handleBack && App.handleBack();
      return;
    }

    // Teclado numerico: digitar numero do canal
    const numCodes = [48,49,50,51,52,53,54,55,56,57];
    if (numCodes.includes(code) && App.currentScreen === 'channels') {
      e.preventDefault();
      const digit = code - 48;
      this._numBuffer = (this._numBuffer + digit).slice(-3);
      clearTimeout(this._numTimer);
      App.showToast && App.showToast(`Canal: ${this._numBuffer}`);
      this._numTimer = setTimeout(() => {
        const chNum = parseInt(this._numBuffer, 10) - 1;
        this._numBuffer = '';
        if (App.filteredItems && chNum >= 0 && chNum < App.filteredItems.length) {
          App.activeChannelIndex = chNum;
          App.updateActiveChannelUiAndStream && App.updateActiveChannelUiAndStream(false);
          const rows = document.querySelectorAll('.live-ch-row');
          if (rows[chNum]) {
            rows[chNum].scrollIntoView({ block: 'nearest', behavior: 'auto' });
            this.setFocus(rows[chNum]);
          }
        }
      }, 1500);
      return;
    }

    // Mini player em tela cheia (canal ao vivo)
    if (App.player && App.player.isMiniFullscreen) {
      const quickGuide = document.getElementById('mini-fs-quick-guide');
      const isGuideOpen = quickGuide && quickGuide.classList.contains('active');

      if (isGuideOpen) {
        if (this.isBackKey(code, e) || this.KEYS.LEFT.includes(code)) {
          e.preventDefault();
          App.player.toggleQuickGuide(false);
          return;
        }
        // UP / DOWN / ENTER dentro do mini-guia são processados pelo D-pad
      } else {
        if (this.KEYS.LEFT.includes(code) || this.KEYS.GUIDE.includes(code) || this.KEYS.MENU.includes(code)) {
          e.preventDefault();
          App.player.toggleQuickGuide(true);
          return;
        }
        if (this.KEYS.BACK.includes(code)) {
          e.preventDefault();
          App.player.collapseMiniFullscreen();
        } else if (this.KEYS.UP.includes(code) || this.KEYS.CH_UP.includes(code)) {
          e.preventDefault();
          App.previousMiniChannel && App.previousMiniChannel();
        } else if (this.KEYS.DOWN.includes(code) || this.KEYS.CH_DOWN.includes(code)) {
          e.preventDefault();
          App.nextMiniChannel && App.nextMiniChannel();
        } else if (this.KEYS.RIGHT.includes(code)) {
          e.preventDefault();
          App.player.toggleMiniFullscreenOsd && App.player.toggleMiniFullscreenOsd();
        } else if (this.KEYS.ENTER.includes(code)) {
          e.preventDefault();
          const focusedBack = document.getElementById('btn-mini-fs-back');
          const focusedGuide = document.getElementById('btn-mini-fs-quick-guide');
          if (focusedBack && (focusedBack.classList.contains('focused') || document.activeElement === focusedBack)) {
            focusedBack.click();
          } else if (focusedGuide && (focusedGuide.classList.contains('focused') || document.activeElement === focusedGuide)) {
            focusedGuide.click();
          } else {
            App.player.toggleMiniFullscreenOsd && App.player.toggleMiniFullscreenOsd();
          }
        } else if (this.KEYS.PLAY.includes(code) || this.KEYS.PAUSE.includes(code) || this.KEYS.PLAY_PAUSE.includes(code)) {
          e.preventDefault();
          App.player.toggleMiniFullscreenOsd && App.player.toggleMiniFullscreenOsd();
        } else if (this.KEYS.STOP.includes(code)) {
          e.preventDefault();
          App.player.collapseMiniFullscreen && App.player.collapseMiniFullscreen();
        }
        return;
      }
    }

    // Player de video HTML5 em tela cheia
    if (App.currentScreen === 'player') {
      if (this.KEYS.BACK.includes(code)) {
        e.preventDefault();
        if (window.App) App._lastBackTs = Date.now() + 500;
        App.closePlayer && App.closePlayer();
      } else if (this.KEYS.PLAY.includes(code) || this.KEYS.PAUSE.includes(code) || this.KEYS.PLAY_PAUSE.includes(code)) {
        e.preventDefault();
        App.player.togglePlayPause && App.player.togglePlayPause();
      } else if (this.KEYS.LEFT.includes(code) || this.KEYS.RW.includes(code)) {
        e.preventDefault();
        if (App.player.isVodMode) App.player.seekRelative && App.player.seekRelative(-10);
        else App.player.toggleControls && App.player.toggleControls();
      } else if (this.KEYS.RIGHT.includes(code) || this.KEYS.FF.includes(code)) {
        e.preventDefault();
        if (App.player.isVodMode) App.player.seekRelative && App.player.seekRelative(10);
        else App.player.toggleControls && App.player.toggleControls();
      } else if (this.KEYS.UP.includes(code) || this.KEYS.CH_UP.includes(code)) {
        e.preventDefault();
        App.player.previousChannel && App.player.previousChannel();
      } else if (this.KEYS.DOWN.includes(code) || this.KEYS.CH_DOWN.includes(code)) {
        e.preventDefault();
        App.player.nextChannel && App.player.nextChannel();
      } else if (this.KEYS.ENTER.includes(code)) {
        e.preventDefault();
        App.player.toggleControls && App.player.toggleControls();
      } else if (this.KEYS.STOP.includes(code)) {
        e.preventDefault();
        App.closePlayer && App.closePlayer();
      }
      return;
    }

    // Navegacao normal D-Pad
    if (this.KEYS.BACK.includes(code)) {
      e.preventDefault();
      App.handleBack && App.handleBack();
      return;
    }

    const pModal = document.getElementById('modal-parental-pin');
    const tModal = document.getElementById('modal-player-tracks');
    const qGuide = document.getElementById('mini-fs-quick-guide');
    let activeOverlay = null;
    if (pModal && pModal.style.display !== 'none') activeOverlay = pModal;
    else if (tModal && tModal.style.display !== 'none') activeOverlay = tModal;
    else if (qGuide && qGuide.classList.contains('active')) activeOverlay = qGuide;
    else activeOverlay = document.querySelector('.tv-dialog-overlay.active, .movie-details-overlay.active');
    const currentContainer = activeOverlay || document.querySelector('.screen.active');
    if (!currentContainer) return;

    let currentEl = currentContainer.querySelector('.focused') || 
      (document.activeElement && currentContainer.contains(document.activeElement) && document.activeElement.classList.contains('focusable') ? document.activeElement : null);

    let direction = null;
    if (this.KEYS.RIGHT.includes(code)) direction = 'RIGHT';
    else if (this.KEYS.LEFT.includes(code)) direction = 'LEFT';
    else if (this.KEYS.DOWN.includes(code)) direction = 'DOWN';
    else if (this.KEYS.UP.includes(code)) direction = 'UP';
    else if (this.KEYS.ENTER.includes(code)) {
      e.preventDefault();
      if (currentEl) {
        if (currentEl.tagName === 'INPUT' || currentEl.tagName === 'TEXTAREA') {
          try {
            currentEl.focus();
            currentEl.select && currentEl.select();
          } catch(e) {}
          return;
        }
        currentEl.click();
      }
      return;
    }

    if (!direction) return;
    e.preventDefault();

    // 1. Navegação Direta de Altíssimo Desempenho (0ms de latência, sem layout recalculation)
    if (currentEl) {
      const fastTarget = this.navigateFast(currentEl, direction);
      if (fastTarget) {
        this.setFocus(fastTarget);
        return;
      }
    }

    // 2. Fallback espacial para contêineres e telas secundárias
    const focusables = Array.from(currentContainer.querySelectorAll('.focusable')).filter(el => {
      return el.offsetParent !== null && !el.disabled &&
             el.offsetWidth > 0 && el.offsetHeight > 0;
    });
    if (focusables.length === 0) return;

    let focusedIndex = currentEl ? focusables.indexOf(currentEl) : -1;
    if (focusedIndex === -1) {
      this.setFocus(focusables[0]);
      return;
    }

    this.navigateDirection(focusables, focusedIndex, direction);
  },

  navigateFast(currentEl, direction) {
    if (!currentEl) return null;

    // 0. TELA DE LOGIN DO PROVEDOR (#screen-reseller-login)
    if (currentEl.id === 'input-reseller-user') {
      if (direction === 'DOWN') return document.getElementById('input-reseller-pass');
      return null;
    }
    if (currentEl.id === 'input-reseller-pass') {
      if (direction === 'UP') return document.getElementById('input-reseller-user');
      if (direction === 'RIGHT') return document.getElementById('btn-toggle-login-pass');
      if (direction === 'DOWN') return document.getElementById('input-reseller-code');
      return null;
    }
    if (currentEl.id === 'btn-toggle-login-pass') {
      if (direction === 'LEFT') return document.getElementById('input-reseller-pass');
      if (direction === 'UP') return document.getElementById('input-reseller-user');
      if (direction === 'DOWN') return document.getElementById('input-reseller-code');
      return null;
    }
    if (currentEl.id === 'input-reseller-code') {
      if (direction === 'UP') return document.getElementById('input-reseller-pass');
      if (direction === 'DOWN') return document.getElementById('btn-do-reseller-login');
      return null;
    }
    if (currentEl.id === 'btn-do-reseller-login') {
      if (direction === 'UP') return document.getElementById('input-reseller-code');
      if (direction === 'DOWN') return document.getElementById('btn-skip-login');
      return null;
    }
    if (currentEl.id === 'btn-skip-login') {
      if (direction === 'UP') return document.getElementById('btn-do-reseller-login');
      return null;
    }

    // 1. CANAIS AO VIVO (.live-ch-row)
    if (currentEl.classList.contains('live-ch-row')) {
      if (direction === 'DOWN') {
        let next = currentEl.nextElementSibling;
        while (next && (!next.classList.contains('live-ch-row') || next.offsetParent === null)) {
          next = next.nextElementSibling;
        }
        return next;
      }
      if (direction === 'UP') {
        let prev = currentEl.previousElementSibling;
        while (prev && (!prev.classList.contains('live-ch-row') || prev.offsetParent === null)) {
          prev = prev.previousElementSibling;
        }
        return prev;
      }
      if (direction === 'LEFT') {
        return document.querySelector('.live-cat-pill.active-cat') ||
               document.querySelector('.live-categories-scroll .live-cat-pill') ||
               document.getElementById('btn-live-favorites');
      }
      if (direction === 'RIGHT') {
        return document.getElementById('btn-expand-fullscreen');
      }
      return null;
    }

    // 2. CATEGORIAS DE CANAIS (.live-cat-pill)
    if (currentEl.classList.contains('live-cat-pill')) {
      if (direction === 'DOWN') {
        let next = currentEl.nextElementSibling;
        while (next && (!next.classList.contains('live-cat-pill') || next.offsetParent === null)) {
          next = next.nextElementSibling;
        }
        return next;
      }
      if (direction === 'UP') {
        let prev = currentEl.previousElementSibling;
        while (prev && (!prev.classList.contains('live-cat-pill') || prev.offsetParent === null)) {
          prev = prev.previousElementSibling;
        }
        if (!prev) {
          return document.getElementById('input-live-search') || document.getElementById('btn-live-favorites');
        }
        return prev;
      }
      if (direction === 'RIGHT') {
        return document.querySelector('.live-ch-row.active-playing') ||
               document.querySelector('.live-channels-scroll .live-ch-row');
      }
      if (direction === 'LEFT') {
        return null;
      }
      return null;
    }

    // 3. BOTÕES DO GUIA AO VIVO
    if (currentEl.id === 'btn-live-favorites') {
      if (direction === 'DOWN') return document.getElementById('input-live-search') || document.querySelector('.live-cat-pill');
      if (direction === 'RIGHT') return document.querySelector('.live-ch-row.active-playing') || document.querySelector('.live-ch-row');
      return null;
    }
    if (currentEl.id === 'input-live-search') {
      if (direction === 'UP') return document.getElementById('btn-live-favorites');
      if (direction === 'DOWN') return document.querySelector('.live-categories-scroll .live-cat-pill') || document.querySelector('.live-cat-pill');
      if (direction === 'RIGHT') return document.querySelector('.live-ch-row.active-playing') || document.querySelector('.live-ch-row');
      return null;
    }
    if (currentEl.id === 'btn-expand-fullscreen') {
      if (direction === 'LEFT') return document.querySelector('.live-ch-row.active-playing') || document.querySelector('.live-ch-row');
      return null;
    }

    // 4. GRADE DE POSTERS VOD (FILMES E SÉRIES)
    if (currentEl.classList.contains('vod-poster-card')) {
      if (direction === 'LEFT') {
        const prev = currentEl.previousElementSibling;
        const grid = document.getElementById('vod-grid');
        const gridRect = grid ? grid.getBoundingClientRect() : null;
        const cRect = currentEl.getBoundingClientRect();
        const isLeftmost = !prev || !prev.classList.contains('vod-poster-card') ||
                           (gridRect && cRect.left <= gridRect.left + 50) ||
                           (prev && prev.offsetTop < currentEl.offsetTop - 10);
        if (isLeftmost) {
          return document.querySelector('.vod-sidebar-item.active-cat') || document.querySelector('.vod-sidebar-item') || document.querySelector('.vod-pill');
        }
        return prev;
      }
      if (direction === 'RIGHT') {
        const next = currentEl.nextElementSibling;
        if (next && next.classList.contains('vod-poster-card')) return next;
        return null;
      }
      if (direction === 'UP') {
        const cLeft = currentEl.offsetLeft;
        const cTop = currentEl.offsetTop;
        let prev = currentEl.previousElementSibling;
        let targetRowTop = -1;
        let bestCandidate = null;
        let bestDist = Infinity;

        while (prev && prev.classList.contains('vod-poster-card')) {
          if (prev.offsetTop < cTop - 15) {
            if (targetRowTop === -1) targetRowTop = prev.offsetTop;
            if (Math.abs(prev.offsetTop - targetRowTop) > 20) break;

            const dist = Math.abs(prev.offsetLeft - cLeft);
            if (dist < bestDist) {
              bestDist = dist;
              bestCandidate = prev;
            }
          }
          prev = prev.previousElementSibling;
        }

        if (bestCandidate) return bestCandidate;
        return document.getElementById('input-vod-search');
      }
      if (direction === 'DOWN') {
        const cLeft = currentEl.offsetLeft;
        const cTop = currentEl.offsetTop;
        let next = currentEl.nextElementSibling;
        let targetRowTop = -1;
        let bestCandidate = null;
        let bestDist = Infinity;

        if (window.App && typeof App.renderMoreVodItems === 'function' && App.renderedCount < (App.filteredItems ? App.filteredItems.length : 0)) {
          const container = currentEl.parentElement;
          if (container && container.lastElementChild) {
            const lastIdx = Array.prototype.indexOf.call(container.children, currentEl);
            if (lastIdx >= container.children.length - 12) {
              App.renderMoreVodItems();
            }
          }
        }

        while (next && next.classList.contains('vod-poster-card')) {
          if (next.offsetTop > cTop + 15) {
            if (targetRowTop === -1) targetRowTop = next.offsetTop;
            if (Math.abs(next.offsetTop - targetRowTop) > 20) break;

            const dist = Math.abs(next.offsetLeft - cLeft);
            if (dist < bestDist) {
              bestDist = dist;
              bestCandidate = next;
            }
          }
          next = next.nextElementSibling;
        }

        if (bestCandidate) return bestCandidate;

        if (window.App && typeof App.renderMoreVodItems === 'function' && App.renderedCount < (App.filteredItems ? App.filteredItems.length : 0)) {
          App.renderMoreVodItems();
          let retryNext = currentEl.nextElementSibling;
          while (retryNext && retryNext.classList.contains('vod-poster-card')) {
            if (retryNext.offsetTop > cTop + 15) {
              return retryNext;
            }
            retryNext = retryNext.nextElementSibling;
          }
        }
        return null;
      }
      return null;
    }

    // 5. SIDEBAR DE CATEGORIAS VOD (.vod-sidebar-item e .vod-pill)
    if (currentEl.classList.contains('vod-sidebar-item') || currentEl.classList.contains('vod-pill')) {
      if (direction === 'DOWN') {
        let next = currentEl.nextElementSibling;
        while (next && (!next.classList.contains('vod-sidebar-item') && !next.classList.contains('vod-pill') || next.offsetParent === null)) {
          next = next.nextElementSibling;
        }
        if (!next && currentEl.parentElement && currentEl.parentElement.id === 'vod-quick-cats') {
          return document.querySelector('#vod-categories-list .vod-sidebar-item');
        }
        return next;
      }
      if (direction === 'UP') {
        let prev = currentEl.previousElementSibling;
        while (prev && (!prev.classList.contains('vod-sidebar-item') && !prev.classList.contains('vod-pill') || prev.offsetParent === null)) {
          prev = prev.previousElementSibling;
        }
        if (!prev && currentEl.parentElement && currentEl.parentElement.id === 'vod-categories-list') {
          return document.querySelector('#vod-quick-cats .vod-sidebar-item:last-child') || document.getElementById('input-vod-search');
        }
        if (!prev) return document.getElementById('input-vod-search');
        return prev;
      }
      if (direction === 'RIGHT') {
        return document.querySelector('.vod-grid-container .vod-poster-card');
      }
      return null;
    }
    if (currentEl.id === 'input-vod-search') {
      if (direction === 'DOWN') return document.querySelector('.vod-sidebar-item') || document.querySelector('.vod-pill');
      if (direction === 'RIGHT') return document.querySelector('.vod-grid-container .vod-poster-card');
      return null;
    }

    // 6. DASHBOARD HOME (5 Tiles: Live Tv, Movies, Series, Playlist, Settings - Imagem 1)
    if (currentEl.classList.contains('home-nav-tile') || currentEl.classList.contains('home-hero-card')) {
      if (direction === 'RIGHT') {
        let next = currentEl.nextElementSibling;
        while (next && (!next.classList.contains('home-nav-tile') && !next.classList.contains('home-hero-card') || next.offsetParent === null)) {
          next = next.nextElementSibling;
        }
        return next;
      }
      if (direction === 'LEFT') {
        let prev = currentEl.previousElementSibling;
        while (prev && (!prev.classList.contains('home-nav-tile') && !prev.classList.contains('home-hero-card') || prev.offsetParent === null)) {
          prev = prev.previousElementSibling;
        }
        return prev;
      }
      if (direction === 'DOWN') {
        const action = currentEl.getAttribute('data-action');
        if (action === 'playlist' || action === 'settings') {
          return document.getElementById('btn-top-exit') || document.getElementById('btn-top-reload');
        }
        return document.getElementById('btn-top-reload') || document.querySelector('.home-sub-btn');
      }
      return null;
    }
    if (currentEl.id === 'btn-top-reload') {
      if (direction === 'RIGHT') return document.getElementById('btn-top-exit');
      if (direction === 'UP') return document.querySelector('.home-nav-tile[data-action="series"]') || document.querySelector('.home-nav-tile');
      return null;
    }
    if (currentEl.id === 'btn-top-exit') {
      if (direction === 'LEFT') return document.getElementById('btn-top-reload');
      if (direction === 'UP') return document.querySelector('.home-nav-tile[data-action="settings"]') || document.querySelector('.home-nav-tile');
      return null;
    }
    if (currentEl.classList.contains('home-sub-btn') || currentEl.classList.contains('quick-action-pill')) {
      if (direction === 'RIGHT') {
        let next = currentEl.nextElementSibling;
        while (next && (!next.classList.contains('home-sub-btn') && !next.classList.contains('quick-action-pill') || next.offsetParent === null)) {
          next = next.nextElementSibling;
        }
        return next;
      }
      if (direction === 'LEFT') {
        let prev = currentEl.previousElementSibling;
        while (prev && (!prev.classList.contains('home-sub-btn') && !prev.classList.contains('quick-action-pill') || prev.offsetParent === null)) {
          prev = prev.previousElementSibling;
        }
        return prev;
      }
      if (direction === 'UP') {
        const tiles = document.querySelectorAll('.home-nav-tile');
        return tiles[2] || tiles[0] || document.querySelector('.home-hero-card');
      }
      return null;
    }

    // 7. TELA CINEMATOGRÁFICA DE SÉRIES (Horizontal 16:9 Carousel - Imagem 3)
    if (currentEl.classList.contains('episode-item')) {
      if (direction === 'LEFT') {
        const prev = currentEl.previousElementSibling;
        if (prev && prev.classList.contains('episode-item')) {
          return prev;
        }
        return null;
      }
      if (direction === 'RIGHT') {
        const next = currentEl.nextElementSibling;
        if (next && next.classList.contains('episode-item')) {
          return next;
        }
        return null;
      }
      if (direction === 'UP') {
        return document.querySelector('.season-tab-btn.active-season') || document.querySelector('.season-tab-btn');
      }
      if (direction === 'DOWN') {
        return null;
      }
      return null;
    }
    if (currentEl.classList.contains('season-tab-btn')) {
      if (direction === 'RIGHT') return currentEl.nextElementSibling || document.getElementById('btn-season-next');
      if (direction === 'LEFT') return currentEl.previousElementSibling || document.getElementById('btn-season-prev');
      if (direction === 'DOWN') return document.querySelector('.episode-item');
      if (direction === 'UP') return document.getElementById('btn-series-fav') || document.getElementById('btn-series-trailer') || document.getElementById('btn-series-play-first') || document.getElementById('btn-close-series-modal');
      return null;
    }

    // 8. BOTÕES DE AÇÃO CINEMA (PLAY, PLAY TRAILER, + FAVORITES - Imagem 4)
    if (currentEl.classList.contains('action-btn-cinema')) {
      if (direction === 'DOWN') {
        let next = currentEl.nextElementSibling;
        while (next && (!next.classList.contains('action-btn-cinema') || next.offsetParent === null)) {
          next = next.nextElementSibling;
        }
        if (next) return next;
        return document.querySelector('.season-tab-btn.active-season') || document.querySelector('.season-tab-btn');
      }
      if (direction === 'UP') {
        let prev = currentEl.previousElementSibling;
        while (prev && (!prev.classList.contains('action-btn-cinema') || prev.offsetParent === null)) {
          prev = prev.previousElementSibling;
        }
        if (prev) return prev;
        return document.getElementById('btn-close-series-modal');
      }
      if (direction === 'RIGHT') {
        return document.querySelector('.season-tab-btn.active-season') || document.querySelector('.season-tab-btn');
      }
      if (direction === 'LEFT') {
        return document.getElementById('btn-close-series-modal');
      }
      return null;
    }
    if (currentEl.id === 'btn-close-series-modal') {
      if (direction === 'DOWN') return document.getElementById('btn-series-play-first') || document.querySelector('.action-btn-cinema') || document.querySelector('.season-tab-btn');
      return null;
    }

    return null;
  },

  navigateDirection(elements, currentIndex, direction) {
    const current = elements[currentIndex];
    const currentRect = current.getBoundingClientRect();
    const cCX = currentRect.left + currentRect.width / 2;
    const cCY = currentRect.top + currentRect.height / 2;

    let bestCandidate = null;
    let bestScore = Infinity;

    for (let i = 0; i < elements.length; i++) {
      if (i === currentIndex) continue;
      const target = elements[i];
      const targetRect = target.getBoundingClientRect();
      const tCX = targetRect.left + targetRect.width / 2;
      const tCY = targetRect.top + targetRect.height / 2;

      const TOLERANCE = 5;
      let isValid = false;
      if (direction === 'RIGHT' && targetRect.left >= currentRect.right - TOLERANCE) isValid = true;
      if (direction === 'LEFT'  && targetRect.right <= currentRect.left + TOLERANCE)  isValid = true;
      if (direction === 'DOWN'  && targetRect.top >= currentRect.bottom - TOLERANCE)  isValid = true;
      if (direction === 'UP'    && targetRect.bottom <= currentRect.top + TOLERANCE)  isValid = true;

      if (!isValid) continue;

      const dx = Math.abs(tCX - cCX);
      const dy = Math.abs(tCY - cCY);
      const primaryAxis  = (direction === 'LEFT' || direction === 'RIGHT') ? dx : dy;
      const secondaryAxis = (direction === 'LEFT' || direction === 'RIGHT') ? dy : dx;
      const score = primaryAxis + secondaryAxis * 2.5;

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = target;
      }
    }

    // Se pressionar PARA BAIXO e não encontrar mais candidatos (fim da página renderizada),
    // carrega automaticamente o próximo lote de filmes/séries e continua a navegação
    if (!bestCandidate && direction === 'DOWN' && current && current.classList.contains('vod-poster-card')) {
      if (window.App && typeof App.renderMoreVodItems === 'function' && App.renderedCount < (App.filteredItems ? App.filteredItems.length : 0)) {
        App.renderMoreVodItems();
        const activeOverlay = document.querySelector('.tv-dialog-overlay.active, .movie-details-overlay.active');
        const container = activeOverlay || document.querySelector('.screen.active');
        if (container) {
          const updatedElements = Array.from(container.querySelectorAll('.focusable')).filter(el => {
            return el.offsetParent !== null && !el.disabled && el.offsetWidth > 0 && el.offsetHeight > 0;
          });
          const newIdx = updatedElements.indexOf(current);
          if (newIdx >= 0) {
            return this.navigateDirection(updatedElements, newIdx, 'DOWN');
          }
        }
      }
    }

    if (bestCandidate) this.setFocus(bestCandidate);
  },

  setFocus(element, shouldScroll = true) {
    if (!element) return;
    const prev = document.querySelector('.focused');
    if (prev && prev !== element) prev.classList.remove('focused');
    element.classList.add('focused');

    const isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
    const currentActive = document.activeElement;

    // Se o elemento ativo atual for um input e estivermos saindo dele, fecha o teclado
    if (currentActive && currentActive !== element && (currentActive.tagName === 'INPUT' || currentActive.tagName === 'TEXTAREA')) {
      try { currentActive.blur(); } catch(e) {}
    }

    // Se o elemento for um input, NÃO chamamos .focus() nativo automaticamente na navegação!
    // Apenas marcamos com a classe .focused para navegação visual do controle remoto.
    // O teclado só abre quando o usuário pressionar OK/ENTER ou clicar nele!
    if (!isInput) {
      if (document.activeElement !== element) {
        try { element.focus({ preventScroll: true }); }
        catch(e) { element.focus(); }
      }
    }

    if (shouldScroll) {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    }

    // Auto-carregamento contínuo super leve para navegação VOD (O(1) sem varredura pesada do DOM)
    if (element.classList.contains('vod-poster-card') && window.App && typeof App.renderMoreVodItems === 'function') {
      const next1 = element.nextElementSibling;
      const next2 = next1 ? next1.nextElementSibling : null;
      if (!next2 && App.renderedCount < (App.filteredItems ? App.filteredItems.length : 0)) {
        App.renderMoreVodItems();
      }
    }
  }
};

window.RemoteControl = RemoteControl;
