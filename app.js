/* =========================================================
   Caixa dos Marceneiros — interface
   Os dados vêm do Store (store.js). Aqui ficam só telas e ações.
   Administrador: faz tudo. Marceneiro: só visualiza e pede retirada.
   ========================================================= */

import * as Store from './store.js';

const LEMBRAR_KEY = 'caixa_ultimo_email';
const SITE_URL = location.origin + location.pathname;

const PERIODOS = [
  ['mes', 'Este mês'],
  ['30d', '30 dias'],
  ['futuros', 'Agendados'],
  ['tudo', 'Tudo'],
  ['custom', 'Escolher datas'],
];

const STATUS_PEDIDO = {
  pendente: ['Aguardando', 'tag'],
  aprovado: ['Aprovado', 'tag tag-green'],
  recusado: ['Recusado', 'tag tag-red'],
};

const ERROS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/missing-email': 'Digite o e-mail.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'auth/email-already-in-use': 'Esse e-mail já tem cadastro no sistema.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
  'permission-denied': 'Você não tem permissão para isso.',
  'unavailable': 'Sem conexão com a internet.',
};

// ================= UTILITÁRIOS =================

const $ = sel => document.querySelector(sel);

const pad = n => String(n).padStart(2, '0');
const toIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => toIso(new Date());
const fromIso = iso => new Date(iso + 'T12:00:00'); // meio-dia evita erro de fuso

