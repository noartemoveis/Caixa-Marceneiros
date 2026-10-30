/* =========================================================
   Caixa dos Marceneiros — interface
   Os dados vêm do Store (store.js). Aqui ficam só telas e ações.
   Administrador: faz tudo. Marceneiro: só visualiza e pede retirada.
   ========================================================= */

import * as Store from './store.js';

const LEMBRAR_KEY = 'caixa_ultimo_email';
const AGENDADOS_KEY = 'caixa_agendados';
const AVISOS_DISPENSADO_KEY = 'caixa_avisos_dispensado';
const SITE_URL = location.origin + location.pathname;

// Filtro do extrato e do PDF por tipo de lançamento
const TIPOS = [['todos', 'Ambos'], ['credito', 'Entradas'], ['debito', 'Saídas']];

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
  const texto = fromIso(iso).toLocaleDateString('pt-BR', options); // "seg., 19 de out."
  return texto[0].toUpperCase() + texto.slice(1);
}

// Data/hora de um registro do Firestore (fica vazio por um instante enquanto salva)
const momento = timestamp => timestamp?.toDate?.() ?? new Date();

// Ordem cronológica: pela data e, no mesmo dia, pela hora em que foi lançado
const porDataEHora = (a, b) => a.data.localeCompare(b.data) || momento(a.criadoEm) - momento(b.criadoEm);
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

// Só palavras que começam com letra ("Luís - teste" vira "LT", não "L-")
const initials = nome => nome.trim().split(/\s+/).filter(p => /\p{L}/u.test(p[0])).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const firstName = nome => nome.trim().split(/\s+/)[0];

const mensagemErro = err => ERROS[err?.code] || (err?.code ? 'Algo deu errado. Tente de novo.' : err?.message);

// Preferências guardadas só neste aparelho (sem quebrar em modo anônimo)
function lerPreferencia(chave) {
  try { return localStorage.getItem(chave) || ''; } catch { return ''; }
}
function salvarPreferencia(chave, valor) {
  try { localStorage.setItem(chave, valor); } catch { /* modo anônimo: segue sem lembrar */ }
}

// Lembra o e-mail de quem usou o aparelho por último (nunca a senha)
const lerEmailLembrado = () => lerPreferencia(LEMBRAR_KEY);
const lembrarEmail = email => salvarPreferencia(LEMBRAR_KEY, email);

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

// Sem internet dá para ver tudo, mas nada é lançado (para não ficar nada pela metade)
function exigeInternet() {
  if (navigator.onLine) return true;
  return fail('Sem internet. Conecte-se para continuar.');
}

