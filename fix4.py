import subprocess
import re

app = subprocess.check_output(['git', 'show', '0b43c0f:js/app.js']).decode('utf-8').replace('\r\n', '\n')

app = app.replace('    this.startClockTimer();\n    this.bindEvents();\n    this.initCinemaBackdropSlideshow();', '    this.startClockTimer();\n    this.bindEvents();\n    this.initCinemaBackdropSlideshow();\n    this.setupPlatformLifecycle();\n    this.updateEpgCalendar();')

t1 = '''    document.getElementById('btn-top-exit')?.addEventListener('click', () => {
      this.openDialog('Sair do Aplicativo?', 'Deseja realmente fechar o Vion Player?', () => {
        if (window.AndroidDevice && typeof AndroidDevice.exitApp === 'function') {
          AndroidDevice.exitApp();
          return;
        }
        if (window.tizen) tizen.application.getCurrentApplication().exit();
        if (window.webOS) window.close();
      });
    });'''.replace('\r\n', '\n')

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
    });'''.replace('\r\n', '\n')

app = app.replace(t1, t2)

with open('favorites_block.txt', 'r', encoding='utf-8') as f:
    favorites_block = f.read().replace('\r\n', '\n')

app = app.replace('  showToast(message) {', favorites_block)

with open('excluir_target.txt', 'r', encoding='utf-8') as f:
    excluir_target = f.read().replace('\r\n', '\n')
with open('excluir_replacement.txt', 'r', encoding='utf-8') as f:
    excluir_replacement = f.read().replace('\r\n', '\n')

app = app.replace(excluir_target, excluir_replacement)

with open('logout_target.txt', 'r', encoding='utf-8') as f:
    logout_target = f.read().replace('\r\n', '\n')
with open('logout_replacement.txt', 'r', encoding='utf-8') as f:
    logout_replacement = f.read().replace('\r\n', '\n')

app = app.replace(logout_target, logout_replacement)

with open('js/app.js', 'w', encoding='utf-8', newline='\n') as f:
    f.write(app)
print('Done!')
