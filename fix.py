import subprocess
import re

# 1. Obter app.js original de 0b43c0f
app = subprocess.check_output(['git', 'show', '0b43c0f:js/app.js']).decode('utf-8')

# 2. Add methods in init
app = app.replace('    this.startClockTimer();\n    this.bindEvents();\n    this.initCinemaBackdropSlideshow();', '    this.startClockTimer();\n    this.bindEvents();\n    this.initCinemaBackdropSlideshow();\n    this.setupPlatformLifecycle();\n    this.updateEpgCalendar();')

# 3. Fix btn-top-exit and add btn-live-favorites
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

# 4. Insert huge favorites block before showToast
with open('favorites_block.txt', 'r', encoding='utf-8') as f:
    favorites_block = f.read()

app = app.replace('  showToast(message) {', favorites_block)

# 5. Excluir target
with open('excluir_target.txt', 'r', encoding='utf-8') as f:
    excluir_target = f.read()
with open('excluir_replacement.txt', 'r', encoding='utf-8') as f:
    excluir_replacement = f.read()

app = app.replace(excluir_target, excluir_replacement)

# 6. Logout target
with open('logout_target.txt', 'r', encoding='utf-8') as f:
    logout_target = f.read()
with open('logout_replacement.txt', 'r', encoding='utf-8') as f:
    logout_replacement = f.read()

app = app.replace(logout_target, logout_replacement)

with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(app)
