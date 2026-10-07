with open("js/app.js", "r", encoding="utf-8") as f:
    text = f.read()

import re
text = re.sub(r"localStorage\.setItem\(.*?JSON\.stringify\(localPlaylists\)\);", "localStorage.setItem(`vion_playlists_${mac}`, JSON.stringify(localPlaylists));", text)
text = re.sub(r"localStorage\.removeItem\(.*?ion_playlists.*?\);", "localStorage.removeItem(`vion_playlists_${mac}`);", text)

with open("js/app.js", "w", encoding="utf-8") as f:
    f.write(text)
print("Fixed setItem/removeItem syntax with loose regex!")
