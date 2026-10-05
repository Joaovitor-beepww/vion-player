/**
 * Vion Player - Lógica do Portal com Login de Dispositivo & Gerenciamento de Playlists
 * Idêntico ao fluxo do TiviPlayer (Login com MAC + Device Key)
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initLoginSystem();
  initPlaylistManager();
  initResellerPortal();
  checkExistingSession();

  // Roteamento automático inicial por hash na URL
  const initialHash = (window.location.hash || '').replace('#', '').split('?')[0].trim();
  if (initialHash && ['home', 'login', 'manage-playlists', 'activation', 'reseller'].includes(initialHash)) {
    switchTab(initialHash);
  }
});

window.addEventListener('hashchange', () => {
  const currentHash = (window.location.hash || '').replace('#', '').split('?')[0].trim();
  if (currentHash && ['home', 'login', 'manage-playlists', 'activation', 'reseller'].includes(currentHash)) {
    switchTab(currentHash);
  }
});

/**
 * 1. Navegação Global entre Abas
 */
function initNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.tab-section');

  window.switchTab = function(targetTab) {
    if (targetTab === 'reseller') {
      document.body.classList.add('is-reseller-mode');
      const isAuth = localStorage.getItem('vion_reseller_auth') === 'true';
      if (isAuth) {
        showResellerView('dashboard');
      }
    } else {
      document.body.classList.remove('is-reseller-mode');
    }

    navLinks.forEach(link => {
      if (link.getAttribute('data-tab') === targetTab) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    sections.forEach(sec => {
      if (sec.id === `section-${targetTab}`) {
        sec.classList.add('active');
      } else {
        sec.classList.remove('active');
      }
    });

    window.location.hash = targetTab;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // Botões na Home
  document.getElementById('btn-hero-activate')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('activation');
  });

  document.getElementById('btn-hero-upload')?.addEventListener('click', (e) => {
    e.preventDefault();
    // Se já estiver logado, vai direto para Gerenciar Playlists, senão vai para Login
    const currentMac = localStorage.getItem('vion_current_session');
    if (currentMac) {
      switchTab('manage-playlists');
    } else {
      switchTab('login');
    }
  });

  // Botão Entrar na Navbar
  document.getElementById('btn-nav-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('login');
  });

  // Botão Sair na Navbar
  document.getElementById('btn-nav-logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    logoutDevice();
  });

  // Fechamento universal de qualquer modal pelo 'X' ou clicando fora dele
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.btn-close-modal');
    if (closeBtn) {
      const modal = closeBtn.closest('.modal-overlay');
      if (modal) modal.style.display = 'none';
      return;
    }
    if (e.target.classList.contains('modal-overlay')) {
      e.target.style.display = 'none';
    }
  });
}

/**
 * 2. Sistema de Login via MAC Address e Device Key (Idêntico à Imagem 1)
 */
function initLoginSystem() {
  const macInput = document.getElementById('login-mac-input');
  const keyInput = document.getElementById('login-key-input');
  const form = document.getElementById('login-form');
  const feedback = document.getElementById('mac-validation-feedback');
  const loginAlert = document.getElementById('login-alert');

  // Validação dinâmica do MAC Address enquanto digita (com máscara XX:XX:XX:XX:XX:XX)
  macInput?.addEventListener('input', (e) => {
    let val = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
    if (val.length > 12) val = val.substring(0, 12);

    const parts = [];
    for (let i = 0; i < val.length; i += 2) {
      parts.push(val.substring(i, i + 2));
    }
    const formatted = parts.join(':');
    e.target.value = formatted;

    // Feedback visual idêntico ao da imagem (verde quando tem 17 caracteres)
    if (formatted.length === 17) {
      feedback.className = 'input-feedback valid';
      feedback.innerHTML = '✔ Endereço MAC é válido';
    } else if (formatted.length > 0) {
      feedback.className = 'input-feedback invalid';
      feedback.innerHTML = 'Insira o MAC completo (12 caracteres)';
    } else {
      feedback.className = 'input-feedback';
      feedback.innerHTML = '';
    }
  });

  // Chave do Dispositivo (máximo 6 dígitos)
  keyInput?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '').substring(0, 6);
  });

  // Ação de Login Estrito (apenas MAC e Key existentes)
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const mac = macInput.value.trim().toUpperCase();
    const key = keyInput.value.trim();

    if (mac.length !== 17) {
      showAlert(loginAlert, 'Por favor, insira um endereço MAC completo no formato XX:XX:XX:XX:XX:XX', 'error');
      return;
    }

    if (key.length < 4 || key.length > 6) {
      showAlert(loginAlert, 'A Chave do Dispositivo deve ter entre 4 e 6 números.', 'error');
      return;
    }

    showAlert(loginAlert, '🔄 Verificando credenciais do dispositivo no sistema...', 'info');

    // Validação estrita: somente permite acesso se o MAC e a KEY existirem no servidor
    const validateEndpoints = [
      `${PORTAL_API}/api/device/validate`,
      '/api/device/validate',
      'http://192.168.1.197:3000/api/device/validate',
      'http://localhost:3000/api/device/validate'
    ];

    let errorMsg = 'Não foi possível conectar ao servidor de validação.';

    for (const endpoint of validateEndpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mac, key }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          loginDevice(mac, key, data.playlists || []);
          showAlert(loginAlert, '✔ Dispositivo autorizado com sucesso!', 'success');
          setTimeout(() => {
            if (loginAlert) loginAlert.style.display = 'none';
          }, 1500);
          return;
        } else {
          errorMsg = data.error || 'Dispositivo não encontrado ou Device Key incorreta.';
          break;
        }
      } catch (err) {
        // Tenta próximo endpoint
      }
    }

    showAlert(loginAlert, `❌ ${errorMsg}`, 'error');
  });
}

const PORTAL_API = window.location.origin.includes(':3000') 
  ? window.location.origin 
  : 'http://192.168.1.197:3000';

function loginDevice(mac, key, initialPlaylists = []) {
  localStorage.setItem('vion_current_session', mac);
  localStorage.setItem(`vion_device_key_${mac}`, key);

  updateSessionUI(mac);

  let playlists = initialPlaylists;
  if (!playlists || playlists.length === 0) {
    playlists = getDevicePlaylists(mac);
  }
  // Limpa quaisquer listas antigas de demonstração (NI1 / NI3)
  if (playlists && playlists.some(p => p.name === 'NI1' || p.name === 'NI3')) {
    playlists = playlists.filter(p => p.name !== 'NI1' && p.name !== 'NI3');
  }
  saveDevicePlaylists(mac, playlists);

  renderPlaylists(mac);
  switchTab('manage-playlists');
}

function logoutDevice() {
  localStorage.removeItem('vion_current_session');
  updateSessionUI(null);
  switchTab('home');
}

function checkExistingSession() {
  const currentMac = localStorage.getItem('vion_current_session');
  if (currentMac) {
    updateSessionUI(currentMac);
    renderPlaylists(currentMac);
  } else {
    updateSessionUI(null);
  }
}

function updateSessionUI(mac) {
  const btnLogin = document.getElementById('btn-nav-login');
  const btnLogout = document.getElementById('btn-nav-logout');
  const connectedMacEl = document.getElementById('connected-mac-display');

  if (mac) {
    if (btnLogin) btnLogin.style.display = 'none';
    if (btnLogout) {
      btnLogout.style.display = 'flex';
      btnLogout.innerHTML = `<span>${mac}</span> <span>[→ Sair</span>`;
    }
    if (connectedMacEl) connectedMacEl.textContent = mac;
  } else {
    if (btnLogin) btnLogin.style.display = 'flex';
    if (btnLogout) btnLogout.style.display = 'none';
  }
}

/**
 * 3. Gerenciamento Completo de Playlists (Idêntico à Imagem 2)
 */
