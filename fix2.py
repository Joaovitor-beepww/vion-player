import subprocess
import re

app = subprocess.check_output(['git', 'show', '0b43c0f:js/app.js']).decode('utf-8')

app = app.replace('    this.startClockTimer();\n    this.bindEvents();\n    this.initCinemaBackdropSlideshow();', '    this.startClockTimer();\n    this.bindEvents();\n    this.initCinemaBackdropSlideshow();\n    this.setupPlatformLifecycle();\n    this.updateEpgCalendar();')

t1 = '''    document.getElementById('btn-top-exit')?.addEventListener('click', () => {
      this.openDialog('Sair do Aplicativo?', 'Deseja realmente fechar o Vion Player?', () => {
        if (window.AndroidDevice && typeof AndroidDevice.exitApp === 'function') {
          AndroidDevice.exitApp();
          return;
        }
        if (window.tizen) tizen.application.getCurrentApplication().exit();
        if (window.webOS) window.close();
      });
    });'''

t2 = '''    document.getElementById('btn-top-exit')?.addEventListener('click', () => {
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
    });'''

app = app.replace(t1, t2)

with open('favorites_block.txt', 'r', encoding='utf-8') as f:
    favorites_block = f.read()

app = app.replace('  showToast(message) {', favorites_block)

excluir_target = '''          <button class="pill-btn focusable btn-item-disconnect" tabindex="0" style="padding:8px 18px;font-size:13px;background:rgba(239,68,68,0.2);border:1px solid #ef4444;color:#ef4444;font-weight:700;">🔌 Desconectar</button>
        </div>
      ;

      item.querySelector('.btn-item-disconnect')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.logoutAccount();
      });'''

excluir_replacement = '''          <button class="pill-btn focusable btn-item-disconnect" tabindex="0" style="padding:8px 18px;font-size:13px;background:rgba(239,68,68,0.2);border:1px solid #ef4444;color:#ef4444;font-weight:700;">🗑️ Excluir</button>
        </div>
      ;

      item.querySelector('.btn-item-disconnect')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openDialog('Excluir Playlist?', Deseja realmente excluir "" da TV e do site?, async () => {
          try {
            // Remove do servidor
            if (p.id) {
              await fetch('https://vion.gestorpro.app.br/api/device/delete-playlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac, id: p.id })
              }).catch(()=>{});
            }

            // Remove da lista local
            let localPlaylists = JSON.parse(localStorage.getItem(ion_playlists_) || '[]');
            localPlaylists = localPlaylists.filter(x => x.id !== p.id && x.url !== p.url);
            localStorage.setItem(ion_playlists_, JSON.stringify(localPlaylists));

            if (this.activePlaylistUrl === p.url || localPlaylists.length === 0) {
              await TVStorage.remove('cached_playlist');
              await TVStorage.remove('cached_playlist_time');
              localStorage.removeItem('vion_has_playlist');
              localStorage.removeItem('vion_active_playlist_url');
              localStorage.removeItem('vion_active_playlist_name');
              this.playlistData = null;
              this.activePlaylistUrl = null;
            }

            this.showToast('Playlist excluída com sucesso!');
            this.openPlaylistsManager(); // recarrega a lista
          } catch(err) {
            this.showToast('Erro ao excluir playlist.');
          }
        });
      });'''

app = app.replace(excluir_target, excluir_replacement)

logout_target = '''  logoutAccount() {
    this.openDialog('Sair da Conta?', 'Deseja realmente desconectar a conta e remover a lista ativa deste dispositivo?', async () => {
      try {
        await TVStorage.remove('cached_playlist');
        await TVStorage.remove('cached_playlist_time');
      } catch (e) {}
      const mac = localStorage.getItem('vion_mac_address');
      if (mac) {
        localStorage.removeItem(ion_playlists_);
      }
      localStorage.removeItem('vion_has_playlist');
      localStorage.removeItem('vion_saved_provider_code');
      localStorage.removeItem('vion_saved_provider_user');
      localStorage.removeItem('vion_saved_provider_pass');
      localStorage.removeItem('vion_provider_pass');
      localStorage.removeItem('vion_active_playlist_url');
      localStorage.removeItem('vion_active_playlist_name');

      this.playlistData = null;
      this.closePlayer();
      this.goToScreen('home');
    });
  },'''

logout_replacement = '''  logoutAccount() {
    this.openDialog('Sair da Conta?', 'Deseja realmente desconectar a conta e remover a lista ativa deste dispositivo?', async () => {
      try {
        await TVStorage.remove('cached_playlist');
        await TVStorage.remove('cached_playlist_time');
      } catch (e) {}
      
      const mac = localStorage.getItem('vion_mac_address');
      if (mac) {
        const localPlaylists = JSON.parse(localStorage.getItem(ion_playlists_) || '[]');
        for (const p of localPlaylists) {
          if (p.id) {
            await fetch('https://vion.gestorpro.app.br/api/device/delete-playlist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mac, id: p.id })
            }).catch(()=>{});
          }
        }
        localStorage.removeItem(ion_playlists_);
      }
      
      localStorage.removeItem('vion_has_playlist');
      localStorage.removeItem('vion_saved_provider_code');
      localStorage.removeItem('vion_saved_provider_user');
      localStorage.removeItem('vion_saved_provider_pass');
      localStorage.removeItem('vion_provider_pass');
      localStorage.removeItem('vion_active_playlist_url');
      localStorage.removeItem('vion_active_playlist_name');

      this.playlistData = null;
      this.activePlaylistUrl = null;
      if (this.player) {
        this.player.stopMini();
        this.player.close();
      }

      const codeInput = document.getElementById('input-reseller-code');
      if (codeInput) codeInput.value = '';

      this.goToScreen('home');
      this.showToast('Conta e listas excluídas definitivamente!');
    });
  },'''

app = app.replace(logout_target, logout_replacement)

with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(app)
print('Done!')
