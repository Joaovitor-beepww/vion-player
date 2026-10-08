with open("js/app.js", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("Recarregar</button>", "Acessar Playlist</button>")

with open("js/app.js", "w", encoding="utf-8") as f:
    f.write(text)
print("Renamed button!")