function initPlaylistManager() {
  const modal = document.getElementById('modal-playlist');
  const btnAdd = document.getElementById('btn-open-add-modal');
  const btnClose = document.getElementById('btn-close-modal');
  const btnCancel = document.getElementById('btn-cancel-modal');
  const formPlaylist = document.getElementById('modal-playlist-form');

  // Alternador de tipo no modal (M3U vs Xtream)
  const tabM3U = document.getElementById('modal-tab-m3u');
  const tabXtream = document.getElementById('modal-tab-xtream');
  const fieldM3U = document.getElementById('modal-field-m3u');
  const fieldXtream = document.getElementById('modal-field-xtream');

  let currentType = 'm3u';

  tabM3U?.addEventListener('click', () => {
    currentType = 'm3u';
    tabM3U.classList.add('active');
    tabXtream.classList.remove('active');
    fieldM3U.style.display = 'block';
    fieldXtream.style.display = 'none';
  });

  tabXtream?.addEventListener('click', () => {
    currentType = 'xtream';
    tabXtream.classList.add('active');
    tabM3U.classList.remove('active');
    fieldM3U.style.display = 'none';
    fieldXtream.style.display = 'block';
  });

  // Abrir Modal de Adição
  btnAdd?.addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'Adicionar Playlist';
    document.getElementById('playlist-edit-id').value = '';
    document.getElementById('input-playlist-name').value = '';
    document.getElementById('input-playlist-url').value = '';
    modal.classList.add('active');
  });

  function closeModal() {
    modal.classList.remove('active');
  }

  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  // Salvar Playlist (Adicionar ou Editar)
  formPlaylist?.addEventListener('submit', (e) => {
    e.preventDefault();

    const currentMac = localStorage.getItem('vion_current_session');
    if (!currentMac) return;

    const editId = document.getElementById('playlist-edit-id').value;
    const name = document.getElementById('input-playlist-name').value.trim() || 'Lista 1';
    let url = '';

    if (currentType === 'm3u') {
      url = document.getElementById('input-playlist-url').value.trim();
      if (!url.startsWith('http')) {
        alert('Insira uma URL M3U válida começando com http:// ou https://');
        return;
      }
    } else {
      const host = document.getElementById('input-modal-host').value.trim();
      const user = document.getElementById('input-modal-user').value.trim();
      const pass = document.getElementById('input-modal-pass').value.trim();
      if (!host || !user || !pass) {
        alert('Preencha os campos do Xtream Codes.');
        return;
      }
      url = `${host}/get.php?username=${user}&password=${pass}&type=m3u_plus`;
    }

    const playlists = getDevicePlaylists(currentMac);

    const playlistObj = {
      id: editId || Date.now().toString(),
      name,
      url
    };

    if (editId) {
      // Editar existente
      const index = playlists.findIndex(p => p.id === editId);
      if (index !== -1) {
        playlists[index] = playlistObj;
      }
    } else {
      // Nova playlist
      playlists.push(playlistObj);
    }

    saveDevicePlaylists(currentMac, playlists);

    // Sincroniza com a API do servidor da TV
    fetch(`${PORTAL_API}/api/device/playlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac: currentMac, playlist: playlistObj })
    }).then(() => {
      console.log('Playlist sincronizada com a TV via API!');
    }).catch(err => {
      console.warn('Aviso: Servidor da TV não respondeu diretamente (usando cache local):', err);
    });

    renderPlaylists(currentMac);
    closeModal();
    alert('Playlist salva com sucesso! Os canais já estão sincronizados no Vion Player.');
  });
}

function getDevicePlaylists(mac) {
  const data = localStorage.getItem(`vion_playlists_${mac}`);
  return data ? JSON.parse(data) : [];
}

function saveDevicePlaylists(mac, list) {
  localStorage.setItem(`vion_playlists_${mac}`, JSON.stringify(list));
}

function renderPlaylists(mac) {
  const container = document.getElementById('playlists-container');
  if (!container) return;

  const playlists = getDevicePlaylists(mac);
  container.innerHTML = '';

  if (playlists.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted); background: #141c2c; border-radius: 12px;">
        Nenhuma playlist cadastrada para este dispositivo.<br>Clique em <strong>+ Adicionar Playlists</strong> abaixo para vincular a sua primeira lista.
      </div>
    `;
    return;
  }

  playlists.forEach(p => {
    const row = document.createElement('div');
    row.className = 'playlist-row';

    row.innerHTML = `
      <div class="playlist-left">
        <span class="playlist-tag">${escapeHtml(p.name)}</span>
        <span class="playlist-url" title="${escapeHtml(p.url)}">${escapeHtml(p.url)}</span>
      </div>
      <div class="playlist-actions">
        <button class="action-icon-btn edit" title="Editar Playlist" data-id="${p.id}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <button class="action-icon-btn delete" title="Excluir Playlist" data-id="${p.id}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    // Botão Editar
    row.querySelector('.edit').addEventListener('click', () => {
      openEditModal(p);
    });

    // Botão Excluir
    row.querySelector('.delete').addEventListener('click', () => {
      if (confirm(`Deseja realmente remover a playlist "${p.name}"?`)) {
        deletePlaylist(mac, p.id);
      }
    });

    container.appendChild(row);
  });
}

function openEditModal(playlist) {
  const modal = document.getElementById('modal-playlist');
  document.getElementById('modal-title').textContent = 'Editar Playlist';
  document.getElementById('playlist-edit-id').value = playlist.id;
  document.getElementById('input-playlist-name').value = playlist.name;
  document.getElementById('input-playlist-url').value = playlist.url;
  modal.classList.add('active');
}

function deletePlaylist(mac, id) {
  let playlists = getDevicePlaylists(mac);
  playlists = playlists.filter(p => p.id !== id);
  saveDevicePlaylists(mac, playlists);

  fetch(`${PORTAL_API}/api/device/delete-playlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mac, id })
  }).catch(err => console.warn('Erro ao remover no servidor da TV:', err));

  renderPlaylists(mac);
}

function showAlert(el, message, type) {
  if (!el) return;
  el.className = `alert-box alert-${type}`;
  el.innerHTML = message;
  el.style.display = 'block';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// ===================================================================
// 4. PAINEL DO REVENDEDOR (RESELLER HUB) - GESTÃO COMPLETA
// ===================================================================

// ===================================================================
// 4. MÓDULO OFICIAL DE REVENDEDORES & PARCEIROS
// Inspirado nas 5 telas oficiais (Cadastro 2 etapas, Cinema Login,
// Dashboard com 5 cards pretos, Topbar com Dropdown e Compra de Créditos Direta)
// ===================================================================

const MASTER_ADMIN_EMAIL = 'joaovitordc1010@gmail.com';

function isCurrentUserMasterAdmin() {
  const user = (localStorage.getItem('vion_reseller_user') || '').trim().toLowerCase();
  return user === MASTER_ADMIN_EMAIL.toLowerCase();
}

function getResellerSession() {
  const email = (localStorage.getItem('vion_reseller_user') || '').trim().toLowerCase();
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(`vion_reseller_data_${email}`) || 'null');
  } catch(e) {}

  if (!data) {
    const isMaster = (email === MASTER_ADMIN_EMAIL.toLowerCase());
    data = {
      email: email || 'revendedor@exemplo.com',
      company: isMaster ? 'Vion Player Master' : 'Minha Revenda',
      firstName: isMaster ? 'João' : 'Revendedor',
      lastName: isMaster ? 'Vitor' : 'Oficial',
      country: 'Brasil',
      address: 'São Paulo, Brasil',
      phone: '+55 11 99999-9999',
      credits: isMaster ? 9999 : parseInt(localStorage.getItem('vion_reseller_credits') || '25', 10),
      activations: JSON.parse(localStorage.getItem('vion_reseller_devices') || '[]'),
      creditHistory: [
        { id: 'h1', type: 'bonus', amount: 25, desc: 'Créditos Iniciais de Parceiro', date: Date.now() - 86400000 * 2 }
      ],
      links: [
        { id: 'l1', name: 'Link Oficial de Divulgação', code: 'VION-' + (isMaster ? 'JV' : 'PRO'), clicks: 18, activations: 4, url: `${window.location.origin}/portal#reseller?ref=VION-PRO` }
      ],
      subs: JSON.parse(localStorage.getItem('vion_reseller_subs') || '[]'),
      withdrawals: [],
      earnings: 320.00
    };
    if (email) localStorage.setItem(`vion_reseller_data_${email}`, JSON.stringify(data));
  }
  return data;
}

function saveResellerSession(data) {
  if (!data || !data.email) return;
  const email = data.email.trim().toLowerCase();
  localStorage.setItem(`vion_reseller_data_${email}`, JSON.stringify(data));
  localStorage.setItem('vion_reseller_credits', (data.credits || 0).toString());
}

function initResellerPortal() {
  initPartnerRegistration();
  initCinemaLogin();
  initHubDashboard();
  initDirectBuyCredits();
  initWithdrawalModal();
  initProfileModal();
  initActivateDeviceModal();
  initAddSubModal();
  initPartnershipsSection();

  // Verifica estado inicial de autenticação
  const isAuth = localStorage.getItem('vion_reseller_auth') === 'true';
  if (isAuth) {
    showResellerView('dashboard');
  } else {
    // Tela inicial para novos visitantes: Cadastro em 2 Etapas (Imagens 1 e 2)
    showResellerView('register');
  }
}

/**
 * Alternador mestre de telas do Revendedor
 * 'register'  -> Cadastro 2 Etapas (Imagens 1 e 2)
 * 'login'     -> Login Cinema Living Room (Imagem 3)
 * 'dashboard' -> Painel do Revendedor (Imagens 4 e 5)
 */
function showResellerView(viewName) {
  const regBox = document.getElementById('partner-register-flow');
  const loginBox = document.getElementById('reseller-cinema-login');
  const panelBox = document.getElementById('reseller-panel-container');

  if (regBox) regBox.style.setProperty('display', (viewName === 'register') ? 'flex' : 'none', 'important');
  if (loginBox) loginBox.style.setProperty('display', (viewName === 'login') ? 'flex' : 'none', 'important');
  if (panelBox) panelBox.style.setProperty('display', (viewName === 'dashboard') ? 'flex' : 'none', 'important');

  if (viewName === 'dashboard') {
    refreshHubDashboard();
  }
}