// O aviso por e-mail não pode travar o que já foi salvo
async function avisar(dados) {
  try {
    await Store.notificar(dados);
  } catch (err) {
    console.error(err);
    toast('Salvo, mas o aviso não foi enviado.', 'error');
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
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-9"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
};

const icon = name =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// ================= ESTADO =================

const state = {
  screen: 'carregando', // carregando | config | login | admin | conta | pedidos | painel | ferramentas
  user: null,           // { role: 'admin' | 'marceneiro', uid, email }
  marceneiros: [],
  lancamentos: [],
  pedidos: [],
  carregados: new Set(), // nomes das coleções que já chegaram do banco
  contaId: null,
  filtro: { inicio: null, fim: null, tipo: 'todos', cliente: '' }, // extrato na tela (datas null = todo o histórico)
  saldoOculto: false,
  agendadosAberto: lerPreferencia(AGENDADOS_KEY) !== 'fechado', // lembrado em cada aparelho
  // Tela de pedidos: aba aberta, de qual conta (null = todas) e para onde volta
  pedidosAba: 'pendentes',
  pedidosDe: null,
  pedidosVolta: 'admin',
  painel: esteMes(),       // período do painel geral do administrador
  busca: '',               // busca no extrato da conta aberta
  // Controle de ferramentas (só admin)
  ferramentas: [],
  equipe: [],
  movimentos: [],
  ferrAba: 'mov',          // mov (movimentação e histórico) | painel (itens e marceneiros)
  ferrBusca: '',           // busca no histórico de ferramentas
  ferrFiltro: 'Todos',     // categoria no painel de itens
  ferrPessoa: '',          // marceneiro escolhido no histórico ('' = todos)
  ferrForm: { ferramenta: '', pessoa: '', acao: 'retirada', obs: '' }, // formulário de movimentação
};

const COLECOES = ['marceneiros', 'lancamentos', 'pedidos'];
const COLECOES_FERRAMENTAS = ['ferramentas', 'equipe', 'movimentos'];

const isAdmin = () => state.user?.role === 'admin';
const carregado = () => COLECOES.every(c => state.carregados.has(c));
const ferramentasCarregadas = () => COLECOES_FERRAMENTAS.every(c => state.carregados.has(c));
const contaAtual = () => state.marceneiros.find(m => m.id === state.contaId);
const marceneiroDe = marcId => state.marceneiros.find(m => m.id === marcId);
// Agendados cancelados não entram em nada (continuam só no banco e no backup)
const lancamentosDe = marcId => state.lancamentos.filter(l => l.marcId === marcId && !l.cancelado);
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

// O saldo fica negativo em algum dia, a partir de "desde"?
const negativoDesde = (lancamentos, desde) =>
  [...saldosDiarios(lancamentos)].some(([dia, saldo]) => dia >= desde && saldo < -CENTAVO);

// Verifica se, somando os novos lançamentos, o saldo fica negativo em algum dia
function ficariaNegativo(lancamentos, novos) {
  return negativoDesde([...lancamentos, ...novos], novos.map(l => l.data).sort()[0]);
}

// Mesma verificação trocando (ou tirando) um lançamento existente
function ficariaNegativoTrocando(lancamentos, original, novo = null) {
  const lista = lancamentos.filter(l => l.id !== original.id).concat(novo ? [novo] : []);
  const desde = novo && novo.data < original.data ? novo.data : original.data;
  return negativoDesde(lista, desde);
}

// O marceneiro só pode pedir o que sobra depois dos pedidos que ainda aguardam resposta
function disponivelParaPedido(marcId) {
  const aguardando = state.pedidos
    .filter(p => p.marcId === marcId && p.status === 'pendente')
    .reduce((s, p) => s + p.valor, 0);
  return Math.max(0, limiteRetirada(lancamentosDe(marcId), today()) - aguardando);
}

// Saldo disponível = só o que já aconteceu.
// Serviços com liberação agendada e parcelas futuras ficam separados.
function resumoConta(lancamentos) {
  const hoje = today();
  let saldo = 0;
  let aLiberar = 0;
  let aDescontar = 0;
  for (const l of lancamentos) {
    if (l.data <= hoje) saldo += sinal(l) * l.valor;
    else if (l.tipo === 'credito') aLiberar += l.valor;
    else aDescontar += l.valor;
  }
  return { saldo, aLiberar, aDescontar };
}

// Saldo no fim de cada dia, para mostrar no extrato
function saldosDiarios(lancamentos) {
  const porDia = new Map();
  let saldo = 0;
  [...lancamentos].sort(porData).forEach(l => {
    saldo += sinal(l) * l.valor;
    porDia.set(l.data, saldo);
  });
  return porDia;
}

function esteMes() {
  const hoje = today();
  return { inicio: hoje.slice(0, 8) + '01', fim: endOfMonth(hoje) };
}

// Filtro do extrato ao abrir uma conta: este mês, entradas e saídas, todos os clientes
const filtroInicial = () => ({ ...esteMes(), tipo: 'todos', cliente: '' });

// Clientes: "vanessa" e "Vanessa " contam como o mesmo
const chaveCliente = nome => (nome || '').trim().toLocaleLowerCase('pt-BR');

// Para buscas: minúsculo e sem acento ("joao" acha "João")
const semAcento = texto => chaveCliente(texto).normalize('NFD').replace(/\p{M}/gu, '');

// Para mostrar o nome, prefere a grafia "Vanessa" a "vanessa" ou "VANESSA"
const capricho = nome => (nome[0] === nome[0].toUpperCase() ? 1 : 0) + (nome !== nome.toUpperCase() ? 1 : 0);

// [chave, nome para mostrar], em ordem alfabética
function clientesDe(lancamentos) {
  const nomes = new Map();
  lancamentos.forEach(l => {
    const chave = chaveCliente(l.cliente);
    if (!chave) return;
    const nome = l.cliente.trim();
    if (!nomes.has(chave) || capricho(nome) > capricho(nomes.get(chave))) nomes.set(chave, nome);
  });
  return [...nomes].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
}

const nomeDoCliente = (lancamentos, chave) =>
  clientesDe(lancamentos).find(([k]) => k === chave)?.[1] ?? chave;

// Lançamento entra no filtro? Com cliente escolhido, só os serviços dele
const passaNoFiltro = ({ tipo, cliente }) => l =>
  cliente ? chaveCliente(l.cliente) === cliente : tipo === 'todos' || l.tipo === tipo;

// "2026-10" → "Outubro de 2026"
function nomeDoMes(mes) {
  const nome = fromIso(mes + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return nome[0].toUpperCase() + nome.slice(1);
}

// Texto do botão de período: "outubro de 2026", "01/10 – 15/10" ou "Todo o histórico"
function rotuloPeriodo({ inicio, fim }) {
  if (!inicio) return 'Todo o histórico';
  if (inicio.endsWith('-01') && fim === endOfMonth(inicio)) return nomeDoMes(inicio.slice(0, 7));
  const curta = iso => (iso.slice(0, 4) === today().slice(0, 4) ? formatDate(iso).slice(0, 5) : formatDate(iso));
  return inicio === fim ? curta(inicio) : `${curta(inicio)} – ${curta(fim)}`;
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

// Cartão para ativar as notificações no celular (some depois de ativar ou de "Agora não")
const ehIphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
const appInstalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function cartaoNotificacoes() {
  if (!Store.notificacoesConfiguradas || lerPreferencia(AVISOS_DISPENSADO_KEY)) return '';

  const cartao = (titulo, texto, botoes) => `
    <div class="aviso-push">
      <span class="qa-icon tone-accent">${icon('bell')}</span>
      <div class="aviso-push-texto"><strong>${titulo}</strong><small>${texto}</small></div>
      <div class="aviso-push-acoes">${botoes}</div>
    </div>`;

  // No iPhone, notificação só funciona com o app instalado na tela de início
  if (ehIphone && !appInstalado) {
    return cartao('Avisos no iPhone',
      'Para receber avisos, toque em Compartilhar ⬆ e depois em "Adicionar à Tela de Início". Abra o app por lá.',
      '<button class="btn btn-ghost btn-sm" data-action="push-depois">Entendi</button>');
  }
  if (globalThis.Notification?.permission !== 'default') return '';
  return cartao('Receber avisos no celular',
    isAdmin() ? 'Pedidos de retirada chegam na hora, mesmo com o app fechado.'
      : 'Lançamentos e respostas dos seus pedidos chegam na hora, mesmo com o app fechado.',
    `<button class="btn btn-ghost btn-sm" data-action="push-depois">Agora não</button>
     <button class="btn btn-primary btn-sm" data-action="ativar-push">Ativar</button>`);
}

// Sininho no topo: aparece enquanto os avisos não estão ativos neste aparelho
function botaoAvisos() {
  if (!Store.notificacoesConfiguradas || globalThis.Notification?.permission === 'granted') return '';
  if (!globalThis.Notification && !ehIphone) return ''; // navegador sem suporte a avisos
  return `<button class="icon-btn" data-action="ativar-push" title="Ativar avisos neste aparelho">${icon('bell')}</button>`;
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
    ? `<p class="pedido-aviso">Saldo não cobre o pedido todo: disponível ${formatMoney(limite)}</p>` : '';
  // Aprovado com valor menor que o pedido: mostra quanto foi aprovado
  const parcial = p.status === 'aprovado' && p.valorAprovado && p.valorAprovado < p.valor - CENTAVO;
  const resposta = p.resposta ? `<p class="pedido-resposta">“${escapeHtml(p.resposta)}”</p>` : '';
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
          <strong>${formatMoney(parcial ? p.valorAprovado : p.valor)}</strong>
          ${parcial ? `<small class="pedido-de">de ${formatMoney(p.valor)}</small>` : ''}
          <span class="${classe}">${rotulo}</span>
        </div>
      </div>
      ${resposta}
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
    <div class="section-head">
      <h2>Pedidos aguardando <span class="badge">${pendentes.length}</span></h2>
      <button class="link-sm" data-action="ver-pedidos">Ver todos</button>
    </div>
    <div class="pedido-list">${pendentes.map(p => pedidoHtml(p, { mostrarNome: true, mostrarBotoes: true })).join('')}</div>` : '';

  return `
    <header class="topbar">
      <div class="brand">
        <img class="logo" src="logo-simbolo.png" alt="Nô Art">
        <div><strong>Olá, Administrador</strong><small>Caixa dos Marceneiros</small></div>
      </div>
      <div class="topbar-actions">
        ${botaoAvisos()}
        ${botaoFerramentas()}
        <button class="icon-btn com-badge" data-action="ver-pedidos" title="Pedidos de retirada">
          ${icon('inbox')}${pendentes.length ? `<span class="badge">${pendentes.length}</span>` : ''}
        </button>
        <button class="icon-btn" data-action="logout" title="Sair">${icon('logout')}</button>
      </div>
    </header>

    <section class="balance-card">
      <div class="balance-top"><span>Saldo total da equipe</span>${eyeButton()}</div>
      <strong class="balance-value${total < 0 ? ' is-negative' : ''}">${valorVisivel(total)}</strong>
      <small>${contas.length} conta(s)</small>
    </section>

    ${cartaoNotificacoes()}

    <button class="painel-atalho" data-action="abrir-painel">
      <span class="qa-icon tone-accent">${icon('chart')}</span>
      <span><strong>Painel geral</strong><small>Totais do período, por marceneiro e por cliente</small></span>
      ${icon('chevronRight')}
    </button>

    ${blocoPedidos}

    <div class="section-head">
      <h2>Contas</h2>
      <button class="btn btn-primary btn-sm" data-action="new-marceneiro">${icon('plus')} Novo marceneiro</button>
    </div>
    ${lista}

    <section class="backup">
      <div>
        <strong>Backup</strong>
        <small>Planilha Excel com todos os lançamentos, pedidos, saldos e ferramentas.</small>
      </div>
      <button class="btn btn-ghost btn-sm" data-action="baixar-backup">${icon('download')} Baixar planilha</button>
    </section>`;
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
  const { saldo } = resumoConta(todos);
  const { tipo, cliente } = state.filtro;
  const nome = escapeHtml(m.nome);

  const filtroTipo = cliente ? '' : `
    <div class="segmented segmented-3 filtro-tipo">
      ${TIPOS.map(([id, rotulo]) =>
        `<button type="button" class="${tipo === id ? 'active' : ''}" data-action="filtro-tipo" data-tipo="${id}">${rotulo}</button>`).join('')}
    </div>`;

  const filtroCliente = clientesDe(todos).length ? `
    <button class="filtro-cliente${cliente ? ' ativo' : ''}" data-action="abrir-clientes" title="Filtrar por cliente">
      ${icon('user')}
      <span class="truncate">${cliente ? escapeHtml(nomeDoCliente(todos, cliente)) : 'Clientes'}</span>
      ${icon('chevronDown')}
    </button>` : '';

  const busca = `
    <label class="busca busca-extrato">
      ${icon('search')}
      <input type="search" data-busca-extrato data-manter-foco="busca" value="${escapeHtml(state.busca)}"
        placeholder="Buscar" autocomplete="off" aria-label="Buscar no extrato">
    </label>`;

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
        <div class="topbar-actions">
          ${botaoAvisos()}
          <button class="icon-btn" data-action="logout" title="Sair">${icon('logout')}</button>
        </div>
      </header>`;

  const acoes = (isAdmin()
    ? [
      ['novo-servico', 'plus', 'Serviço', 'green'],
      ['nova-retirada', 'minus', 'Retirada', 'red'],
      ['novo-parcelado', 'cart', 'Parcelado', 'amber'],
    ]
    : [
      ['novo-pedido', 'send', 'Pedir retirada', 'accent'],
      ['ver-pedidos', 'inbox', 'Meus pedidos', 'accent'],
    ]
  ).concat([['imprimir', 'print', 'Extrato PDF', 'accent']])
    .map(([action, ic, label, tone]) => `
      <button class="quick-action" data-action="${action}">
        <span class="qa-icon tone-${tone}">${icon(ic)}</span>
        <span>${label}</span>
      </button>`).join('');

  // Aqui só os pedidos que aguardam resposta; o histórico fica na tela de pedidos
  const pendentes = state.pedidos
    .filter(p => p.marcId === m.id && p.status === 'pendente')
    .sort(porMaisRecente);
  const blocoPedidos = pendentes.length ? `
    <section>
      <div class="section-head">
        <h2>Pedidos aguardando</h2>
        <button class="link-sm" data-action="ver-pedidos" data-id="${m.id}">Ver todos</button>
      </div>
      <div class="pedido-list">${pendentes.map(p => pedidoHtml(p, { mostrarNome: false, mostrarBotoes: isAdmin() })).join('')}</div>
    </section>` : '';

  return `
    <div class="conta">
      ${header}

      <section class="balance-card">
        <div class="balance-top"><span>Saldo disponível</span>${eyeButton()}</div>
        <strong class="balance-value${saldo < 0 ? ' is-negative' : ''}">${valorVisivel(saldo)}</strong>
      </section>

      ${isAdmin() ? '' : cartaoNotificacoes()}

      <nav class="quick-actions">${acoes}</nav>

      ${blocoPedidos}

      <section>
        <div class="section-head">
          <h2>Extrato</h2>
          <button class="period-btn" data-action="abrir-periodo">${icon('calendar')} ${rotuloPeriodo(state.filtro)}</button>
        </div>
        ${filtroTipo}
        <div class="filtros-linha">${busca}${filtroCliente}</div>
        <div id="extrato-conteudo">${extratoConteudo(m)}</div>
      </section>
    </div>`;
}

// Painel geral do administrador: o movimento real do período (sem estornos e cancelados),
// por marceneiro e por cliente somando todos os marceneiros
function viewPainel() {
  const { inicio, fim } = state.painel;
  const hoje = today();
  const noPeriodo = l => !l.cancelado && !l.estornado && !l.estornoDe && l.data <= hoje
    && (!inicio || l.data >= inicio) && (!fim || l.data <= fim);
  const movimento = state.lancamentos.filter(noPeriodo);
  const soma = (lista, tipo) => lista.filter(l => l.tipo === tipo).reduce((s, l) => s + l.valor, 0);

  const contas = state.marceneiros.map(m => {
    const doMarceneiro = movimento.filter(l => l.marcId === m.id);
    return { m, entradas: soma(doMarceneiro, 'credito'), saidas: soma(doMarceneiro, 'debito'), ...resumoConta(lancamentosDe(m.id)) };
  }).sort((a, b) => b.entradas - a.entradas || a.m.nome.localeCompare(b.m.nome, 'pt-BR'));
  const totalDe = campo => contas.reduce((s, c) => s + c[campo], 0);

  const servicos = movimento.filter(l => l.tipo === 'credito');
  const clientes = clientesDe(servicos).map(([chave, nome]) => {
    const doCliente = servicos.filter(l => chaveCliente(l.cliente) === chave);
    const quem = [...new Set(doCliente.map(l => marceneiroDe(l.marcId)?.nome).filter(Boolean))];
    return { nome, total: doCliente.reduce((s, l) => s + l.valor, 0), quantidade: doCliente.length, quem };
  }).sort((a, b) => b.total - a.total);

  const aprovados = state.pedidos.filter(p => {
    if (p.status !== 'aprovado') return false;
    const dia = toIso(momento(p.respondidoEm));
    return (!inicio || dia >= inicio) && (!fim || dia <= fim);
  });

  const linhasContas = contas.map(({ m, entradas, saidas, saldo }) => `
    <button class="painel-linha" data-action="open-conta" data-id="${m.id}">
      <span class="avatar sm">${escapeHtml(initials(m.nome))}</span>
      <span class="painel-info">
        <strong class="truncate">${escapeHtml(m.nome)}</strong>
        <small><span class="pos">+ ${formatMoney(entradas)}</span> · <span class="neg">− ${formatMoney(saidas)}</span></small>
      </span>
      <span class="painel-valor"><small>Saldo</small>${valorVisivel(saldo)}</span>
    </button>`).join('');

  const linhasClientes = clientes.map(c => `
    <div class="painel-linha">
      <span class="avatar sm">${escapeHtml(initials(c.nome))}</span>
      <span class="painel-info">
        <strong class="truncate">${escapeHtml(c.nome)}</strong>
        <small class="truncate">${c.quantidade} serviço(s) · ${escapeHtml(c.quem.join(', '))}</small>
      </span>
      <span class="painel-valor pos">${formatMoney(c.total)}</span>
    </div>`).join('');

  return `
    <div class="conta">
      <header class="topbar">
        <button class="icon-btn" data-action="back" title="Voltar">${icon('back')}</button>
        <div class="brand-center"><span>Painel geral</span></div>
        <span class="icon-btn-espaco"></span>
      </header>

      <div class="section-head">
        <h2>Resumo</h2>
        <button class="period-btn" data-action="abrir-periodo-painel">${icon('calendar')} ${rotuloPeriodo(state.painel)}</button>
      </div>

      <div class="painel-cards">
        <div><small>Entradas no período</small><strong class="pos">${formatMoney(soma(movimento, 'credito'))}</strong></div>
        <div><small>Saídas no período</small><strong class="neg">${formatMoney(soma(movimento, 'debito'))}</strong></div>
        <div><small>Saldo da equipe hoje</small><strong>${valorVisivel(totalDe('saldo'))}</strong></div>
        <div><small>Agendados</small>
          <strong class="painel-agendados"><span class="pos">+ ${valorVisivel(totalDe('aLiberar'))}</span><span class="neg">− ${valorVisivel(totalDe('aDescontar'))}</span></strong>
        </div>
      </div>
      <p class="hint painel-nota">
        ${aprovados.length} pedido(s) de retirada aprovado(s) no período, somando ${formatMoney(aprovados.reduce((s, p) => s + (p.valorAprovado ?? p.valor), 0))}.
        Estornos e agendamentos cancelados não entram nas contas.
      </p>

      <div class="section-head"><h2>Por marceneiro</h2></div>
      <div class="painel-lista">${linhasContas || '<p class="empty">Nenhum marceneiro cadastrado.</p>'}</div>

      <div class="section-head"><h2>Por cliente</h2></div>
      <div class="painel-lista">${linhasClientes || '<p class="empty">Nenhum serviço com cliente neste período.</p>'}</div>
    </div>`;
}

// Todos os pedidos de retirada: "Aguardando" e "Histórico" (já respondidos)
function viewPedidos() {
  const daConta = state.pedidosDe ? state.pedidos.filter(p => p.marcId === state.pedidosDe) : state.pedidos;
  const pendentes = daConta.filter(p => p.status === 'pendente');
  const historico = daConta.filter(p => p.status !== 'pendente');
  const aba = state.pedidosAba;
  const lista = (aba === 'pendentes' ? pendentes : historico).sort(porMaisRecente);
  const conta = state.pedidosDe && isAdmin() ? marceneiroDe(state.pedidosDe) : null;

  const vazio = aba === 'pendentes' ? 'Nenhum pedido aguardando resposta.' : 'Nenhum pedido respondido ainda.';
  const abas = [['pendentes', `Aguardando${pendentes.length ? ` (${pendentes.length})` : ''}`], ['historico', 'Histórico']]
    .map(([id, rotulo]) => `<button type="button" class="${aba === id ? 'active' : ''}" data-action="pedidos-aba" data-aba="${id}">${rotulo}</button>`)
    .join('');

  return `
    <div class="conta">
      <header class="topbar">
        <button class="icon-btn" data-action="voltar-pedidos" title="Voltar">${icon('back')}</button>
        <div class="brand-center"><span class="truncate">${conta ? `Pedidos · ${escapeHtml(conta.nome)}` : 'Pedidos de retirada'}</span></div>
        <span class="icon-btn-espaco"></span>
      </header>

      <div class="segmented pedidos-abas">${abas}</div>

      ${lista.length
        ? `<div class="pedido-list">${lista.map(p => pedidoHtml(p, { mostrarNome: isAdmin() && !conta, mostrarBotoes: isAdmin() })).join('')}</div>`
        : `<p class="empty">${vazio}</p>`}
    </div>`;
}

// ================= FERRAMENTAS (só admin) =================
// Controle de quem está com cada máquina. Os marceneiros não veem nada disso.

const TIPOS_FERRAMENTA = ['Máquina', 'Ferramenta', 'Broca/Fresa', 'Outro'];

// Lista da planilha, para cadastrar tudo de uma vez na primeira vez
const LISTA_INICIAL = {
  ferramentas: [
    ['MAQ-01', 'Máquina', 'Lixadeira Raiman (1)'], ['MAQ-02', 'Máquina', 'Lixadeira Raiman (2)'],
    ['MAQ-03', 'Máquina', 'Lixadeira Raiman (3)'], ['MAQ-04', 'Máquina', 'Lixadeira Raiman (4)'],
    ['MAQ-05', 'Máquina', 'Lixadeira angular DeWalt (1)'], ['MAQ-06', 'Máquina', 'Lixadeira angular DeWalt (2)'],
    ['MAQ-07', 'Máquina', 'Soprador térmico'], ['MAQ-08', 'Máquina', 'Esmerilhadeira Bosch'],
    ['MAQ-09', 'Máquina', 'Serra circular Bosch'], ['MAQ-10', 'Máquina', 'Router Makita'],
    ['MAQ-11', 'Máquina', 'Serra circular Makita'], ['MAQ-12', 'Máquina', 'Nível a laser'],
    ['FER-01', 'Ferramenta', 'Pinador MTK'], ['FER-02', 'Ferramenta', 'Grampeador MTK'],
    ['FER-03', 'Ferramenta', 'Tripé (1)'], ['FER-04', 'Ferramenta', 'Tripé (2)'],
    ['BRO-01', 'Broca/Fresa', 'Broca fresadora 30mm/8mm'], ['BRO-02', 'Broca/Fresa', 'Fresa 1/4'],
    ['BRO-03', 'Broca/Fresa', 'Fresa c/ haste 65x23/75/12 LEITZ'], ['BRO-04', 'Broca/Fresa', 'Fresa de topo 23mm'],
    ['BRO-05', 'Broca/Fresa', 'Fresa de topo 15x12'], ['BRO-06', 'Broca/Fresa', 'Fresa 150x12 LEITZ'],
  ].map(([codigo, tipo, nome]) => ({ codigo, tipo, nome })),
  nomes: ['Zé', 'Itu', 'Djalma', 'Mi', 'Gilmar', 'Galeguinho', 'Cesar', 'Igor', 'Vitor', 'Maksuel', 'Rondennes', 'Daniel', 'Fabiano', 'Fabianinho'],
};

// Máquinas primeiro, depois ferramentas, brocas e o resto; dentro de cada tipo, pelo código
const ordemTipo = f => (TIPOS_FERRAMENTA.includes(f.tipo) ? TIPOS_FERRAMENTA.indexOf(f.tipo) : TIPOS_FERRAMENTA.length);
const porCodigo = (a, b) => ordemTipo(a) - ordemTipo(b) || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true });
const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
const ferramentasAtivas = () => state.ferramentas.filter(f => f.ativo !== false).sort(porCodigo);
const ferramentasEmUso = () => ferramentasAtivas().filter(f => f.comQuem);
const pessoaDe = id => state.equipe.find(p => p.id === id);
// Nome atual da pessoa (se foi renomeada depois da retirada, mostra o nome novo)
const nomeDaPessoa = (id, guardado) => pessoaDe(id)?.nome ?? guardado;
const rotuloFerramenta = f => `${f.codigo} · ${f.nome}`;

const formatDataHora = timestamp =>
  momento(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Formulário de movimentação: os valores ficam no estado para não sumirem
// quando chegam dados novos do banco e a tela é redesenhada
const formMovVazio = () => ({ ferramenta: '', pessoa: '', acao: 'retirada', obs: '' });

// Ao escolher a ferramenta, a ação acompanha: se está fora, é devolução de quem está com ela
function escolherFerramentaMov(id) {
  const f = state.ferramentas.find(x => x.id === id);
  const eraDevolucao = state.ferrForm.acao === 'devolucao';
  state.ferrForm.ferramenta = id;
  state.ferrForm.acao = f?.comQuem ? 'devolucao' : 'retirada';
  if (f?.comQuem) state.ferrForm.pessoa = f.comQuem.pessoaId;
  // Vindo de uma devolução, não deixa o nome de quem devolveu escolhido para a nova retirada
  else if (eraDevolucao) state.ferrForm.pessoa = '';
}

function formMovimentacao() {
  const { ferramenta, pessoa, acao, obs } = state.ferrForm;
  const selecionada = state.ferramentas.find(f => f.id === ferramenta);
  const devolucao = acao === 'devolucao';
  const pessoas = state.equipe.filter(p => p.ativo !== false || p.id === pessoa).sort(porNome);
  const opcao = (valor, texto, escolhido) =>
    `<option value="${valor}"${escolhido ? ' selected' : ''}>${escapeHtml(texto)}</option>`;

  return `
    <form class="ferr-card ferr-form" data-form="movFerramenta">
      <h3>Nova movimentação</h3>
      <label class="field">
        <span>Item</span>
        <select name="ferramenta" required data-mov="ferramenta">
          ${opcao('', 'Escolha a ferramenta', !ferramenta)}
          ${ferramentasAtivas().map(f => opcao(f.id,
            `${rotuloFerramenta(f)}${f.comQuem ? ` (com ${nomeDaPessoa(f.comQuem.pessoaId, f.comQuem.nome)})` : ''}`,
            f.id === ferramenta)).join('')}
        </select>
      </label>
      <label class="field">
        <span>Marceneiro</span>
        <select name="pessoa" required data-mov="pessoa" ${devolucao && selecionada?.comQuem ? 'disabled' : ''}>
          ${opcao('', 'Quem está levando?', !pessoa)}
          ${pessoas.map(p => opcao(p.id, p.nome, p.id === pessoa)).join('')}
        </select>
      </label>
      <label class="field">
        <span>Ação</span>
        <select name="acao" data-mov="acao">
          ${opcao('retirada', 'Retirada', !devolucao)}
          ${opcao('devolucao', 'Devolução', devolucao)}
        </select>
      </label>
      <label class="field">
        <span>Observações</span>
        <input name="obs" data-mov="obs" data-manter-foco="obs-ferr" autocomplete="off" maxlength="80" placeholder="Ex: obra, motivo..." value="${escapeHtml(obs)}"
          ${devolucao ? 'disabled' : ''}>
      </label>
      <button class="btn btn-primary">${icon('plus')} Registrar</button>
    </form>`;
}

// Movimentações que contam (as excluídas ficam só no banco e no backup)
const movimentosAtivos = () => state.movimentos.filter(m => !m.excluido);
const movimentoDe = id => state.movimentos.find(m => m.id === id);

// Ferramenta fora há muitos dias aparece em vermelho e acende o número na chave inglesa
const DIAS_ALERTA = 7;
const diasFora = f => Math.floor((Date.now() - momento(f.comQuem.desde)) / 86400000);
const atrasada = f => Boolean(f.comQuem) && diasFora(f) >= DIAS_ALERTA;

// Histórico com o filtro da tela (marceneiro e busca), do mais recente para o mais antigo
function historicoFiltrado() {
  const termo = semAcento(state.ferrBusca.trim());
  return movimentosAtivos()
    .filter(m => !state.ferrPessoa || m.pessoaId === state.ferrPessoa)
    .map(m => ({ ...m, pessoa: nomeDaPessoa(m.pessoaId, m.pessoa) }))
    .filter(m => !termo || semAcento(`${m.pessoa} ${m.ferramenta} ${m.obs}`).includes(termo))
    .sort(porMaisRecente);
}

// "MAQ-09 · Serra circular Bosch" → código em negrito e nome ao lado
function itemHtml(texto) {
  const [codigo, ...resto] = texto.split(' · ');
  return resto.length ? `<b>${escapeHtml(codigo)}</b> <span class="muted">${escapeHtml(resto.join(' · '))}</span>` : escapeHtml(texto);
}

const tagAcao = m => (m.acao === 'retirada' ? '<span class="tag">Retirada</span>' : '<span class="tag tag-green">Devolução</span>');

// Chave inglesa no topo da tela inicial: o número é quantas estão fora (vermelho se alguma passou do prazo)
function botaoFerramentas() {
  const fora = ferramentasCarregadas() ? ferramentasEmUso() : [];
  const titulo = fora.length ? `Ferramentas: ${fora.length} fora da empresa` : 'Ferramentas';
  const numero = fora.length
    ? `<span class="badge${fora.some(atrasada) ? '' : ' badge-cinza'}">${fora.length}</span>` : '';
  return `<button class="icon-btn com-badge" data-action="abrir-ferramentas" title="${titulo}">${icon('tool')}${numero}</button>`;
}

// Fica separado para a busca atualizar só a tabela enquanto a pessoa digita
function historicoFerramentasHtml() {
  const lista = historicoFiltrado();
  const filtrando = state.ferrBusca.trim() || state.ferrPessoa;
  if (!lista.length) return `<p class="empty">${filtrando ? 'Nada encontrado.' : 'Nenhuma movimentação registrada ainda.'}</p>`;
  const LIMITE = 300; // o histórico completo fica na planilha de backup e no PDF
  const aviso = lista.length > LIMITE
    ? `<p class="busca-info">Mostrando as ${LIMITE} mais recentes de ${lista.length}. O PDF e a planilha de backup trazem todas.</p>` : '';
  return `${aviso}
    <div class="tabela-wrap">
      <table class="tabela">
        <thead><tr><th>Data/hora</th><th>Item</th><th>Marceneiro</th><th>Ação</th><th>Obs.</th><th></th></tr></thead>
        <tbody>
          ${lista.slice(0, LIMITE).map(m => `
            <tr class="clicavel" data-action="ver-movimento" data-id="${m.id}" title="Corrigir ou excluir">
              <td class="nowrap">${formatDataHora(m.criadoEm)}</td>
              <td>${itemHtml(m.ferramenta)}</td>
              <td>${escapeHtml(m.pessoa)}</td>
              <td>${tagAcao(m)}</td>
              <td class="muted">${escapeHtml(m.obs) || '-'}${m.alteracoes?.length ? ' <small>(corrigida)</small>' : ''}</td>
              <td class="tabela-icone">${icon('edit')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function abaMovimentacao() {
  const pessoas = [...state.equipe].sort(porNome);
  return `
    <div class="ferr-split">
      ${formMovimentacao()}
      <section>
        <div class="ferr-topo">
          <h3 class="ferr-titulo">Histórico de movimentações</h3>
          <button class="btn btn-ghost btn-sm" data-action="pdf-ferramentas">${icon('print')} PDF</button>
        </div>
        <div class="ferr-filtros">
          <select class="ferr-select" data-ferr-pessoa aria-label="Filtrar por marceneiro">
            <option value="">Todos os marceneiros</option>
            ${pessoas.map(p => `<option value="${p.id}"${p.id === state.ferrPessoa ? ' selected' : ''}>${escapeHtml(p.nome)}</option>`).join('')}
          </select>
          <label class="busca ferr-busca">
            ${icon('search')}
            <input type="search" data-busca-ferramentas data-manter-foco="busca-ferr" value="${escapeHtml(state.ferrBusca)}"
              placeholder="Buscar" autocomplete="off" aria-label="Buscar no histórico">
          </label>
        </div>
        <div id="ferr-historico">${historicoFerramentasHtml()}</div>
      </section>
    </div>`;
}

function abaPainelItens() {
  const ativas = ferramentasAtivas();
  const emUso = ativas.filter(f => f.comQuem).length;
  const desativadas = state.ferramentas.filter(f => f.ativo === false);
  // Tipo desconhecido (ou vazio) entra em "Outro", para nenhuma ferramenta sumir da lista
  const tipoDe = f => (TIPOS_FERRAMENTA.includes(f.tipo) ? f.tipo : 'Outro');
  const filtros = ['Todos', ...TIPOS_FERRAMENTA.filter(t => ativas.some(f => tipoDe(f) === t)), ...(desativadas.length ? ['Desativadas'] : [])];
  // "Marceneiros" fica junto dos filtros: troca a tabela de ferramentas pela lista de pessoas
  const verPessoas = state.ferrFiltro === 'Marceneiros';
  const filtro = filtros.includes(state.ferrFiltro) ? state.ferrFiltro : verPessoas ? '' : 'Todos';
  const lista = filtro === 'Desativadas' ? [...desativadas].sort(porCodigo)
    : ativas.filter(f => filtro === 'Todos' || tipoDe(f) === filtro);

  const status = f => {
    if (f.ativo === false) return '<span class="tag tag-cinza">Desativada</span>';
    if (!f.comQuem) return '<span class="tag tag-green">Disponível</span>';
    return atrasada(f) ? `<span class="tag tag-red">Fora há ${diasFora(f)} dias</span>` : '<span class="tag">Em uso</span>';
  };

  const linhas = lista.map(f => `
    <tr class="clicavel" data-action="editar-ferramenta" data-id="${f.id}" title="Editar">
      <td><b>${escapeHtml(f.codigo)}</b></td>
      <td>${escapeHtml(tipoDe(f))}</td>
      <td>${escapeHtml(f.nome)}</td>
      <td>${status(f)}</td>
      <td>${f.comQuem ? escapeHtml(nomeDaPessoa(f.comQuem.pessoaId, f.comQuem.nome)) : '-'}</td>
      <td class="nowrap ${atrasada(f) ? 'neg' : 'muted'}">${f.comQuem ? formatDataHora(f.comQuem.desde) : '-'}</td>
      <td class="tabela-acoes">
        ${f.comQuem && f.ativo !== false ? `<button class="btn btn-ghost btn-sm" data-action="devolver-ferramenta" data-id="${f.id}">Devolver</button>` : ''}
        ${icon('edit')}
      </td>
    </tr>`).join('');

  // Quem tem o mesmo nome de uma conta do Caixa aparece marcado
  const comConta = new Set(state.marceneiros.map(m => chaveCliente(m.nome)));
  const pessoas = [...state.equipe].sort((a, b) => (a.ativo === false) - (b.ativo === false) || porNome(a, b));
  const cartaoPessoa = p => {
    const qtd = ativas.filter(f => f.comQuem?.pessoaId === p.id).length;
    const selo = p.ativo === false ? '<span class="tag tag-cinza">Desativado</span>'
      : comConta.has(chaveCliente(p.nome)) ? '<span class="tag tag-green">Conta no Caixa</span>'
      : '<span class="tag tag-cinza">Sem conta no Caixa</span>';
    return `
      <button class="pessoa-card${p.ativo === false ? ' inativo' : ''}" data-action="editar-pessoa" data-id="${p.id}" title="Editar">
        <span class="avatar sm">${escapeHtml(initials(p.nome))}</span>
        <span class="painel-info">
          <strong class="truncate">${escapeHtml(p.nome)}</strong>
          <small>${selo}${qtd ? ` · ${qtd} em uso` : ''}</small>
        </span>
      </button>`;
  };

  return `
    <div class="painel-cards painel-cards-3">
      <div><small>Itens cadastrados</small><strong>${ativas.length}</strong></div>
      <div><small>Disponíveis</small><strong class="pos">${ativas.length - emUso}</strong></div>
      <div><small>Em uso</small><strong class="tone-amber">${emUso}</strong></div>
    </div>

    <div class="ferr-topo">
      <div class="chips">
        ${filtros.map(t => `<button type="button" class="chip${t === filtro ? ' active' : ''}" data-action="ferr-filtro" data-filtro="${t}">${t}</button>`).join('')}
        <span class="chips-divisor" aria-hidden="true"></span>
        <button type="button" class="chip${verPessoas ? ' active' : ''}" data-action="ferr-filtro" data-filtro="Marceneiros">
          Marceneiros <span class="chip-numero">${state.equipe.filter(p => p.ativo !== false).length}</span>
        </button>
      </div>
      ${verPessoas
        ? `<button class="btn btn-primary btn-sm" data-action="nova-pessoa">${icon('plus')} Adicionar pessoa</button>`
        : `<button class="btn btn-primary btn-sm" data-action="nova-ferramenta">${icon('plus')} Nova ferramenta</button>`}
    </div>

    ${verPessoas ? `
      <p class="hint ferr-dica">Não precisa ter conta no app. Toque no nome para editar.</p>
      ${pessoas.length ? `<div class="pessoas-grid">${pessoas.map(cartaoPessoa).join('')}</div>` : '<p class="empty">Ninguém cadastrado.</p>'}` : `
      <div class="tabela-wrap">
        <table class="tabela">
          <thead><tr><th>Código</th><th>Categoria</th><th>Item</th><th>Status</th><th>Com quem</th><th>Desde</th><th></th></tr></thead>
          <tbody>${linhas || '<tr><td colspan="7" class="empty">Nenhuma ferramenta aqui.</td></tr>'}</tbody>
        </table>
      </div>`}`;
}

function viewFerramentas() {
  const header = `
    <header class="topbar">
      <button class="icon-btn" data-action="back" title="Voltar">${icon('back')}</button>
      <div class="brand-center"><span>Ferramentas</span></div>
      <span class="icon-btn-espaco"></span>
    </header>`;

  if (!ferramentasCarregadas()) return `<div class="ferr">${header}<p class="empty">Carregando…</p></div>`;

  // Primeira vez: oferece cadastrar a lista da planilha
  if (!state.ferramentas.length && !state.equipe.length) {
    return `
      <div class="conta">
        ${header}
        <section class="ferr-inicio">
          <span class="qa-icon tone-amber">${icon('tool')}</span>
          <strong>Vamos começar</strong>
          <p class="hint">Cadastre de uma vez as ${LISTA_INICIAL.ferramentas.length} máquinas, ferramentas e brocas
            e os ${LISTA_INICIAL.nomes.length} nomes da equipe que estavam na planilha. Depois dá para editar tudo.</p>
          <button class="btn btn-primary btn-block" data-action="lista-inicial">Cadastrar lista da planilha</button>
          <button class="link" data-action="nova-ferramenta">Prefiro cadastrar uma por uma</button>
        </section>
      </div>`;
  }

  const ABAS = [['mov', 'Movimentação'], ['painel', 'Painel de itens']];
  return `
    <div class="ferr">
      ${header}
      <div class="segmented ferr-abas">
        ${ABAS.map(([id, rotulo]) => `<button type="button" class="${state.ferrAba === id ? 'active' : ''}" data-action="ferr-aba" data-aba="${id}">${rotulo}</button>`).join('')}
      </div>
      ${state.ferrAba === 'painel' ? abaPainelItens() : abaMovimentacao()}
    </div>`;
}

function abrirFerramenta(id = '') {
  const f = state.ferramentas.find(x => x.id === id);
  $('#ferramenta-titulo').textContent = f ? 'Editar ferramenta' : 'Nova ferramenta';
  const ativar = $('#ferramenta-ativar');
  ativar.hidden = !f;
  ativar.textContent = f?.ativo === false ? 'Reativar esta ferramenta' : 'Desativar esta ferramenta';
  openDialog('dlg-ferramenta', {
    ferramentaId: id,
    codigo: f?.codigo ?? '',
    nome: f?.nome ?? '',
    tipo: TIPOS_FERRAMENTA.includes(f?.tipo) ? f.tipo : f ? 'Outro' : TIPOS_FERRAMENTA[0],
  });
}

function abrirPessoa(id = '') {
  const p = pessoaDe(id);
  $('#pessoa-titulo').textContent = p ? 'Editar nome' : 'Adicionar pessoa';
  const ativar = $('#pessoa-ativar');
  ativar.hidden = !p;
  ativar.textContent = p?.ativo === false ? 'Reativar esta pessoa' : 'Desativar esta pessoa';
  openDialog('dlg-pessoa', { pessoaId: id, nome: p?.nome ?? '' });
}

// ---------- Correção do histórico ----------

const ultimoMovimento = ferramentaId => movimentosAtivos().filter(m => m.ferramentaId === ferramentaId).sort(porMaisRecente)[0];

// Janela para trocar a pessoa ou a observação de uma movimentação (ou excluir)
function abrirMovimento(id) {
  const m = movimentoDe(id);
  if (!m) return;
  const form = $('#dlg-movimento form');
  const pessoas = state.equipe.filter(p => p.ativo !== false || p.id === m.pessoaId).sort(porNome);
  form.elements.pessoa.innerHTML = pessoas.map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('');
  $('#movimento-resumo').innerHTML = `${m.acao === 'retirada' ? 'Retirada' : 'Devolução'} de <b>${escapeHtml(m.ferramenta)}</b> em ${formatDataHora(m.criadoEm)}`;
  $('#movimento-obs').hidden = m.acao !== 'retirada';
  const antes = (m.alteracoes ?? []).map(a =>
    `<li><b>Corrigida em ${formatMomento({ toDate: () => new Date(a.em) })}</b><br>Antes: ${escapeHtml(a.antes.pessoa)}${a.antes.obs ? ` · ${escapeHtml(a.antes.obs)}` : ''}</li>`).join('');
  $('#movimento-historico').innerHTML = antes;
  $('#movimento-historico').hidden = !antes;
  openDialog('dlg-movimento', { movId: m.id, pessoa: m.pessoaId, obs: m.obs || '' });
}

// O que muda na ferramenta ao excluir esta movimentação (undefined = nada)
function comQuemSemMovimento(m) {
  if (ultimoMovimento(m.ferramentaId)?.id !== m.id) return undefined; // só a última muda a situação de hoje
  const f = state.ferramentas.find(x => x.id === m.ferramentaId);
  if (m.acao === 'retirada') return f?.comQuem ? null : undefined; // a retirada some: volta para a empresa
  if (f?.comQuem) return undefined;
  // A devolução some: a ferramenta volta a ficar com quem fez a retirada anterior
  const anterior = movimentosAtivos()
    .filter(x => x.ferramentaId === m.ferramentaId && x.id !== m.id)
    .sort(porMaisRecente)[0];
  return anterior?.acao === 'retirada'
    ? { pessoaId: anterior.pessoaId, nome: anterior.pessoa, desde: anterior.criadoEm, obs: anterior.obs || '' }
    : undefined;
}

// ---------- Relatório de ferramentas em PDF ----------
// Usa o filtro da tela: um marceneiro (o que está com ele e tudo que pegou e devolveu) ou todos

async function imprimirFerramentas() {
  const p = pessoaDe(state.ferrPessoa);
  const lista = historicoFiltrado();
  const fora = ferramentasEmUso()
    .filter(f => !p || f.comQuem.pessoaId === p.id)
    .sort((a, b) => momento(a.comQuem.desde) - momento(b.comQuem.desde));
  const titulo = p ? `Ferramentas de ${p.nome}` : 'Controle de ferramentas';
  const rotuloFora = p ? 'Com ele agora' : 'Fora da empresa agora';
  const busca = state.ferrBusca.trim();
  const emitidoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  const linhasFora = fora.map(f => `
    <tr>
      <td>${escapeHtml(rotuloFerramenta(f))}</td>
      ${p ? '' : `<td>${escapeHtml(nomeDaPessoa(f.comQuem.pessoaId, f.comQuem.nome))}</td>`}
      <td>${formatDataHora(f.comQuem.desde)}</td>
      <td class="num${atrasada(f) ? ' neg' : ''}">${diasFora(f)}</td>
      <td>${escapeHtml(f.comQuem.obs || '')}</td>
    </tr>`).join('');
  const linhasHistorico = lista.map(m => `
    <tr>
      <td>${formatDataHora(m.criadoEm)}</td>
      <td>${escapeHtml(m.ferramenta)}</td>
      ${p ? '' : `<td>${escapeHtml(m.pessoa)}</td>`}
      <td>${m.acao === 'retirada' ? 'Retirada' : 'Devolução'}</td>
      <td>${escapeHtml(m.obs || '')}</td>
    </tr>`).join('');

  const area = $('#print-area');
  area.innerHTML = `
    <header class="pdf-topo">
      <img src="logo.png" alt="Nô Art Móveis">
      <div><h1>${escapeHtml(titulo)}</h1><p>Controle de ferramentas</p></div>
    </header>
    <section class="pdf-dados">
      <div><span>Marceneiro</span><strong>${p ? escapeHtml(p.nome) : 'Todos'}</strong></div>
      <div><span>Emitido em</span><strong>${emitidoEm}</strong></div>
      <div><span>${rotuloFora}</span><strong>${fora.length} ferramenta(s)</strong></div>
      <div><span>Movimentações${busca ? ` (busca: ${escapeHtml(busca)})` : ''}</span><strong>${lista.length}</strong></div>
    </section>

    <h2 class="pdf-subtitulo">${rotuloFora}</h2>
    <table class="pdf-tabela">
      <thead><tr><th>Ferramenta</th>${p ? '' : '<th>Com quem</th>'}<th>Desde</th><th class="num">Dias</th><th>Obra</th></tr></thead>
      <tbody>${linhasFora || `<tr><td colspan="${p ? 4 : 5}" class="pdf-vazio">Nenhuma ferramenta fora.</td></tr>`}</tbody>
    </table>

    <h2 class="pdf-subtitulo">Histórico</h2>
    <table class="pdf-tabela">
      <thead><tr><th>Data/hora</th><th>Ferramenta</th>${p ? '' : '<th>Marceneiro</th>'}<th>Ação</th><th>Obs.</th></tr></thead>
      <tbody>${linhasHistorico || `<tr><td colspan="${p ? 4 : 5}" class="pdf-vazio">Nenhuma movimentação.</td></tr>`}</tbody>
    </table>

    <p class="pdf-rodape">Nô Art Móveis · Documento gerado pelo Caixa dos Marceneiros</p>`;
  await area.querySelector('img').decode().catch(() => {}); // espera o logo carregar

  // O título vira o nome do arquivo ao salvar em PDF
  const tituloOriginal = document.title;
  document.title = `${titulo} - ${today()}`;
  window.addEventListener('afterprint', () => { document.title = tituloOriginal; }, { once: true });
  window.print();
}

// Parte de baixo do extrato (resumo, agendados e lista). Fica separada para a busca
// atualizar só ela enquanto a pessoa digita, sem tirar o foco do campo.
function extratoConteudo(m) {
  const todos = lancamentosDe(m.id);
  const { inicio, fim, tipo, cliente } = state.filtro;
  const hoje = today();
  const filtrar = passaNoFiltro(state.filtro);

  // Com busca: procura em todo o histórico (inclusive agendados), sem o resumo do período
  const termo = semAcento(state.busca);
  if (termo) {
    const achados = todos.filter(l => filtrar(l) && textoDeBusca(l).includes(termo));
    return `
      <p class="busca-info">${achados.length} resultado(s) em todo o histórico</p>
      ${extratoHtml(todos, achados, 'busca')}`;
  }

  // Agendados (data futura) aparecem sempre, à parte, e não entram nos totais
  const { aLiberar, aDescontar } = resumoConta(todos);
  const futuros = todos.filter(l => l.data > hoje && filtrar(l)).sort(porDataEHora);
  const doPeriodo = todos.filter(l => l.data <= hoje && (!inicio || l.data >= inicio) && (!fim || l.data <= fim));
  const entradas = doPeriodo.filter(l => l.tipo === 'credito').reduce((s, l) => s + l.valor, 0);
  const saidas = doPeriodo.filter(l => l.tipo === 'debito').reduce((s, l) => s + l.valor, 0);

  // Com cliente escolhido, o resumo vira o total de serviços dele no período (sem os estornados)
  const servicosCliente = cliente ? doPeriodo.filter(l => filtrar(l) && !l.estornado) : [];
  const resumo = cliente ? `
    <div class="period-summary period-summary-1">
      <div>
        <small>Serviços de ${escapeHtml(nomeDoCliente(todos, cliente))} no período</small>
        <strong class="pos">${formatMoney(servicosCliente.reduce((s, l) => s + l.valor, 0))}</strong>
        <span class="futuro neutro">${servicosCliente.length} serviço(s)</span>
      </div>
    </div>` : `
    <div class="period-summary">
      <div>
        <small>Entradas</small><strong class="pos">${formatMoney(entradas)}</strong>
        ${aLiberar ? `<span class="futuro">+ ${valorVisivel(aLiberar)} a liberar</span>` : ''}
      </div>
      <div>
        <small>Saídas</small><strong class="neg">${formatMoney(saidas)}</strong>
        ${aDescontar ? `<span class="futuro">− ${valorVisivel(aDescontar)} a descontar</span>` : ''}
      </div>
    </div>`;

  return `
    ${resumo}
    ${agendadosHtml(futuros)}
    ${extratoHtml(todos, doPeriodo.filter(filtrar), cliente ? 'cliente' : tipo)}`;
}

// Texto em que a busca procura: descrição, cliente e valor ("600" acha "R$ 600,00")
const textoDeBusca = l =>
  semAcento(`${l.desc} ${l.cliente || ''} ${formatMoney(l.valor)} ${l.valor.toFixed(2).replace('.', ',')}`);

// Bloco recolhível: a seta esconde a lista para o extrato aparecer logo
function agendadosHtml(futuros) {
  if (!futuros.length) return '';
  const aberto = state.agendadosAberto;
  return `
    <div class="day-group agendados${aberto ? '' : ' recolhido'}">
      <button class="day-head agendados-toggle" data-action="toggle-agendados" aria-expanded="${aberto}">
        <span>${icon('chevronDown')} Agendados (${futuros.length})</span>
        ${aberto ? '<span>Ainda não contam no saldo</span>' : ''}
      </button>
      ${aberto ? `<div class="day-list">${futuros.map(lancamentoHtml).join('')}</div>` : ''}
    </div>`;
}

function extratoHtml(todos, lancamentos, tipo) {
  const vazio = {
    todos: 'Nenhum lançamento neste período.',
    credito: 'Nenhuma entrada neste período.',
    debito: 'Nenhuma saída neste período.',
    cliente: 'Nenhum serviço deste cliente neste período.',
    busca: 'Nada encontrado. Tente outra palavra ou valor.',
  }[tipo];
  if (!lancamentos.length) return `<p class="empty">${vazio}</p>`;

  const saldoDoDia = saldosDiarios(todos);
  const porDia = new Map();
  [...lancamentos]
    .sort((a, b) => porDataEHora(b, a)) // mais recente primeiro, também dentro do mesmo dia
    .forEach(l => {
      if (!porDia.has(l.data)) porDia.set(l.data, []);
      porDia.get(l.data).push(l);
    });

  return [...porDia].map(([dia, itens]) => `
    <div class="day-group">
      <div class="day-head">
        <span>${formatDayHeader(dia)}</span>
        <span>Saldo do dia ${valorVisivel(saldoDoDia.get(dia))}</span>
      </div>
      <div class="day-list">${itens.map(lancamentoHtml).join('')}</div>
    </div>`).join('');
}

function lancamentoHtml(l) {
  const credito = l.tipo === 'credito';
  let detalhe = credito ? (l.cliente ? `Cliente: ${l.cliente}` : 'Serviço') : 'Retirada';
  if (l.data > today()) detalhe = `${credito ? 'Libera' : 'Desconta'} em ${formatDate(l.data)}`;
  if (l.estornoDe) detalhe = 'Estorno';
  if (l.estornado) detalhe = `Estornado em ${formatMomento(l.estornadoEm)}`;
  const classes = ['tx', l.data > today() && 'tx-future', l.estornado && 'tx-estornado'].filter(Boolean).join(' ');
  return `
    <button class="${classes}" data-action="ver-lancamento" data-id="${l.id}">
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
  pedidos: viewPedidos,
  painel: viewPainel,
  ferramentas: viewFerramentas,
};

function render() {
  // Se a pessoa está digitando na busca e chegam dados novos, o cursor continua no lugar
  const ativo = document.activeElement;
  const foco = ativo?.dataset?.manterFoco ? [ativo.dataset.manterFoco, ativo.selectionStart] : null;

  $('#app').innerHTML = VIEWS[state.screen]();

  if (foco) {
    const campo = document.querySelector(`[data-manter-foco="${foco[0]}"]`);
    campo?.focus();
    campo?.setSelectionRange(foco[1], foco[1]);
  }
}

// historico: 'push' cria uma entrada no navegador (o "voltar" volta para cá),
// 'replace' só troca o endereço, false não mexe (usado quando o próprio navegador mudou o endereço)
function go(screen, historico = 'push') {
  state.screen = screen;
  render();
  window.scrollTo(0, 0);
  if (historico) atualizarEndereco(historico === 'replace');
}

function openConta(id) {
  state.contaId = id;
  state.filtro = filtroInicial();
  state.busca = '';
  go('conta');
}

// ================= ENDEREÇOS (cada tela tem o seu) =================
// #ferramentas, #painel, #pedidos, #pedidos/<conta>, #conta/<conta>; a tela inicial fica sem nada.
// Assim dá para salvar nos favoritos, abrir numa aba separada e usar o "voltar" do navegador.

const TELAS_SEM_ENDERECO = ['carregando', 'config', 'login'];
let passosNoApp = 0; // quantas telas dá para voltar sem sair do app

function enderecoDaTela() {
  const { screen } = state;
  if (screen === 'ferramentas' || screen === 'painel') return `#${screen}`;
  if (screen === 'pedidos') return isAdmin() && state.pedidosDe ? `#pedidos/${state.pedidosDe}` : '#pedidos';
  if (screen === 'conta' && isAdmin()) return `#conta/${state.contaId}`;
  return '';
}

function atualizarEndereco(substituir) {
  // Na tela de login o endereço fica como está: depois de entrar, a pessoa cai na tela que pediu
  if (TELAS_SEM_ENDERECO.includes(state.screen)) return;
  const destino = enderecoDaTela();
  if (destino === location.hash) return;
  history[substituir ? 'replaceState' : 'pushState'](null, '', destino || location.pathname + location.search);
  if (!substituir) passosNoApp++;
}

// Abre a tela do endereço atual (ao entrar no app, ou quando o navegador volta ou avança)
function abrirEndereco(historico) {
  const [tela, id = null] = location.hash.slice(1).split('/');

  if (!isAdmin()) {
    // O marceneiro só tem a conta dele e os pedidos; qualquer outro endereço vira a conta
    if (tela === 'pedidos') {
      Object.assign(state, { pedidosDe: state.contaId, pedidosVolta: 'conta', pedidosAba: 'pendentes' });
      return go('pedidos', historico);
    }
    return go('conta', 'replace');
  }

  if (tela === 'ferramentas' || tela === 'painel') return go(tela, historico);
  if (tela === 'pedidos') {
    Object.assign(state, { pedidosDe: id, pedidosVolta: id ? 'conta' : 'admin', pedidosAba: 'pendentes' });
    if (id) state.contaId = id;
    return go('pedidos', historico);
  }
  if (tela === 'conta' && id) {
    if (state.contaId !== id) Object.assign(state, { contaId: id, filtro: filtroInicial(), busca: '' });
    return go('conta', historico);
  }
  go('admin', 'replace'); // endereço vazio ou desconhecido: tela inicial
}

window.addEventListener('popstate', () => {
  passosNoApp = Math.max(0, passosNoApp - 1);
  if (!state.user) return; // na tela de login, só guarda o endereço
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  abrirEndereco(false);
});

// Seta de voltar dentro do app: volta no histórico do navegador quando dá (assim os dois "voltar" combinam)
function voltar(telaSeNaoDer) {
  if (passosNoApp > 0) history.back();
  else go(telaSeNaoDer, 'replace');
}

// ================= LOGIN E DADOS AO VIVO =================

let pararEscutas = [];

function aoMudarLogin(user) {
  pararEscutas.forEach(parar => parar());
  pararEscutas = [];
  document.querySelectorAll('dialog[open]').forEach(d => d.close()); // nada fica aberto de outra sessão
  Object.assign(state, {
    user, marceneiros: [], lancamentos: [], pedidos: [], saldoOculto: false, filtro: filtroInicial(), busca: '',
    ferramentas: [], equipe: [], movimentos: [], ferrAba: 'mov', ferrBusca: '', ferrFiltro: 'Todos', ferrPessoa: '', ferrForm: formMovVazio(),
  });
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
  // Ferramentas: só o administrador carrega (o marceneiro nem tem permissão)
  if (user.role === 'admin') {
    pararEscutas.push(
      Store.watchFerramentas(user, lista => chegou('ferramentas', lista), erro),
      Store.watchEquipe(user, lista => chegou('equipe', lista), erro),
      Store.watchMovimentos(user, lista => chegou('movimentos', lista), erro),
    );
  }
  // Quem já ativou os avisos tem o aparelho atualizado a cada entrada
  if (globalThis.Notification?.permission === 'granted') Store.registrarAparelho(user).catch(console.warn);
  abrirEndereco('replace'); // cai na tela do endereço (ex.: #ferramentas) ou na tela inicial
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
    form.querySelectorAll('[data-sugestoes-cliente]').forEach(caixa => { caixa.innerHTML = ''; });
  }
  if (id === 'dlg-parcelado') updateParceladoPreview();
  if (id === 'dlg-servico') atualizarAgendaServico(form);
  dialog.showModal();
}

// Janela de confirmação no visual do app (no lugar do confirm() do navegador).
// Responde true só se a pessoa tocar no botão de confirmar.
let respostaConfirmacao = null;

function confirmar({ titulo, corpo, botao, tom = 'primary' }) {
  $('#confirmar-titulo').textContent = titulo;
  $('#confirmar-corpo').innerHTML = corpo;
  const ok = $('#confirmar-ok');
  ok.textContent = botao;
  ok.className = `btn btn-${tom}`;
  $('#dlg-confirmar').showModal();
  return new Promise(resolve => { respostaConfirmacao = resolve; });
}

function responderConfirmacao(sim) {
  $('#dlg-confirmar').close();
  respostaConfirmacao?.(sim);
  respostaConfirmacao = null;
}

const detalhesHtml = linhas => `
  <dl class="detail-list">
    ${linhas.map(([rotulo, valor]) => `<div><dt>${rotulo}</dt><dd>${escapeHtml(valor)}</dd></div>`).join('')}
  </dl>`;

// Serviço: "Liberar agora" ou "Agendar" (aí aparece a data de liberação)
function atualizarAgendaServico(form) {
  const agendar = form.elements.liberacao.value === 'agendar';
  const campo = form.elements.data;
  $('#servico-agenda').hidden = !agendar;
  campo.disabled = !agendar; // desativado, o navegador não confere a data de agendamento
  campo.min = addDays(today(), 1);
  if (agendar && campo.value <= today()) campo.value = addDays(today(), 1);
}

// Como era antes de cada edição, para o comprovante
const resumoVersao = v =>
  [formatMoney(v.valor), v.desc, v.cliente && `Cliente: ${v.cliente}`, formatDate(v.data)].filter(Boolean).join(' · ');

function openLancamento(id) {
  const m = contaAtual();
  const l = state.lancamentos.find(x => x.id === id);
  const credito = l.tipo === 'credito';
  const futuro = l.data > today();
  const original = l.estornoDe && state.lancamentos.find(x => x.id === l.estornoDe);

  const situacao = [
    ...(l.estornado ? [['Situação', `Estornado em ${formatMomento(l.estornadoEm)}`]] : []),
    ...(original ? [['Estorno de', `${original.desc} (${formatDate(original.data)})`]] : []),
  ];

  const historico = (l.alteracoes ?? []).map(a => `
    <li><b>Alterado em ${formatMomento({ toDate: () => new Date(a.em) })}</b><br>Antes: ${escapeHtml(resumoVersao(a.antes))}</li>`).join('');

  // Estornado e o próprio estorno não mudam mais; agendado se cancela em vez de estornar
  const podeMexer = isAdmin() && !l.estornado && !l.estornoDe;
  const botoes = podeMexer ? `
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-action="editar-lancamento" data-id="${l.id}">${icon('edit')} Editar</button>
      ${futuro
        ? `<button class="btn btn-danger" data-action="cancelar-agendado" data-id="${l.id}">Cancelar agendamento</button>`
        : `<button class="btn btn-danger" data-action="estornar-lancamento" data-id="${l.id}">Estornar</button>`}
    </div>` : '';

  $('#lancamento-body').innerHTML = `
    <div class="detail-amount ${credito ? 'pos' : 'neg'}${l.estornado ? ' riscado' : ''}">${credito ? '+' : '−'} ${formatMoney(l.valor)}</div>
    <p class="detail-type">${l.estornoDe ? 'Estorno' : credito ? 'Serviço' : 'Retirada'} (${credito ? 'entrada' : 'saída'})${futuro ? ' · Agendado' : ''}</p>
    ${detalhesHtml([
      [credito && futuro ? 'Libera em' : 'Data', formatDate(l.data)],
      ['Lançado em', formatMomento(l.criadoEm)],
      ['Descrição', l.desc],
      ...(l.cliente ? [['Cliente', l.cliente]] : []),
      ['Conta', m.nome],
      ...situacao,
    ])}
    ${historico ? `<ul class="historico">${historico}</ul>` : ''}
    ${botoes}`;

  $('#dlg-lancamento').showModal();
}

function openEditarLancamento(id) {
  const l = state.lancamentos.find(x => x.id === id);
  $('#dlg-lancamento').close();
  $('#editar-lanc-cliente').hidden = l.tipo !== 'credito';
  openDialog('dlg-editar-lancamento', {
    lancId: l.id,
    valor: maskMoneyInput(String(Math.round(l.valor * 100))),
    desc: l.desc,
    cliente: l.cliente || '',
    data: l.data,
  });
}

function updateParceladoPreview() {
  const form = $('#form-parcelado');
  const total = parseMoney(form.elements.total.value);
  const parcelas = parseInt(form.elements.parcelas.value, 10);
  $('#parcelado-preview').textContent = total > 0 && parcelas > 0
    ? `${parcelas}x de ${formatMoney(total / parcelas)}`
    : '';
}

// ================= ESCOLHA DE CLIENTE =================
// Janela com busca; cada cliente mostra quantos serviços e quanto já somou

function abrirClientes() {
  const busca = $('[data-busca-cliente]');
  busca.value = '';
  renderListaClientes('');
  $('#dlg-cliente').showModal();
}

function renderListaClientes(termo) {
  const todos = lancamentosDe(state.contaId);
  const atual = state.filtro.cliente;
  const procura = semAcento(termo);

  const item = (chave, titulo, detalhe, avatar) => `
    <button class="cliente-item${chave === atual ? ' escolhido' : ''}" data-action="escolher-cliente" data-cliente="${escapeHtml(chave)}">
      ${avatar}
      <span class="cliente-info"><strong class="truncate">${escapeHtml(titulo)}</strong><small>${detalhe}</small></span>
      ${chave === atual ? icon('check') : ''}
    </button>`;

  const clientes = clientesDe(todos)
    .filter(([chave]) => !procura || semAcento(chave).includes(procura))
    .map(([chave, nome]) => {
      const servicos = todos.filter(l => chaveCliente(l.cliente) === chave && !l.estornado);
      const total = servicos.reduce((s, l) => s + l.valor, 0);
      return item(chave, nome, `${servicos.length} serviço(s) · ${formatMoney(total)}`,
        `<span class="avatar sm">${escapeHtml(initials(nome))}</span>`);
    }).join('');

  const todosItem = procura ? '' : item('', 'Todos os clientes', 'Mostrar o extrato completo',
    `<span class="avatar sm avatar-icone">${icon('user')}</span>`);

  $('#lista-clientes').innerHTML = todosItem + (clientes || '<p class="empty">Nenhum cliente com esse nome.</p>');
}

// ================= SUGESTÃO DE CLIENTE =================
// Ao digitar o cliente de um serviço, mostra botões com os clientes já usados (de todos os marceneiros)

function sugerirClientes(campo) {
  const caixa = campo.parentElement.querySelector('[data-sugestoes-cliente]');
  const termo = semAcento(campo.value);
  // Some quando o nome digitado já é exatamente um cliente conhecido
  const nomes = termo
    ? clientesDe(state.lancamentos)
      .map(([, nome]) => nome)
      .filter(nome => semAcento(nome).includes(termo) && semAcento(nome) !== termo)
      .slice(0, 5)
    : [];
  caixa.innerHTML = nomes.map(nome =>
    `<button type="button" class="sugestao" data-action="usar-cliente" data-nome="${escapeHtml(nome)}">${icon('user')} ${escapeHtml(nome)}</button>`).join('');
}

// ================= CALENDÁRIO DE PERÍODO =================
// Usado para filtrar o extrato na tela (modo 'filtro') e para gerar o PDF (modo 'pdf').
// Toque no primeiro dia e depois no último para marcar o período.

let cal = { modo: 'filtro', mes: '', inicio: null, fim: null, tipo: 'todos', cliente: '' };

// modo: 'filtro' (extrato na tela), 'pdf' (extrato em PDF) ou 'painel' (painel geral)
function abrirPeriodo(modo) {
  const { inicio, fim, tipo, cliente } = modo === 'painel' ? { ...state.painel, tipo: 'todos', cliente: '' } : state.filtro;
  cal = { modo, inicio, fim, tipo, cliente, mes: (inicio ?? today()).slice(0, 7) };
  const nomeCliente = cliente && nomeDoCliente(lancamentosDe(state.contaId), cliente);
  $('#periodo-titulo').textContent = modo === 'painel' ? 'Período do painel'
    : modo === 'filtro' ? 'Período do extrato'
    : cliente ? `Serviços de ${nomeCliente} em PDF` : 'Extrato em PDF';
  $('#periodo-ok').textContent = modo === 'pdf' ? 'Gerar PDF' : 'Aplicar';
  // Na tela o filtro de tipo já fica no extrato; com cliente escolhido, são só serviços
  $('#periodo-tipo-campo').hidden = modo !== 'pdf' || Boolean(cliente);
  renderCalendario();
  $('#dlg-periodo').showModal();
}

function renderCalendario() {
  const { mes, inicio, fim } = cal;
  const [ano, numMes] = mes.split('-').map(Number);
  const vazios = new Date(ano, numMes - 1, 1).getDay();
  const diasNoMes = new Date(ano, numMes, 0).getDate();
  const hoje = today();

  let dias = '<span></span>'.repeat(vazios);
  for (let d = 1; d <= diasNoMes; d++) {
    const dia = `${mes}-${pad(d)}`;
    const classes = ['cal-dia'];
    if (dia === hoje) classes.push('hoje');
    if (inicio && fim && dia > inicio && dia < fim) classes.push('no-meio');
    if (dia === inicio || dia === fim) classes.push('marcado');
    dias += `<button type="button" class="${classes.join(' ')}" data-action="cal-dia" data-dia="${dia}">${d}</button>`;
  }

  const semana = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => `<span>${d}</span>`).join('');
  $('#calendario').innerHTML = `
    <div class="cal-topo">
      <button type="button" class="icon-btn sm" data-action="cal-mes" data-passo="-1" aria-label="Mês anterior">${icon('chevronLeft')}</button>
      <strong>${nomeDoMes(mes)}</strong>
      <button type="button" class="icon-btn sm" data-action="cal-mes" data-passo="1" aria-label="Próximo mês">${icon('chevronRight')}</button>
    </div>
    <div class="cal-semana">${semana}</div>
    <div class="cal-dias">${dias}</div>`;

  const mesAtual = esteMes();
  $('#periodo-resumo').textContent = !inicio ? 'Todo o histórico'
    : !fim ? `A partir de ${formatDate(inicio)} · toque no último dia`
    : `${formatDate(inicio)} a ${formatDate(fim)}`;
  document.querySelectorAll('[data-action="periodo-rapido"]').forEach(b => {
    const ativo = b.dataset.rapido === 'tudo'
      ? !inicio
      : inicio === mesAtual.inicio && fim === mesAtual.fim;
    b.classList.toggle('active', ativo);
  });
  $('#periodo-tipo').innerHTML = TIPOS.map(([id, rotulo]) =>
    `<button type="button" class="${cal.tipo === id ? 'active' : ''}" data-action="cal-tipo" data-tipo="${id}">${rotulo}</button>`).join('');
}

function mudarMesCalendario(passo) {
  const [ano, mes] = cal.mes.split('-').map(Number);
  cal.mes = toIso(new Date(ano, mes - 1 + passo, 1)).slice(0, 7);
  renderCalendario();
}

function escolherDia(dia) {
  if (!cal.inicio || cal.fim) {
    cal.inicio = dia;
    cal.fim = null;
  } else if (dia < cal.inicio) {
    [cal.inicio, cal.fim] = [dia, cal.inicio];
  } else {
    cal.fim = dia;
  }
  renderCalendario();
}

function confirmarPeriodo() {
  const inicio = cal.inicio;
  const fim = cal.inicio ? (cal.fim ?? cal.inicio) : null; // um dia só também vale
  $('#dlg-periodo').close();
  if (cal.modo === 'pdf') {
    // Espera a janela fechar para ela não sair na impressão
    setTimeout(() => imprimirExtrato(contaAtual(), inicio, fim, cal.tipo, cal.cliente), 150);
  } else if (cal.modo === 'painel') {
    state.painel = { inicio, fim };
    render();
  } else {
    state.filtro = { ...state.filtro, inicio, fim };
    render();
  }
}

// ================= EXTRATO EM PDF =================
// Monta uma página própria para impressão, só com as movimentações do período

const TITULO_PDF = { todos: 'Extrato de conta', credito: 'Relatório de entradas', debito: 'Relatório de saídas' };

const descricaoPdf = (l, extra = []) => {
  const detalhes = [l.cliente && `Cliente: ${l.cliente}`, l.estornado && 'Estornado', ...extra].filter(Boolean);
  return escapeHtml(l.desc) + detalhes.map(d => `<small>${escapeHtml(d)}</small>`).join('');
};

// Título do PDF (também vira o nome do arquivo)
function tituloPdf(m, tipo, cliente) {
  return cliente ? `Serviços de ${nomeDoCliente(lancamentosDe(m.id), cliente)}` : TITULO_PDF[tipo];
}

// tipo: 'todos' = extrato completo com saldo; 'credito'/'debito' = relatório só daquele tipo.
// cliente: relatório só com os serviços (entradas) desse cliente.
function extratoParaImpressao(m, inicio, fim, tipoEscolhido, cliente = '') {
  const hoje = today();
  const todos = lancamentosDe(m.id);
  const realizados = todos.filter(l => l.data <= hoje);
  const tipo = cliente ? 'credito' : tipoEscolhido; // serviços de cliente são sempre entradas
  const completo = tipo === 'todos';
  // No relatório só de entradas, saídas ou de um cliente, estornos ficam de fora
  // (senão o original e o estorno somariam juntos no total)
  const filtroTipo = passaNoFiltro({ tipo, cliente });
  const doTipo = completo ? filtroTipo : l => filtroTipo(l) && !l.estornado && !l.estornoDe;
  const doPeriodo = realizados.filter(l => l.data >= inicio && l.data <= fim).sort(porDataEHora);
  const entradas = doPeriodo.filter(l => l.tipo === 'credito').reduce((s, l) => s + l.valor, 0);
  const saidas = doPeriodo.filter(l => l.tipo === 'debito').reduce((s, l) => s + l.valor, 0);
  // Agendados só fazem sentido se o período chega até hoje
  const agendados = fim >= hoje ? todos.filter(l => l.data > hoje && doTipo(l)).sort(porDataEHora) : [];
  const colunas = completo ? 5 : 3;

  const saldoAnterior = saldoAte(realizados, addDays(inicio, -1));
  let saldo = saldoAnterior;
  const linhas = doPeriodo.filter(doTipo).map(l => {
    saldo += sinal(l) * l.valor;
    const credito = l.tipo === 'credito';
    const valores = completo
      ? `<td class="num pos">${credito ? formatMoney(l.valor) : ''}</td>
         <td class="num neg">${credito ? '' : formatMoney(l.valor)}</td>
         <td class="num">${formatMoney(saldo)}</td>`
      : `<td class="num ${credito ? 'pos' : 'neg'}">${formatMoney(l.valor)}</td>`;
    return `<tr><td>${formatDate(l.data)}</td><td>${descricaoPdf(l)}</td>${valores}</tr>`;
  }).join('');

  const filtrados = doPeriodo.filter(doTipo);
  const totalDoTipo = filtrados.reduce((s, l) => s + l.valor, 0);
  const rotuloTotal = cliente ? 'serviços' : tipo === 'credito' ? 'entradas' : 'saídas';
  const resumo = completo
    ? `<div><span>Saldo anterior</span><strong>${formatMoney(saldoAnterior)}</strong></div>
       <div><span>Entradas</span><strong class="pos">+ ${formatMoney(entradas)}</strong></div>
       <div><span>Saídas</span><strong class="neg">− ${formatMoney(saidas)}</strong></div>
       <div><span>Saldo final</span><strong>${formatMoney(saldo)}</strong></div>`
    : `<div><span>Total de ${rotuloTotal}</span>
         <strong class="${tipo === 'credito' ? 'pos' : 'neg'}">${formatMoney(totalDoTipo)}</strong></div>
       <div><span>${cliente ? 'Serviços' : 'Lançamentos'}</span><strong>${filtrados.length}</strong></div>`;

  const cabecalho = completo
    ? '<th>Data</th><th>Descrição</th><th class="num">Entrada</th><th class="num">Saída</th><th class="num">Saldo</th>'
    : `<th>Data</th><th>Descrição</th><th class="num">${tipo === 'credito' ? 'Entrada' : 'Saída'}</th>`;

  const saldoAnteriorLinha = completo ? `
    <tr class="pdf-saldo-anterior">
      <td>${formatDate(addDays(inicio, -1))}</td><td>Saldo anterior</td><td></td><td></td>
      <td class="num">${formatMoney(saldoAnterior)}</td>
    </tr>` : '';

  const rodapeTabela = completo
    ? `<td colspan="2">Totais do período</td>
       <td class="num pos">${formatMoney(entradas)}</td>
       <td class="num neg">${formatMoney(saidas)}</td>
       <td class="num">${formatMoney(saldo)}</td>`
    : `<td colspan="2">Total do período</td><td class="num">${formatMoney(totalDoTipo)}</td>`;

  const tabelaAgendados = agendados.length ? `
    <h2 class="pdf-subtitulo">Agendados <small>(ainda não contam no saldo)</small></h2>
    <table class="pdf-tabela pdf-agendados">
      <thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th></tr></thead>
      <tbody>
        ${agendados.map(l => {
          const credito = l.tipo === 'credito';
          return `<tr>
            <td>${formatDate(l.data)}</td>
            <td>${descricaoPdf(l, [credito ? 'Libera nesta data' : 'Desconta nesta data'])}</td>
            <td class="num ${credito ? 'pos' : 'neg'}">${credito ? '+' : '−'} ${formatMoney(l.valor)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '';

  const emitidoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return `
    <header class="pdf-topo">
      <img src="logo.png" alt="Nô Art Móveis">
      <div>
        <h1>${escapeHtml(tituloPdf(m, tipo, cliente))}</h1>
        <p>Caixa dos Marceneiros</p>
      </div>
    </header>

    <section class="pdf-dados">
      <div><span>Marceneiro</span><strong>${escapeHtml(m.nome)}</strong></div>
      <div><span>Período</span><strong>${formatDate(inicio)} a ${formatDate(fim)}</strong></div>
      <div><span>E-mail</span><strong>${escapeHtml(m.email)}</strong></div>
      <div><span>Emitido em</span><strong>${emitidoEm}</strong></div>
    </section>

    <section class="pdf-resumo${completo ? '' : ' pdf-resumo-2'}">${resumo}</section>

    <table class="pdf-tabela">
      <thead><tr>${cabecalho}</tr></thead>
      <tbody>
        ${saldoAnteriorLinha}
        ${linhas || `<tr><td colspan="${colunas}" class="pdf-vazio">Nenhuma movimentação no período.</td></tr>`}
      </tbody>
      <tfoot><tr>${rodapeTabela}</tr></tfoot>
    </table>

    ${tabelaAgendados}

    <p class="pdf-rodape">Nô Art Móveis · Documento gerado pelo Caixa dos Marceneiros</p>`;
}

async function imprimirExtrato(m, inicio, fim, tipo, cliente = '') {
  // "Todo o histórico": do primeiro lançamento até hoje (os agendados saem em tabela à parte)
  const datas = lancamentosDe(m.id).map(l => l.data).sort();
  inicio ??= [datas[0] ?? today(), today()].sort()[0];
  fim ??= today();

  const area = $('#print-area');
  area.innerHTML = extratoParaImpressao(m, inicio, fim, tipo, cliente);
  await area.querySelector('img').decode().catch(() => {}); // espera o logo carregar

  // O título vira o nome do arquivo ao salvar em PDF
  const tituloOriginal = document.title;
  document.title = `${tituloPdf(m, tipo, cliente)} - ${m.nome} - ${inicio} a ${fim}`;
  window.addEventListener('afterprint', () => { document.title = tituloOriginal; }, { once: true });
  window.print();
}

// ================= BACKUP EM PLANILHA =================
// Arquivo Excel com tudo: lançamentos (inclusive estornados e cancelados), pedidos e marceneiros.
// A biblioteca de planilhas só é baixada na hora de gerar o arquivo.

const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

const dataHora = timestamp => (timestamp ? formatMomento(timestamp) : '');

function situacaoLancamento(l) {
  if (l.cancelado) return `Cancelado em ${dataHora(l.canceladoEm)}`;
  if (l.estornado) return `Estornado em ${dataHora(l.estornadoEm)}`;
  if (l.estornoDe) return 'Estorno';
  if (l.data > today()) return 'Agendado';
  return 'Normal';
}

async function baixarBackup() {
  const XLSX = await import(SHEETJS_URL);
  const nomeDe = marcId => marceneiroDe(marcId)?.nome ?? '(conta excluída)';

  const lancamentos = [...state.lancamentos].sort(porDataEHora).map(l => ({
    Marceneiro: nomeDe(l.marcId),
    Data: formatDate(l.data),
    Tipo: l.tipo === 'credito' ? 'Entrada' : 'Saída',
    Descrição: l.desc,
    Cliente: l.cliente || '',
    Entrada: l.tipo === 'credito' ? l.valor : null,
    Saída: l.tipo === 'debito' ? l.valor : null,
    Situação: situacaoLancamento(l),
    'Lançado em': dataHora(l.criadoEm),
    Alterações: (l.alteracoes ?? [])
      .map(a => `${formatMomento({ toDate: () => new Date(a.em) })}: antes ${resumoVersao(a.antes)}`).join(' | '),
  }));

  const pedidos = [...state.pedidos].sort(porMaisRecente).map(p => ({
    Marceneiro: nomeDe(p.marcId),
    'Pedido em': dataHora(p.criadoEm),
    Valor: p.valor,
    Motivo: p.motivo || '',
    Situação: STATUS_PEDIDO[p.status][0],
    'Valor aprovado': p.status === 'aprovado' ? (p.valorAprovado ?? p.valor) : null,
    'Respondido em': dataHora(p.respondidoEm),
    Resposta: p.resposta || '',
  }));

  const marceneiros = [...state.marceneiros].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(m => {
    const { saldo, aLiberar, aDescontar } = resumoConta(lancamentosDe(m.id));
    return { Nome: m.nome, 'E-mail': m.email, 'Saldo atual': saldo, 'A liberar': aLiberar, 'A descontar': aDescontar };
  });

  const aba = (linhas, larguras, colunasDinheiro) => {
    const planilha = XLSX.utils.json_to_sheet(linhas);
    planilha['!cols'] = larguras.map(wch => ({ wch }));
    // Formato de dinheiro brasileiro nas colunas de valor
    const fim = XLSX.utils.decode_range(planilha['!ref']).e.r;
    colunasDinheiro.forEach(col => {
      for (let r = 1; r <= fim; r++) {
        const celula = planilha[XLSX.utils.encode_cell({ r, c: col })];
        if (celula && typeof celula.v === 'number') celula.z = '"R$" #,##0.00';
      }
    });
    return planilha;
  };

  const arquivo = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(arquivo, aba(lancamentos, [22, 12, 9, 34, 20, 13, 13, 26, 16, 50], [5, 6]), 'Lançamentos');
  XLSX.utils.book_append_sheet(arquivo, aba(pedidos, [22, 16, 13, 30, 12, 14, 16, 34], [2, 5]), 'Pedidos');
  XLSX.utils.book_append_sheet(arquivo, aba(marceneiros, [22, 30, 14, 14, 14], [2, 3, 4]), 'Marceneiros');

  // Controle de ferramentas (só entra se já tiver algo cadastrado)
  const ferramentas = [...state.ferramentas].sort(porCodigo).map(f => ({
    Código: f.codigo,
    Ferramenta: f.nome,
    Tipo: f.tipo || '',
    Situação: f.ativo === false ? 'Desativada' : f.comQuem ? 'Em uso' : 'Na empresa',
    'Com quem': f.comQuem ? nomeDaPessoa(f.comQuem.pessoaId, f.comQuem.nome) : '',
    Desde: f.comQuem ? dataHora(f.comQuem.desde) : '',
    Obra: f.comQuem?.obs || '',
  }));
  const movimentos = [...state.movimentos].sort(porMaisRecente).map(m => ({
    Quando: dataHora(m.criadoEm),
    Pessoa: nomeDaPessoa(m.pessoaId, m.pessoa),
    Ação: m.acao === 'retirada' ? 'Retirada' : 'Devolução',
    Ferramenta: m.ferramenta,
    Obra: m.obs || '',
    Situação: m.excluido ? `Excluída em ${dataHora(m.excluidoEm)}` : m.alteracoes?.length ? 'Corrigida' : 'Normal',
    Alterações: (m.alteracoes ?? [])
      .map(a => `${formatMomento({ toDate: () => new Date(a.em) })}: antes ${a.antes.pessoa}${a.antes.obs ? ` · ${a.antes.obs}` : ''}`).join(' | '),
  }));
  if (ferramentas.length) XLSX.utils.book_append_sheet(arquivo, aba(ferramentas, [10, 34, 12, 12, 18, 16, 26], []), 'Ferramentas');
  if (movimentos.length) XLSX.utils.book_append_sheet(arquivo, aba(movimentos, [16, 18, 11, 40, 26, 24, 50], []), 'Retiradas de ferramentas');
  XLSX.writeFile(arquivo, `Caixa Nô Art - backup ${today()}.xlsx`);
  toast('Planilha baixada. Guarde em um lugar seguro (Google Drive, por exemplo).');
}

// ================= PEDIDOS (admin responde) =================

// Abre a janela de resposta: aprovar (com valor, que pode ser menor) ou recusar, com mensagem opcional
function abrirResposta(id, aprovar) {
  if (!exigeInternet()) return;
  const p = state.pedidos.find(x => x.id === id);
  const m = marceneiroDe(p.marcId);
  const limite = limiteRetirada(lancamentosDe(m.id), today());
  if (aprovar && limite < 0.01) return fail('Saldo insuficiente para aprovar: a conta não tem saldo disponível.');

  const form = $('#dlg-responder form');
  const ok = $('#responder-ok');
  $('#responder-titulo').textContent = aprovar ? 'Aprovar retirada' : 'Recusar pedido';
  $('#responder-resumo').textContent = `${m.nome} pediu ${formatMoney(p.valor)}${p.motivo ? ` · ${p.motivo}` : ''}`;
  $('#responder-valor-campo').hidden = !aprovar;
  form.elements.valor.disabled = !aprovar; // desativado, o navegador não exige o valor na recusa
  $('#responder-disponivel').textContent = `Disponível na conta: ${formatMoney(limite)}. Dá para aprovar um valor menor que o pedido.`;
  $('#responder-msg-rotulo').textContent = aprovar ? 'Recado para o marceneiro (opcional)' : 'Motivo da recusa (opcional)';
  ok.textContent = aprovar ? 'Aprovar' : 'Recusar';
  ok.className = `btn btn-${aprovar ? 'green' : 'red'}`;

  openDialog('dlg-responder', {
    pedidoId: id,
    decisao: aprovar ? 'aprovar' : 'recusar',
    valor: maskMoneyInput(String(Math.round(Math.min(p.valor, limite) * 100))),
  });
}

// E-mail e notificação para o marceneiro com a resposta do pedido
function avisarResposta(p, m, aprovar, valor, resposta) {
  const parcial = aprovar && valor < p.valor - CENTAVO;
  const valorTexto = parcial ? `${formatMoney(valor)} (de ${formatMoney(p.valor)} pedidos)` : formatMoney(p.valor);
  avisar({
    email: {
      para: m.email,
      assunto: `Seu pedido de retirada foi ${aprovar ? 'aprovado' : 'recusado'}`,
      mensagem: `Olá, ${firstName(m.nome)}!\n\n`
        + `Seu pedido de retirada foi ${aprovar ? 'APROVADO' : 'RECUSADO'}: ${valorTexto}.\n`
        + (resposta ? `Mensagem do administrador: ${resposta}\n` : '')
        + (aprovar ? 'O valor já aparece no seu extrato.\n' : '')
        + `\nVer no app: ${SITE_URL}`,
    },
    push: {
      para: m.uid,
      titulo: aprovar ? 'Pedido aprovado ✅' : 'Pedido recusado',
      corpo: `Retirada ${aprovar ? 'aprovada' : 'recusada'}: ${valorTexto}.${resposta ? ` ${resposta}` : ''}`,
    },
  });
}

// Notificação no celular do marceneiro quando o administrador lança algo na conta dele
function avisarMarceneiro(m, titulo, corpo) {
  avisar({ push: { para: m.uid, titulo, corpo } });
}

// ================= AÇÕES (cliques) =================

const actions = {
  // Ao sair, o aparelho para de receber avisos dessa conta (sem travar se estiver sem internet)
  'logout': async () => {
    await Promise.race([Store.esquecerAparelho().catch(() => {}), new Promise(r => setTimeout(r, 3000))]);
    Store.logout();
  },
  'ativar-push': async () => {
    if (ehIphone && !appInstalado) {
      return fail('No iPhone, primeiro instale o app: Compartilhar ⬆ → "Adicionar à Tela de Início". Depois abra por lá.');
    }
    if (Notification.permission === 'denied') {
      return fail('Os avisos estão bloqueados neste navegador. Toque no cadeado ao lado do endereço e libere as notificações.');
    }
    if (!exigeInternet()) return;
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') {
      fail('Os avisos foram bloqueados. Dá para liberar nas configurações do navegador.');
    } else {
      try {
        await Store.registrarAparelho(state.user);
        toast('Pronto! Os avisos vão chegar neste aparelho.');
      } catch (err) {
        console.error(err);
        fail('Não foi possível ativar os avisos agora. Tente de novo mais tarde.');
      }
    }
    render();
  },
  'push-depois': () => {
    salvarPreferencia(AVISOS_DISPENSADO_KEY, '1');
    render();
  },
  'back': () => voltar('admin'),
  'ver-pedidos': el => {
    // Marceneiro sempre vê só os dele; admin vê de todos ou da conta aberta
    state.pedidosDe = isAdmin() ? (el.dataset.id ?? null) : state.contaId;
    state.pedidosVolta = state.screen;
    state.pedidosAba = 'pendentes';
    go('pedidos');
  },
  'pedidos-aba': el => {
    state.pedidosAba = el.dataset.aba;
    render();
  },
  'voltar-pedidos': () => voltar(state.pedidosVolta),
  'open-conta': el => openConta(el.dataset.id),
  'toggle-saldo': () => {
    state.saldoOculto = !state.saldoOculto;
    render();
  },
  'abrir-periodo': () => abrirPeriodo('filtro'),
  'abrir-periodo-painel': () => abrirPeriodo('painel'),
  'abrir-painel': () => {
    state.painel = esteMes();
    go('painel');
  },
  'abrir-ferramentas': () => {
    state.ferrAba = 'mov';
    state.ferrBusca = '';
    state.ferrPessoa = '';
    state.ferrForm = formMovVazio();
    go('ferramentas');
  },
  'ferr-aba': el => {
    state.ferrAba = el.dataset.aba;
    render();
  },
  'ferr-filtro': el => {
    state.ferrFiltro = el.dataset.filtro;
    render();
  },
  'pdf-ferramentas': () => imprimirFerramentas(),
  'ver-movimento': el => abrirMovimento(el.dataset.id),
  'excluir-movimento': async el => {
    if (!exigeInternet()) return;
    const m = movimentoDe($('#dlg-movimento form').elements.movId.value);
    el.closest('dialog').close();
    const comQuem = comQuemSemMovimento(m);
    const consequencia = comQuem === null ? '<p>A ferramenta volta a aparecer como <b>disponível</b> na empresa.</p>'
      : comQuem ? `<p>A ferramenta volta a ficar com <b>${escapeHtml(nomeDaPessoa(comQuem.pessoaId, comQuem.nome))}</b>.</p>` : '';
    const confirmado = await confirmar({
      titulo: 'Excluir movimentação',
      corpo: `<p>Excluir a ${m.acao === 'retirada' ? 'retirada' : 'devolução'} de <b>${escapeHtml(m.ferramenta)}</b>
        por <b>${escapeHtml(nomeDaPessoa(m.pessoaId, m.pessoa))}</b> (${formatDataHora(m.criadoEm)})?</p>
        ${consequencia}<p class="hint">Ela sai do histórico, mas continua guardada na planilha de backup.</p>`,
      botao: 'Excluir',
      tom: 'red',
    });
    if (!confirmado) return;
    try {
      await Store.excluirMovimento(m, comQuem);
      toast('Movimentação excluída.');
    } catch (err) {
      fail(mensagemErro(err));
    }
  },
  // Devolução direto pela linha do painel de itens
  'devolver-ferramenta': async el => {
    if (!exigeInternet()) return;
    const f = state.ferramentas.find(x => x.id === el.dataset.id);
    if (!f?.comQuem) return;
    const confirmado = await confirmar({
      titulo: 'Devolver ferramenta',
      corpo: `<p><b>${escapeHtml(nomeDaPessoa(f.comQuem.pessoaId, f.comQuem.nome))}</b> devolveu <b>${escapeHtml(rotuloFerramenta(f))}</b>?</p>`,
      botao: 'Confirmar devolução',
      tom: 'green',
    });
    if (!confirmado) return;
    try {
      await Store.devolverFerramenta(f);
      toast(`Devolução registrada: ${f.nome}.`);
    } catch (err) {
      fail(mensagemErro(err));
    }
  },
  'nova-ferramenta': () => abrirFerramenta(),
  'editar-ferramenta': el => abrirFerramenta(el.dataset.id),
  'ativar-ferramenta': async el => {
    if (!exigeInternet()) return;
    const f = state.ferramentas.find(x => x.id === $('#dlg-ferramenta form').elements.ferramentaId.value);
    const ativar = f.ativo === false;
    if (!ativar && f.comQuem) return fail('Essa ferramenta está em uso. Registre a devolução antes de desativar.');
    el.closest('dialog').close();
    try {
      await Store.updateFerramenta(f.id, { ativo: ativar });
      toast(ativar ? 'Ferramenta reativada.' : 'Ferramenta desativada. O histórico continua guardado.');
    } catch (err) {
      fail(mensagemErro(err));
    }
  },
  'nova-pessoa': () => abrirPessoa(),
  'editar-pessoa': el => abrirPessoa(el.dataset.id),
  'ativar-pessoa': async el => {
    if (!exigeInternet()) return;
    const p = pessoaDe($('#dlg-pessoa form').elements.pessoaId.value);
    const ativar = p.ativo === false;
    if (!ativar && ferramentasEmUso().some(f => f.comQuem.pessoaId === p.id)) {
      return fail(`${p.nome} ainda está com ferramenta. Registre a devolução antes de desativar.`);
    }
    el.closest('dialog').close();
    try {
      await Store.updatePessoa(p.id, { ativo: ativar });
      toast(ativar ? 'Pessoa reativada.' : 'Pessoa desativada. O histórico continua guardado.');
    } catch (err) {
      fail(mensagemErro(err));
    }
  },
  'lista-inicial': async el => {
    if (!exigeInternet()) return;
    el.disabled = true;
    try {
      await Store.cadastrarListaInicial(LISTA_INICIAL.ferramentas, LISTA_INICIAL.nomes);
      toast('Lista cadastrada!');
    } catch (err) {
      fail(mensagemErro(err));
    } finally {
      el.disabled = false;
    }
  },
  'imprimir': () => abrirPeriodo('pdf'),
  'periodo-rapido': el => {
    const { inicio, fim } = el.dataset.rapido === 'tudo' ? { inicio: null, fim: null } : esteMes();
    Object.assign(cal, { inicio, fim, mes: (inicio ?? today()).slice(0, 7) });
    renderCalendario();
  },
  'cal-mes': el => mudarMesCalendario(Number(el.dataset.passo)),
  'cal-dia': el => escolherDia(el.dataset.dia),
  'cal-tipo': el => {
    cal.tipo = el.dataset.tipo;
    renderCalendario();
  },
  'toggle-agendados': () => {
    state.agendadosAberto = !state.agendadosAberto;
    salvarPreferencia(AGENDADOS_KEY, state.agendadosAberto ? 'aberto' : 'fechado');
    render();
  },
  'abrir-clientes': abrirClientes,
  'usar-cliente': el => {
    const campo = el.closest('.field').querySelector('input[name="cliente"]');
    campo.value = el.dataset.nome;
    el.parentElement.innerHTML = '';
  },
  'escolher-cliente': el => {
    $('#dlg-cliente').close();
    state.filtro = { ...state.filtro, cliente: el.dataset.cliente };
    render();
  },
  'filtro-tipo': el => {
    state.filtro = { ...state.filtro, tipo: el.dataset.tipo };
    render();
  },
  'periodo-confirmar': confirmarPeriodo,

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
  'confirmar-sim': () => responderConfirmacao(true),
  'confirmar-nao': () => responderConfirmacao(false),
  'new-marceneiro': () => openDialog('dlg-marceneiro'),
  'edit-marceneiro': () => {
    const m = contaAtual();
    $('#editar-email').textContent = `E-mail de acesso: ${m.email}`;
    openDialog('dlg-editar', { nome: m.nome });
  },
  'reenviar-senha': async () => {
    if (!exigeInternet()) return;
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
  'aprovar-pedido': el => abrirResposta(el.dataset.id, true),
  'recusar-pedido': el => abrirResposta(el.dataset.id, false),

  'delete-marceneiro': async el => {
    if (!exigeInternet()) return;
    const m = contaAtual();
    el.closest('dialog').close();
    const confirmado = await confirmar({
      titulo: 'Excluir conta',
      corpo: `<p>Excluir a conta de <b>${escapeHtml(m.nome)}</b> com todo o histórico e os pedidos? Isso não pode ser desfeito.</p>`,
      botao: 'Excluir conta',
      tom: 'red',
    });
    if (!confirmado) return;
    try {
      await Store.removeMarceneiro(m);
      toast('Conta excluída.');
      go('admin');
    } catch (err) {
      fail(mensagemErro(err));
    }
  },
  'editar-lancamento': el => openEditarLancamento(el.dataset.id),

  // Estorno: o original fica riscado no extrato e entra o lançamento contrário com data de hoje
  'estornar-lancamento': async el => {
    if (!exigeInternet()) return;
    const l = state.lancamentos.find(x => x.id === el.dataset.id);
    const m = contaAtual();
    el.closest('dialog').close();
    // Estornar um serviço tira o dinheiro de volta: precisa ter saldo para isso
    if (l.tipo === 'credito') {
      const limite = limiteRetirada(lancamentosDe(m.id), today());
      if (l.valor > limite + CENTAVO) {
        return fail(`Saldo insuficiente para estornar este serviço. Disponível: ${formatMoney(limite)}.`);
      }
    }
    const confirmado = await confirmar({
      titulo: 'Estornar lançamento',
      corpo: `
        <div class="detail-amount ${l.tipo === 'credito' ? 'neg' : 'pos'}">${l.tipo === 'credito' ? '−' : '+'} ${formatMoney(l.valor)}</div>
        <p>O lançamento <b>${escapeHtml(l.desc)}</b> fica no extrato marcado como estornado,
        e entra um estorno com a data de hoje que desfaz o valor.</p>`,
      botao: 'Estornar',
      tom: 'red',
    });
    if (!confirmado) return;
    try {
      await Store.estornarLancamento(l, m, today());
      toast('Lançamento estornado.');
      avisarMarceneiro(m, 'Lançamento estornado',
        `${l.desc} · ${l.tipo === 'credito' ? '−' : '+'} ${formatMoney(l.valor)} (estorno)`);
    } catch (err) {
      fail(mensagemErro(err));
    }
  },

  'cancelar-agendado': async el => {
    if (!exigeInternet()) return;
    const l = state.lancamentos.find(x => x.id === el.dataset.id);
    el.closest('dialog').close();
    if (ficariaNegativoTrocando(lancamentosDe(l.marcId), l)) {
      return fail('Não dá para cancelar: sem esse valor, o saldo ficaria negativo nas parcelas futuras.');
    }
    const confirmado = await confirmar({
      titulo: 'Cancelar agendamento',
      corpo: `<p>Cancelar <b>${escapeHtml(l.desc)}</b> de <b>${formatMoney(l.valor)}</b> agendado para
        ${formatDate(l.data)}? Ele sai dos agendados, mas o registro fica guardado no backup.</p>`,
      botao: 'Cancelar agendamento',
      tom: 'red',
    });
    if (!confirmado) return;
    try {
      await Store.cancelarAgendado(l.id);
      toast('Agendamento cancelado.');
    } catch (err) {
      fail(mensagemErro(err));
    }
  },

  'baixar-backup': async el => {
    el.disabled = true;
    try {
      await baixarBackup();
    } catch (err) {
      console.error(err);
      fail('Não foi possível gerar a planilha. Verifique a internet e tente de novo.');
    } finally {
      el.disabled = false;
    }
  },
};

// ================= FORMULÁRIOS =================
// Cada função recebe os campos do formulário. Retornar false mantém a janela aberta.

const forms = {
  async responderPedido(f) {
    const p = state.pedidos.find(x => x.id === f.pedidoId.value);
    const m = marceneiroDe(p.marcId);
    const aprovar = f.decisao.value === 'aprovar';
    const resposta = f.resposta.value.trim();
    let valor = p.valor;

    if (aprovar) {
      valor = parseMoney(f.valor.value);
      if (!(valor > 0)) return fail('Informe o valor aprovado.');
      if (valor > p.valor + CENTAVO) return fail(`O valor aprovado não pode passar do pedido (${formatMoney(p.valor)}).`);
      const limite = limiteRetirada(lancamentosDe(m.id), today());
      if (valor > limite + CENTAVO) return fail(`Saldo insuficiente. Disponível: ${formatMoney(limite)}.`);
      await Store.aprovarPedido(p, m, today(), { valor, resposta });
      toast('Pedido aprovado e lançado no extrato.');
    } else {
      await Store.recusarPedido(p, resposta);
      toast('Pedido recusado.');
    }
    avisarResposta(p, m, aprovar, valor, resposta);
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

  // Agendado: o valor só entra no saldo disponível na data de liberação
  async servico(f) {
    const valor = parseMoney(f.valor.value);
    if (!(valor > 0)) return fail('Informe um valor maior que zero.');
    const agendado = f.liberacao.value === 'agendar';
    const data = agendado ? f.data.value : today();
    if (agendado && data <= today()) return fail('Para agendar, escolha uma data a partir de amanhã.');
    const desc = f.desc.value.trim();
    await Store.addLancamento(contaAtual(), { tipo: 'credito', data, desc, cliente: f.cliente.value.trim(), valor });
    toast(agendado ? `Serviço agendado: o valor libera em ${formatDate(data)}.` : 'Serviço lançado!');
    avisarMarceneiro(contaAtual(), agendado ? 'Serviço agendado' : 'Novo serviço lançado',
      `${desc} · + ${formatMoney(valor)}${agendado ? ` (libera em ${formatDate(data)})` : ''}`);
  },

  // Edição: confere o saldo com o valor novo e guarda como era antes
  async editarLancamento(f) {
    const l = state.lancamentos.find(x => x.id === f.lancId.value);
    const valor = parseMoney(f.valor.value);
    if (!(valor > 0)) return fail('Informe um valor maior que zero.');
    const novo = {
      valor,
      desc: f.desc.value.trim(),
      cliente: l.tipo === 'credito' ? f.cliente.value.trim() : '',
      data: f.data.value,
    };
    const mudou = novo.valor !== l.valor || novo.desc !== l.desc || novo.cliente !== (l.cliente || '') || novo.data !== l.data;
    if (!mudou) return; // nada a salvar: só fecha a janela
    if (ficariaNegativoTrocando(lancamentosDe(l.marcId), l, { ...l, ...novo })) {
      return fail('Com essa alteração o saldo ficaria negativo.');
    }
    await Store.editarLancamento(l, novo);
    toast('Lançamento alterado.');
  },

  async retirada(f) {
    const valor = parseMoney(f.valor.value);
    if (!(valor > 0)) return fail('Informe um valor maior que zero.');
    const limite = limiteRetirada(lancamentosDe(state.contaId), f.data.value);
    if (valor > limite + CENTAVO) {
      return fail(`Saldo insuficiente. Disponível para retirada nessa data: ${formatMoney(limite)}.`);
    }
    const obs = f.obs.value.trim();
    const desc = obs ? `${f.forma.value} - ${obs}` : f.forma.value;
    await Store.addLancamento(contaAtual(), { tipo: 'debito', data: f.data.value, desc, valor });
    toast('Retirada registrada!');
    avisarMarceneiro(contaAtual(), 'Retirada registrada', `${desc} · − ${formatMoney(valor)}`);
  },

  async parcelado(f) {
    const total = parseMoney(f.total.value);
    const parcelas = parseInt(f.parcelas.value, 10);
    if (!(total > 0)) return fail('Informe o valor total.');
    const novas = Store.dividirParcelas(total, parcelas, f.data.value).map(p => ({ ...p, tipo: 'debito' }));
    if (ficariaNegativo(lancamentosDe(state.contaId), novas)) {
      return fail('Saldo insuficiente: com essas parcelas o saldo ficaria negativo.');
    }
    const desc = f.desc.value.trim();
    await Store.addParcelado(contaAtual(), { desc, total, parcelas, dataInicio: f.data.value });
    toast(`${parcelas} parcela(s) gerada(s)!`);
    avisarMarceneiro(contaAtual(), 'Compra parcelada', `${desc} · ${parcelas}x de ${formatMoney(total / parcelas)}`);
  },

  // Correção de uma movimentação: troca a pessoa e/ou a observação
  async editarMovimento(f) {
    const m = movimentoDe(f.movId.value);
    const pessoa = pessoaDe(f.pessoa.value);
    if (!m || !pessoa) return fail('Escolha o marceneiro.');
    const obs = m.acao === 'retirada' ? f.obs.value.trim() : (m.obs || '');
    if (pessoa.id === m.pessoaId && obs === (m.obs || '')) return; // nada mudou: só fecha
    // Se é a retirada de agora, a ferramenta passa a constar com a pessoa certa
    const ferramenta = state.ferramentas.find(x => x.id === m.ferramentaId);
    const atual = m.acao === 'retirada' && ferramenta?.comQuem && ultimoMovimento(m.ferramentaId)?.id === m.id;
    const comQuem = atual ? { ...ferramenta.comQuem, pessoaId: pessoa.id, nome: pessoa.nome, obs } : undefined;
    await Store.editarMovimento(m, { pessoa, obs }, comQuem);
    toast('Movimentação corrigida.');
  },

  // Retirada ou devolução, pelo formulário da aba Movimentação
  async movFerramenta() {
    const { ferramenta: id, pessoa: pessoaId, acao, obs } = state.ferrForm;
    const ferramenta = state.ferramentas.find(x => x.id === id);
    if (!ferramenta) return fail('Escolha a ferramenta.');
    if (acao === 'retirada') {
      if (ferramenta.comQuem) {
        return fail(`Essa ferramenta já está com ${nomeDaPessoa(ferramenta.comQuem.pessoaId, ferramenta.comQuem.nome)}.`);
      }
      const pessoa = pessoaDe(pessoaId);
      if (!pessoa) return fail('Escolha o marceneiro.');
      await Store.retirarFerramenta(ferramenta, pessoa, obs.trim());
      toast(`Retirada registrada: ${ferramenta.nome} com ${pessoa.nome}.`);
    } else {
      if (!ferramenta.comQuem) return fail('Essa ferramenta não está em uso.');
      await Store.devolverFerramenta(ferramenta);
      toast(`Devolução registrada: ${ferramenta.nome}.`);
    }
    state.ferrForm = formMovVazio();
    render();
  },

  async ferramenta(f) {
    const id = f.ferramentaId.value;
    const dados = { codigo: f.codigo.value.trim().toUpperCase(), nome: f.nome.value.trim(), tipo: f.tipo.value };
    const repetido = state.ferramentas.find(x => x.id !== id && x.codigo.toUpperCase() === dados.codigo);
    if (repetido) return fail(`O código ${dados.codigo} já é de ${repetido.nome}.`);
    if (id) {
      await Store.updateFerramenta(id, dados);
      toast('Ferramenta atualizada.');
    } else {
      await Store.addFerramenta(dados);
      toast('Ferramenta cadastrada.');
    }
  },

  async pessoa(f) {
    const id = f.pessoaId.value;
    const nome = f.nome.value.trim();
    const repetido = state.equipe.find(p => p.id !== id && chaveCliente(p.nome) === chaveCliente(nome));
    if (repetido) return fail(`${repetido.nome} já está na lista.`);
    if (id) {
      await Store.updatePessoa(id, { nome });
      toast('Nome atualizado.');
    } else {
      await Store.addPessoa(nome);
      toast(`${nome} adicionado.`);
    }
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
      email: {
        assunto: `Pedido de retirada: ${m.nome} - ${formatMoney(valor)}`,
        mensagem: `${m.nome} pediu uma retirada de ${formatMoney(valor)}.\n`
          + `Motivo: ${motivo || 'não informado'}\n\n`
          + `Abra o Caixa dos Marceneiros para aprovar ou recusar: ${SITE_URL}`,
      },
      push: {
        para: 'admin',
        titulo: 'Novo pedido de retirada',
        corpo: `${m.nome} pediu ${formatMoney(valor)}${motivo ? ` · ${motivo}` : ''}`,
      },
    });
  },
};

// ================= EVENTOS =================

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el) actions[el.dataset.action]?.(el);
});

