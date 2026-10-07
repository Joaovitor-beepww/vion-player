import re

with open('js/app.js', 'r', encoding='utf-8') as f:
    app = f.read()

excluir_replacement = '''          <button class="pill-btn focusable btn-item-disconnect" tabindex="0" style="padding:8px 18px;font-size:13px;background:rgba(239,68,68,0.2);border:1px solid #ef4444;color:#ef4444;font-weight:700;">🗑️ Excluir</button>
        </div>
      \;

      item.querySelector('.btn-item-disconnect')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openDialog('Excluir Playlist?', \Deseja realmente excluir "\" da TV e do site?\, async () => {
          try {
            if (p.id) {
              await fetch('https://vion.gestorpro.app.br/api/device/delete-playlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac, id: p.id })
              }).catch(()=>{});
            }

            let localPlaylists = JSON.parse(localStorage.getItem(\ion_playlists_\\) || '[]');
            localPlaylists = localPlaylists.filter(x => x.id !== p.id && x.url !== p.url);
            localStorage.setItem(\ion_playlists_\\, JSON.stringify(localPlaylists));

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
            this.openPlaylistsManager();
          } catch(err) {
            this.showToast('Erro ao excluir playlist.');
          }
        });
      });'''

app = re.sub(r'          <button class="pill-btn focusable btn-item-disconnect".*?this\.logoutAccount\(\);\n      \}\);', excluir_replacement, app, flags=re.DOTALL)

logout_replacement = '''  logoutAccount() {
    this.openDialog('Sair da Conta?', 'Deseja realmente desconectar a conta e remover a lista ativa deste dispositivo?', async () => {
      try {
        await TVStorage.remove('cached_playlist');
        await TVStorage.remove('cached_playlist_time');
      } catch (e) {}
      
      const mac = localStorage.getItem('vion_mac_address');
      if (mac) {
        const localPlaylists = JSON.parse(localStorage.getItem(\ion_playlists_\\) || '[]');
        for (const p of localPlaylists) {
          if (p.id) {
            await fetch('https://vion.gestorpro.app.br/api/device/delete-playlist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mac, id: p.id })
            }).catch(()=>{});
          }
        }
        localStorage.removeItem(\ion_playlists_\\);
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

app = re.sub(r'  logoutAccount\(\) \{.*?\n  \},', logout_replacement, app, flags=re.DOTALL)

with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(app)
print('Done regex repl!')