// ===================================================================
// 4.1 CADASTRO DE PARCEIROS EM 2 ETAPAS (IMAGENS 1 E 2)
// ===================================================================
function initPartnerRegistration() {
  const step1Form = document.getElementById('partner-reg-step1');
  const step2Form = document.getElementById('partner-reg-step2');
  const circle1 = document.getElementById('step-circle-1');
  const circle2 = document.getElementById('step-circle-2');

  const btnNext = document.getElementById('btn-reg-next');
  const btnBack = document.getElementById('btn-back-to-step1');
  const linkToLogin = document.getElementById('link-switch-to-login');
  const btnTopLogin = document.getElementById('btn-goto-login-from-reg');
  const alertStep1 = document.getElementById('reg-step1-alert');
  const alertStep2 = document.getElementById('reg-step2-alert');

  // Alternar para tela de Login (Imagem 3)
  [linkToLogin, btnTopLogin].forEach(el => {
    el?.addEventListener('click', (e) => {
      e.preventDefault();
      showResellerView('login');
    });
  });

  // Botão de alternar visibilidade de senhas
  document.querySelectorAll('.btn-toggle-password').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        if (input.type === 'password') {
          input.type = 'text';
          btn.style.color = '#38bdf8';
        } else {
          input.type = 'password';
          btn.style.color = '';
        }
      }
    });
  });

  // Alteração de bandeira do DDI
  const phoneCodeSelect = document.getElementById('reg-phone-code');
  const phoneFlagIcon = document.getElementById('phone-flag-icon');
  phoneCodeSelect?.addEventListener('change', () => {
    const val = phoneCodeSelect.value;
    if (val === '+55') phoneFlagIcon.textContent = '🇧🇷';
    else if (val === '+1') phoneFlagIcon.textContent = '🇺🇸';
    else if (val === '+351') phoneFlagIcon.textContent = '🇵🇹';
    else if (val === '+34') phoneFlagIcon.textContent = '🇪🇸';
    else if (val === '+54') phoneFlagIcon.textContent = '🇦🇷';
  });

  // AVANÇAR: ETAPA 1 -> ETAPA 2 (Imagem 1 -> Imagem 2)
  step1Form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const company = document.getElementById('reg-company')?.value.trim();
    const firstName = document.getElementById('reg-first-name')?.value.trim();
    const lastName = document.getElementById('reg-last-name')?.value.trim();
    const email = document.getElementById('reg-email')?.value.trim();
    const password = document.getElementById('reg-password')?.value.trim();

    if (!company || !firstName || !lastName || !email || !password) {
      showAlert(alertStep1, 'Por favor, preencha todos os campos da etapa 1.', 'error');
      return;
    }

    if (password.length < 4) {
      showAlert(alertStep1, 'A senha deve conter pelo menos 4 caracteres.', 'error');
      return;
    }

    if (alertStep1) alertStep1.style.display = 'none';

    // Transição visual: Círculo 1 marcado, Círculo 2 ativo (Estilo Imagem 2)
    circle1?.classList.remove('active');
    circle1?.classList.add('completed');
    circle2?.classList.add('active');

    step1Form.style.display = 'none';
    if (step2Form) {
      step2Form.style.display = 'flex';
      step2Form.classList.add('active');
    }
  });

  // VOLTAR: ETAPA 2 -> ETAPA 1
  btnBack?.addEventListener('click', (e) => {
    e.preventDefault();
    circle2?.classList.remove('active');
    circle1?.classList.remove('completed');
    circle1?.classList.add('active');

    if (step2Form) step2Form.style.display = 'none';
    if (step1Form) step1Form.style.display = 'flex';
  });

  // REGISTRAR: ETAPA 2 (Imagem 2)
  step2Form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const company = document.getElementById('reg-company')?.value.trim();
    const firstName = document.getElementById('reg-first-name')?.value.trim();
    const lastName = document.getElementById('reg-last-name')?.value.trim();
    const email = document.getElementById('reg-email')?.value.trim().toLowerCase();
    const password = document.getElementById('reg-password')?.value.trim();

    const country = document.getElementById('reg-country')?.value || 'Brasil';
    const address = document.getElementById('reg-address')?.value.trim();
    const phoneCode = document.getElementById('reg-phone-code')?.value || '+55';
    const phoneNumber = document.getElementById('reg-phone-number')?.value.trim();
    const fullPhone = `${phoneCode} ${phoneNumber}`;

    const isReseller = document.getElementById('check-partner-reseller')?.checked;
    const isReference = document.getElementById('check-partner-reference')?.checked;
    const terms = document.getElementById('check-partner-terms')?.checked;

    if (!address || !phoneNumber) {
      showAlert(alertStep2, 'Por favor, informe seu endereço e telefone.', 'error');
      return;
    }

    if (!terms) {
      showAlert(alertStep2, 'Você deve concordar com os termos de privacidade e uso.', 'error');
      return;
    }

    showAlert(alertStep2, '🔄 Criando sua conta de parceiro...', 'info');

    const partnerTypes = [];
    if (isReseller) partnerTypes.push('reseller');
    if (isReference) partnerTypes.push('reference');

    try {
      const res = await fetch('/api/reseller/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company, firstName, lastName, email, password,
          country, address, phone: fullPhone, partnerTypes
        })
      });

      if (res.ok) {
        const data = await res.json();
        saveResellerSession(data.reseller);
      }
    } catch(err) {
      console.warn('Registro local de fallback:', err);
    }

    // Grava autenticação local
    const isMaster = (email === MASTER_ADMIN_EMAIL.toLowerCase());
    localStorage.setItem('vion_reseller_auth', 'true');
    localStorage.setItem('vion_reseller_user', email);
    localStorage.setItem('vion_is_master_admin', isMaster ? 'true' : 'false');

    showAlert(alertStep2, '✔ Cadastro realizado com sucesso! Entrando no seu painel...', 'success');

    setTimeout(() => {
      showResellerView('dashboard');
    }, 700);
  });
}

// ===================================================================
// 4.2 GUIA DE LOGIN DO REVENDEDOR (IMAGEM 3 - LIVING ROOM CINEMA)
// ===================================================================
function initCinemaLogin() {
  const form = document.getElementById('cinema-login-form');
  const userInput = document.getElementById('cinema-user-input');
  const passInput = document.getElementById('cinema-pass-input');
  const alertBox = document.getElementById('cinema-login-alert');
  const linkToReg = document.getElementById('link-goto-register-from-login');
  const btnQuickAdmin = document.getElementById('btn-cinema-admin-quick');

  linkToReg?.addEventListener('click', (e) => {
    e.preventDefault();
    showResellerView('register');
  });

  // Acesso rápido como Administrador Geral
  btnQuickAdmin?.addEventListener('click', () => {
    if (userInput) userInput.value = MASTER_ADMIN_EMAIL;
    if (passInput) passInput.value = 'admin123';
    form?.dispatchEvent(new Event('submit'));
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = (userInput?.value || '').trim();
    const pass = (passInput?.value || '').trim();

    if (!user || !pass) {
      showAlert(alertBox, 'Informe usuário e senha.', 'error');
      return;
    }

    showAlert(alertBox, '🔄 Autenticando revendedor...', 'info');

    const isMaster = (user.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase());

    try {
      const res = await fetch('/api/reseller/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.reseller) saveResellerSession(data.reseller);
      }
    } catch(err) {
      console.warn('Auth local fallback:', err);
    }

    localStorage.setItem('vion_reseller_auth', 'true');
    localStorage.setItem('vion_reseller_user', user);
    localStorage.setItem('vion_is_master_admin', isMaster ? 'true' : 'false');

    showAlert(alertBox, isMaster ? '✔ Bem-vindo, Administrador Geral!' : '✔ Login autorizado!', 'success');

    setTimeout(() => {
      if (alertBox) alertBox.style.display = 'none';
      showResellerView('dashboard');
    }, 500);
  });
}

// ===================================================================
// 4.3 PAINEL DO REVENDEDOR (IMAGENS 4 E 5)
// ===================================================================
function initHubDashboard() {
  const dropdownTrigger = document.getElementById('hub-user-dropdown-trigger');
  const dropdownMenu = document.getElementById('hub-user-dropdown-menu');
  const btnHamburger = document.getElementById('btn-hub-hamburger');
  const sidebar = document.getElementById('hub-sidebar');

  // Toggle do Dropdown Menu da Imagem 5
  dropdownTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu?.classList.toggle('active');
  });

  document.addEventListener('click', (e) => {
    if (dropdownMenu && !dropdownTrigger?.contains(e.target)) {
      dropdownMenu.classList.remove('active');
    }
  });

  // Ações do Dropdown Menu (Imagem 5)
  document.getElementById('menu-buy-credits')?.addEventListener('click', () => {
    dropdownMenu?.classList.remove('active');
    openDirectBuyModal();
  });

  document.getElementById('btn-hero-buy-credits')?.addEventListener('click', () => {
    openDirectBuyModal();
  });

  document.getElementById('btn-history-buy-more')?.addEventListener('click', () => {
    openDirectBuyModal();
  });

  document.getElementById('menu-withdraw-funds')?.addEventListener('click', () => {
    dropdownMenu?.classList.remove('active');
    openWithdrawModal();
  });

  document.getElementById('btn-hub-open-withdraw')?.addEventListener('click', () => {
    openWithdrawModal();
  });

  document.getElementById('menu-edit-profile')?.addEventListener('click', () => {
    dropdownMenu?.classList.remove('active');
    openProfileModal();
  });

  document.getElementById('menu-logout')?.addEventListener('click', () => {
    dropdownMenu?.classList.remove('active');
    handleResellerLogout();
  });

  // Atualizar dados no topo
  document.getElementById('btn-hub-refresh-credits')?.addEventListener('click', () => {
    refreshHubDashboard();
  });

  // Toggle do Menu Lateral (Hambúrguer ☰) sem quebrar o layout
  function openMobileSidebar() {
    sidebar?.classList.add('mobile-open');
    const backdrop = document.getElementById('hub-sidebar-backdrop');
    if (backdrop) backdrop.classList.add('active');
  }

  function closeMobileSidebar() {
    sidebar?.classList.remove('mobile-open');
    const backdrop = document.getElementById('hub-sidebar-backdrop');
    if (backdrop) backdrop.classList.remove('active');
  }

  // Restaurar estado da sidebar no Desktop
  const savedCollapsed = localStorage.getItem('vion_hub_sidebar_collapsed') === 'true';
  const hubGrid = document.querySelector('.hub-body-grid');
  if (savedCollapsed && window.innerWidth > 860 && hubGrid) {
    hubGrid.classList.add('sidebar-collapsed');
  }

  btnHamburger?.addEventListener('click', () => {
    const isMobile = window.innerWidth <= 860;
    if (isMobile) {
      const isOpen = sidebar?.classList.contains('mobile-open');
      if (isOpen) closeMobileSidebar();
      else openMobileSidebar();
    } else {
      const grid = document.querySelector('.hub-body-grid');
      const isCollapsed = grid?.classList.toggle('sidebar-collapsed');
      try {
        localStorage.setItem('vion_hub_sidebar_collapsed', isCollapsed ? 'true' : 'false');
      } catch(e) {}
    }
  });

  document.getElementById('hub-sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);

  // Navegação entre sub-abas da Sidebar
  const navBtns = document.querySelectorAll('.hub-nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sub = btn.getAttribute('data-sub');
      if (sub) switchHubSubView(sub);
      if (window.innerWidth <= 860) closeMobileSidebar();
    });
  });

  // Sub-aba inicial: Painel
  switchHubSubView('dashboard');
}