function addDays(iso, n) {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

function endOfMonth(iso) {
  const d = fromIso(iso);
  return toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatDayHeader(iso) {
  const hoje = today();
  if (iso === hoje) return 'Hoje';
  if (iso === addDays(hoje, -1)) return 'Ontem';
  if (iso === addDays(hoje, 1)) return 'Amanhã';
  const options = { weekday: 'short', day: '2-digit', month: 'short' };
  if (iso.slice(0, 4) !== hoje.slice(0, 4)) options.year = 'numeric';
  return fromIso(iso).toLocaleDateString('pt-BR', options);
}

// Data/hora de um registro do Firestore (fica vazio por um instante enquanto salva)
const momento = timestamp => timestamp?.toDate?.() ?? new Date();
const formatMomento = timestamp =>
  momento(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const formatMoney = v => (Math.round(v * 100) / 100 || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Campo de valor estilo banco: digita "1500" e aparece "15,00"
function maskMoneyInput(value) {
  const cents = Number(value.replace(/\D/g, '').slice(0, 11));
  return cents ? (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}
const parseMoney = value => Number(String(value).replace(/\D/g, '')) / 100;

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, c => map[c]);
}

const initials = nome => nome.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const firstName = nome => nome.trim().split(/\s+/)[0];

const mensagemErro = err => ERROS[err?.code] || (err?.code ? 'Algo deu errado. Tente de novo.' : err?.message);

// Lembra o e-mail de quem usou o aparelho por último (nunca a senha)
function lerEmailLembrado() {
  try { return localStorage.getItem(LEMBRAR_KEY) || ''; } catch { return ''; }
}
function lembrarEmail(email) {
  try { localStorage.setItem(LEMBRAR_KEY, email); } catch { /* modo anônimo: segue sem lembrar */ }
}

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function fail(message) {
  toast(message, 'error');
  return false;
}

// O aviso por e-mail não pode travar o que já foi salvo
async function avisar(dados) {
  try {
    await Store.notificar(dados);
  } catch (err) {
    console.error(err);
    toast('Salvo, mas o e-mail de aviso não foi enviado.', 'error');
  }
}

// ================= ÍCONES =================

const ICONS = {
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
};

const icon = name =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// ================= ESTADO =================

const state = {
  screen: 'carregando', // carregando | config | login | admin | conta
  user: null,           // { role: 'admin' | 'marceneiro', uid, email }
  marceneiros: [],
  lancamentos: [],
  pedidos: [],
  carregados: new Set(), // nomes das coleções que já chegaram do banco
  contaId: null,
  periodo: 'mes',
  inicio: '',
  fim: '',
  saldoOculto: false,
};

const COLECOES = ['marceneiros', 'lancamentos', 'pedidos'];

const isAdmin = () => state.user?.role === 'admin';
const carregado = () => state.carregados.size === COLECOES.length;
const contaAtual = () => state.marceneiros.find(m => m.id === state.contaId);
const marceneiroDe = marcId => state.marceneiros.find(m => m.id === marcId);
const lancamentosDe = marcId => state.lancamentos.filter(l => l.marcId === marcId);
const pedidosPendentes = () => state.pedidos.filter(p => p.status === 'pendente');

// ================= CÁLCULOS =================

const sinal = l => (l.tipo === 'credito' ? 1 : -1);
const porData = (a, b) => a.data.localeCompare(b.data);
const CENTAVO = 0.005; // folga para arredondamento de centavos

function saldoAte(lancamentos, data) {
  return lancamentos.filter(l => l.data <= data).reduce((s, l) => s + sinal(l) * l.valor, 0);
}

// Quanto dá para retirar numa data sem o saldo ficar negativo,
// nem naquele dia nem depois (conta as parcelas já agendadas)
function limiteRetirada(lancamentos, data) {
  let saldo = saldoAte(lancamentos, data);
  let menor = saldo;
  lancamentos.filter(l => l.data > data).sort(porData).forEach(l => {
    saldo += sinal(l) * l.valor;
    menor = Math.min(menor, saldo);
  });
  return Math.max(0, Math.round(menor * 100) / 100);
}

// Verifica se, somando os novos lançamentos, o saldo fica negativo em algum dia
function ficariaNegativo(lancamentos, novos) {
  const desde = novos.map(l => l.data).sort()[0];
  return [...saldosDiarios([...lancamentos, ...novos])]
    .some(([dia, saldo]) => dia >= desde && saldo < -CENTAVO);
}

// O marceneiro só pode pedir o que sobra depois dos pedidos que ainda aguardam resposta
function disponivelParaPedido(marcId) {
  const aguardando = state.pedidos
    .filter(p => p.marcId === marcId && p.status === 'pendente')
    .reduce((s, p) => s + p.valor, 0);
  return Math.max(0, limiteRetirada(lancamentosDe(marcId), today()) - aguardando);
}

// Saldo disponível = só o que já aconteceu. Parcelas futuras ficam "agendadas".
function resumoConta(lancamentos) {
  const hoje = today();
  let saldo = 0;
  let futuro = 0;
  for (const l of lancamentos) {
    if (l.data <= hoje) saldo += sinal(l) * l.valor;
    else futuro += sinal(l) * l.valor;
  }
  return { saldo, futuro };
}

// Saldo no fim de cada dia, para mostrar no extrato
function saldosDiarios(lancamentos) {
  const porDia = new Map();
  let saldo = 0;
  [...lancamentos]
    .sort((a, b) => a.data.localeCompare(b.data))
    .forEach(l => {
      saldo += sinal(l) * l.valor;
      porDia.set(l.data, saldo);
    });
  return porDia;
}

function intervaloPeriodo() {
  const hoje = today();
  switch (state.periodo) {
    case 'mes': return [hoje.slice(0, 8) + '01', endOfMonth(hoje)];
    case '30d': return [addDays(hoje, -30), hoje];
    case 'futuros': return [addDays(hoje, 1), null];
    case 'custom': return [state.inicio || null, state.fim || null];
    default: return [null, null];
  }
}

// Atalhos de período da janela do extrato em PDF
function intervaloAtalho(atalho) {
  const hoje = today();
  const [ano, mes] = hoje.split('-').map(Number);
  switch (atalho) {
    case 'mes-passado': {
      const inicio = toIso(new Date(ano, mes - 2, 1));
      return [inicio, endOfMonth(inicio)];
    }
    case '30d': return [addDays(hoje, -30), hoje];
    case 'ano': return [`${ano}-01-01`, hoje];
    default: return [hoje.slice(0, 8) + '01', endOfMonth(hoje)];
  }
}

const valorVisivel = v => (state.saldoOculto ? 'R$ ••••' : formatMoney(v));

// ================= TELAS =================

function brandBlock() {
  return `
    <div class="login-brand">
      <img class="login-logo" src="logo.png" alt="Nô Art Móveis">
      <div>
        <h1>Caixa dos Marceneiros</h1>
        <p>Gestão Financeira</p>
      </div>
    </div>`;
}

function eyeButton() {
  const label = state.saldoOculto ? 'Mostrar saldo' : 'Esconder saldo';
  return `<button data-action="toggle-saldo" aria-label="${label}" title="${label}">${icon(state.saldoOculto ? 'eyeOff' : 'eye')}</button>`;
}

function viewCarregando() {
  return `<section class="login">${brandBlock()}<p class="hint">Carregando…</p></section>`;
}

function viewConfig() {
  return `
    <section class="login">
      ${brandBlock()}
      <p class="pin-title"><strong>Falta configurar o Firebase</strong></p>
      <p class="hint">Preencha o arquivo <b>firebase-config.js</b> seguindo o passo a passo do <b>COMO-CONFIGURAR.md</b>.</p>
    </section>`;
}

function viewLogin() {
  const email = lerEmailLembrado();
  return `
    <section class="login">
      ${brandBlock()}
      <form class="login-form" data-form="login">
        <label class="field">
          <span>E-mail</span>
          <input name="email" type="email" required autocomplete="username" autocapitalize="none" spellcheck="false"
            placeholder="seu@email.com" value="${escapeHtml(email)}" ${email ? '' : 'autofocus'}>
        </label>
        <label class="field">
          <span>Senha</span>
          <div class="password-field">
            <input name="senha" type="password" required autocomplete="current-password" ${email ? 'autofocus' : ''}>
            <button type="button" data-action="ver-senha" aria-label="Mostrar senha" title="Mostrar senha">${icon('eye')}</button>
          </div>
        </label>
        <button class="btn btn-primary btn-block">Entrar</button>
      </form>
      <button class="link" data-action="esqueci-senha">Esqueci minha senha</button>
    </section>`;
}

function pedidoHtml(p, { mostrarNome, mostrarBotoes }) {
  const m = marceneiroDe(p.marcId);
  const [rotulo, classe] = STATUS_PEDIDO[p.status];
  const limite = mostrarBotoes && p.status === 'pendente' ? limiteRetirada(lancamentosDe(p.marcId), today()) : Infinity;
  const aviso = p.valor > limite + CENTAVO
    ? `<p class="pedido-aviso">Saldo insuficiente: disponível ${formatMoney(limite)}</p>` : '';
  const botoes = mostrarBotoes && p.status === 'pendente' ? `${aviso}
    <div class="pedido-acoes">
      <button class="btn btn-ghost btn-sm" data-action="recusar-pedido" data-id="${p.id}">Recusar</button>
      <button class="btn btn-green btn-sm" data-action="aprovar-pedido" data-id="${p.id}">Aprovar</button>
    </div>` : '';

  return `
    <div class="pedido">
      <div class="pedido-linha">
        ${mostrarNome && m ? `<span class="avatar sm">${escapeHtml(initials(m.nome))}</span>` : ''}
        <div class="pedido-info">
          <strong>${mostrarNome && m ? escapeHtml(m.nome) : 'Pedido de retirada'}</strong>
          <small>${escapeHtml(p.motivo || 'Sem motivo informado')} · ${formatMomento(p.criadoEm)}</small>
        </div>
        <div class="pedido-valor">
          <strong>${formatMoney(p.valor)}</strong>
          <span class="${classe}">${rotulo}</span>
        </div>
      </div>
      ${botoes}
    </div>`;
}

const porMaisRecente = (a, b) => momento(b.criadoEm) - momento(a.criadoEm);

function viewAdmin() {
  const contas = [...state.marceneiros]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(m => ({ m, ...resumoConta(lancamentosDe(m.id)) }));
  const total = contas.reduce((soma, c) => soma + c.saldo, 0);
  const pendentes = pedidosPendentes().sort(porMaisRecente);

  const cards = contas.map(({ m, saldo }) => {
    const qtdPedidos = pendentes.filter(p => p.marcId === m.id).length;
    return `
      <button class="account-card" data-action="open-conta" data-id="${m.id}">
        <span class="avatar">${escapeHtml(initials(m.nome))}</span>
        <span class="account-info">
          <strong class="truncate">${escapeHtml(m.nome)}</strong>
          <small class="truncate">${qtdPedidos ? `<span class="tag">${qtdPedidos} pedido(s)</span>` : escapeHtml(m.email)}</small>
        </span>
        <span class="account-balance ${saldo < 0 ? 'neg' : ''}">${valorVisivel(saldo)}</span>
      </button>`;
  }).join('');

  let lista = cards ? `<div class="account-grid">${cards}</div>` : '<p class="empty">Nenhum marceneiro cadastrado ainda.</p>';
  if (!carregado()) lista = '<p class="empty">Carregando…</p>';

  const blocoPedidos = pendentes.length ? `
    <div class="section-head"><h2>Pedidos de retirada <span class="badge">${pendentes.length}</span></h2></div>
    <div class="pedido-list">${pendentes.map(p => pedidoHtml(p, { mostrarNome: true, mostrarBotoes: true })).join('')}</div>` : '';

  return `
    <header class="topbar">
      <div class="brand">
        <img class="logo" src="logo-simbolo.png" alt="Nô Art">
        <div><strong>Olá, Administrador</strong><small>Caixa dos Marceneiros</small></div>
      </div>
      <button class="icon-btn" data-action="logout" title="Sair">${icon('logout')}</button>
    </header>

    <section class="balance-card">
      <div class="balance-top"><span>Saldo total da equipe</span>${eyeButton()}</div>
      <strong class="balance-value${total < 0 ? ' is-negative' : ''}">${valorVisivel(total)}</strong>
      <small>${contas.length} conta(s)</small>
    </section>

    ${blocoPedidos}

    <div class="section-head">
      <h2>Contas</h2>
      <button class="btn btn-primary btn-sm" data-action="new-marceneiro">${icon('plus')} Novo marceneiro</button>
    </div>
    ${lista}`;
}

function viewContaIndisponivel() {
  const msg = carregado() ? 'Esta conta não foi encontrada. Fale com o administrador.' : 'Carregando…';
  return `
    <section class="login">
      ${brandBlock()}
      <p class="hint">${msg}</p>
      ${isAdmin()
        ? '<button class="link" data-action="back">Voltar</button>'
        : '<button class="link" data-action="logout">Sair</button>'}
    </section>`;
}

function viewConta() {
  const m = contaAtual();
  if (!m || !carregado()) return viewContaIndisponivel();

  const todos = lancamentosDe(m.id);
  const { saldo, futuro } = resumoConta(todos);
  const [inicio, fim] = intervaloPeriodo();
  const doPeriodo = todos.filter(l => (!inicio || l.data >= inicio) && (!fim || l.data <= fim));
  const entradas = doPeriodo.filter(l => l.tipo === 'credito').reduce((s, l) => s + l.valor, 0);
  const saidas = doPeriodo.filter(l => l.tipo === 'debito').reduce((s, l) => s + l.valor, 0);
  const nome = escapeHtml(m.nome);

  const header = isAdmin()
    ? `<header class="topbar">
        <button class="icon-btn" data-action="back" title="Voltar">${icon('back')}</button>
        <div class="brand-center"><span class="avatar sm">${escapeHtml(initials(m.nome))}</span><span class="truncate">${nome}</span></div>
        <button class="icon-btn" data-action="edit-marceneiro" title="Editar conta">${icon('edit')}</button>
      </header>`
    : `<header class="topbar">
        <div class="brand">
          <span class="avatar">${escapeHtml(initials(m.nome))}</span>
          <div><strong>Olá, ${escapeHtml(firstName(m.nome))}</strong><small>Caixa dos Marceneiros · Nô Art</small></div>
        </div>
        <button class="icon-btn" data-action="logout" title="Sair">${icon('logout')}</button>
      </header>`;

  const acoes = (isAdmin()
    ? [
      ['novo-servico', 'plus', 'Serviço', 'green'],
      ['nova-retirada', 'minus', 'Retirada', 'red'],
      ['novo-parcelado', 'cart', 'Parcelado', 'amber'],
    ]
    : [['novo-pedido', 'send', 'Pedir retirada', 'accent']]
  ).concat([['imprimir', 'print', 'Extrato PDF', 'accent']])
    .map(([action, ic, label, tone]) => `
      <button class="quick-action" data-action="${action}">
        <span class="qa-icon tone-${tone}">${icon(ic)}</span>
        <span>${label}</span>
      </button>`).join('');

  // Admin vê os pedidos pendentes desta conta; o marceneiro vê os últimos pedidos dele
  const pedidos = state.pedidos
    .filter(p => p.marcId === m.id && (!isAdmin() || p.status === 'pendente'))
    .sort(porMaisRecente)
    .slice(0, 5);
  const blocoPedidos = pedidos.length ? `
    <section>
      <div class="section-head"><h2>${isAdmin() ? 'Pedidos aguardando' : 'Meus pedidos'}</h2></div>
      <div class="pedido-list">${pedidos.map(p => pedidoHtml(p, { mostrarNome: false, mostrarBotoes: isAdmin() })).join('')}</div>
    </section>` : '';

  const chips = PERIODOS.map(([id, label]) =>
    `<button class="chip${state.periodo === id ? ' active' : ''}" data-action="periodo" data-periodo="${id}">${label}</button>`).join('');

  const datas = state.periodo === 'custom' ? `
    <div class="custom-range">
      <input type="date" data-filter="inicio" value="${state.inicio}" aria-label="Data inicial">
      <span>até</span>
      <input type="date" data-filter="fim" value="${state.fim}" aria-label="Data final">
    </div>` : '';

  return `
    <div class="conta">
      ${header}

      <section class="balance-card">
        <div class="balance-top"><span>Saldo disponível</span>${eyeButton()}</div>
        <strong class="balance-value${saldo < 0 ? ' is-negative' : ''}">${valorVisivel(saldo)}</strong>
        ${futuro ? `<small>Agendado: ${valorVisivel(futuro)}</small>` : '<small>Nenhum lançamento agendado</small>'}
      </section>

      <nav class="quick-actions">${acoes}</nav>

      ${blocoPedidos}

      <section>
        <div class="section-head"><h2>Extrato</h2></div>
        <div class="chips">${chips}</div>
        ${datas}
        <div class="period-summary">
          <div><small>Entradas</small><strong class="pos">${formatMoney(entradas)}</strong></div>
          <div><small>Saídas</small><strong class="neg">${formatMoney(saidas)}</strong></div>
        </div>
        ${extratoHtml(todos, doPeriodo)}
      </section>
    </div>`;
}

function extratoHtml(todos, lancamentos) {
  if (!lancamentos.length) return '<p class="empty">Nenhum lançamento neste período.</p>';

  const hoje = today();
  const saldoDoDia = saldosDiarios(todos);
  const porDia = new Map();
  [...lancamentos]
    .sort((a, b) => b.data.localeCompare(a.data))
    .forEach(l => {
      if (!porDia.has(l.data)) porDia.set(l.data, []);
      porDia.get(l.data).push(l);
    });

  return [...porDia].map(([dia, itens]) => `
    <div class="day-group">
      <div class="day-head">
        <span>${formatDayHeader(dia)}</span>
        ${dia > hoje ? '<span class="tag">Agendado</span>' : `<span>Saldo do dia ${valorVisivel(saldoDoDia.get(dia))}</span>`}
      </div>
      <div class="day-list">${itens.map(lancamentoHtml).join('')}</div>
    </div>`).join('');
}

function lancamentoHtml(l) {
  const credito = l.tipo === 'credito';
  const detalhe = credito ? (l.cliente ? `Cliente: ${l.cliente}` : 'Serviço') : 'Retirada';
  return `
    <button class="tx${l.data > today() ? ' tx-future' : ''}" data-action="ver-lancamento" data-id="${l.id}">
      <span class="tx-icon ${credito ? 'in' : 'out'}">${icon(credito ? 'arrowUp' : 'arrowDown')}</span>
      <span class="tx-info">
        <strong>${escapeHtml(l.desc)}</strong>
        <small>${escapeHtml(detalhe)}</small>
      </span>
      <span class="tx-value ${credito ? 'pos' : 'neg'}">${credito ? '+' : '−'} ${formatMoney(l.valor)}</span>
    </button>`;
}

// ================= NAVEGAÇÃO =================

const VIEWS = {
  carregando: viewCarregando,
  config: viewConfig,
  login: viewLogin,
  admin: viewAdmin,
  conta: viewConta,
};

function render() {
  $('#app').innerHTML = VIEWS[state.screen]();
}

function go(screen) {
  state.screen = screen;
  render();
  window.scrollTo(0, 0);
}

function openConta(id) {
  state.contaId = id;
  state.periodo = 'mes';
  go('conta');
}

// ================= LOGIN E DADOS AO VIVO =================

let pararEscutas = [];

function aoMudarLogin(user) {
  pararEscutas.forEach(parar => parar());
  pararEscutas = [];
  Object.assign(state, { user, marceneiros: [], lancamentos: [], pedidos: [], saldoOculto: false });
  state.carregados.clear();

  if (!user) {
    go('login');
    return;
  }

  lembrarEmail(user.email);
  const erro = err => {
    console.error(err);
    toast(mensagemErro(err), 'error');
  };
  pararEscutas = [
    Store.watchMarceneiros(user, lista => chegou('marceneiros', lista), erro),
    Store.watchLancamentos(user, lista => chegou('lancamentos', lista), erro),
    Store.watchPedidos(user, lista => chegou('pedidos', lista), erro),
  ];
  go(user.role === 'admin' ? 'admin' : 'conta');
}

function chegou(colecao, lista) {
  state[colecao] = lista;
  state.carregados.add(colecao);
  if (!isAdmin()) state.contaId = state.marceneiros[0]?.id ?? null;
  render();
}

// ================= JANELAS =================

function openDialog(id, valores = {}) {
  const dialog = document.getElementById(id);
  const form = dialog.querySelector('form');
  if (form) {
    form.reset();
    form.querySelectorAll('input[type="date"]').forEach(input => { input.value = today(); });
    Object.entries(valores).forEach(([name, value]) => { form.elements[name].value = value; });
  }
  if (id === 'dlg-parcelado') updateParceladoPreview();
  dialog.showModal();
}

function openLancamento(id) {
  const m = contaAtual();
  const l = state.lancamentos.find(x => x.id === id);
  const credito = l.tipo === 'credito';

  $('#lancamento-body').innerHTML = `
    <div class="detail-amount ${credito ? 'pos' : 'neg'}">${credito ? '+' : '−'} ${formatMoney(l.valor)}</div>
    <p class="detail-type">${credito ? 'Serviço (entrada)' : 'Retirada (saída)'}${l.data > today() ? ' · Agendado' : ''}</p>
    <dl class="detail-list">
      <div><dt>Data</dt><dd>${formatDate(l.data)}</dd></div>
      <div><dt>Descrição</dt><dd>${escapeHtml(l.desc)}</dd></div>
      ${l.cliente ? `<div><dt>Cliente</dt><dd>${escapeHtml(l.cliente)}</dd></div>` : ''}
      <div><dt>Conta</dt><dd>${escapeHtml(m.nome)}</dd></div>
    </dl>
    ${isAdmin() ? `<button class="btn btn-danger btn-block" data-action="excluir-lancamento" data-id="${l.id}">Excluir lançamento</button>` : ''}`;

  $('#dlg-lancamento').showModal();
}

function updateParceladoPreview() {
  const form = $('#form-parcelado');
  const total = parseMoney(form.elements.total.value);
  const parcelas = parseInt(form.elements.parcelas.value, 10);
  $('#parcelado-preview').textContent = total > 0 && parcelas > 0
    ? `${parcelas}x de ${formatMoney(total / parcelas)}`
    : '';
}

// ================= EXTRATO EM PDF =================
// Monta uma página própria para impressão, só com as movimentações do período

function extratoParaImpressao(m, inicio, fim) {
  const todos = lancamentosDe(m.id);
  const saldoAnterior = saldoAte(todos, addDays(inicio, -1));
  const doPeriodo = todos.filter(l => l.data >= inicio && l.data <= fim).sort(porData);
  const entradas = doPeriodo.filter(l => l.tipo === 'credito').reduce((s, l) => s + l.valor, 0);
  const saidas = doPeriodo.filter(l => l.tipo === 'debito').reduce((s, l) => s + l.valor, 0);
  const hoje = today();

  let saldo = saldoAnterior;
  const linhas = doPeriodo.map(l => {
    saldo += sinal(l) * l.valor;
    const credito = l.tipo === 'credito';
    const detalhes = [l.cliente && `Cliente: ${l.cliente}`, l.data > hoje && 'Agendado'].filter(Boolean);
    return `
      <tr>
        <td>${formatDate(l.data)}</td>
        <td>${escapeHtml(l.desc)}${detalhes.map(d => `<small>${escapeHtml(d)}</small>`).join('')}</td>
        <td class="num pos">${credito ? formatMoney(l.valor) : ''}</td>
        <td class="num neg">${credito ? '' : formatMoney(l.valor)}</td>
        <td class="num">${formatMoney(saldo)}</td>
      </tr>`;
  }).join('');

  const emitidoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return `
    <header class="pdf-topo">
      <img src="logo.png" alt="Nô Art Móveis">
      <div>
        <h1>Extrato de conta</h1>
        <p>Caixa dos Marceneiros</p>
      </div>
    </header>

    <section class="pdf-dados">
      <div><span>Marceneiro</span><strong>${escapeHtml(m.nome)}</strong></div>
      <div><span>Período</span><strong>${formatDate(inicio)} a ${formatDate(fim)}</strong></div>
      <div><span>E-mail</span><strong>${escapeHtml(m.email)}</strong></div>
      <div><span>Emitido em</span><strong>${emitidoEm}</strong></div>
    </section>

    <section class="pdf-resumo">
      <div><span>Saldo anterior</span><strong>${formatMoney(saldoAnterior)}</strong></div>
      <div><span>Entradas</span><strong class="pos">+ ${formatMoney(entradas)}</strong></div>
      <div><span>Saídas</span><strong class="neg">− ${formatMoney(saidas)}</strong></div>
      <div><span>Saldo final</span><strong>${formatMoney(saldo)}</strong></div>
    </section>

    <table class="pdf-tabela">
      <thead>
        <tr><th>Data</th><th>Descrição</th><th class="num">Entrada</th><th class="num">Saída</th><th class="num">Saldo</th></tr>
      </thead>
      <tbody>
        <tr class="pdf-saldo-anterior">
          <td>${formatDate(addDays(inicio, -1))}</td><td>Saldo anterior</td><td></td><td></td>
          <td class="num">${formatMoney(saldoAnterior)}</td>
        </tr>
        ${linhas || '<tr><td colspan="5" class="pdf-vazio">Nenhuma movimentação no período.</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2">Totais do período</td>
          <td class="num pos">${formatMoney(entradas)}</td>
          <td class="num neg">${formatMoney(saidas)}</td>
          <td class="num">${formatMoney(saldo)}</td>
        </tr>
      </tfoot>
    </table>

    <p class="pdf-rodape">Nô Art Móveis · Documento gerado pelo Caixa dos Marceneiros</p>`;
}

async function imprimirExtrato(m, inicio, fim) {
  const area = $('#print-area');
  area.innerHTML = extratoParaImpressao(m, inicio, fim);
  await area.querySelector('img').decode().catch(() => {}); // espera o logo carregar

  // O título vira o nome do arquivo ao salvar em PDF
  const tituloOriginal = document.title;
  document.title = `Extrato - ${m.nome} - ${inicio} a ${fim}`;
  window.addEventListener('afterprint', () => { document.title = tituloOriginal; }, { once: true });
  window.print();
}

// ================= PEDIDOS (admin responde) =================

async function responderPedido(id, aprovar) {
  const p = state.pedidos.find(x => x.id === id);
  const m = marceneiroDe(p.marcId);
  if (aprovar) {
    const limite = limiteRetirada(lancamentosDe(m.id), today());
    if (p.valor > limite + CENTAVO) {
      fail(`Saldo insuficiente para aprovar. Disponível: ${formatMoney(limite)}.`);
      return;
    }
  }
  const pergunta = aprovar
    ? `Aprovar ${formatMoney(p.valor)} para ${m.nome}? A retirada entra no extrato com a data de hoje.`
    : `Recusar o pedido de ${formatMoney(p.valor)} de ${m.nome}?`;
  if (!confirm(pergunta)) return;

  try {
    if (aprovar) await Store.aprovarPedido(p, m, today());
    else await Store.recusarPedido(p);
  } catch (err) {
    fail(mensagemErro(err));
    return;
  }
  toast(aprovar ? 'Pedido aprovado e lançado no extrato.' : 'Pedido recusado.');

  await avisar({
    para: m.email,
    assunto: `Seu pedido de retirada foi ${aprovar ? 'aprovado' : 'recusado'}`,
    mensagem: `Olá, ${firstName(m.nome)}!\n\n`
      + `Seu pedido de retirada de ${formatMoney(p.valor)} foi ${aprovar ? 'APROVADO' : 'RECUSADO'}.\n`
      + (aprovar ? 'O valor já aparece no seu extrato.\n' : 'Em caso de dúvida, fale com o administrador.\n')
      + `\nVer no app: ${SITE_URL}`,
  });
}

// ================= AÇÕES (cliques) =================

const actions = {
  'logout': () => Store.logout(),
  'back': () => go('admin'),
  'open-conta': el => openConta(el.dataset.id),
  'toggle-saldo': () => {
    state.saldoOculto = !state.saldoOculto;
    render();
  },
  'periodo': el => {
    state.periodo = el.dataset.periodo;
    render();
  },
  'imprimir': () => {
    const [inicio, fim] = intervaloAtalho('mes');
    openDialog('dlg-extrato', { inicio, fim });
  },
  'extrato-atalho': el => {
    const [inicio, fim] = intervaloAtalho(el.dataset.atalho);
    const form = el.closest('form');
    form.elements.inicio.value = inicio;
    form.elements.fim.value = fim;
  },

  'ver-senha': el => {
    const input = el.parentElement.querySelector('input');
    const mostrar = input.type === 'password';
    input.type = mostrar ? 'text' : 'password';
    el.innerHTML = icon(mostrar ? 'eyeOff' : 'eye');
    el.setAttribute('aria-label', mostrar ? 'Esconder senha' : 'Mostrar senha');
  },
  'esqueci-senha': async () => {
    const email = $('form[data-form="login"]').elements.email.value.trim();
    if (!email) return fail('Digite seu e-mail primeiro.');
    try {
      await Store.enviarEmailSenha(email);
      toast('Enviamos um e-mail para você criar uma nova senha. Olhe também no spam.');
    } catch (err) {
      fail(mensagemErro(err));
    }
  },

  'close': el => el.closest('dialog').close(),
  'new-marceneiro': () => openDialog('dlg-marceneiro'),
  'edit-marceneiro': () => {
    const m = contaAtual();
    $('#editar-email').textContent = `E-mail de acesso: ${m.email}`;
    openDialog('dlg-editar', { nome: m.nome });
  },
  'reenviar-senha': async () => {
    const m = contaAtual();
    try {
      await Store.enviarEmailSenha(m.email);
      toast(`E-mail enviado para ${m.email}.`);
    } catch (err) {
      fail(mensagemErro(err));
    }
  },
  'novo-servico': () => openDialog('dlg-servico'),
  'nova-retirada': () => openDialog('dlg-retirada'),
  'novo-parcelado': () => openDialog('dlg-parcelado'),
  'novo-pedido': () => {
    const disponivel = disponivelParaPedido(state.contaId);
    if (disponivel < 0.01) return fail('Você não tem saldo disponível para pedir retirada.');
    $('#pedido-saldo').textContent = `Disponível para pedir: ${formatMoney(disponivel)}`;
    openDialog('dlg-pedido');
  },
  'ver-lancamento': el => openLancamento(el.dataset.id),
  'aprovar-pedido': el => responderPedido(el.dataset.id, true),
  'recusar-pedido': el => responderPedido(el.dataset.id, false),

  'delete-marceneiro': async el => {
    const m = contaAtual();
    if (!confirm(`Excluir a conta de ${m.nome} e todo o histórico? Isso não pode ser desfeito.`)) return;
    el.closest('dialog').close();
    try {
      await Store.removeMarceneiro(m.id);
      toast('Conta excluída.');
      go('admin');
    } catch (err) {
      fail(mensagemErro(err));
    }
  },
  'excluir-lancamento': async el => {
    if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
    el.closest('dialog').close();
    try {
      await Store.removeLancamento(el.dataset.id);
      toast('Lançamento excluído.');
    } catch (err) {
      fail(mensagemErro(err));
    }
  },
};

// ================= FORMULÁRIOS =================
// Cada função recebe os campos do formulário. Retornar false mantém a janela aberta.

const forms = {
  extrato(f) {
    const inicio = f.inicio.value;
    const fim = f.fim.value;
    if (inicio > fim) return fail('A data inicial precisa ser antes da data final.');
    // Espera a janela fechar para ela não sair na impressão
    setTimeout(() => imprimirExtrato(contaAtual(), inicio, fim), 150);
  },

  async login(f) {
    await Store.login(f.email.value, f.senha.value);
  },

  async marceneiro(f) {
    await Store.addMarceneiro({ nome: f.nome.value.trim(), email: f.email.value });
    toast('Marceneiro cadastrado! Ele vai receber um e-mail para criar a senha.');
  },

  async editar(f) {
    await Store.updateMarceneiro(state.contaId, { nome: f.nome.value.trim() });
    toast('Conta atualizada.');
  },

  async servico(f) {
    const valor = parseMoney(f.valor.value);
    if (!(valor > 0)) return fail('Informe um valor maior que zero.');
    await Store.addLancamento(contaAtual(), {
      tipo: 'credito',
      data: f.data.value,
      desc: f.desc.value.trim(),
      cliente: f.cliente.value.trim(),
      valor,
    });
    toast('Serviço lançado!');
  },

  async retirada(f) {
    const valor = parseMoney(f.valor.value);
    if (!(valor > 0)) return fail('Informe um valor maior que zero.');
    const limite = limiteRetirada(lancamentosDe(state.contaId), f.data.value);
    if (valor > limite + CENTAVO) {
      return fail(`Saldo insuficiente. Disponível para retirada nessa data: ${formatMoney(limite)}.`);
    }
    await Store.addLancamento(contaAtual(), { tipo: 'debito', data: f.data.value, desc: f.desc.value.trim(), valor });
    toast('Retirada registrada!');
  },

  async parcelado(f) {
    const total = parseMoney(f.total.value);
    const parcelas = parseInt(f.parcelas.value, 10);
    if (!(total > 0)) return fail('Informe o valor total.');
    const novas = Store.dividirParcelas(total, parcelas, f.data.value).map(p => ({ ...p, tipo: 'debito' }));
    if (ficariaNegativo(lancamentosDe(state.contaId), novas)) {
      return fail('Saldo insuficiente: com essas parcelas o saldo ficaria negativo.');
    }
    await Store.addParcelado(contaAtual(), { desc: f.desc.value.trim(), total, parcelas, dataInicio: f.data.value });
    toast(`${parcelas} parcela(s) gerada(s)!`);
  },

  async pedido(f) {
    const valor = parseMoney(f.valor.value);
    if (!(valor > 0)) return fail('Informe um valor maior que zero.');
    const m = contaAtual();
    const disponivel = disponivelParaPedido(m.id);
    if (valor > disponivel + CENTAVO) {
      return fail(`Valor maior que o seu saldo disponível (${formatMoney(disponivel)}).`);
    }
    const motivo = f.motivo.value.trim();
    await Store.criarPedido(m, { valor, motivo });
    toast('Pedido enviado! Você será avisado quando for respondido.');

    avisar({
      assunto: `Pedido de retirada: ${m.nome} - ${formatMoney(valor)}`,
      mensagem: `${m.nome} pediu uma retirada de ${formatMoney(valor)}.\n`
        + `Motivo: ${motivo || 'não informado'}\n\n`
        + `Abra o Caixa dos Marceneiros para aprovar ou recusar: ${SITE_URL}`,
    });
  },
};

// ================= EVENTOS =================

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el) actions[el.dataset.action](el);
});

// Clicar fora da janela fecha
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
});

document.addEventListener('submit', async e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();

  const botao = form.querySelector('button:not([type="button"])');
  botao.disabled = true; // evita salvar duas vezes com clique duplo
  try {
    if (await forms[form.dataset.form](form.elements) === false) return;
    form.closest('dialog')?.close();
  } catch (err) {
    console.error(err);
    fail(mensagemErro(err));
  } finally {
    botao.disabled = false;
  }
});

document.addEventListener('input', e => {
  if (e.target.matches('[data-money]')) e.target.value = maskMoneyInput(e.target.value);
  if (e.target.form?.id === 'form-parcelado') updateParceladoPreview();
});

document.addEventListener('change', e => {
  const filtro = e.target.dataset.filter;
  if (!filtro) return;
  state[filtro] = e.target.value;
  render();
});

// ================= INÍCIO =================

if (Store.configurado) {
  render(); // "Carregando…" até o Firebase dizer se já tem alguém logado
  Store.onAuthChange(aoMudarLogin);
} else {
  go('config');
}

// Permite instalar no celular (só funciona em http/https)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js');
}
