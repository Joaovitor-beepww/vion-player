import re

with open('js/app.js', 'r', encoding='utf-8') as f:
    text = f.read()

match = re.search(r'          <button class="pill-btn focusable btn-item-disconnect".*?this\.logoutAccount\(\);\n      \}\);', text, flags=re.DOTALL)
if match:
    with open('excluir_target.txt', 'w', encoding='utf-8') as f:
        f.write(match.group(0))

match2 = re.search(r'  logoutAccount\(\) \{.*?\n  \},', text, flags=re.DOTALL)
if match2:
    with open('logout_target.txt', 'w', encoding='utf-8') as f:
        f.write(match2.group(0))