function switchHubSubView(targetSub) {
  const navBtns = document.querySelectorAll('.hub-nav-btn');
  const subContents = document.querySelectorAll('.hub-sub-content');

  navBtns.forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-sub') === targetSub);
  });

  subContents.forEach(c => {
    c.classList.remove('active');
  });

  const activeContent = document.getElementById(`hub-sub-${targetSub}`);
  if (activeContent) activeContent.classList.add('active');

  // Renders específicos
  if (targetSub === 'devices') renderHubDevices();
  if (targetSub === 'credits-history') renderHubCreditHistory();
  if (targetSub === 'links') renderHubLinks();
  if (targetSub === 'withdrawals') renderHubWithdrawals();
  if (targetSub === 'subs') renderHubSubs();
  if (targetSub === 'partnerships') {
    if (!isCurrentUserMasterAdmin()) {
      alert('Acesso restrito: Apenas o Administrador Geral pode acessar Códigos de Parceria.');
      switchHubSubView('dashboard');
      return;
    }
    renderPortalPartnerships();
  }
}

function refreshHubDashboard() {
  const session = getResellerSession();
  const isMaster = isCurrentUserMasterAdmin();

  // Topbar Updates
  const nameEl = document.getElementById('hub-user-display-name');
  const creditsEl = document.getElementById('hub-credits-val');
  const flagEl = document.getElementById('hub-flag-badge');
  const masterBtn = document.getElementById('hub-nav-partners');

  if (nameEl) nameEl.textContent = session.firstName ? `${session.firstName} ${session.lastName || ''}`.trim() : (isMaster ? 'João Vitor' : 'Revendedor');
  if (creditsEl) creditsEl.textContent = session.credits || 0;
  if (flagEl) flagEl.textContent = session.country === 'Estados Unidos' ? '🇺🇸' : (session.country === 'Portugal' ? '🇵🇹' : '🇧🇷');
  if (masterBtn) masterBtn.style.display = isMaster ? 'flex' : 'none';

  // ATUALIZA OS 5 CARDS PRETOS (IMAGEM 4)
  const devices = session.activations || [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const monthsPt = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const curMonthName = monthsPt[now.getMonth()];

  // Card 1: Ativações
  const actTotal = devices.length;
  const actMonth = devices.filter(d => (d.createdAt || d.date ? new Date(d.createdAt || d.date).getMonth() === now.getMonth() : false)).length;
  const actToday = devices.filter(d => (d.createdAt || d.date ? new Date(d.createdAt || d.date).toISOString().startsWith(todayStr) : false)).length;

  setText('card-act-total', actTotal);
  setText('card-act-month-name', `${curMonthName} :`);
  setText('card-act-month', actMonth);
  setText('card-act-today', actToday);

  // Card 2: Crédito
  setText('card-cred-total', session.credits || 0);
  setText('card-cred-month-name', `${curMonthName} :`);
  setText('card-cred-month', session.creditHistory ? session.creditHistory.filter(h => h.amount > 0).reduce((acc, x) => acc + x.amount, 0) : 0);
  setText('card-cred-today', session.creditHistory ? session.creditHistory.filter(h => h.amount < 0 && new Date(h.date).toISOString().startsWith(todayStr)).length : 0);

  // Card 3: Sub-revendedor
  const subs = session.subs || [];
  setText('card-sub-total', subs.length);
  setText('card-sub-month-name', `${curMonthName} :`);
  setText('card-sub-month', subs.length > 0 ? 1 : 0);
  setText('card-sub-today', 0);

  // Card 4: Links
  const links = session.links || [];
  const linkClicks = links.reduce((a, b) => a + (b.clicks || 0), 0);
  const linkActs = links.reduce((a, b) => a + (b.activations || 0), 0);
  setText('card-links-total', links.length);
  setText('card-links-today', 0);
  setText('card-links-act-total', linkActs);
  setText('card-links-act-today', 0);

  // Card 5: Ganhos
  const earnings = session.earnings || 0;
  setText('card-earn-total', earnings.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  setText('card-earn-month-name', `${curMonthName} :`);
  setText('card-earn-month', (earnings * 0.4).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  setText('card-earn-today', '0,00');

  // Ganhos no saque
  setText('withdraw-available-val', earnings.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function handleResellerLogout() {
  localStorage.removeItem('vion_reseller_auth');
  showResellerView('login');
}

// ===================================================================
// 4.4 COMPRA DIRETA DE CRÉDITOS ("COMPRAR CRÉDITOS DIRETAMENTE LÁ")
// ===================================================================
let selectedCreditsPack = { amount: 25, price: 300 };

function initDirectBuyCredits() {
  const modal = document.getElementById('modal-buy-credits');
  const btnClose = document.getElementById('btn-close-buy-modal');

  btnClose?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
  });

  // Função global chamada nos cards de pacotes
  window.selectCreditPack = function(amount, price) {
    selectedCreditsPack = { amount, price };
    openCheckoutView(amount, price);
  };
}

function openDirectBuyModal() {
  const modal = document.getElementById('modal-buy-credits');
  if (modal) modal.style.display = 'flex';
}

let pixPollingTimer = null;

function clearPixPolling() {
  if (pixPollingTimer) {
    clearInterval(pixPollingTimer);
    pixPollingTimer = null;
  }
}

function closePixBuyModal() {
  clearPixPolling();
  const modal = document.getElementById('modal-buy-credits');
  if (modal) modal.style.display = 'none';
  initDirectBuyCreditsModalRestore();
}

async function openCheckoutView(amount, price) {
  const modal = document.getElementById('modal-buy-credits');
  if (!modal) return;
  clearPixPolling();

  const modalBox = modal.querySelector('.modal-box');
  modalBox.innerHTML = `
    <div class="modal-header">
      <h3>Pagamento Instantâneo via PIX</h3>
      <button type="button" class="btn-close-modal" onclick="closePixBuyModal()">&times;</button>
    </div>
    <div style="padding: 40px 20px; text-align: center;">
      <div class="pix-spinner"></div>
      <p style="margin-top: 18px; color: #cbd5e1; font-weight: 600; font-size: 15px;">
        Conectando ao Mercado Pago e gerando QR Code oficial...
      </p>
      <span style="font-size: 13px; color: var(--text-muted);">Aguarde alguns instantes</span>
    </div>
  `;

  const session = getResellerSession();
  let paymentData = null;

  try {
    const res = await fetch('/api/payment/create-pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'credits',
        email: session?.email || 'contato@vionplayer.app',
        amount: price,
        credits: amount,
        description: `Recarga de ${amount} Créditos - Vion Player`
      })
    });
    paymentData = await res.json();
  } catch(e) {
    paymentData = { success: false, error: 'Falha de comunicação com o servidor de pagamentos.' };
  }

  if (!paymentData || !paymentData.success) {
    modalBox.innerHTML = `
      <div class="modal-header">
        <h3>Erro ao Gerar Cobrança</h3>
        <button type="button" class="btn-close-modal" onclick="closePixBuyModal()">&times;</button>
      </div>
      <div style="padding: 30px 20px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
        <p style="color: #ef4444; font-weight: 600; font-size: 15px; margin-bottom: 16px;">
          ${paymentData?.error || 'Não foi possível gerar a chave PIX no momento.'}
        </p>
        <button type="button" class="btn btn-secondary" onclick="initDirectBuyCreditsModalRestore()">
          ← Voltar para Escolha de Pacotes
        </button>
      </div>
    `;
    return;
  }

  const qrCode = paymentData.qrCode || '';
  const qrCodeBase64 = paymentData.qrCodeBase64 || '';
  const paymentId = paymentData.paymentId;
  const isDemo = !!paymentData.isDemo;

  modalBox.innerHTML = `
    <div class="modal-header">
      <h3>Pagamento Instantâneo via PIX</h3>
      <button type="button" class="btn-close-modal" onclick="closePixBuyModal()">&times;</button>
    </div>

    <div style="padding: 10px 0; text-align: center;">
      ${paymentData.notConfigured ? `
        <div style="background: rgba(245, 158, 11, 0.12); border: 1px dashed rgba(245, 158, 11, 0.4); border-radius: 10px; padding: 12px; margin-bottom: 16px; font-size: 12.5px; color: #fbbf24; text-align: left;">
          ⚡ <strong>Modo Demonstração / Teste:</strong> Configure seu Access Token do Mercado Pago na aba Códigos de Parceria para receber pagamentos reais no seu banco.
        </div>
      ` : ''}

      <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 14px; margin-bottom: 16px;">
        <span style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Pacote Selecionado:</span>
        <div style="font-size: 20px; font-weight: 800; color: #f59e0b; margin: 2px 0;">
          ${amount} Créditos de Revenda
        </div>
        <div style="font-size: 18px; font-weight: 900; color: #ffffff;">
          Total: R$ ${Number(price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </div>
      </div>

      ${qrCodeBase64 ? `
        <div class="pix-qr-container">
          <img src="data:image/png;base64,${qrCodeBase64}" alt="QR Code PIX Mercado Pago" class="pix-qr-image">
        </div>
        <p style="font-size: 13px; color: #cbd5e1; margin-bottom: 10px;">
          Abra o app do seu banco e aponte a câmera para o QR Code acima.
        </p>
      ` : `
        <p style="font-size: 13px; color: #cbd5e1; margin-bottom: 10px;">
          Pague via <strong>PIX Copia e Cola</strong> no aplicativo do seu banco:
        </p>
      `}

      <div class="pix-key-display" id="pix-copy-text" style="font-size: 11px; max-height: 60px; overflow-y: auto; user-select: all;">${qrCode}</div>

      <button type="button" class="btn btn-outline" id="btn-copy-pix-code" style="margin-top: 10px; margin-bottom: 16px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
        <span>📋</span> Copiar Código PIX Copia e Cola
      </button>

      <!-- Status em Tempo Real (Verificação Automática) -->
      <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 10px; padding: 12px; display: flex; align-items: center; justify-content: center; gap: 10px;">
        <span class="pulse-indicator"></span>
        <span style="font-size: 13px; color: #86efac; font-weight: 600;" id="pix-live-status-text">
          Aguardando pagamento no banco... Liberação automática
        </span>
      </div>

      ${(isDemo || paymentData.notConfigured) ? `
        <button type="button" class="btn btn-gold" id="btn-simulate-pix-success" style="width: 100%; margin-top: 14px; font-size: 14px; padding: 12px;">
          ⚡ Simular Pagamento Aprovado Imediato (Teste)
        </button>
      ` : ''}

      <div style="border-top: 1px solid #334155; padding-top: 14px; margin-top: 16px;">
        <button type="button" class="btn btn-secondary" onclick="initDirectBuyCreditsModalRestore()" style="width: 100%;">
          ← Escolher Outro Pacote
        </button>
      </div>
    </div>
  `;

  // Botão Copiar
  document.getElementById('btn-copy-pix-code')?.addEventListener('click', () => {
    navigator.clipboard.writeText(qrCode);
    const btn = document.getElementById('btn-copy-pix-code');
    if (btn) btn.innerHTML = '<span>✅</span> Código PIX Copiado com Sucesso!';
    setTimeout(() => {
      if (btn) btn.innerHTML = '<span>📋</span> Copiar Código PIX Copia e Cola';
    }, 3000);
  });

  // Função disparada quando aprovado
  const handlePaymentApproved = () => {
    clearPixPolling();
    modalBox.innerHTML = `
      <div style="padding: 36px 20px; text-align: center;">
        <div style="font-size: 64px; margin-bottom: 12px;">🎉</div>
        <h3 style="color: #22c55e; font-size: 24px; font-weight: 800; margin-bottom: 8px;">
          Pagamento Aprovado com Sucesso!
        </h3>
        <p style="color: #cbd5e1; font-size: 15px; margin-bottom: 22px;">
          <strong style="color: #f59e0b;">+${amount} créditos</strong> foram adicionados ao seu saldo de revenda.
        </p>
        <button type="button" class="btn btn-gold" onclick="closePixBuyModal()" style="padding: 12px 32px; font-size: 15px;">
          Continuar no Painel
        </button>
      </div>
    `;

    // Atualiza a sessão e recarrega os dados do dashboard
    if (session) {
      session.credits = (session.credits || 0) + amount;
      if (!Array.isArray(session.creditHistory)) session.creditHistory = [];
      session.creditHistory.unshift({
        id: 'mp_' + Date.now(),
        type: 'purchase',
        amount: amount,
        desc: `Recarga de ${amount} créditos via PIX Mercado Pago`,
        date: Date.now()
      });
      saveResellerSession(session);
      refreshHubDashboard();
    }
  };

  // Botão de Simulação (se disponível)
  document.getElementById('btn-simulate-pix-success')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-simulate-pix-success');
    if (btn) btn.innerHTML = '⏳ Confirmando liberação...';
    try {
      await fetch('/api/payment/simulate-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId })
      });
    } catch(e) {}
    handlePaymentApproved();
  });

  // Polling automático no Mercado Pago a cada 2.5 segundos
  pixPollingTimer = setInterval(async () => {
    try {
      const checkRes = await fetch(`/api/payment/status?id=${encodeURIComponent(paymentId)}`);
      const checkData = await checkRes.json();
      if (checkData.success && checkData.status === 'approved') {
        handlePaymentApproved();
      }
    } catch(e) {}
  }, 2500);
}

