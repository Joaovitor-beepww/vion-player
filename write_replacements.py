with open('excluir_replacement.txt', 'w', encoding='utf-8') as f:
    f.write('''          <button class="pill-btn focusable btn-item-disconnect" tabindex="0" style="padding:8px 18px;font-size:13px;background:rgba(239,68,68,0.2);border:1px solid #ef4444;color:#ef4444;font-weight:700;">🗑️ Excluir</button>
        </div>
      `;

      item.querySelector('.btn-item-disconnect')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openDialog('Excluir Playlist?', `Deseja realmente excluir "${p.name}" da TV e do site?`, async () => {
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
            let localPlaylists = JSON.parse(localStorage.getItem(`vion_playlists_${mac}`) || '[]');
            localPlaylists = localPlaylists.filter(x => x.id !== p.id && x.url !== p.url);
            localStorage.setItem(`vion_playlists_${mac}`, JSON.stringify(localPlaylists));

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
      });''')

with open('logout_replacement.txt', 'w', encoding='utf-8') as f:
    f.write('''  logoutAccount() {
    this.openDialog('Sair da Conta?', 'Deseja realmente desconectar a conta e remover a lista ativa deste dispositivo?', async () => {
      try {
        await TVStorage.remove('cached_playlist');
        await TVStorage.remove('cached_playlist_time');
      } catch (e) {}
      
      const mac = localStorage.getItem('vion_mac_address');
      if (mac) {
        const localPlaylists = JSON.parse(localStorage.getItem(`vion_playlists_${mac}`) || '[]');
        for (const p of localPlaylists) {
          if (p.id) {
            await fetch('https://vion.gestorpro.app.br/api/device/delete-playlist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mac, id: p.id })
            }).catch(()=>{});
          }
        }
        localStorage.removeItem(`vion_playlists_${mac}`);
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
  },''')
