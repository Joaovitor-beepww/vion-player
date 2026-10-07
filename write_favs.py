with open('favorites_block.txt', 'w', encoding='utf-8') as f:
    f.write('''  // ===================================================================
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
  // CALENDÁRIO EPG COM DATAS REAIS
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
      pill.innerHTML = `<span class="cal-day">${d.getDate()}</span><span class="cal-wday">${days[d.getDay()]}</span>`;
      cal.appendChild(pill);
    }
  },

  showToast(message) {''')