function initDirectBuyCreditsModalRestore() {
  const modal = document.getElementById('modal-buy-credits');
  if (!modal) return;
  modal.querySelector('.modal-box').innerHTML = `
    <div class="modal-header">
      <h3>Comprar Créditos para Revenda</h3>
      <button type="button" class="btn-close-modal" onclick="document.getElementById('modal-buy-credits').style.display='none'">&times;</button>
    </div>

    <div style="padding: 10px 0;">
      <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
        Adquira pacotes de créditos com preço de atacado e libere licenças na hora:
      </p>

      <div class="buy-credits-grid">
        <div class="credit-pack-card" onclick="selectCreditPack(10, 150)">
          <div class="pack-badge">Iniciante</div>
          <h4>10 Créditos</h4>
          <div class="pack-price">R$ 150,00</div>
          <div class="pack-unit">R$ 15,00 / crédito</div>
          <button type="button" class="btn btn-outline pack-btn">Comprar</button>
        </div>

        <div class="credit-pack-card featured" onclick="selectCreditPack(25, 300)">
          <div class="pack-badge pack-badge-gold">Mais Vendido</div>
          <h4>25 Créditos</h4>
          <div class="pack-price">R$ 300,00</div>
          <div class="pack-unit">R$ 12,00 / crédito</div>
          <button type="button" class="btn btn-gold pack-btn">Comprar</button>
        </div>

        <div class="credit-pack-card" onclick="selectCreditPack(50, 500)">
          <div class="pack-badge">Atacado</div>
          <h4>50 Créditos</h4>
          <div class="pack-price">R$ 500,00</div>
          <div class="pack-unit">R$ 10,00 / crédito</div>
          <button type="button" class="btn btn-outline pack-btn">Comprar</button>
        </div>

        <div class="credit-pack-card" onclick="selectCreditPack(100, 800)">
          <div class="pack-badge">Master</div>
          <h4>100 Créditos</h4>
          <div class="pack-price">R$ 800,00</div>
          <div class="pack-unit">R$ 8,00 / crédito</div>
          <button type="button" class="btn btn-outline pack-btn">Comprar</button>
        </div>
      </div>
    </div>
  `;
}

// ===================================================================
// ATIVAÇÃO DIRETA DE DISPOSITIVO VIA PIX MERCADO PAGO (CLIENTE FINAL)
// ===================================================================
let devicePixPollingTimer = null;

function clearDevicePixPolling() {
  if (devicePixPollingTimer) {
    clearInterval(devicePixPollingTimer);
    devicePixPollingTimer = null;
  }
}

function closeDevicePayModal() {
  clearDevicePixPolling();
  const modal = document.getElementById('modal-pay-device');
  if (modal) modal.style.display = 'none';
}