// Clicar fora da janela ou apertar Esc fecha (na confirmação, vale como "Cancelar")
document.querySelectorAll('dialog').forEach(dialog => {
  const fechar = () => (dialog.id === 'dlg-confirmar' ? responderConfirmacao(false) : dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) fechar(); });
  dialog.addEventListener('cancel', e => { e.preventDefault(); fechar(); });
});

document.addEventListener('submit', async e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  if (!exigeInternet()) return;

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
  if (e.target.matches('[data-busca-cliente]')) renderListaClientes(e.target.value);
  if (e.target.name === 'cliente' && e.target.form) sugerirClientes(e.target);
  if (e.target.matches('[data-busca-extrato]')) {
    state.busca = e.target.value;
    $('#extrato-conteudo').innerHTML = extratoConteudo(contaAtual());
  }
  if (e.target.matches('input[data-mov]')) state.ferrForm[e.target.dataset.mov] = e.target.value;
  if (e.target.matches('[data-busca-ferramentas]')) {
    state.ferrBusca = e.target.value;
    $('#ferr-historico').innerHTML = historicoFerramentasHtml();
  }
});

document.addEventListener('change', e => {
  if (e.target.name === 'liberacao') atualizarAgendaServico(e.target.form);
  // Formulário de movimentação de ferramentas: guarda a escolha e redesenha (a ação e o marceneiro acompanham a ferramenta)
  if (e.target.matches('select[data-mov]')) {
    const campo = e.target.dataset.mov;
    if (campo === 'ferramenta') escolherFerramentaMov(e.target.value);
    else state.ferrForm[campo] = e.target.value;
    if (campo !== 'pessoa') render();
  }
  if (e.target.matches('[data-ferr-pessoa]')) {
    state.ferrPessoa = e.target.value;
    $('#ferr-historico').innerHTML = historicoFerramentasHtml();
  }
});

// Aviso de "sem internet" no topo, que some sozinho quando a conexão volta
function atualizarAvisoOffline() {
  $('#offline').hidden = navigator.onLine;
}
window.addEventListener('online', atualizarAvisoOffline);
window.addEventListener('offline', atualizarAvisoOffline);

// ================= INÍCIO =================

atualizarAvisoOffline();

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
