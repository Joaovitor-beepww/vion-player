
with open("js/app.js", "r", encoding="utf-8") as f:
    content = f.read()
target = "name: ${partner.name || partner.code} (),"
replacement = "name: `${partner.name || partner.code} (${user})`,"
content = content.replace(target, replacement)
with open("js/app.js", "w", encoding="utf-8") as f:
    f.write(content)