window.openDevicePaymentModal = function(planType, price, planTitle) {
  clearDevicePixPolling();
  const modal = document.getElementById('modal-pay-device');
  if (!modal) return;
  modal.style.display = 'flex';

  const modalBox = modal.querySelector('.modal-box');
  const isLifetime = planType === 'vitalicio';

  // ETAPA 1: DIGITAÇÃO DO ENDEREÇO MAC
  modalBox.innerHTML = `
    <div class="modal-header">
      <h3>Ativação do Vion Player na TV</h3>
      <button type="button" class="btn-close-modal" onclick="closeDevicePayModal()">&times;</button>
    </div>

    <div style="padding: 10px 0;">
      <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 14px; margin-bottom: 18px; text-align: center;">
        <span style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Plano Selecionado:</span>
        <div style="font-size: 20px; font-weight: 800; color: #f59e0b; margin: 2px 0;">
          ${planTitle}
        </div>
        <div style="font-size: 18px; font-weight: 900; color: #ffffff;">
          R$ ${Number(price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ${isLifetime ? '(Pagamento Único)' : '(12 Meses)'}
        </div>
      </div>

      <div style="text-align: left;">
        <label style="font-size: 13px; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 6px;">
          Endereço MAC da TV ou Aparelho:
        </label>
        <input type="text" id="input-device-pay-mac" placeholder="Ex: 00:1A:79:B4:C2:5D" maxlength="17"
               style="width: 100%; font-family: monospace; font-size: 16px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 12px 14px; border-radius: 8px; border: 1.5px solid #475569; background: #0f172a; color: #fff; box-sizing: border-box;">
        <p style="font-size: 12px; color: #94a3b8; margin-top: 6px; line-height: 1.4;">
          💡 <strong>Onde encontrar?</strong> Abra o Vion Player na sua TV. O endereço MAC aparece na tela inicial.
        </p>

        <label style="font-size: 13px; font-weight: 700; color: #cbd5e1; display: block; margin-top: 14px; margin-bottom: 6px;">
          E-mail (opcional para recibo):
        </label>
        <input type="email" id="input-device-pay-email" placeholder="seuemail@exemplo.com"
               style="width: 100%; font-size: 14px; padding: 12px 14px; border-radius: 8px; border: 1.5px solid #475569; background: #0f172a; color: #fff; box-sizing: border-box;">

        <div style="border-top: 1px solid #334155; padding-top: 18px; margin-top: 20px; display: flex; flex-direction: column; gap: 10px;">
          <button type="button" class="btn btn-gold" id="btn-device-pay-proceed" style="width: 100%; font-size: 15px; padding: 14px;">
            ⚡ Gerar PIX para Ativação Instantânea (R$ ${price},00)
          </button>
          <button type="button" class="btn btn-secondary" onclick="closeDevicePayModal()" style="width: 100%;">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  `;

  // Auto-formatação de MAC Address (ex: 00:1A:79...)
  const macInput = document.getElementById('input-device-pay-mac');
  macInput?.focus();
  macInput?.addEventListener('input', (e) => {
    let val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    if (val.length > 12) val = val.substring(0, 12);
    const parts = val.match(/.{1,2}/g) || [];
    e.target.value = parts.join(':');
  });

  // Prosseguir para gerar o PIX
  document.getElementById('btn-device-pay-proceed')?.addEventListener('click', async () => {
    let mac = (macInput?.value || '').trim().toUpperCase();
    const email = (document.getElementById('input-device-pay-email')?.value || '').trim();

    // Validação básica do MAC
    const cleanMac = mac.replace(/[^0-9A-F]/g, '');
    if (cleanMac.length !== 12) {
      alert('Por favor, informe um endereço MAC válido contendo 12 dígitos (ex: 00:1A:79:B4:C2:5D).');
      macInput?.focus();
      return;
    }

    // ETAPA 2: GERANDO COBRANÇA
    modalBox.innerHTML = `
      <div class="modal-header">
        <h3>Ativação do Vion Player</h3>
        <button type="button" class="btn-close-modal" onclick="closeDevicePayModal()">&times;</button>
      </div>
      <div style="padding: 40px 20px; text-align: center;">
        <div class="pix-spinner"></div>
        <p style="margin-top: 18px; color: #cbd5e1; font-weight: 600; font-size: 15px;">
          Gerando QR Code PIX oficial para o MAC ${mac}...
        </p>
        <span style="font-size: 13px; color: var(--text-muted);">Aguarde alguns instantes</span>
      </div>
    `;

    let payData = null;
    try {
      const res = await fetch('/api/payment/create-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'activation',
          plan: planType,
          mac: mac,
          amount: price,
          email: email || 'cliente@vionplayer.app',
          description: `Ativação ${planTitle} - MAC ${mac}`
        })
      });
      payData = await res.json();
    } catch(err) {
      payData = { success: false, error: 'Falha de comunicação com o servidor de pagamentos.' };
    }

    if (!payData || !payData.success) {
      modalBox.innerHTML = `
        <div class="modal-header">
          <h3>Erro ao Gerar Cobrança</h3>
          <button type="button" class="btn-close-modal" onclick="closeDevicePayModal()">&times;</button>
        </div>
        <div style="padding: 30px 20px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
          <p style="color: #ef4444; font-weight: 600; font-size: 15px; margin-bottom: 16px;">
            ${payData?.error || 'Não foi possível gerar a chave PIX no momento.'}
          </p>
          <button type="button" class="btn btn-secondary" onclick="openDevicePaymentModal('${planType}', ${price}, '${planTitle}')">
            ← Tentar Novamente
          </button>
        </div>
      `;
      return;
    }

    // ETAPA 3: TELA DE PAGAMENTO PIX PARA O MAC
    const qrCode = payData.qrCode || '';
    const qrCodeBase64 = payData.qrCodeBase64 || '';
    const paymentId = payData.paymentId;
    const isDemo = !!payData.isDemo;

    modalBox.innerHTML = `
      <div class="modal-header">
        <h3>Pagamento PIX - Ativação de TV</h3>
        <button type="button" class="btn-close-modal" onclick="closeDevicePayModal()">&times;</button>
      </div>

      <div style="padding: 10px 0; text-align: center;">
        <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 12px; margin-bottom: 16px;">
          <div style="font-size: 13px; color: #94a3b8;">Aparelho a ser Ativado:</div>
          <div style="font-family: monospace; font-size: 18px; font-weight: 800; color: #f59e0b; letter-spacing: 1px; margin: 2px 0;">
            ${mac}
          </div>
          <div style="font-size: 14px; font-weight: 700; color: #ffffff;">
            ${planTitle} • R$ ${Number(price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        ${qrCodeBase64 ? `
          <div class="pix-qr-container">
            <img src="data:image/png;base64,${qrCodeBase64}" alt="QR Code PIX Mercado Pago" class="pix-qr-image">
          </div>
          <p style="font-size: 13px; color: #cbd5e1; margin-bottom: 10px;">
            Abra o app do seu banco e aponte a câmera para o QR Code acima.
          </p>
        ` : `
          <p style="font-size: 13px; color: #cbd5e1; margin-bottom: 10px;">
            Pague via <strong>PIX Copia e Cola</strong> no aplicativo do seu banco:
          </p>
        `}

        <div class="pix-key-display" id="device-pix-copy-text" style="font-size: 11px; max-height: 60px; overflow-y: auto; user-select: all;">${qrCode}</div>

        <button type="button" class="btn btn-outline" id="btn-copy-device-pix-code" style="margin-top: 10px; margin-bottom: 16px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span>📋</span> Copiar Código PIX Copia e Cola
        </button>

        <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 10px; padding: 12px; display: flex; align-items: center; justify-content: center; gap: 10px;">
          <span class="pulse-indicator"></span>
          <span style="font-size: 13px; color: #86efac; font-weight: 600;">
            Aguardando pagamento no banco... Liberação automática do MAC
          </span>
        </div>

        ${(isDemo || payData.notConfigured) ? `
          <button type="button" class="btn btn-gold" id="btn-simulate-device-pix-success" style="width: 100%; margin-top: 14px; font-size: 14px; padding: 12px;">
            ⚡ Simular Pagamento Aprovado Imediato (Teste)
          </button>
        ` : ''}

        <div style="border-top: 1px solid #334155; padding-top: 14px; margin-top: 16px;">
          <button type="button" class="btn btn-secondary" onclick="closeDevicePayModal()" style="width: 100%;">
            Cancelar
          </button>
        </div>
      </div>
    `;

    // Botão Copiar
    document.getElementById('btn-copy-device-pix-code')?.addEventListener('click', () => {
      navigator.clipboard.writeText(qrCode);
      const btn = document.getElementById('btn-copy-device-pix-code');
      if (btn) btn.innerHTML = '<span>✅</span> Código PIX Copiado com Sucesso!';
      setTimeout(() => {
        if (btn) btn.innerHTML = '<span>📋</span> Copiar Código PIX Copia e Cola';
      }, 3000);
    });

    // Função de Ativação Concluída
    const handleDevicePaymentApproved = () => {
      clearDevicePixPolling();
      modalBox.innerHTML = `
        <div style="padding: 36px 20px; text-align: center;">
          <div style="font-size: 64px; margin-bottom: 12px;">🎉</div>
          <h3 style="color: #22c55e; font-size: 24px; font-weight: 800; margin-bottom: 8px;">
            Aparelho Ativado com Sucesso!
          </h3>
          <p style="color: #cbd5e1; font-size: 15px; margin-bottom: 8px;">
            O dispositivo com MAC <strong style="color: #f59e0b; font-family: monospace;">${mac}</strong> foi ativado com a <strong>${planTitle}</strong>!
          </p>
          <p style="color: #94a3b8; font-size: 13.5px; margin-bottom: 24px;">
            Basta abrir ou reiniciar o Vion Player na sua TV para começar a assistir.
          </p>
          <button type="button" class="btn btn-gold" onclick="closeDevicePayModal()" style="padding: 12px 36px; font-size: 15px;">
            Concluir
          </button>
        </div>
      `;
    };

    // Botão Simular (se disponível)
    document.getElementById('btn-simulate-device-pix-success')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-simulate-device-pix-success');
      if (btn) btn.innerHTML = '⏳ Confirmando liberação...';
      try {
        await fetch('/api/payment/simulate-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId })
        });
      } catch(e) {}
      handleDevicePaymentApproved();
    });

    // Polling de verificação ao vivo no Mercado Pago
    devicePixPollingTimer = setInterval(async () => {
      try {
        const checkRes = await fetch(`/api/payment/status?id=${encodeURIComponent(paymentId)}`);
        const checkData = await checkRes.json();
        if (checkData.success && checkData.status === 'approved') {
          handleDevicePaymentApproved();
        }
      } catch(e) {}
    }, 2500);
  });
};

// ===================================================================
// 4.5 SUB-ABAS DO PAINEL (DISPOSITIVOS, CRÉDITOS, LINKS, RETIRADAS, SUBS)
// ===================================================================

