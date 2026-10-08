with open("js/app.js", "r", encoding="utf-8") as f:
    text = f.read()

import re
old_sync = r"""    const first = await this.queryPortalPlaylists(mac);
    if (first && first.url) {
      if (!forceSync && this.activePlaylistUrl === first.url && this.playlistData && this.playlistData.channels && this.playlistData.channels.length > 0 && this.playlistData._schemaVersion === 25) {
        if (this.currentScreen === 'reseller-login') this.goToScreen('home');
        this.updateTrialDisplay();
        if (notify) this.showToast('✔️ Playlist e licença já estão ativas e atualizadas!');
        return;
      }
      if (notify) this.showToast(`Carregando "${first.name}" do Portal...`);
      await this.activatePlaylistByUrl(first.url, first.name, notify, false, forceSync);
    } else {"""

new_sync = """    const portalPlaylistsStr = localStorage.getItem(`vion_playlists_${mac}`);
    let pList = portalPlaylistsStr ? JSON.parse(portalPlaylistsStr) : [];
    
    // Fallback pra garantir busca
    const first = await this.queryPortalPlaylists(mac);
    if (!pList || pList.length === 0) {
      const upStr = localStorage.getItem(`vion_playlists_${mac}`);
      pList = upStr ? JSON.parse(upStr) : [];
    }

    if (pList && pList.length > 0) {
      // Prioriza a playlist que ja estava ativa (se ainda existir na lista do portal)
      let targetPlaylist = pList.find(p => p.url === this.activePlaylistUrl) || pList[0];
      
      if (!forceSync && this.activePlaylistUrl === targetPlaylist.url && this.playlistData && this.playlistData.channels && this.playlistData.channels.length > 0 && this.playlistData._schemaVersion === 25) {
        if (this.currentScreen === 'reseller-login') this.goToScreen('home');
        this.updateTrialDisplay();
        if (notify) this.showToast('✔️ Playlist e licença já estão ativas e atualizadas!');
        return;
      }
      if (notify) this.showToast(`Carregando "${targetPlaylist.name}"...`);
      await this.activatePlaylistByUrl(targetPlaylist.url, targetPlaylist.name, notify, false, forceSync);
    } else {"""

if old_sync in text:
    text = text.replace(old_sync, new_sync)
    with open("js/app.js", "w", encoding="utf-8") as f:
        f.write(text)
    print("Fixed sync logic!")
else:
    print("Could not find old sync block.")
