import re

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    def repl_id(m):
        idx = m.group(1).replace('-', '_')
        return f"var _el_{idx} = document.getElementById('{m.group(1)}'); if (_el_{idx}) _el_{idx}.addEventListener("
    
    content = re.sub(r"document\.getElementById\('([^']+)'\)\?\.addEventListener\(", repl_id, content)

    def repl_id_class(m):
        idx = m.group(1).replace('-', '_')
        return f"var _elC_{idx} = document.getElementById('{m.group(1)}'); if (_elC_{idx}) _elC_{idx}.classList."
    content = re.sub(r"document\.getElementById\('([^']+)'\)\?\.classList\.", repl_id_class, content)

    def repl_qs(m):
        cls = m.group(1).replace('.', '').replace('-', '_')
        return f"var _qs_{cls} = item.querySelector('{m.group(1)}'); if (_qs_{cls}) _qs_{cls}.addEventListener("
    content = re.sub(r"item\.querySelector\('([^']+)'\)\?\.addEventListener\(", repl_qs, content)

    content = re.sub(r"(this\.\w+)\?\.addEventListener\(", r"if (\1) \1.addEventListener(", content)
    content = re.sub(r"\b(\w+)\?\.addEventListener\(", r"if (\1) \1.addEventListener(", content)

    content = content.replace('data.episode_run_time?.[0]', '(data.episode_run_time ? data.episode_run_time[0] : null)')
    
    content = content.replace('this.playlistData.live?.channels?.length', '(this.playlistData.live && this.playlistData.live.channels ? this.playlistData.live.channels.length : 0)')
    content = content.replace('this.playlistData.movies?.channels?.length', '(this.playlistData.movies && this.playlistData.movies.channels ? this.playlistData.movies.channels.length : 0)')
    content = content.replace('this.playlistData.series?.channels?.length', '(this.playlistData.series && this.playlistData.series.channels ? this.playlistData.series.channels.length : 0)')
    
    content = content.replace('parsed.live?.channels?.length', '(parsed.live && parsed.live.channels ? parsed.live.channels.length : 0)')
    content = content.replace('parsed.movies?.channels?.length', '(parsed.movies && parsed.movies.channels ? parsed.movies.channels.length : 0)')
    content = content.replace('parsed.series?.channels?.length', '(parsed.series && parsed.series.channels ? parsed.series.channels.length : 0)')
    
    content = content.replace('this.playlistData?.live', '(this.playlistData ? this.playlistData.live : null)')
    content = content.replace('this.playlistData?.movies', '(this.playlistData ? this.playlistData.movies : null)')
    
    content = content.replace('nameInput?.value.trim()', '(nameInput ? nameInput.value.trim() : "")')
    content = content.replace('urlInput?.value.trim()', '(urlInput ? urlInput.value.trim() : "")')
    
    content = content.replace('this.nowPlayingVod.item?.url', '(this.nowPlayingVod.item ? this.nowPlayingVod.item.url : null)')
    content = content.replace('this.nowPlayingVod.episode?.url', '(this.nowPlayingVod.episode ? this.nowPlayingVod.episode.url : null)')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

fix_file('js/app.js')
fix_file('js/player.js')
print('Fixed!')