function renderHubDevices(query = '') {
  const tbody = document.getElementById('hub-devices-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const session = getResellerSession();
  const devices = session.activations || [];
  const q = (query || '').toUpperCase();

  const filtered = devices.filter(d => !q || (d.mac || '').toUpperCase().includes(q) || (d.comment || '').toUpperCase().includes(q));

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 24px;">Nenhum dispositivo cadastrado. Clique em "+ Ativar Dispositivo" para começar.</td></tr>`;
    return;
  }

  filtered.forEach((d, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700; color: #64748b;">#${idx + 1}</td>
      <td style="font-family: monospace; font-weight: 700; color: #0284c7;">${escapeHtml(d.mac)}</td>
      <td>${escapeHtml(d.comment || 'Cliente')}</td>
      <td><span style="font-size: 12px; background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 4px; font-weight: 700;">${d.plan === 'lifetime' ? '⭐ Vitalício' : '📅 1 Ano'}</span></td>
      <td><span style="font-size: 12px; background: #dcfce7; color: #15803d; padding: 4px 8px; border-radius: 4px; font-weight: 700;">● Ativo</span></td>
      <td style="text-align: right;">
        <button type="button" class="btn-del-device" style="background: transparent; border: none; color: #ef4444; font-size: 16px; cursor: pointer;">✕</button>
      </td>
    `;
    tr.querySelector('.btn-del-device')?.addEventListener('click', () => {
      if (confirm(`Remover dispositivo MAC ${d.mac}?`)) {
        session.activations = session.activations.filter(x => x.mac !== d.mac);
        saveResellerSession(session);
        renderHubDevices();
        refreshHubDashboard();
      }
    });
    tbody.appendChild(tr);
  });
}

function renderHubCreditHistory() {
  const tbody = document.getElementById('hub-credits-history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const session = getResellerSession();
  const history = session.creditHistory || [];

  if (history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 24px;">Nenhum histórico registrado.</td></tr>`;
    return;
  }

  history.forEach(h => {
    const tr = document.createElement('tr');
    const isAdd = h.amount > 0;
    const dateFormatted = new Date(h.date || Date.now()).toLocaleString('pt-BR');
    tr.innerHTML = `
      <td style="color: #64748b; font-size: 13px;">${dateFormatted}</td>
      <td><strong>${h.type === 'purchase' ? '🛒 Compra' : (h.type === 'bonus' ? '🎁 Bônus' : '⚡ Ativação')}</strong></td>
      <td>${escapeHtml(h.desc || '-')}</td>
      <td style="font-weight: 800; color: ${isAdd ? '#16a34a' : '#dc2626'};">${isAdd ? '+' : ''}${h.amount}</td>
      <td><span style="font-size: 12px; background: #f0fdf4; color: #166534; padding: 3px 8px; border-radius: 4px; font-weight: 700;">Concluído</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderHubLinks() {
  const tbody = document.getElementById('hub-links-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const session = getResellerSession();
  const links = session.links || [];

  links.forEach(l => {
    const liveUrl = `${window.location.origin}/portal/#reseller?ref=${encodeURIComponent(l.code || 'VION')}`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(l.name)}</strong></td>
      <td><code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${escapeHtml(l.code)}</code></td>
      <td style="color: #0284c7; font-size: 13px;">${escapeHtml(liveUrl)}</td>
      <td><strong>${l.clicks || 0}</strong></td>
      <td><strong>${l.activations || 0}</strong></td>
      <td style="text-align: right;">
        <button type="button" class="btn btn-outline" style="padding: 4px 10px; font-size: 12px;" onclick="navigator.clipboard.writeText('${liveUrl}'); alert('Link copiado!');">
          📋 Copiar
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderHubWithdrawals() {
  const tbody = document.getElementById('hub-withdrawals-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const session = getResellerSession();
  const withs = session.withdrawals || [];

  if (withs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 24px;">Nenhuma retirada solicitada ainda.</td></tr>`;
    return;
  }

  withs.forEach(w => {
    const tr = document.createElement('tr');
    const dateFormatted = new Date(w.date || Date.now()).toLocaleString('pt-BR');
    tr.innerHTML = `
      <td>${dateFormatted}</td>
      <td style="font-weight: 800; color: #16a34a;">R$ ${(w.amount || 0).toFixed(2)}</td>
      <td style="font-family: monospace;">${escapeHtml(w.pixKey)}</td>
      <td>${escapeHtml(w.pixType || 'PIX')}</td>
      <td><span style="font-size: 12px; background: #fef3c7; color: #b45309; padding: 3px 8px; border-radius: 4px; font-weight: 700;">${escapeHtml(w.status || 'Pendente')}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderHubSubs() {
  const tbody = document.getElementById('hub-subs-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const session = getResellerSession();
  const subs = session.subs || [];

  if (subs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 24px;">Nenhum sub-revendedor cadastrado.</td></tr>`;
    return;
  }

  subs.forEach(s => {
    const tr = document.createElement('tr');
    const dateFormatted = new Date(s.date || s.createdAt || Date.now()).toLocaleDateString('pt-BR');
    tr.innerHTML = `
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td>${escapeHtml(s.email)}</td>
      <td>${escapeHtml(s.phone || '-')}</td>
      <td><span style="background: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-weight: 800;">${s.credits || 0}</span></td>
      <td>${dateFormatted}</td>
      <td style="text-align: right;">
        <button type="button" class="btn btn-outline" style="padding: 4px 8px; font-size: 12px;">Editar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ===================================================================
// 4.6 MODAIS DE ATIVAÇÃO, SAQUE, PERFIL E SUB-REVENDA
// ===================================================================

function initActivateDeviceModal() {
  const modal = document.getElementById('modal-activate-device');
  const btnOpen = document.getElementById('btn-hub-open-activate');
  const btnClose = document.getElementById('btn-close-activate-modal');
  const btnCancel = document.getElementById('btn-cancel-activate-modal');
  const form = document.getElementById('modal-activate-device-form') || document.getElementById('modal-activate-form');
  const alertBox = document.getElementById('activate-alert-box');

  btnOpen?.addEventListener('click', () => {
    if (modal) modal.style.display = 'flex';
  });

  btnClose?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
  });

  btnCancel?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mac = document.getElementById('input-activate-mac')?.value.trim().toUpperCase();
    const comment = document.getElementById('input-activate-comment')?.value.trim();
    const plan = document.getElementById('select-activate-plan')?.value || '1year';

    const session = getResellerSession();
    const cost = plan === 'lifetime' ? 2 : 1;

    if ((session.credits || 0) < cost) {
      showAlert(alertBox, `Saldo insuficiente! Você precisa de ${cost} crédito(s).`, 'error');
      return;
    }

    showAlert(alertBox, '🔄 Ativando dispositivo...', 'info');

    try {
      await fetch('/api/reseller/activate-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: session.email, mac, comment, plan })
      });
    } catch(err) {}

    session.credits -= cost;
    if (!Array.isArray(session.activations)) session.activations = [];
    session.activations.unshift({
      id: 'act_' + Date.now(),
      mac, comment, plan, cost,
      date: Date.now(),
      status: 'Ativo'
    });

    if (!Array.isArray(session.creditHistory)) session.creditHistory = [];
    session.creditHistory.unshift({
      id: 'use_' + Date.now(),
      type: 'activation',
      amount: -cost,
      desc: `Ativação do dispositivo MAC ${mac}`,
      date: Date.now()
    });

    saveResellerSession(session);
    refreshHubDashboard();
    renderHubDevices();

    showAlert(alertBox, `✔ Dispositivo MAC ${mac} ativado com sucesso!`, 'success');
    setTimeout(() => {
      if (modal) modal.style.display = 'none';
      if (alertBox) alertBox.style.display = 'none';
    }, 900);
  });
}

function openWithdrawModal() {
  const modal = document.getElementById('modal-withdraw-funds');
  if (modal) modal.style.display = 'flex';
}

function initWithdrawalModal() {
  const modal = document.getElementById('modal-withdraw-funds');
  const btnClose = document.getElementById('btn-close-withdraw-modal');
  const btnCancel = document.getElementById('btn-cancel-withdraw');
  const form = document.getElementById('form-withdraw-funds');
  const alertBox = document.getElementById('withdraw-alert-box');

  [btnClose, btnCancel].forEach(b => b?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
  }));

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('input-withdraw-amount')?.value);
    const pixType = document.getElementById('select-withdraw-pix-type')?.value;
    const pixKey = document.getElementById('input-withdraw-pix-key')?.value.trim();

    const session = getResellerSession();
    if (!amount || amount <= 0 || amount > (session.earnings || 0)) {
      showAlert(alertBox, 'Valor de saque inválido ou saldo insuficiente.', 'error');
      return;
    }

    showAlert(alertBox, '🔄 Processando solicitação de retirada...', 'info');

    try {
      await fetch('/api/reseller/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: session.email, amount, pixType, pixKey })
      });
    } catch(err) {}

    session.earnings -= amount;
    if (!Array.isArray(session.withdrawals)) session.withdrawals = [];
    session.withdrawals.unshift({
      id: 'w_' + Date.now(),
      amount, pixType, pixKey,
      status: 'Pendente',
      date: Date.now()
    });

    saveResellerSession(session);
    refreshHubDashboard();

    showAlert(alertBox, `✔ Solicitação de retirada de R$ ${amount.toFixed(2)} enviada!`, 'success');
    setTimeout(() => {
      if (modal) modal.style.display = 'none';
      if (alertBox) alertBox.style.display = 'none';
    }, 1000);
  });
}

function openProfileModal() {
  const modal = document.getElementById('modal-edit-profile');
  const session = getResellerSession();
  if (!modal) return;

  const fn = document.getElementById('profile-first-name');
  const ln = document.getElementById('profile-last-name');
  const comp = document.getElementById('profile-company');
  const ph = document.getElementById('profile-phone');
  const co = document.getElementById('profile-country');

  if (fn) fn.value = session.firstName || '';
  if (ln) ln.value = session.lastName || '';
  if (comp) comp.value = session.company || '';
  if (ph) ph.value = session.phone || '';
  if (co) co.value = session.country || 'Brasil';

  modal.style.display = 'flex';
}

function initProfileModal() {
  const modal = document.getElementById('modal-edit-profile');
  const btnClose = document.getElementById('btn-close-profile-modal');
  const btnCancel = document.getElementById('btn-cancel-profile');
  const form = document.getElementById('form-edit-profile');
  const alertBox = document.getElementById('profile-alert-box');

  [btnClose, btnCancel].forEach(b => b?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
  }));

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const session = getResellerSession();
    session.firstName = document.getElementById('profile-first-name')?.value.trim();
    session.lastName = document.getElementById('profile-last-name')?.value.trim();
    session.company = document.getElementById('profile-company')?.value.trim();
    session.phone = document.getElementById('profile-phone')?.value.trim();
    session.country = document.getElementById('profile-country')?.value.trim();

    saveResellerSession(session);
    refreshHubDashboard();

    showAlert(alertBox, '✔ Perfil atualizado com sucesso!', 'success');
    setTimeout(() => {
      if (modal) modal.style.display = 'none';
      if (alertBox) alertBox.style.display = 'none';
    }, 800);
  });
}

function initAddSubModal() {
  const modal = document.getElementById('modal-add-sub');
  const btnOpen = document.getElementById('btn-hub-open-add-sub');
  const btnClose = document.getElementById('btn-close-sub-modal');
  const btnCancel = document.getElementById('btn-cancel-sub-modal');
  const form = document.getElementById('modal-add-sub-form');
  const alertBox = document.getElementById('sub-alert-box');

  btnOpen?.addEventListener('click', () => {
    if (modal) modal.style.display = 'flex';
  });

  [btnClose, btnCancel].forEach(b => b?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
  }));

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('input-sub-name')?.value.trim();
    const email = document.getElementById('input-sub-email')?.value.trim();
    const phone = document.getElementById('input-sub-phone')?.value.trim();
    const credits = parseInt(document.getElementById('input-sub-credits')?.value || '5', 10);

    const session = getResellerSession();
    if ((session.credits || 0) < credits) {
      showAlert(alertBox, 'Você não possui créditos suficientes para transferir.', 'error');
      return;
    }

    session.credits -= credits;
    if (!Array.isArray(session.subs)) session.subs = [];
    session.subs.unshift({
      id: 'sub_' + Date.now(),
      name, email, phone, credits,
      date: Date.now()
    });

    saveResellerSession(session);
    refreshHubDashboard();
    renderHubSubs();

    showAlert(alertBox, `✔ Sub-revenda criada e ${credits} crédito(s) transferidos!`, 'success');
    setTimeout(() => {
      if (modal) modal.style.display = 'none';
      if (alertBox) alertBox.style.display = 'none';
    }, 900);
  });
}

async function renderPortalPartnerships(filterText = '') {
  const tbody = document.getElementById('partnerships-table-body');
  if (!tbody) return;

  const allPartners = await fetchPartnershipCodes();
  const query = (filterText || '').toLowerCase().trim();

  const filtered = query ? allPartners.filter(p =>
    (p.code || '').toLowerCase().includes(query) ||
    (p.name || '').toLowerCase().includes(query) ||
    (p.server || '').toLowerCase().includes(query)
  ) : allPartners;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="reseller-empty-cell" style="text-align: center; padding: 36px; color: var(--text-muted);">
          Nenhum código de parceria encontrado. Cadastre um novo código acima.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach(p => {
    const tr = document.createElement('tr');
    tr.style.opacity = p.active ? '1' : '0.65';

    tr.innerHTML = `
      <td>
        <span style="font-family: monospace; font-weight: 800; font-size: 14px; background: rgba(255,255,255,0.08); padding: 5px 12px; border-radius: 6px; color: #fff; letter-spacing: 1px; border: 1px solid rgba(255,255,255,0.15);">
          ${escapeHtml(p.code)}
        </span>
      </td>
      <td>
        <span style="font-family: monospace; color: var(--primary-gold); font-size: 13px;">
          ${escapeHtml(p.server)}
        </span>
      </td>
      <td>
        <span style="color: #fff; font-weight: 600;">
          ${escapeHtml(p.name || p.code)}
        </span>
      </td>
      <td>
        <span style="font-size: 11px; padding: 4px 10px; border-radius: 4px; font-weight: 800; display: inline-block; ${p.active ? 'background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3);' : 'background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);'}">
          ${p.active ? '● ATIVO' : '○ DESATIVADO'}
        </span>
      </td>
      <td style="text-align: right;">
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button type="button" class="btn-partner-toggle-state" style="padding: 6px 14px; font-size: 12px; font-weight: 700; border-radius: 6px; cursor: pointer; border: 1px solid rgba(255,255,255,0.15); ${p.active ? 'background: rgba(255,255,255,0.08); color: #fff;' : 'background: rgba(34,197,94,0.2); color: #4ade80; border-color: rgba(34,197,94,0.4);'}">
            ${p.active ? 'Desativar' : 'Ativar'}
          </button>
          <button type="button" class="btn-partner-delete-state" style="padding: 6px 14px; font-size: 12px; font-weight: 700; border-radius: 6px; cursor: pointer; background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);">
            Excluir
          </button>
        </div>
      </td>
    `;

    // Evento de Alternar Ativo/Desativado
    const btnToggle = tr.querySelector('.btn-partner-toggle-state');
    btnToggle?.addEventListener('click', async () => {
      try {
        await fetch('/api/partnerships', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-email': localStorage.getItem('vion_reseller_user') || ''
          },
          body: JSON.stringify({ action: 'toggle', id: p.id || p.code })
        });
      } catch(e) {}

      p.active = !p.active;
      const local = JSON.parse(localStorage.getItem('vion_partnership_codes') || '[]');
      const item = local.find(x => x.id === p.id || x.code === p.code);
      if (item) item.active = p.active;
      localStorage.setItem('vion_partnership_codes', JSON.stringify(local));

      renderPortalPartnerships(filterText);
    });

    // Evento de Exclusão
    const btnDelete = tr.querySelector('.btn-partner-delete-state');
    btnDelete?.addEventListener('click', async () => {
      if (!confirm(`Tem certeza que deseja excluir o código de parceria "${p.code}"? Clientes não conseguirão mais usá-lo na TV.`)) {
        return;
      }

      try {
        await fetch('/api/partnerships', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-email': localStorage.getItem('vion_reseller_user') || ''
          },
          body: JSON.stringify({ action: 'delete', id: p.id || p.code })
        });
      } catch(e) {}

      let local = JSON.parse(localStorage.getItem('vion_partnership_codes') || '[]');
      local = local.filter(x => x.id !== p.id && x.code !== p.code);
      localStorage.setItem('vion_partnership_codes', JSON.stringify(local));

      renderPortalPartnerships(filterText);
    });

    tbody.appendChild(tr);
  });
}

function initPartnershipsSection() {
  // Formulário de Cadastro de Código
  document.getElementById('portal-form-create-partner')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const codeInput = document.getElementById('portal-partner-code');
    const serverInput = document.getElementById('portal-partner-server');
    const nameInput = document.getElementById('portal-partner-name');

    const rawCode = (codeInput?.value || '').trim().toUpperCase().replace(/\s+/g, '');
    let server = (serverInput?.value || '').trim().replace(/\/+$/, '');
    const name = (nameInput?.value || '').trim() || rawCode;

    if (!rawCode || !server) {
      alert('Informe o código e o servidor / DNS.');
      return;
    }

    if (!server.startsWith('http://') && !server.startsWith('https://') && server.toLowerCase() !== 'demo') {
      server = 'http://' + server;
    }

    try {
      const res = await fetch('/api/partnerships', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': localStorage.getItem('vion_reseller_user') || ''
        },
        body: JSON.stringify({ action: 'create', code: rawCode, server, name })
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Erro ao cadastrar código de parceria.');
        return;
      }
    } catch(e) {}

    // Fallback/sync localStorage
    const local = JSON.parse(localStorage.getItem('vion_partnership_codes') || '[]');
    if (!local.find(x => x.code === rawCode)) {
      local.unshift({
        id: 'code_' + Date.now(),
        code: rawCode,
        server,
        name,
        active: true,
        createdAt: Date.now()
      });
      localStorage.setItem('vion_partnership_codes', JSON.stringify(local));
    }

    if (codeInput) codeInput.value = '';
    if (serverInput) serverInput.value = '';
    if (nameInput) nameInput.value = '';

    renderPortalPartnerships();
    alert(`✔ Código de parceria "${rawCode}" cadastrado com sucesso!`);
  });

  // Busca de Parcerias
  const inputSearch = document.getElementById('input-search-partners');
  const btnSearch = document.getElementById('btn-search-partners');
  btnSearch?.addEventListener('click', () => {
    renderPortalPartnerships(inputSearch ? inputSearch.value.trim() : '');
  });
  inputSearch?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') renderPortalPartnerships(e.target.value.trim());
  });

  // Recarregar
  document.getElementById('btn-reload-partners')?.addEventListener('click', () => {
    renderPortalPartnerships();
  });

  // Inicializa card de configurações do Mercado Pago
  initMpAdminSettings();
}

function initMpAdminSettings() {
  const form = document.getElementById('portal-form-mp-settings');
  const badge = document.getElementById('mp-admin-status-badge');
  const input = document.getElementById('portal-mp-access-token');

  async function loadMpStatus() {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.configured) {
        if (badge) {
          badge.style.background = '#dcfce7';
          badge.style.color = '#15803d';
          badge.innerHTML = `🟢 Conectado (${data.maskedToken})`;
        }
        if (input && !input.value) {
          input.placeholder = `Ativo: ${data.maskedToken}`;
        }
      } else {
        if (badge) {
          badge.style.background = '#fee2e2';
          badge.style.color = '#dc2626';
          badge.innerHTML = '🔴 Não Configurado';
        }
      }
    } catch(e) {}
  }

  loadMpStatus();

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = input?.value.trim();
    if (!token) return alert('Por favor, digite o Access Token do Mercado Pago.');

    const btn = document.getElementById('btn-save-mp-settings');
    if (btn) btn.innerHTML = '⏳ Salvando...';

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': 'joaovitordc1010@gmail.com'
        },
        body: JSON.stringify({
          adminEmail: 'joaovitordc1010@gmail.com',
          mpAccessToken: token
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 Credencial do Mercado Pago salva com sucesso! O PIX automático agora está ativo em produção.');
        input.value = '';
        loadMpStatus();
      } else {
        alert('Erro ao salvar: ' + (data.error || 'Tente novamente.'));
      }
    } catch(err) {
      alert('Erro de conexão ao salvar.');
    } finally {
      if (btn) btn.innerHTML = '<span>💾</span> Salvar Credencial';
    }
  });
}


