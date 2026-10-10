with open('js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = "name:  (),"
replacement = "name: \\ (\)\,"

content = content.replace(target, replacement)

with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Syntax fixed')
