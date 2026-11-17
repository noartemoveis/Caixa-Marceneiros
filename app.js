/* =========================================================
   Caixa dos Marceneiros — interface
   Os dados vêm do Store (store.js). Aqui ficam só telas e ações.
   Administrador: faz tudo. Marceneiro: só visualiza e pede retirada.
   ========================================================= */

import * as Store from './store.js';

const LEMBRAR_KEY = 'caixa_ultimo_email';
const AGENDADOS_KEY = 'caixa_agendados';
const AVISOS_DISPENSADO_KEY = 'caixa_avisos_dispensado';
const TEMA_KEY = 'caixa_tema'; // 'light', 'dark' ou vazio (segue o aparelho); lido também no index.html
const LETRA_KEY = 'caixa_letra'; // 'grande' ou vazio; lido também no index.html
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
  'auth/invalid-action-code': 'Esse link já foi usado ou venceu. Peça um link novo.',
  'auth/expired-action-code': 'Esse link venceu. Peça um link novo.',
  'auth/operation-not-allowed': 'A entrada sem senha ainda não foi ativada. Entre com a senha por enquanto.',
  'auth/unauthorized-continue-uri': 'A entrada sem senha ainda não foi ativada. Entre com a senha por enquanto.',
  'auth/quota-exceeded': 'Muitos links enviados hoje. Entre com a senha ou tente amanhã.',
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
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
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
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-9"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
};

const icon = name =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// ================= ESTADO =================

const state = {
  screen: 'carregando', // carregando | config | login | admin | conta | pedidos | painel | ferramentas
  user: null,           // { role: 'admin' | 'marceneiro', uid, email }
  loginModo: 'senha',   // senha | link (pede o e-mail) | link-enviado | link-confirmar (voltou pelo link em outro aparelho) | link-entrando
  marceneiros: [],
  lancamentos: [],
  pedidos: [],
  fechamentos: [],      // "Estou de acordo" de cada conta e mês
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
  parafSel: '',            // aba Parafusos: item escolhido, o que está digitado, a quantidade e a linha marcada na lista
  parafBusca: '',
  parafQtd: 100,
  parafAtivo: -1,
  parafModo: 'pesar',      // pesar (quanto a balança deve marcar) | contar (quantas peças tem pelo peso)
  parafPesos: [''],        // modo contar: o peso de cada pote (soma tudo)
  ferrFiltro: 'Todos',     // categoria no painel de itens
  ferrPessoa: '',          // marceneiro escolhido no histórico ('' = todos)
  ferrForm: { ferramenta: '', pessoa: '', acao: 'retirada', obs: '' }, // formulário de movimentação
  ferrPeriodo: { inicio: null, fim: null }, // período do histórico (ao abrir: os meses que vêm ao vivo)
  movimentosAntigos: [],   // movimentações de antes do período ao vivo, buscadas quando pedem
  historicoBuscado: new Set(), // períodos antigos já buscados
  historicoTodo: false,    // já buscou o histórico inteiro?
  carregandoHistorico: false,
  config: {},              // configurações do admin (ex.: config.ferramentas.prazos)
};

const COLECOES = ['marceneiros', 'lancamentos', 'pedidos', 'fechamentos'];
const COLECOES_FERRAMENTAS = ['ferramentas', 'equipe', 'movimentos', 'config'];

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

// Obras (ex.: "Cozinha"), do mesmo jeito que os clientes: [chave, nome para mostrar]
function obrasDe(lancamentos) {
  const nomes = new Map();
  lancamentos.forEach(l => {
    const chave = chaveCliente(l.obra);
    if (!chave) return;
    const nome = l.obra.trim();
    if (!nomes.has(chave) || capricho(nome) > capricho(nomes.get(chave))) nomes.set(chave, nome);
  });
  return [...nomes].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
}

// "Cliente: Ana · Obra: Cozinha" (o que tiver)
const clienteObra = l => [l.cliente && `Cliente: ${l.cliente}`, l.obra && `Obra: ${l.obra}`].filter(Boolean).join(' · ');

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
  if (!fim) return `Desde ${curta(inicio)}`; // sem fim: até hoje (histórico de ferramentas)
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

// Tema do app neste aparelho: Automático (como o celular/computador), Claro ou Escuro
const TEMAS = [['', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']];

function aplicarTema(tema) {
  if (tema) document.documentElement.dataset.theme = tema;
  else delete document.documentElement.dataset.theme;
}

// Letra grande neste aparelho (para quem enxerga pouco): aumenta a tela toda
const letraGrande = () => document.documentElement.dataset.letra === 'grande';

function aplicarLetra(grande) {
  if (grande) document.documentElement.dataset.letra = 'grande';
  else delete document.documentElement.dataset.letra;
}

// Botão "A+" no topo: o jeito mais fácil de achar
const botaoLetra = () => `
  <button class="icon-btn letra-btn" data-action="letra" data-letra="${letraGrande() ? '' : 'grande'}"
    title="${letraGrande() ? 'Letra normal' : 'Aumentar letra'}">${letraGrande() ? 'A−' : 'A+'}</button>`;

function seletorTema() {
  const atual = document.documentElement.dataset.theme || '';
  const grande = letraGrande();
  return `
    <section class="tema">
      <span>${icon('moon')} Aparência</span>
      <div class="segmented segmented-3">
        ${TEMAS.map(([id, rotulo]) => `<button type="button" class="${atual === id ? 'active' : ''}" data-action="tema" data-tema="${id}">${rotulo}</button>`).join('')}
      </div>
    </section>
    <section class="tema">
      <span>Tamanho da letra</span>
      <div class="segmented">
        <button type="button" class="${grande ? '' : 'active'}" data-action="letra" data-letra="">Normal</button>
        <button type="button" class="${grande ? 'active' : ''}" data-action="letra" data-letra="grande">Grande</button>
      </div>
    </section>`;
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
  const modo = state.loginModo;
  const letra = `
      <button class="link" data-action="letra" data-letra="${letraGrande() ? '' : 'grande'}">
        ${letraGrande() ? 'Voltar a letra normal' : 'A+ Aumentar a letra'}</button>`;

  if (modo === 'link-entrando') {
    return `<section class="login">${brandBlock()}<p class="empty">Entrando…</p></section>`;
  }
  if (modo === 'link-enviado') {
    return `
    <section class="login">
      ${brandBlock()}
      <div class="login-aviso">
        <span class="qa-icon tone-green">${icon('mail')}</span>
        <strong>Pronto! Olhe o seu e-mail</strong>
        <p>Mandamos um link para <b>${escapeHtml(state.loginEmailLink || '')}</b>.</p>
        <p>Abra o e-mail <b>neste celular</b> e toque no link. O app abre e você já entra, sem senha.</p>
        <p class="hint">Não chegou? Espere um minuto e olhe também na pasta de spam.</p>
      </div>
      <button class="link" data-action="login-link">Mandar o link de novo</button>
      <button class="link" data-action="login-senha">Entrar com senha</button>
      ${letra}
    </section>`;
  }
  if (modo === 'link' || modo === 'link-confirmar') {
    const confirmar = modo === 'link-confirmar';
    return `
    <section class="login">
      ${brandBlock()}
      <form class="login-form" data-form="${confirmar ? 'confirmarLink' : 'loginLink'}">
        <p class="login-explica">${confirmar
          ? 'Para terminar de entrar, digite o mesmo e-mail que recebeu o link.'
          : 'Digite seu e-mail. Vamos mandar um link: é só tocar nele para entrar, sem senha.'}</p>
        <label class="field">
          <span>E-mail</span>
          <input name="email" type="email" required autocomplete="username" autocapitalize="none" spellcheck="false"
            placeholder="seu@email.com" value="${escapeHtml(email)}" autofocus>
        </label>
        <button class="btn btn-primary btn-block">${confirmar ? 'Entrar' : 'Mandar o link'}</button>
      </form>
      <button class="link" data-action="login-senha">Entrar com senha</button>
      ${letra}
    </section>`;
  }
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
      <button class="btn btn-ghost btn-block login-sem-senha" data-action="login-link">${icon('mail')} Entrar sem senha (link no e-mail)</button>
      <button class="link" data-action="esqueci-senha">Esqueci minha senha</button>
      <button class="link" data-action="letra" data-letra="${letraGrande() ? '' : 'grande'}">
        ${letraGrande() ? 'Voltar a letra normal' : 'A+ Aumentar a letra'}</button>
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
    </section>

    ${seletorTema()}`;
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
          ${botaoLetra()}
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

      ${fechamentoHtml(m)}
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

      ${isAdmin() ? '' : seletorTema()}
    </div>`;
}

// ---------- Fechamento do mês ("Estou de acordo") ----------
// A partir do dia 1º, o marceneiro confere o extrato do mês que passou e confirma.
// Fica registrado para os dois lados; o administrador vê na conta se já foi confirmado.

function mesPassado() {
  const d = fromIso(today().slice(0, 8) + '01');
  d.setMonth(d.getMonth() - 1);
  return toIso(d).slice(0, 7);
}

const fechamentoDe = (marcId, mes) => state.fechamentos.find(f => f.marcId === marcId && f.mes === mes);

// Entradas e saídas do mês e o saldo no último dia (como no extrato completo)
function resumoDoMes(marcId, mes) {
  const inicio = `${mes}-01`;
  const fim = endOfMonth(inicio);
  const todos = lancamentosDe(marcId);
  const doMes = todos.filter(l => l.data >= inicio && l.data <= fim);
  const soma = tipo => doMes.filter(l => l.tipo === tipo).reduce((s, l) => s + l.valor, 0);
  return { mes, inicio, fim, entradas: soma('credito'), saidas: soma('debito'), saldoFinal: saldoAte(todos, fim), quantidade: doMes.length };
}

// Confirmado com outros valores = o escritório mexeu no mês depois da confirmação
const mudouDepois = (f, r) => ['entradas', 'saidas', 'saldoFinal'].some(campo => Math.abs(f[campo] - r[campo]) > CENTAVO);

function fechamentoHtml(m) {
  const mes = mesPassado();
  const f = fechamentoDe(m.id, mes);
  const r = resumoDoMes(m.id, mes);
  const nomeMes = nomeDoMes(mes);

  if (f) {
    const quando = formatMomento(f.confirmadoEm);
    const aviso = isAdmin() && mudouDepois(f, r) ? ' · <b>houve alteração no mês depois disso</b>' : '';
    return `<p class="fechamento-status ok">${icon('check')}
      <span>${isAdmin() ? 'Extrato' : 'Você confirmou o extrato'} de ${nomeMes} ${isAdmin() ? 'confirmado pelo marceneiro ' : ''}em ${quando}${aviso}</span></p>`;
  }
  if (!r.quantidade) return ''; // mês sem movimento: nada para conferir
  if (isAdmin()) {
    return `<p class="fechamento-status">${icon('clock')}<span>Extrato de ${nomeMes} ainda não confirmado pelo marceneiro.</span></p>`;
  }
  return `
    <div class="aviso-push fechamento">
      <span class="qa-icon tone-green">${icon('check')}</span>
      <div class="aviso-push-texto">
        <strong>Confira o extrato de ${nomeMes}</strong>
        <small>Veja se está tudo certo e toque em "Estou de acordo".</small>
      </div>
      <div class="aviso-push-acoes">
        <button class="btn btn-primary btn-sm" data-action="abrir-fechamento">Conferir</button>
      </div>
    </div>`;
}

function abrirFechamento() {
  const m = contaAtual();
  const r = resumoDoMes(m.id, mesPassado());
  $('#fechamento-titulo').textContent = `Extrato de ${nomeDoMes(r.mes)}`;
  $('#fechamento-resumo').innerHTML = `
    <div><span>Entradas</span><strong class="pos">+ ${formatMoney(r.entradas)}</strong></div>
    <div><span>Saídas</span><strong class="neg">− ${formatMoney(r.saidas)}</strong></div>
    <div><span>Saldo em ${formatDate(r.fim)}</span><strong>${formatMoney(r.saldoFinal)}</strong></div>`;
  openDialog('dlg-fechamento');
}

// Aviso para o administrador (notificação e e-mail)
function avisarFechamento(m, mes, deAcordo) {
  const nomeMes = nomeDoMes(mes);
  avisar({
    email: {
      assunto: deAcordo ? `${m.nome} confirmou o extrato de ${nomeMes}` : `${m.nome} tem dúvida no extrato de ${nomeMes}`,
      mensagem: deAcordo
        ? `${m.nome} conferiu o extrato de ${nomeMes} e tocou em "Estou de acordo".\n\nVer no app: ${SITE_URL}`
        : `${m.nome} conferiu o extrato de ${nomeMes} e tem uma dúvida. Converse com ele.\n\nVer no app: ${SITE_URL}`,
    },
    push: {
      para: 'admin',
      titulo: deAcordo ? 'Extrato confirmado ✅' : 'Dúvida no extrato',
      corpo: deAcordo ? `${m.nome} está de acordo com ${nomeMes}.` : `${m.nome} tem dúvida no extrato de ${nomeMes}. Converse com ele.`,
    },
  });
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
  const quemFez = lista => [...new Set(lista.map(l => marceneiroDe(l.marcId)?.nome).filter(Boolean))];
  const clientes = clientesDe(servicos).map(([chave, nome]) => {
    const doCliente = servicos.filter(l => chaveCliente(l.cliente) === chave);
    return { chave, nome, total: doCliente.reduce((s, l) => s + l.valor, 0), quantidade: doCliente.length, quem: quemFez(doCliente) };
  }).sort((a, b) => b.total - a.total);

  // Cada obra é do seu cliente ("Cozinha" da Ana é diferente de "Cozinha" do João)
  const obras = new Map();
  servicos.filter(l => chaveCliente(l.obra)).forEach(l => {
    const chave = `${chaveCliente(l.cliente)}|${chaveCliente(l.obra)}`;
    const o = obras.get(chave) ?? { chave, nome: l.obra.trim(), cliente: (l.cliente || '').trim(), lista: [] };
    o.lista.push(l);
    obras.set(chave, o);
  });
  const linhasObras = [...obras.values()]
    .map(o => ({ ...o, total: o.lista.reduce((s, l) => s + l.valor, 0) }))
    .sort((a, b) => b.total - a.total)
    .map(o => `
    <button class="painel-linha" data-action="ver-obra" data-obra="${escapeHtml(o.chave)}">
      <span class="avatar sm avatar-icone">${icon('tool')}</span>
      <span class="painel-info">
        <strong class="truncate">${escapeHtml(o.nome)}${o.cliente ? ` <span class="muted">· ${escapeHtml(o.cliente)}</span>` : ''}</strong>
        <small class="truncate">${o.lista.length} serviço(s) · ${escapeHtml(quemFez(o.lista).join(', '))}</small>
      </span>
      <span class="painel-valor pos">${formatMoney(o.total)}</span>
    </button>`).join('');

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
    <button class="painel-linha" data-action="ver-cliente-painel" data-cliente="${escapeHtml(c.chave)}">
      <span class="avatar sm">${escapeHtml(initials(c.nome))}</span>
      <span class="painel-info">
        <strong class="truncate">${escapeHtml(c.nome)}</strong>
        <small class="truncate">${c.quantidade} serviço(s) · ${escapeHtml(c.quem.join(', '))}</small>
      </span>
      <span class="painel-valor pos">${formatMoney(c.total)}</span>
    </button>`).join('');

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

      <div class="section-head"><h2>Por obra</h2></div>
      <div class="painel-lista">${linhasObras || '<p class="empty">Nenhum serviço com obra neste período. Preencha a obra ao lançar o serviço.</p>'}</div>
      <p class="hint painel-nota">Toque num cliente ou numa obra para ver quanto foi de mão de obra, de quem e cada serviço.</p>
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

// ---------- Manutenção e revisão ----------
// situacao: 'defeito' (separada, esperando conserto) ou 'assistencia' (fora, consertando).
// Em manutenção a ferramenta não pode ser retirada.

const SITUACOES = { defeito: ['Com defeito', 'tag-red'], assistencia: ['Na assistência', ''] };
const ferramentaDe = id => state.ferramentas.find(f => f.id === id);
const disponivel = f => f.ativo !== false && !f.comQuem && !f.situacao;
const tagSituacao = f => `<span class="tag ${SITUACOES[f.situacao][1]}">${SITUACOES[f.situacao][0]}</span>`;

// Revisão periódica: vence "revisaoMeses" meses depois da última revisão ou conserto (ou do cadastro)
function proximaRevisao(f) {
  if (!(Number(f.revisaoMeses) > 0)) return null;
  const d = new Date(momento(f.ultimaRevisao || f.criadoEm));
  d.setMonth(d.getMonth() + Number(f.revisaoMeses));
  return d;
}
const revisaoVencida = f => f.ativo !== false && proximaRevisao(f) !== null && proximaRevisao(f) <= new Date();

// ---------- Formulário de movimentação ----------
// Retirada: uma ou várias ferramentas para a mesma pessoa. Devolução: uma ou várias, com o estado (OK ou com defeito).
// Os valores ficam no estado para não sumirem quando chegam dados novos do banco e a tela é redesenhada.

const formMovVazio = (acao = 'retirada') => ({ acao, itens: [], pessoa: '', obs: '', estado: 'ok' });

// Itens que podem entrar na lista: na retirada, as disponíveis; na devolução, as que estão fora
const podeEntrar = (f, acao) => f.ativo !== false && (acao === 'devolucao' ? Boolean(f.comQuem) : disponivel(f));

function formMovimentacao() {
  const { acao, itens, pessoa, obs, estado } = state.ferrForm;
  const devolucao = acao === 'devolucao';
  const escolhidas = itens.map(ferramentaDe).filter(Boolean);
  const pessoas = state.equipe.filter(p => p.ativo !== false || p.id === pessoa).sort(porNome);
  const opcao = (valor, texto, escolhido, desligado) =>
    `<option value="${valor}"${escolhido ? ' selected' : ''}${desligado ? ' disabled' : ''}>${escapeHtml(texto)}</option>`;

  // Na lista de escolha aparecem todas; as que não servem para esta ação ficam apagadas, com o motivo
  const motivo = f => (f.comQuem ? `com ${nomeDaPessoa(f.comQuem.pessoaId, f.comQuem.nome)}`
    : f.situacao ? SITUACOES[f.situacao][0].toLowerCase() : 'na empresa');
  const opcoes = ferramentasAtivas().filter(f => !itens.includes(f.id)).map(f => {
    const serve = podeEntrar(f, acao);
    return opcao(f.id, `${rotuloFerramenta(f)}${serve && !devolucao ? '' : ` (${motivo(f)})`}`, false, !serve);
  }).join('');

  const lista = escolhidas.length ? `
    <ul class="mov-itens">
      ${escolhidas.map(f => `
        <li>
          <span>${itemHtml(rotuloFerramenta(f))}${devolucao && f.comQuem ? `<small>com ${escapeHtml(nomeDaPessoa(f.comQuem.pessoaId, f.comQuem.nome))}</small>` : ''}</span>
          <button type="button" class="icon-btn sm" data-action="mov-tirar" data-id="${f.id}" aria-label="Tirar da lista">✕</button>
        </li>`).join('')}
    </ul>` : '';

  const botaoAcao = (id, rotulo) =>
    `<button type="button" class="${acao === id ? 'active' : ''}" data-action="mov-acao" data-acao="${id}">${rotulo}</button>`;
  const botaoEstado = (id, rotulo) =>
    `<button type="button" class="${estado === id ? 'active' : ''}" data-action="mov-estado" data-estado="${id}">${rotulo}</button>`;
  const qtd = escolhidas.length;

  return `
    <form class="ferr-card ferr-form" data-form="movFerramenta">
      <h3>Nova movimentação</h3>
      <div class="segmented">${botaoAcao('retirada', 'Retirada')}${botaoAcao('devolucao', 'Devolução')}</div>
      <label class="field">
        <span>${devolucao ? 'Ferramentas devolvidas' : 'Ferramentas levadas'}${qtd ? ` (${qtd})` : ''}</span>
        <select data-mov="item" aria-label="Adicionar ferramenta">
          ${opcao('', qtd ? '+ Adicionar outra ferramenta' : 'Escolha a ferramenta', true)}
          ${opcoes}
        </select>
      </label>
      ${lista}
      ${devolucao ? `
        <div class="field">
          <span>Estado</span>
          <div class="segmented">${botaoEstado('ok', 'OK')}${botaoEstado('defeito', 'Com defeito')}</div>
        </div>
        <label class="field">
          <span>${estado === 'defeito' ? 'O que aconteceu?' : 'Observações'}</span>
          <input name="obs" data-mov="obs" data-manter-foco="obs-ferr" autocomplete="off" maxlength="80"
            placeholder="${estado === 'defeito' ? 'Ex: motor fazendo barulho' : 'Opcional'}" value="${escapeHtml(obs)}">
        </label>` : `
        <label class="field">
          <span>Marceneiro</span>
          <select name="pessoa" data-mov="pessoa">
            ${opcao('', 'Quem está levando?', !pessoa)}
            ${pessoas.map(p => opcao(p.id, p.nome, p.id === pessoa)).join('')}
          </select>
        </label>
        <label class="field">
          <span>Observações</span>
          <input name="obs" data-mov="obs" data-manter-foco="obs-ferr" autocomplete="off" maxlength="80" placeholder="Ex: obra, motivo..." value="${escapeHtml(obs)}">
        </label>`}
      <button class="btn btn-primary">${icon('plus')} Registrar ${devolucao ? 'devolução' : 'retirada'}${qtd > 1 ? ` (${qtd})` : ''}</button>
    </form>`;
}

// Escolheu uma ferramenta na lista: entra na movimentação (sem repetir)
function adicionarItemMov(id) {
  const f = ferramentaDe(id);
  const form = state.ferrForm;
  if (!f || form.itens.includes(id) || !podeEntrar(f, form.acao)) return;
  form.itens.push(id);
}

// ---------- Histórico: ao vivo só os últimos meses; o mais antigo vem quando pedem ----------

const MESES_AO_VIVO = 3;
// Primeiro dia do mês, MESES_AO_VIVO meses atrás (ex.: em 30/10 → 01/08)
function inicioAoVivo() {
  const hoje = new Date();
  return toIso(new Date(hoje.getFullYear(), hoje.getMonth() - (MESES_AO_VIVO - 1), 1));
}
const periodoPadraoHistorico = () => ({ inicio: inicioAoVivo(), fim: null });

// Movimentações carregadas: as ao vivo e as antigas buscadas (sem repetir; a ao vivo é a mais nova)
function todosMovimentos() {
  const porId = new Map(state.movimentosAntigos.map(m => [m.id, m]));
  state.movimentos.forEach(m => porId.set(m.id, m));
  return [...porId.values()];
}
// As excluídas ficam só no banco e no backup
const movimentosAtivos = () => todosMovimentos().filter(m => !m.excluido);
const movimentoDe = id => todosMovimentos().find(m => m.id === id);
const diaDoMovimento = m => toIso(momento(m.criadoEm));

// Se o período pedido começa antes do que está ao vivo, busca o que falta no banco (uma vez só)
async function garantirHistorico() {
  const { inicio, fim } = state.ferrPeriodo;
  if (inicio && inicio >= inicioAoVivo()) return;
  if (state.historicoTodo) return; // já buscou tudo
  const ate = fim && fim < inicioAoVivo() ? addDays(fim, 1) : inicioAoVivo();
  const chave = `${inicio || ''}|${ate}`;
  if (state.historicoBuscado.has(chave)) return;
  state.carregandoHistorico = true;
  render();
  try {
    const lista = await Store.buscarMovimentos(inicio ? new Date(inicio + 'T00:00:00') : null, new Date(ate + 'T00:00:00'));
    const antigos = new Map(state.movimentosAntigos.map(m => [m.id, m]));
    lista.forEach(m => antigos.set(m.id, m));
    state.movimentosAntigos = [...antigos.values()];
    state.historicoBuscado.add(chave);
    // Só conta como "tudo" se buscou do começo até o período ao vivo (com data final, ficou faltando o meio)
    if (!inicio && ate === inicioAoVivo()) state.historicoTodo = true;
  } catch (err) {
    console.error(err);
    fail(mensagemErro(err));
  } finally {
    state.carregandoHistorico = false;
    render();
  }
}

// ---------- Prazo de cada tipo de ferramenta ----------
// Passou do prazo: aparece em vermelho, acende o número na chave inglesa e entra no aviso diário

const PRAZO_PADRAO = 7;
// Chave de cada tipo no banco (sem "/" no nome do campo)
const CHAVE_TIPO = { 'Máquina': 'maquina', 'Ferramenta': 'ferramenta', 'Broca/Fresa': 'broca', 'Outro': 'outro' };
const prazoDoTipo = tipo => Number(state.config.ferramentas?.prazos?.[CHAVE_TIPO[tipo] ?? 'outro']) || PRAZO_PADRAO;
const prazoDe = f => prazoDoTipo(TIPOS_FERRAMENTA.includes(f.tipo) ? f.tipo : 'Outro');
const diasFora = f => Math.floor((Date.now() - momento(f.comQuem.desde)) / 86400000);
const atrasada = f => Boolean(f.comQuem) && diasFora(f) >= prazoDe(f);

// Histórico com o filtro da tela (período, marceneiro e busca), do mais recente para o mais antigo
function historicoFiltrado() {
  const termo = semAcento(state.ferrBusca.trim());
  const { inicio, fim } = state.ferrPeriodo;
  return movimentosAtivos()
    .filter(m => (!inicio || diaDoMovimento(m) >= inicio) && (!fim || diaDoMovimento(m) <= fim))
    .filter(m => !state.ferrPessoa || m.pessoaId === state.ferrPessoa)
    .map(m => ({ ...m, pessoa: nomeDaPessoa(m.pessoaId, m.pessoa) }))
    .filter(m => !termo || semAcento(`${m.pessoa} ${m.ferramenta} ${m.obs || ''}`).includes(termo))
    .sort(porMaisRecente);
}

// "MAQ-09 · Serra circular Bosch" → código em negrito e nome ao lado
function itemHtml(texto) {
  const [codigo, ...resto] = texto.split(' · ');
  return resto.length ? `<b>${escapeHtml(codigo)}</b> <span class="muted">${escapeHtml(resto.join(' · '))}</span>` : escapeHtml(texto);
}

// Nome e cor de cada tipo de movimentação (as de manutenção não têm pessoa)
const ACOES_MOV = {
  retirada: ['Retirada', ''],
  devolucao: ['Devolução', 'tag-green'],
  defeito: ['Com defeito', 'tag-red'],
  assistencia: ['Assistência', 'tag-cinza'],
  conserto: ['Consertada', 'tag-green'],
  revisao: ['Revisão', 'tag-cinza'],
};
const ehManutencao = m => !['retirada', 'devolucao'].includes(m.acao);
const textoAcao = m => (m.acao === 'devolucao' && m.estado === 'defeito' ? 'Devolução (com defeito)' : ACOES_MOV[m.acao]?.[0] ?? m.acao);
const tagAcao = m => {
  const defeito = m.acao === 'devolucao' && m.estado === 'defeito';
  return `<span class="tag ${defeito ? 'tag-red' : ACOES_MOV[m.acao]?.[1] ?? ''}">${textoAcao(m)}</span>`;
};

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
  if (state.carregandoHistorico) return '<p class="empty">Buscando o histórico desse período…</p>';
  const lista = historicoFiltrado();
  if (!lista.length) return '<p class="empty">Nenhuma movimentação neste período.</p>';
  const LIMITE = 300; // o histórico completo fica na planilha de backup e no PDF
  const aviso = lista.length > LIMITE
    ? `<p class="busca-info">Mostrando as ${LIMITE} mais recentes de ${lista.length}. O PDF e a planilha de backup trazem todas.</p>` : '';
  return `${aviso}
    <div class="tabela-wrap">
      <table class="tabela">
        <thead><tr><th>Data/hora</th><th>Item</th><th>Marceneiro</th><th>Ação</th><th>Obs.</th><th></th></tr></thead>
        <tbody>
          ${lista.slice(0, LIMITE).map(m => `
            <tr${ehManutencao(m) ? '' : ` class="clicavel" data-action="ver-movimento" data-id="${m.id}" title="Corrigir ou excluir"`}>
              <td class="nowrap">${formatDataHora(m.criadoEm)}</td>
              <td>${itemHtml(m.ferramenta)}</td>
              <td>${escapeHtml(m.pessoa) || '-'}</td>
              <td>${tagAcao(m)}</td>
              <td class="muted">${escapeHtml(m.obs) || '-'}${m.alteracoes?.length ? ' <small>(corrigida)</small>' : ''}</td>
              <td class="tabela-icone">${ehManutencao(m) ? '' : icon('edit')}</td>
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
          <button class="period-btn" data-action="abrir-periodo-ferr">${icon('calendar')} ${rotuloPeriodo(state.ferrPeriodo)}</button>
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
  // Manutenção: com defeito, na assistência ou com a revisão vencida
  const precisaManutencao = f => Boolean(f.situacao) || revisaoVencida(f);
  const emManutencao = ativas.filter(f => f.situacao).length;
  // Tipo desconhecido (ou vazio) entra em "Outro", para nenhuma ferramenta sumir da lista
  const tipoDe = f => (TIPOS_FERRAMENTA.includes(f.tipo) ? f.tipo : 'Outro');
  const filtros = ['Todos', ...TIPOS_FERRAMENTA.filter(t => ativas.some(f => tipoDe(f) === t)),
    ...(ativas.some(precisaManutencao) ? ['Manutenção'] : []), ...(desativadas.length ? ['Desativadas'] : [])];
  // "Marceneiros" fica junto dos filtros: troca a tabela de ferramentas pela lista de pessoas
  const verPessoas = state.ferrFiltro === 'Marceneiros';
  const filtro = filtros.includes(state.ferrFiltro) ? state.ferrFiltro : verPessoas ? '' : 'Todos';
  const lista = filtro === 'Desativadas' ? [...desativadas].sort(porCodigo)
    : filtro === 'Manutenção' ? ativas.filter(precisaManutencao)
    : ativas.filter(f => filtro === 'Todos' || tipoDe(f) === filtro);

  const status = f => {
    if (f.ativo === false) return '<span class="tag tag-cinza">Desativada</span>';
    if (f.situacao) return tagSituacao(f);
    if (!f.comQuem) return `<span class="tag tag-green">Disponível</span>${revisaoVencida(f) ? ' <span class="tag">Revisão vencida</span>' : ''}`;
    return atrasada(f) ? `<span class="tag tag-red" title="Prazo: ${prazoDe(f)} dias">Fora há ${diasFora(f)} dias</span>` : '<span class="tag">Em uso</span>';
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
    <div class="painel-cards">
      <div><small>Itens cadastrados</small><strong>${ativas.length}</strong></div>
      <div><small>Disponíveis</small><strong class="pos">${ativas.filter(disponivel).length}</strong></div>
      <div><small>Em uso</small><strong class="tone-amber">${emUso}</strong></div>
      <div><small>Em manutenção</small><strong class="${emManutencao ? 'neg' : ''}">${emManutencao}</strong></div>
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
        : `<div class="ferr-botoes">
            <button class="btn btn-ghost btn-sm" data-action="prazos" title="Dias até a ferramenta contar como atrasada">${icon('calendar')} Prazos</button>
            <button class="btn btn-primary btn-sm" data-action="nova-ferramenta">${icon('plus')} Nova ferramenta</button>
          </div>`}
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

// ---------- Relatório de uso ----------
// No período escolhido: quais ferramentas mais saem, quem mais pega, quanto tempo ficam fora,
// quais voltam com defeito e quais quase não saem (ajuda a decidir se vale comprar outra ou vender).

const DIA_MS = 86400000;
const formatDias = dias => (dias < 1 ? 'menos de 1 dia'
  : `${dias.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dia${dias >= 2 ? 's' : ''}`);

// Cada retirada feita no período, com quanto tempo ficou fora (até a devolução, ou até hoje se ainda está fora;
// sem passar do fim do período) e se voltou com defeito
function usosNoPeriodo() {
  const { inicio, fim } = state.ferrPeriodo;
  const desde = inicio ? new Date(`${inicio}T00:00:00`).getTime() : 0;
  const ate = Math.min(Date.now(), fim ? new Date(`${addDays(fim, 1)}T00:00:00`).getTime() : Infinity);
  const movs = movimentosAtivos().filter(m => !ehManutencao(m)).sort((a, b) => momento(a.criadoEm) - momento(b.criadoEm));

  const usos = [];
  const abertas = new Map(); // ferramenta → retirada ainda sem devolução
  for (const m of movs) {
    if (m.acao === 'retirada') {
      abertas.set(m.ferramentaId, m);
    } else if (abertas.has(m.ferramentaId)) {
      usos.push({ retirada: abertas.get(m.ferramentaId), volta: +momento(m.criadoEm), defeito: m.estado === 'defeito' });
      abertas.delete(m.ferramentaId);
    }
  }
  abertas.forEach(retirada => usos.push({ retirada, volta: Date.now(), defeito: false }));

  return usos
    .filter(u => +momento(u.retirada.criadoEm) >= desde && +momento(u.retirada.criadoEm) < ate)
    .map(u => ({ ...u, dias: Math.max(0, Math.min(u.volta, ate) - momento(u.retirada.criadoEm)) / DIA_MS }));
}

function abaRelatorio() {
  if (state.carregandoHistorico) return '<p class="empty">Buscando o histórico desse período…</p>';
  const usos = usosNoPeriodo();

  // Agrupa por uma chave e soma vezes, dias e defeitos
  const agrupar = chave => {
    const grupos = new Map();
    usos.forEach(u => {
      const k = chave(u);
      const g = grupos.get(k) ?? { vezes: 0, dias: 0, defeitos: 0, ferramentas: new Set(), u };
      g.vezes++;
      g.dias += u.dias;
      if (u.defeito) g.defeitos++;
      g.ferramentas.add(u.retirada.ferramentaId);
      grupos.set(k, g);
    });
    return [...grupos.entries()].sort(([, a], [, b]) => b.vezes - a.vezes || b.dias - a.dias);
  };

  const porFerramenta = agrupar(u => u.retirada.ferramentaId);
  const porPessoa = agrupar(u => u.retirada.pessoaId);
  const usadas = new Set(porFerramenta.map(([id]) => id));
  const paradas = ferramentasAtivas().filter(f => !usadas.has(f.id));

  const linhasFerramentas = porFerramenta.map(([id, g]) => `
    <tr>
      <td>${itemHtml(ferramentaDe(id) ? rotuloFerramenta(ferramentaDe(id)) : g.u.retirada.ferramenta)}</td>
      <td class="num">${g.vezes}</td>
      <td class="num nowrap">${formatDias(g.dias)}</td>
      <td class="num nowrap">${formatDias(g.dias / g.vezes)}</td>
      <td class="num${g.defeitos ? ' neg' : ' muted'}">${g.defeitos || '-'}</td>
    </tr>`).join('');

  const linhasPessoas = porPessoa.map(([id, g]) => `
    <tr>
      <td>${escapeHtml(nomeDaPessoa(id, g.u.retirada.pessoa))}</td>
      <td class="num">${g.vezes}</td>
      <td class="num">${g.ferramentas.size}</td>
      <td class="num nowrap">${formatDias(g.dias)}</td>
      <td class="num${g.defeitos ? ' neg' : ' muted'}">${g.defeitos || '-'}</td>
    </tr>`).join('');

  const totalDias = usos.reduce((t, u) => t + u.dias, 0);
  const tabela = (cabecalho, linhas, vazio) => (linhas ? `
    <div class="tabela-wrap"><table class="tabela"><thead><tr>${cabecalho}</tr></thead><tbody>${linhas}</tbody></table></div>`
    : `<p class="empty">${vazio}</p>`);

  return `
    <div class="ferr-topo">
      <button class="period-btn" data-action="abrir-periodo-ferr">${icon('calendar')} ${rotuloPeriodo(state.ferrPeriodo)}</button>
      <p class="hint">Conta as retiradas feitas no período.</p>
    </div>

    <div class="painel-cards">
      <div><small>Retiradas</small><strong>${usos.length}</strong></div>
      <div><small>Tempo fora (média)</small><strong>${usos.length ? formatDias(totalDias / usos.length) : '-'}</strong></div>
      <div><small>Voltaram com defeito</small><strong class="${usos.some(u => u.defeito) ? 'neg' : ''}">${usos.filter(u => u.defeito).length}</strong></div>
      <div><small>Não saíram</small><strong>${paradas.length}</strong></div>
    </div>

    <h3 class="ferr-titulo">Ferramentas que mais saem</h3>
    ${tabela('<th>Ferramenta</th><th class="num">Vezes</th><th class="num">Tempo fora</th><th class="num">Média por vez</th><th class="num">Defeitos</th>',
      linhasFerramentas, 'Nenhuma retirada neste período.')}

    <h3 class="ferr-titulo">Quem mais pega</h3>
    ${tabela('<th>Marceneiro</th><th class="num">Retiradas</th><th class="num">Ferramentas diferentes</th><th class="num">Tempo fora</th><th class="num">Devolveu com defeito</th>',
      linhasPessoas, 'Nenhuma retirada neste período.')}

    <h3 class="ferr-titulo">Não saíram neste período (${paradas.length})</h3>
    ${paradas.length
      ? `<div class="chips relatorio-paradas">${paradas.map(f => `<span class="chip">${escapeHtml(rotuloFerramenta(f))}</span>`).join('')}</div>`
      : '<p class="empty">Todas as ferramentas saíram pelo menos uma vez.</p>'}`;
}

// ---------- Peso dos parafusos ----------
// Escolhe o parafuso, diz quantas peças quer e o app mostra quanto a balança deve marcar.
// O peso de 1 peça vem de uma contagem: conta 50 a 100 peças à mão, pesa e divide.

const PARAFUSOS_INICIAIS = [
  {"nome": "Parafuso 3x30 Flange", "peso": 1.22, "amostra": 100},
  {"nome": "Parafuso 3,5x22 Chato", "peso": 1.12, "amostra": 100},
  {"nome": "Parafuso 3,5x40 Chato", "peso": 1.55, "amostra": 100},
  {"nome": "Parafuso 4x14 Panela", "peso": 1.13, "amostra": 100},
  {"nome": "Parafuso 4x16 Chato", "peso": 1.14, "amostra": 100},
  {"nome": "Parafuso 4x25 Chato", "peso": 1.3, "amostra": 100},
  {"nome": "Parafuso 4x25 Panela", "peso": 1.66, "amostra": 100},
  {"nome": "Parafuso 4x30 Chato", "peso": 1.34, "amostra": 100},
  {"nome": "Parafuso 4x35 Chato", "peso": 1.7, "amostra": 100},
  {"nome": "Parafuso 4x50 Chato Hafele", "peso": 3.18, "amostra": 100},
  {"nome": "Parafuso 4x50 Panela", "peso": 2.7313, "amostra": 67},
  {"nome": "Parafuso 4,2x13 Chato", "peso": 1.06, "amostra": 100},
  {"nome": "Parafuso 4,5x20 Chato", "peso": 1.35, "amostra": 100},
  {"nome": "Parafuso 4,5x40 Chato", "peso": 2.46, "amostra": 100},
  {"nome": "Parafuso 4,5x45 Panela", "peso": 3.19, "amostra": 100},
  {"nome": "Parafuso 4,5x60 Chato", "peso": 3.56, "amostra": 100},
  {"nome": "Parafuso 4,8x25 Chato", "peso": 2.59, "amostra": 100},
  {"nome": "Parafuso 5x25 Chato", "peso": 1.97, "amostra": 100},
  {"nome": "Parafuso 5x30 Chato", "peso": 2.52, "amostra": 100},
  {"nome": "Parafuso 5x35 Chato", "peso": 2.84, "amostra": 100},
  {"nome": "Parafuso 5x40 Chato", "peso": 3.32, "amostra": 100},
  {"nome": "Parafuso 5x50 Chato", "peso": 4, "amostra": 100},
  {"nome": "Parafuso 5x60 Chato", "peso": 4.02, "amostra": 100},
  {"nome": "Parafuso 5x65 Chato", "peso": 4.42, "amostra": 50},
  {"nome": "Parafuso 5x70 Chato", "peso": 4.6, "amostra": 100},
  {"nome": "Parafuso 5,5x60 Chato", "peso": 7.27, "amostra": 100},
  {"nome": "Parafuso 5,5x70 Panela", "peso": null, "amostra": null},
  {"nome": "Parafuso 6x60 Chato", "peso": 6.5, "amostra": 100},
  {"nome": "Parafuso 6x70 Chato", "peso": 7.55, "amostra": 100},
  {"nome": "Parafuso 6x90 Chato", "peso": 9.01, "amostra": 100},
  {"nome": "Parafuso 4x50 Chato", "peso": null, "amostra": null},
  {"nome": "Parafuso 4x40 Chato", "peso": null, "amostra": null},
  {"nome": "Parafuso 4,5x50 Chato", "peso": null, "amostra": null},
  {"nome": "Bucha Fix D8", "peso": 1.08, "amostra": 100},
  {"nome": "Bucha Fix D10", "peso": null, "amostra": null},
  {"nome": "Bucha Fix D6", "peso": 0.55, "amostra": 100}
];
const QTDS_RAPIDAS = [50, 100, 200, 500, 1000, 2000];

const normParaf = s => semAcento(String(s)).replace(/\./g, ',').replace(/[×*]/g, 'x');
const numero = (n, casas) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
function lerDecimal(txt) {
  const t = String(txt).trim().replace(/\s/g, '');
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  return Number(/^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t);
}

function parafusos() {
  return Object.entries(state.config.parafusos?.itens ?? {})
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
}
const parafusoSel = () => parafusos().find(p => p.id === state.parafSel);

// Cada palavra digitada precisa aparecer no nome; quem começa com ela vem primeiro
function filtrarParafusos() {
  const termos = normParaf(state.parafBusca).split(/\s+/).filter(Boolean);
  const todos = parafusos();
  if (!termos.length) return todos;
  const comeca = p => (termos.every(t => ` ${normParaf(p.nome)}`.includes(` ${t}`)) ? 0 : 1);
  return todos
    .filter(p => termos.every(t => normParaf(p.nome).includes(t)))
    .sort((a, b) => comeca(a) - comeca(b));
}

const pesoTexto = p => (p.peso ? `${numero(p.peso, 2)} g` : 'sem peso');

function parafListaHtml() {
  const lista = filtrarParafusos();
  if (!lista.length) return '<li class="paraf-nada">Nenhum item encontrado</li>';
  return lista.map((p, i) => `
    <li role="option" data-paraf-op="${p.id}" aria-selected="${i === state.parafAtivo}">
      <b>${escapeHtml(p.nome)}</b><small>${pesoTexto(p)}</small>
    </li>`).join('');
}

function parafResultadoHtml() {
  const p = parafusoSel();
  const qtd = parseInt(state.parafQtd, 10);
  if (!p) return '<div class="paraf-vazio">Escolha um parafuso para ver o peso.</div>';
  if (!p.peso) {
    return `
      <div class="paraf-aviso">
        <b>${escapeHtml(p.nome)} ainda não tem peso cadastrado</b>
        Conte de 50 a 100 peças à mão, pese e cadastre o peso para liberar este item.
        <button type="button" class="btn btn-sm btn-ghost" data-action="editar-parafuso" data-id="${p.id}">Cadastrar o peso</button>
      </div>`;
  }
  if (state.parafModo === 'contar') return contagemHtml(p);
  if (!(qtd > 0)) return '<div class="paraf-vazio">Digite a quantidade de peças.</div>';
  const gramas = qtd * p.peso;
  return `
    <div class="paraf-resultado">
      <small>Peso na balança</small>
      <strong>${numero(gramas, gramas < 1000 ? 1 : 0)}<span>g</span></strong>
      <p><b>${numero(qtd, 0)} un</b> de ${escapeHtml(p.nome)}${gramas >= 1000 ? ` · ${numero(gramas / 1000, 3)} kg` : ''}<br>
        1 peça = ${numero(p.peso, 3)} g${p.amostra ? ` (amostra de ${p.amostra} un)` : ''}</p>
      <hr>
      <p>Zere a balança com o recipiente em cima (tara) e coloque as peças até marcar esse valor.</p>
    </div>`;
}

// Modo "Quantas peças tem?": soma o peso de todos os potes e divide pelo peso de 1 peça
const pesosDigitados = () => state.parafPesos.map(lerDecimal).filter(g => g > 0);

function contagemHtml(p) {
  const pesos = pesosDigitados();
  const total = pesos.reduce((s, g) => s + g, 0);
  if (!(total > 0)) return '<div class="paraf-vazio">Digite o peso que a balança marcou.</div>';
  const pecas = Math.round(total / p.peso);
  const margem = Math.max(1, Math.round(pecas * 0.02));
  return `
    <div class="paraf-resultado">
      <small>Quantidade estimada</small>
      <strong>${numero(pecas, 0)}<span>peças</span></strong>
      <p><b>${numero(total, 1)} g</b>${pesos.length > 1 ? ` somando ${pesos.length} potes` : ''} de ${escapeHtml(p.nome)}<br>
        1 peça = ${numero(p.peso, 3)} g${p.amostra ? ` (amostra de ${p.amostra} un)` : ''}</p>
      <hr>
      <p>É uma estimativa: pode variar umas ${numero(margem, 0)} peças para mais ou para menos.</p>
    </div>`;
}

function camposPesar(qtd) {
  return `
        <label class="field">
          <span>Quantidade de peças</span>
          <input type="number" class="paraf-qtd" data-paraf-qtd data-manter-foco="paraf-qtd" inputmode="numeric" min="1" step="1"
            value="${escapeHtml(String(state.parafQtd))}">
        </label>
        <div class="chips paraf-chips">
          ${QTDS_RAPIDAS.map(q => `<button type="button" class="chip${q === qtd ? ' active' : ''}" data-action="paraf-qtd" data-q="${q}">${numero(q, 0)}</button>`).join('')}
        </div>`;
}

// Um campo por pote; o total soma todos
function camposContar() {
  const varios = state.parafPesos.length > 1;
  return `
        <div class="field">
          <span>${varios ? 'Peso de cada pote (g)' : 'Peso na balança (g)'}</span>
          <div class="paraf-potes">
            ${state.parafPesos.map((g, i) => `
              <div class="paraf-pote">
                ${varios ? `<small>Pote ${i + 1}</small>` : ''}
                <input class="paraf-qtd" data-paraf-peso="${i}" data-manter-foco="paraf-peso-${i}" inputmode="decimal" autocomplete="off"
                  maxlength="10" placeholder="Ex: 1.250" value="${escapeHtml(g)}">
                ${varios ? `<button type="button" class="icon-btn sm" data-action="paraf-pote-tirar" data-i="${i}" aria-label="Tirar o pote ${i + 1}">✕</button>` : ''}
              </div>`).join('')}
          </div>
          <small class="hint">Com o pote na balança, aperte a tara, coloque as peças e digite o peso.</small>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="paraf-pote-mais">${icon('plus')} Somar outro pote</button>`;
}

function abaParafusos() {
  const lista = parafusos();
  if (!lista.length) {
    return `
      <section class="ferr-inicio">
        <span class="qa-icon tone-amber">${icon('tool')}</span>
        <strong>Peso dos parafusos</strong>
        <p class="hint">Cadastre de uma vez os ${PARAFUSOS_INICIAIS.length} parafusos e buchas que já foram pesados.
          Depois dá para corrigir e incluir outros.</p>
        <button class="btn btn-primary btn-block" data-action="parafusos-iniciais">Cadastrar os ${PARAFUSOS_INICIAIS.length} itens</button>
        <button class="link" data-action="novo-parafuso">Prefiro cadastrar um por um</button>
      </section>`;
  }
  const qtd = parseInt(state.parafQtd, 10);
  const semPeso = lista.filter(p => !p.peso).length;
  const linhas = lista.map(p => `
    <tr class="clicavel" data-action="editar-parafuso" data-id="${p.id}" title="Editar">
      <td>${escapeHtml(p.nome)}</td>
      <td class="num nowrap">${p.peso ? `${numero(p.peso, 3)} g` : '<span class="tag tag-amber">sem peso</span>'}</td>
      <td class="num muted">${p.amostra ? `${p.amostra} un` : '-'}</td>
    </tr>`).join('');

  return `
    <div class="ferr-split paraf">
      <section class="ferr-card ferr-form">
        <div class="segmented paraf-modo">
          <button type="button" class="${state.parafModo === 'pesar' ? 'active' : ''}" data-action="paraf-modo" data-modo="pesar">Quanto pesar</button>
          <button type="button" class="${state.parafModo === 'contar' ? 'active' : ''}" data-action="paraf-modo" data-modo="contar">Contar pelo peso</button>
        </div>
        <div class="field paraf-campo">
          <span>Parafuso ou bucha</span>
          <input type="text" data-paraf-busca data-manter-foco="paraf-busca" role="combobox" aria-controls="paraf-lista"
            autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Digite ex.: 4x25, chato, 5x50…"
            value="${escapeHtml(state.parafBusca)}">
          <button type="button" class="paraf-limpar" data-action="paraf-limpar" aria-label="Limpar"${state.parafBusca ? '' : ' hidden'}>×</button>
          <ul class="paraf-lista" id="paraf-lista" role="listbox" hidden></ul>
        </div>
        ${state.parafModo === 'contar' ? camposContar() : camposPesar(qtd)}
        <div id="paraf-resultado" aria-live="polite">${parafResultadoHtml()}</div>
      </section>

      <div>
        <div class="ferr-topo">
          <h3 class="ferr-titulo">Pesos cadastrados (${lista.length})${semPeso ? ` <span class="tag tag-amber">${semPeso} sem peso</span>` : ''}</h3>
          <button class="btn btn-ghost btn-sm" data-action="novo-parafuso">${icon('plus')} Novo item</button>
        </div>
        <div class="tabela-wrap"><table class="tabela tabela-paraf">
          <thead><tr><th>Item</th><th class="num">1 peça</th><th class="num">Amostra</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>
        <p class="hint paraf-dica">Toque num item para corrigir o peso ou o nome.</p>
      </div>
    </div>`;
}

// Atualiza só o resultado e os botões de quantidade (sem redesenhar a tela, para não perder o que está digitando)
function atualizarParafuso() {
  const caixa = $('#paraf-resultado');
  if (!caixa) return;
  caixa.innerHTML = parafResultadoHtml();
  const qtd = parseInt(state.parafQtd, 10);
  document.querySelectorAll('[data-action="paraf-qtd"]').forEach(b => b.classList.toggle('active', +b.dataset.q === qtd));
  const limpar = $('.paraf-limpar');
  if (limpar) limpar.hidden = !state.parafBusca;
}

function mostrarListaParafusos() {
  const ul = $('#paraf-lista');
  if (!ul) return;
  ul.innerHTML = parafListaHtml();
  ul.hidden = false;
}

function esconderListaParafusos() {
  const ul = $('#paraf-lista');
  if (ul) ul.hidden = true;
  state.parafAtivo = -1;
}

function escolherParafuso(id) {
  const p = parafusos().find(x => x.id === id);
  if (!p) return;
  state.parafSel = p.id;
  state.parafBusca = p.nome;
  state.parafAtivo = -1;
  render();
  const qtd = $('[data-paraf-qtd]') ?? $('[data-paraf-peso]');
  qtd?.focus();
  qtd?.select();
  esconderListaParafusos(); // o redesenho devolveu o foco ao campo por um instante e reabriu a lista
}

function moverNaListaParafusos(passo) {
  const lista = filtrarParafusos();
  if (!lista.length) return;
  if ($('#paraf-lista')?.hidden) mostrarListaParafusos();
  state.parafAtivo = (state.parafAtivo + passo + lista.length) % lista.length;
  document.querySelectorAll('[data-paraf-op]').forEach((li, i) => li.setAttribute('aria-selected', String(i === state.parafAtivo)));
  document.querySelectorAll('[data-paraf-op]')[state.parafAtivo]?.scrollIntoView({ block: 'nearest' });
}

function abrirParafuso(id = '') {
  const p = parafusos().find(x => x.id === id);
  $('#parafuso-titulo').textContent = p ? 'Editar item' : 'Novo parafuso ou bucha';
  $('#parafuso-excluir').hidden = !p;
  openDialog('dlg-parafuso', {
    parafusoId: id,
    nome: p?.nome ?? '',
    amostra: p?.amostra ?? '',
    total: p?.peso && p?.amostra ? numero(Math.round(p.peso * p.amostra * 100) / 100, 2) : '',
  });
  atualizarCalculoParafuso();
}

// Mostra na hora o peso de 1 peça enquanto digita a contagem
function atualizarCalculoParafuso() {
  const f = $('#dlg-parafuso form').elements;
  const amostra = parseInt(f.amostra.value, 10);
  const total = lerDecimal(f.total.value);
  $('#parafuso-calculo').innerHTML = amostra > 0 && total > 0
    ? `1 peça = <b>${numero(total / amostra, 3)} g</b>`
    : 'Deixe vazio se ainda não pesou (o item fica como "sem peso").';
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

  const ABAS = [['mov', 'Movimentação'], ['painel', 'Painel de itens'], ['relatorio', 'Relatório'], ['parafusos', 'Parafusos']];
  const conteudo = { mov: abaMovimentacao, painel: abaPainelItens, relatorio: abaRelatorio, parafusos: abaParafusos }[state.ferrAba] ?? abaMovimentacao;
  return `
    <div class="ferr">
      ${header}
      <div class="segmented segmented-4 ferr-abas">
        ${ABAS.map(([id, rotulo]) => `<button type="button" class="${state.ferrAba === id ? 'active' : ''}" data-action="ferr-aba" data-aba="${id}">${rotulo}</button>`).join('')}
      </div>
      ${conteudo()}
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
    revisaoMeses: f?.revisaoMeses || '',
  });
  const manut = $('#ferramenta-manutencao');
  manut.innerHTML = f && f.ativo !== false ? manutencaoHtml(f) : '';
  manut.hidden = !manut.innerHTML;
}

// Parte "Manutenção" da janela da ferramenta: como ela está e os botões que fazem sentido agora
function manutencaoHtml(f) {
  const botao = (acao, rotulo, tom = 'ghost') =>
    `<button type="button" class="btn btn-${tom} btn-sm" data-action="manutencao" data-manut="${acao}">${rotulo}</button>`;
  const proxima = proximaRevisao(f);
  const revisao = proxima
    ? `<small class="${revisaoVencida(f) ? 'neg' : 'muted'}">Próxima revisão: ${proxima.toLocaleDateString('pt-BR')}${revisaoVencida(f) ? ' (vencida)' : ''}</small>` : '';
  const ultima = f.ultimaRevisao ? `<small class="muted">Última revisão ou conserto: ${formatDataHora(f.ultimaRevisao)}</small>` : '';

  let situacao;
  let botoes;
  if (f.comQuem) {
    situacao = `Está com ${escapeHtml(nomeDaPessoa(f.comQuem.pessoaId, f.comQuem.nome))}. Registre a devolução para mexer na manutenção.`;
    botoes = '';
  } else if (f.situacao) {
    situacao = `${tagSituacao(f)} desde ${formatDataHora(f.situacaoDesde)}${f.situacaoObs ? ` · ${escapeHtml(f.situacaoObs)}` : ''}`;
    botoes = (f.situacao === 'defeito' ? botao('assistencia', 'Enviar para assistência') : '') + botao('conserto', 'Voltou consertada', 'green');
  } else {
    situacao = '<span class="tag tag-green">Funcionando</span>';
    botoes = botao('defeito', 'Marcar com defeito') + botao('assistencia', 'Enviar para assistência')
      + (f.revisaoMeses ? botao('revisao', 'Revisão feita') : '');
  }
  return `
    <strong>Manutenção</strong>
    <p>${situacao}</p>
    ${ultima}${revisao}
    ${botoes ? `<div class="manutencao-botoes">${botoes}</div>` : ''}`;
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

// Movimentações da ferramenta direto do banco, da mais recente para a mais antiga
// (a retirada que importa pode ser de antes dos meses carregados na tela)
const historicoDaFerramenta = async ferramentaId =>
  (await Store.movimentosDaFerramenta(ferramentaId)).filter(m => !m.excluido && !ehManutencao(m)).sort(porMaisRecente);

// Uma movimentação antiga (buscada pelo filtro de data) não atualiza sozinha: aplica a correção na cópia da tela
function atualizarMovimentoAntigo(id, campos) {
  state.movimentosAntigos = state.movimentosAntigos.map(m => (m.id === id ? { ...m, ...campos } : m));
}

// Janela para trocar a pessoa ou a observação de uma movimentação (ou excluir)
function abrirMovimento(id) {
  const m = movimentoDe(id);
  if (!m) return;
  const form = $('#dlg-movimento form');
  const pessoas = state.equipe.filter(p => p.ativo !== false || p.id === m.pessoaId).sort(porNome);
  form.elements.pessoa.innerHTML = pessoas.map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('');
  $('#movimento-resumo').innerHTML = `${m.acao === 'retirada' ? 'Retirada' : 'Devolução'} de <b>${escapeHtml(m.ferramenta)}</b> em ${formatDataHora(m.criadoEm)}`;
  $('#movimento-obs').hidden = false; // retirada: a obra; devolução: o que aconteceu
  const antes = (m.alteracoes ?? []).map(a =>
    `<li><b>Corrigida em ${formatMomento({ toDate: () => new Date(a.em) })}</b><br>Antes: ${escapeHtml(a.antes.pessoa)}${a.antes.obs ? ` · ${escapeHtml(a.antes.obs)}` : ''}</li>`).join('');
  $('#movimento-historico').innerHTML = antes;
  $('#movimento-historico').hidden = !antes;
  openDialog('dlg-movimento', { movId: m.id, pessoa: m.pessoaId, obs: m.obs || '' });
}

// O que muda na ferramenta ao excluir esta movimentação (undefined = nada)
// daFerramenta: o historicoDaFerramenta() dela
function comQuemSemMovimento(m, daFerramenta) {
  if (daFerramenta[0]?.id !== m.id) return undefined; // só a última muda a situação de hoje
  const f = state.ferramentas.find(x => x.id === m.ferramentaId);
  if (m.acao === 'retirada') return f?.comQuem ? null : undefined; // a retirada some: volta para a empresa
  if (f?.comQuem) return undefined;
  // A devolução some: a ferramenta volta a ficar com quem fez a retirada anterior
  const anterior = daFerramenta.find(x => x.id !== m.id);
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
      ${p ? '' : `<td>${escapeHtml(m.pessoa) || '-'}</td>`}
      <td>${textoAcao(m)}</td>
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
      <div><span>Período</span><strong>${escapeHtml(rotuloPeriodo(state.ferrPeriodo))}</strong></div>
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
  semAcento(`${l.desc} ${l.cliente || ''} ${l.obra || ''} ${formatMoney(l.valor)} ${l.valor.toFixed(2).replace('.', ',')}`);

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
  let detalhe = credito ? (clienteObra(l) || 'Serviço') : 'Retirada';
  if (l.data > today()) detalhe = `${credito ? 'Libera' : 'Desconta'} em ${formatDate(l.data)}`;
  if (l.estornoDe) detalhe = 'Estorno';
  if (l.estornado) detalhe = `Estornado em ${formatMomento(l.estornadoEm)}`;
  const classes = ['tx', l.data > today() && 'tx-future', l.estornado && 'tx-estornado'].filter(Boolean).join(' ');
  return `
    <button class="${classes}" data-action="ver-lancamento" data-id="${l.id}">
      <span class="tx-icon ${credito ? 'in' : 'out'}">${icon(credito ? 'arrowUp' : 'arrowDown')}</span>
      <span class="tx-info">
        <strong>${escapeHtml(l.desc)}</strong>
        <small>${escapeHtml(detalhe)}${l.temFoto ? ` <span class="tx-foto" title="Tem foto do comprovante">${icon('camera')}</span>` : ''}</small>
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
    if (foco[1] != null) campo?.setSelectionRange(foco[1], foco[1]); // campo de número não tem cursor
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
  fecharJanelas();
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
  fecharJanelas(); // nada fica aberto de outra sessão
  Object.assign(state, {
    user, marceneiros: [], lancamentos: [], pedidos: [], fechamentos: [], saldoOculto: false, filtro: filtroInicial(), busca: '',
    ferramentas: [], equipe: [], movimentos: [], ferrAba: 'mov', ferrBusca: '', ferrFiltro: 'Todos', ferrPessoa: '', ferrForm: formMovVazio(), parafSel: '', parafBusca: '', parafQtd: 100, parafAtivo: -1, parafModo: 'pesar', parafPesos: [''],
    ferrPeriodo: periodoPadraoHistorico(), movimentosAntigos: [], historicoBuscado: new Set(), historicoTodo: false,
    carregandoHistorico: false, config: {},
  });
  state.carregados.clear();

  if (!user) {
    if (state.loginModo === 'link-entrando') return; // está entrando pelo link: espera o login chegar
    go('login');
    return;
  }

  state.loginModo = 'senha'; // da próxima vez, a tela de entrada volta ao normal
  lembrarEmail(user.email);
  const erro = err => {
    console.error(err);
    toast(mensagemErro(err), 'error');
  };
  pararEscutas = [
    Store.watchMarceneiros(user, lista => chegou('marceneiros', lista), erro),
    Store.watchLancamentos(user, lista => chegou('lancamentos', lista), erro),
    Store.watchPedidos(user, lista => chegou('pedidos', lista), erro),
    Store.watchFechamentos(user, lista => chegou('fechamentos', lista), erro),
  ];
  // Ferramentas: só o administrador carrega (o marceneiro nem tem permissão)
  if (user.role === 'admin') {
    pararEscutas.push(
      Store.watchFerramentas(user, lista => chegou('ferramentas', lista), erro),
      Store.watchEquipe(user, lista => chegou('equipe', lista), erro),
      // Ao vivo só os últimos meses; o resto o filtro de data busca quando precisar
      Store.watchMovimentos(new Date(inicioAoVivo() + 'T00:00:00'), lista => chegou('movimentos', lista), erro),
      Store.watchConfig(user, lista => chegou('config', Object.fromEntries(lista.map(({ id, ...dados }) => [id, dados]))), erro),
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
    form.querySelectorAll('[data-sugestoes-cliente], [data-sugestoes-obra]').forEach(caixa => { caixa.innerHTML = ''; });
    limparFotos(form);
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

// Fecha tudo o que estiver aberto; a confirmação fechada assim vale como "Cancelar"
// (senão a ação que esperava a resposta ficaria parada para sempre)
function fecharJanelas() {
  document.querySelectorAll('dialog[open]').forEach(d => (d.id === 'dlg-confirmar' ? responderConfirmacao(false) : d.close()));
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
  [formatMoney(v.valor), v.desc, v.cliente && `Cliente: ${v.cliente}`, v.obra && `Obra: ${v.obra}`, formatDate(v.data)].filter(Boolean).join(' · ');

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

  // Foto do comprovante: todos veem; só o administrador anexa, troca ou tira
  const botoesFoto = isAdmin() && !l.estornoDe ? `
      <div class="foto-botoes">
        <label class="btn btn-ghost btn-sm">
          <input type="file" accept="image/*" data-anexar-foto="${l.id}" hidden>${icon('camera')} ${l.temFoto ? 'Trocar a foto' : 'Anexar foto do comprovante'}
        </label>
        ${l.temFoto ? `<button class="btn btn-link-danger btn-sm" data-action="remover-foto" data-id="${l.id}">Tirar a foto</button>` : ''}
      </div>` : '';
  const fotoHtml = `
    ${l.temFoto ? `<div class="comprovante-foto" id="comprovante-foto" data-id="${l.id}"><p class="hint">Carregando a foto…</p></div>` : ''}
    ${botoesFoto}`;
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
      ...(l.obra ? [['Obra', l.obra]] : []),
      ['Conta', m.nome],
      ...situacao,
    ])}
    ${fotoHtml}
    ${historico ? `<ul class="historico">${historico}</ul>` : ''}
    ${botoes}`;

  $('#dlg-lancamento').showModal();
  if (l.temFoto) mostrarFotoDoLancamento(l.id);
}

function openEditarLancamento(id) {
  const l = state.lancamentos.find(x => x.id === id);
  $('#dlg-lancamento').close();
  $('#editar-lanc-cliente').hidden = l.tipo !== 'credito';
  $('#editar-lanc-obra').hidden = l.tipo !== 'credito';
  openDialog('dlg-editar-lancamento', {
    lancId: l.id,
    valor: maskMoneyInput(String(Math.round(l.valor * 100))),
    desc: l.desc,
    cliente: l.cliente || '',
    obra: l.obra || '',
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

// ================= MÃO DE OBRA POR CLIENTE E POR OBRA =================
// No painel geral, tocar num cliente ou numa obra mostra quanto foi pago, para quem e cada serviço

function servicosDoPainel() {
  const { inicio, fim } = state.painel;
  const hoje = today();
  return state.lancamentos.filter(l => l.tipo === 'credito' && !l.cancelado && !l.estornado && !l.estornoDe && l.data <= hoje
    && (!inicio || l.data >= inicio) && (!fim || l.data <= fim));
}

function abrirMaoDeObra({ cliente = null, obra = null }) {
  let lista = servicosDoPainel();
  let titulo;
  let subtitulo;
  if (obra) {
    const [chaveCli, chaveObra] = obra.split('|');
    lista = lista.filter(l => chaveCliente(l.cliente) === chaveCli && chaveCliente(l.obra) === chaveObra);
    if (!lista.length) return;
    titulo = `Obra: ${obrasDe(lista)[0][1]}`;
    subtitulo = chaveCli ? `Cliente: ${nomeDoCliente(lista, chaveCli)}` : 'Sem cliente informado';
  } else {
    lista = lista.filter(l => chaveCliente(l.cliente) === cliente);
    if (!lista.length) return;
    titulo = `Cliente: ${nomeDoCliente(lista, cliente)}`;
    subtitulo = 'Mão de obra de todas as obras deste cliente';
  }
  lista.sort((a, b) => b.data.localeCompare(a.data));
  const total = lista.reduce((s, l) => s + l.valor, 0);

  const somarPor = chave => {
    const grupos = new Map();
    lista.forEach(l => {
      const k = chave(l);
      grupos.set(k, (grupos.get(k) ?? 0) + l.valor);
    });
    return [...grupos].sort((a, b) => b[1] - a[1]);
  };
  const porMarceneiro = somarPor(l => marceneiroDe(l.marcId)?.nome ?? '(conta excluída)');
  const porObra = obra ? [] : somarPor(l => (l.obra || '').trim() || 'Sem obra informada');
  const linhas = pares => detalhesHtml(pares.map(([nome, valor]) => [escapeHtml(nome), formatMoney(valor)]));

  $('#obra-titulo').textContent = titulo;
  $('#obra-subtitulo').textContent = subtitulo;
  $('#obra-body').innerHTML = `
    <div class="detail-amount pos">${formatMoney(total)}</div>
    <p class="detail-type">${lista.length} serviço(s) · ${escapeHtml(rotuloPeriodo(state.painel))}</p>
    <h4 class="obra-secao">Por marceneiro</h4>
    ${linhas(porMarceneiro)}
    ${porObra.length > 1 || (porObra.length === 1 && porObra[0][0] !== 'Sem obra informada') ? `<h4 class="obra-secao">Por obra</h4>${linhas(porObra)}` : ''}
    <h4 class="obra-secao">Serviços</h4>
    <ul class="obra-servicos">
      ${lista.map(l => `
        <li>
          <span><strong>${escapeHtml(l.desc)}</strong>
            <small>${formatDate(l.data)} · ${escapeHtml(marceneiroDe(l.marcId)?.nome ?? '(conta excluída)')}${!obra && l.obra ? ` · ${escapeHtml(l.obra)}` : ''}</small></span>
          <b class="pos">${formatMoney(l.valor)}</b>
        </li>`).join('')}
    </ul>
    <p class="hint">Estornos e agendamentos ainda não liberados não entram na conta. Para ver outro período, troque as datas no painel.</p>`;
  $('#dlg-obra').showModal();
}

function sugerirObras(campo) {
  const caixa = campo.parentElement.querySelector('[data-sugestoes-obra]');
  const cliente = chaveCliente(campo.form?.elements.cliente?.value);
  const termo = semAcento(campo.value);
  // Sem nada digitado, mostra as obras que esse cliente já tem
  const nomes = termo || cliente
    ? obrasDe(state.lancamentos.filter(l => !cliente || chaveCliente(l.cliente) === cliente))
      .map(([, nome]) => nome)
      .filter(nome => semAcento(nome).includes(termo) && semAcento(nome) !== termo)
      .slice(0, 5)
    : [];
  caixa.innerHTML = nomes.map(nome =>
    `<button type="button" class="sugestao" data-action="usar-obra" data-nome="${escapeHtml(nome)}">${icon('tool')} ${escapeHtml(nome)}</button>`).join('');
}

// ================= FOTO DO COMPROVANTE =================
// A foto é diminuída no próprio celular (fica com uns 100 a 300 KB) antes de ir para o banco.

async function comprimirFoto(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error('Não deu para abrir essa foto. Tente outra.'));
      i.src = url;
    });
    for (const [lado, qualidade] of [[1600, 0.72], [1280, 0.65], [1000, 0.6], [800, 0.55]]) {
      const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
      const tela = document.createElement('canvas');
      tela.width = Math.round(img.naturalWidth * escala);
      tela.height = Math.round(img.naturalHeight * escala);
      tela.getContext('2d').drawImage(img, 0, 0, tela.width, tela.height);
      const dados = tela.toDataURL('image/jpeg', qualidade);
      if (dados.length <= 700000) return dados;
    }
    throw new Error('A foto ficou grande demais. Tente outra.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Ao escolher a foto num formulário: já diminui e mostra uma prévia
function prepararFoto(campo) {
  const caixa = campo.closest('.campo-foto');
  const previa = caixa.querySelector('[data-foto-previa]');
  const rotulo = caixa.querySelector('[data-foto-rotulo]');
  const arquivo = campo.files?.[0];
  campo.fotoPronta = null;
  if (!arquivo) {
    previa.hidden = true;
    rotulo.textContent = 'Tirar foto ou escolher';
    return;
  }
  rotulo.textContent = 'Preparando a foto…';
  campo.fotoPronta = comprimirFoto(arquivo);
  campo.fotoPronta.then(dados => {
    previa.src = dados;
    previa.hidden = false;
    rotulo.textContent = 'Trocar a foto';
  }).catch(err => {
    campo.value = '';
    campo.fotoPronta = null;
    previa.hidden = true;
    rotulo.textContent = 'Tirar foto ou escolher';
    fail(err.message);
  });
}

const fotoDoFormulario = campo => (campo?.fotoPronta ? campo.fotoPronta : Promise.resolve(null));

function limparFotos(form) {
  form.querySelectorAll('[data-foto]').forEach(campo => { campo.fotoPronta = null; });
  form.querySelectorAll('[data-foto-previa]').forEach(img => { img.hidden = true; img.removeAttribute('src'); });
  form.querySelectorAll('[data-foto-rotulo]').forEach(r => { r.textContent = 'Tirar foto ou escolher'; });
}

// No comprovante: busca a foto só quando abre (se for do mesmo lançamento que ainda está aberto)
async function mostrarFotoDoLancamento(id) {
  const caixa = $('#comprovante-foto');
  try {
    const foto = await Store.buscarFoto(id);
    if (caixa.dataset.id !== id) return;
    caixa.innerHTML = foto
      ? `<img src="${foto}" alt="Foto do comprovante" data-action="ampliar-foto" title="Tocar para aumentar">`
      : '<p class="hint">A foto não foi encontrada.</p>';
  } catch (err) {
    console.error(err);
    if (caixa.dataset.id === id) caixa.innerHTML = '<p class="hint">Não deu para carregar a foto. Confira a internet e abra de novo.</p>';
  }
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

// modo: 'filtro' (extrato na tela), 'pdf' (extrato em PDF), 'painel' (painel geral) ou 'ferramentas' (histórico)
function abrirPeriodo(modo) {
  const sem = { tipo: 'todos', cliente: '' };
  const { inicio, fim, tipo, cliente } = modo === 'painel' ? { ...state.painel, ...sem }
    : modo === 'ferramentas' ? { ...state.ferrPeriodo, ...sem } : state.filtro;
  cal = { modo, inicio, fim, tipo, cliente, mes: (inicio ?? today()).slice(0, 7) };
  const nomeCliente = cliente && nomeDoCliente(lancamentosDe(state.contaId), cliente);
  $('#periodo-titulo').textContent = modo === 'painel' ? 'Período do painel'
    : modo === 'ferramentas' ? 'Período do histórico'
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
  } else if (cal.modo === 'ferramentas') {
    // Sem o último dia, vale "a partir de" (como o calendário mostra)
    state.ferrPeriodo = { inicio, fim: cal.fim };
    render();
    garantirHistorico();
  } else {
    state.filtro = { ...state.filtro, inicio, fim };
    render();
  }
}

// ================= EXTRATO EM PDF =================
// Monta uma página própria para impressão, só com as movimentações do período

const TITULO_PDF = { todos: 'Extrato de conta', credito: 'Relatório de entradas', debito: 'Relatório de saídas' };

const descricaoPdf = (l, extra = []) => {
  const detalhes = [l.cliente && `Cliente: ${l.cliente}`, l.obra && `Obra: ${l.obra}`, l.estornado && 'Estornado', ...extra].filter(Boolean);
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
    Obra: l.obra || '',
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

  // "Estou de acordo" de cada mês (só entra se já tiver algum)
  const fechamentos = [...state.fechamentos].sort((a, b) => (b.mes > a.mes ? 1 : b.mes < a.mes ? -1 : 0)).map(f => ({
    Marceneiro: marceneiroDe(f.marcId)?.nome ?? '(conta excluída)',
    Mês: nomeDoMes(f.mes),
    Entradas: f.entradas,
    Saídas: f.saidas,
    'Saldo no fim do mês': f.saldoFinal,
    'Confirmado em': dataHora(f.confirmadoEm),
  }));
  if (fechamentos.length) XLSX.utils.book_append_sheet(arquivo, aba(fechamentos, [22, 20, 14, 14, 18, 18], [2, 3, 4]), 'Confirmações do mês');

  // Controle de ferramentas (só entra se já tiver algo cadastrado)
  const ferramentas = [...state.ferramentas].sort(porCodigo).map(f => ({
    Código: f.codigo,
    Ferramenta: f.nome,
    Tipo: f.tipo || '',
    Situação: f.ativo === false ? 'Desativada' : f.comQuem ? 'Em uso' : f.situacao ? SITUACOES[f.situacao][0] : 'Na empresa',
    'Com quem': f.comQuem ? nomeDaPessoa(f.comQuem.pessoaId, f.comQuem.nome) : '',
    Desde: f.comQuem ? dataHora(f.comQuem.desde) : '',
    Obra: f.comQuem?.obs || '',
  }));
  const movimentos = (await Store.buscarMovimentos(null, null)).sort(porMaisRecente).map(m => ({
    Quando: dataHora(m.criadoEm),
    Pessoa: nomeDaPessoa(m.pessoaId, m.pessoa),
    Ação: textoAcao(m),
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
  $('#responder-foto-campo').hidden = !aprovar;
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
    state.ferrPeriodo = periodoPadraoHistorico();
    state.ferrForm = formMovVazio();
    go('ferramentas');
  },
  'abrir-periodo-ferr': () => abrirPeriodo('ferramentas'),
  'prazos': () => {
    const form = $('#dlg-prazos form');
    const valores = Object.fromEntries(TIPOS_FERRAMENTA.map(t => [CHAVE_TIPO[t], prazoDoTipo(t)]));
    openDialog('dlg-prazos', valores);
    form.elements[CHAVE_TIPO[TIPOS_FERRAMENTA[0]]].focus();
  },
  'paraf-limpar': () => {
    state.parafSel = '';
    state.parafBusca = '';
    render();
    $('[data-paraf-busca]')?.focus();
  },
  'paraf-qtd': el => {
    state.parafQtd = Number(el.dataset.q);
    const campo = $('[data-paraf-qtd]');
    if (campo) campo.value = state.parafQtd;
    atualizarParafuso();
  },
  'paraf-modo': el => {
    state.parafModo = el.dataset.modo;
    render();
  },
  'paraf-pote-mais': () => {
    state.parafPesos.push('');
    render();
    const campos = document.querySelectorAll('[data-paraf-peso]');
    campos[campos.length - 1]?.focus();
  },
  'paraf-pote-tirar': el => {
    state.parafPesos.splice(Number(el.dataset.i), 1);
    render();
  },
  'novo-parafuso': () => abrirParafuso(),
  'editar-parafuso': el => abrirParafuso(el.dataset.id),
  'excluir-parafuso': async () => {
    const form = $('#dlg-parafuso form');
    const id = form.elements.parafusoId.value;
    const p = parafusos().find(x => x.id === id);
    if (!p) return;
    if (!await confirmar({ titulo: 'Excluir este item?', corpo: `<b>${escapeHtml(p.nome)}</b> sai da lista de pesos.`, botao: 'Excluir', tom: 'red' })) return;
    if (!exigeInternet()) return;
    try {
      await Store.excluirParafuso(id);
      $('#dlg-parafuso').close();
      if (state.parafSel === id) { state.parafSel = ''; state.parafBusca = ''; }
      toast('Item excluído.');
    } catch (err) {
      fail(mensagemErro(err));
    }
  },
  'parafusos-iniciais': async el => {
    if (!exigeInternet()) return;
    el.disabled = true;
    try {
      await Store.cadastrarParafusos(PARAFUSOS_INICIAIS);
      toast('Lista de pesos cadastrada!');
    } catch (err) {
      fail(mensagemErro(err));
    } finally {
      el.disabled = false;
    }
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
  'tema': el => {
    const tema = el.dataset.tema;
    salvarPreferencia(TEMA_KEY, tema);
    aplicarTema(tema);
    render();
  },
  'abrir-fechamento': () => abrirFechamento(),
  // Mostra no extrato só o mês que está sendo conferido
  'fechamento-ver-extrato': el => {
    const { inicio, fim } = resumoDoMes(state.contaId, mesPassado());
    Object.assign(state, { filtro: { inicio, fim, tipo: 'todos', cliente: '' }, busca: '' });
    el.closest('dialog').close();
    render();
    $('#extrato-conteudo')?.scrollIntoView({ behavior: 'smooth' });
  },
  'fechamento-ok': async el => {
    if (!exigeInternet()) return;
    const m = contaAtual();
    const r = resumoDoMes(m.id, mesPassado());
    el.disabled = true;
    try {
      await Store.confirmarFechamento(m, r);
      el.closest('dialog').close();
      toast(`Obrigado! Extrato de ${nomeDoMes(r.mes)} confirmado.`);
      avisarFechamento(m, r.mes, true);
    } catch (err) {
      fail(mensagemErro(err));
    } finally {
      el.disabled = false;
    }
  },
  'fechamento-duvida': el => {
    if (!exigeInternet()) return;
    el.closest('dialog').close();
    avisarFechamento(contaAtual(), mesPassado(), false);
    toast('O escritório foi avisado e vai conversar com você.');
  },
  'letra': el => {
    const grande = el.dataset.letra === 'grande';
    salvarPreferencia(LETRA_KEY, grande ? 'grande' : '');
    aplicarLetra(grande);
    render();
  },
  'ver-movimento': el => abrirMovimento(el.dataset.id),
  'excluir-movimento': async el => {
    if (!exigeInternet()) return;
    const m = movimentoDe($('#dlg-movimento form').elements.movId.value);
    el.closest('dialog').close();
    if (!m) return;
    let daFerramenta;
    try {
      daFerramenta = await historicoDaFerramenta(m.ferramentaId);
    } catch (err) {
      return fail(mensagemErro(err));
    }
    const comQuem = comQuemSemMovimento(m, daFerramenta);
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
      const f = ferramentaDe(m.ferramentaId);
      const extra = comQuem && m.estado === 'defeito' && f?.situacao === 'defeito' ? { situacao: null, situacaoObs: '' } : {};
      await Store.excluirMovimento(m, comQuem, extra);
      atualizarMovimentoAntigo(m.id, { excluido: true });
      render();
      toast('Movimentação excluída.');
    } catch (err) {
      fail(mensagemErro(err));
    }
  },
  // Devolução direto pela linha do painel de itens
  'devolver-ferramenta': el => {
    const f = ferramentaDe(el.dataset.id);
    if (!f?.comQuem) return;
    state.ferrForm = { ...formMovVazio('devolucao'), itens: [f.id] };
    state.ferrAba = 'mov';
    render();
    window.scrollTo(0, 0);
  },
  // Formulário de movimentação: retirada/devolução, estado da devolução e tirar um item da lista
  'mov-acao': el => {
    if (state.ferrForm.acao === el.dataset.acao) return;
    state.ferrForm = formMovVazio(el.dataset.acao); // trocar a ação limpa a lista (as ferramentas que servem são outras)
    render();
  },
  'mov-estado': el => {
    state.ferrForm.estado = el.dataset.estado;
    render();
  },
  // Botões de manutenção na janela da ferramenta: pede uma observação e registra
  'manutencao': async el => {
    if (!exigeInternet()) return;
    const f = ferramentaDe($('#dlg-ferramenta form').elements.ferramentaId.value);
    const acao = el.dataset.manut;
    const [titulo, pergunta, tom, feito] = {
      defeito: ['Marcar com defeito', 'O que aconteceu?', 'red', 'separada como com defeito'],
      assistencia: ['Enviar para assistência', 'Para onde foi ou o que vai consertar? (opcional)', 'primary', 'na assistência'],
      conserto: ['Voltou consertada', 'O que foi feito? (opcional)', 'green', 'de volta e disponível'],
      revisao: ['Revisão feita', 'Observação (opcional)', 'green', 'com a revisão registrada'],
    }[acao];
    el.closest('dialog').close();
    const confirmado = await confirmar({
      titulo,
      corpo: `<p><b>${escapeHtml(rotuloFerramenta(f))}</b></p>
        <label class="field"><span>${pergunta}</span><input id="manutencao-obs" maxlength="80" autocomplete="off"></label>`,
      botao: titulo,
      tom,
    });
    if (!confirmado) return;
    try {
      await Store.manutencaoFerramenta(f, acao, $('#manutencao-obs').value.trim());
      toast(`${f.nome}: ${feito}.`);
    } catch (err) {
      fail(mensagemErro(err));
    }
  },
  'mov-tirar': el => {
    state.ferrForm.itens = state.ferrForm.itens.filter(id => id !== el.dataset.id);
    render();
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
  'usar-obra': el => {
    const campo = el.closest('.field').querySelector('input[name="obra"]');
    campo.value = el.dataset.nome;
    el.parentElement.innerHTML = '';
  },
  'ver-obra': el => abrirMaoDeObra({ obra: el.dataset.obra }),
  'ver-cliente-painel': el => abrirMaoDeObra({ cliente: el.dataset.cliente }),
  'ampliar-foto': el => el.classList.toggle('grande'),
  'remover-foto': async el => {
    const l = state.lancamentos.find(x => x.id === el.dataset.id);
    if (!l || !exigeInternet()) return;
    if (!await confirmar({ titulo: 'Tirar a foto?', corpo: 'A foto do comprovante sai deste lançamento. O lançamento continua igual.', botao: 'Tirar a foto', tom: 'red' })) return;
    try {
      await Store.removerFoto(l);
      toast('Foto retirada.');
      openLancamento(l.id);
    } catch (err) {
      fail(mensagemErro(err));
    }
  },
  'login-link': () => {
    state.loginEmailLink = '';
    state.loginModo = 'link';
    render();
  },
  'login-senha': () => {
    state.loginModo = 'senha';
    render();
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
      await Store.aprovarPedido(p, m, today(), { valor, resposta, foto: await fotoDoFormulario(f.foto) });
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

  // Entrar sem senha: manda o link para o e-mail
  async loginLink(f) {
    const email = f.email.value.trim();
    await Store.enviarLinkDeEntrada(email);
    lembrarEmail(email);
    state.loginEmailLink = email;
    state.loginModo = 'link-enviado';
    render();
  },

  // Voltou pelo link num aparelho que não sabe o e-mail: pede para confirmar
  async confirmarLink(f) {
    await Store.entrarPeloLink(f.email.value.trim());
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
    await Store.addLancamento(contaAtual(), { tipo: 'credito', data, desc, cliente: f.cliente.value.trim(), obra: f.obra.value.trim(), valor },
      await fotoDoFormulario(f.foto));
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
      obra: l.tipo === 'credito' ? f.obra.value.trim() : '',
      data: f.data.value,
    };
    const mudou = novo.valor !== l.valor || novo.desc !== l.desc || novo.cliente !== (l.cliente || '')
      || novo.obra !== (l.obra || '') || novo.data !== l.data;
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
    await Store.addLancamento(contaAtual(), { tipo: 'debito', data: f.data.value, desc, valor }, await fotoDoFormulario(f.foto));
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
    const obs = f.obs.value.trim();
    if (pessoa.id === m.pessoaId && obs === (m.obs || '')) return; // nada mudou: só fecha
    // Se é a retirada de agora, a ferramenta passa a constar com a pessoa certa
    const ferramenta = state.ferramentas.find(x => x.id === m.ferramentaId);
    const ultimo = ferramenta?.comQuem && m.acao === 'retirada' ? (await historicoDaFerramenta(m.ferramentaId))[0] : null;
    const comQuem = ultimo?.id === m.id ? { ...ferramenta.comQuem, pessoaId: pessoa.id, nome: pessoa.nome, obs } : undefined;
    await Store.editarMovimento(m, { pessoa, obs }, comQuem);
    atualizarMovimentoAntigo(m.id, {
      pessoaId: pessoa.id, pessoa: pessoa.nome, obs,
      alteracoes: [...(m.alteracoes ?? []), { em: new Date().toISOString(), antes: { pessoa: m.pessoa, obs: m.obs || '' } }],
    });
    render();
    toast('Movimentação corrigida.');
  },

  // Prazo (em dias) de cada tipo de ferramenta antes de contar como atrasada
  async prazos(f) {
    const prazos = {};
    for (const tipo of TIPOS_FERRAMENTA) {
      const dias = parseInt(f[CHAVE_TIPO[tipo]].value, 10);
      if (!(dias >= 1 && dias <= 365)) return fail(`Prazo de ${tipo}: use de 1 a 365 dias.`);
      prazos[CHAVE_TIPO[tipo]] = dias;
    }
    await Store.salvarPrazos(prazos);
    toast('Prazos salvos.');
  },

  // Peso de um parafuso: pela contagem (peças contadas e o peso total que a balança marcou)
  async parafuso(f) {
    const id = f.parafusoId.value;
    const nome = f.nome.value.trim();
    const repetido = parafusos().find(p => p.id !== id && normParaf(p.nome) === normParaf(nome));
    if (repetido) return fail(`${repetido.nome} já está na lista.`);
    let peso = null;
    let amostra = null;
    if (f.amostra.value.trim() || f.total.value.trim()) {
      amostra = parseInt(f.amostra.value, 10);
      const total = lerDecimal(f.total.value);
      if (!(amostra >= 1 && amostra <= 10000)) return fail('Digite quantas peças você contou.');
      if (!(total > 0)) return fail('Digite o peso total (em gramas) que a balança marcou.');
      peso = Math.round((total / amostra) * 10000) / 10000;
    }
    await Store.salvarParafuso(id, { nome, peso, amostra });
    toast(id ? 'Item atualizado.' : 'Item cadastrado.');
  },

  // Retirada ou devolução (uma ou várias ferramentas), pelo formulário da aba Movimentação
  async movFerramenta() {
    const { acao, itens, pessoa: pessoaId, obs, estado } = state.ferrForm;
    const ferramentas = itens.map(ferramentaDe).filter(Boolean);
    if (!ferramentas.length) return fail('Escolha a ferramenta.');
    const nomes = ferramentas.length === 1 ? ferramentas[0].nome : `${ferramentas.length} ferramentas`;
    if (acao === 'retirada') {
      const pessoa = pessoaDe(pessoaId);
      if (!pessoa) return fail('Escolha o marceneiro.');
      await Store.retirarFerramentas(ferramentas, pessoa, obs.trim());
      toast(`Retirada registrada: ${nomes} com ${pessoa.nome}.`);
    } else {
      await Store.devolverFerramentas(ferramentas, { estado, obs: obs.trim() });
      toast(estado === 'defeito' ? `Devolução registrada: ${nomes} separada(s) como com defeito.` : `Devolução registrada: ${nomes}.`);
    }
    state.ferrForm = formMovVazio(acao);
    render();
  },

  async ferramenta(f) {
    const id = f.ferramentaId.value;
    const revisaoMeses = parseInt(f.revisaoMeses.value, 10) || 0;
    if (revisaoMeses < 0 || revisaoMeses > 60) return fail('Revisão: use de 1 a 60 meses (ou deixe vazio).');
    const dados = { codigo: f.codigo.value.trim().toUpperCase(), nome: f.nome.value.trim(), tipo: f.tipo.value, revisaoMeses };
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
  if (e.target.name === 'obra' && e.target.form) sugerirObras(e.target);
  if (e.target.matches('[data-busca-extrato]')) {
    state.busca = e.target.value;
    $('#extrato-conteudo').innerHTML = extratoConteudo(contaAtual());
  }
  if (e.target.matches('input[data-mov]')) state.ferrForm[e.target.dataset.mov] = e.target.value;
  if (e.target.matches('[data-busca-ferramentas]')) {
    state.ferrBusca = e.target.value;
    $('#ferr-historico').innerHTML = historicoFerramentasHtml();
  }
  // Aba Parafusos: digitar procura na lista; mudar a quantidade refaz a conta
  if (e.target.matches('[data-paraf-busca]')) {
    state.parafBusca = e.target.value;
    state.parafSel = '';
    state.parafAtivo = -1;
    mostrarListaParafusos();
    atualizarParafuso();
  }
  if (e.target.matches('[data-paraf-qtd]')) {
    state.parafQtd = e.target.value;
    atualizarParafuso();
  }
  if (e.target.matches('[data-paraf-peso]')) {
    state.parafPesos[Number(e.target.dataset.parafPeso)] = e.target.value;
    atualizarParafuso();
  }
  if (e.target.form?.dataset.form === 'parafuso') atualizarCalculoParafuso();
});

// Lista de parafusos: abre ao tocar no campo, fecha ao sair; setas e Enter também escolhem
document.addEventListener('focusin', e => {
  if (e.target.name === 'obra' && e.target.form && !e.target.value) sugerirObras(e.target);
  if (e.target.matches('[data-paraf-busca]')) {
    e.target.select();
    mostrarListaParafusos();
  }
  if (e.target.matches('[data-paraf-qtd]')) e.target.select();
});
document.addEventListener('focusout', e => {
  if (!e.target.matches('[data-paraf-busca]')) return;
  setTimeout(() => {
    if (document.activeElement?.matches('[data-paraf-busca]')) return; // voltou para o campo (tela redesenhada)
    esconderListaParafusos();
    // Digitou o nome inteiro sem tocar na lista: escolhe assim mesmo
    if (!state.parafSel) {
      const igual = parafusos().find(p => normParaf(p.nome) === normParaf(state.parafBusca));
      if (igual) escolherParafuso(igual.id);
    }
  }, 150);
});
document.addEventListener('mousedown', e => {
  const op = e.target.closest('[data-paraf-op]');
  if (!op) return;
  e.preventDefault(); // não tira o foco do campo antes de escolher
  escolherParafuso(op.dataset.parafOp);
});
document.addEventListener('keydown', e => {
  if (!e.target.matches('[data-paraf-busca]')) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    moverNaListaParafusos(e.key === 'ArrowDown' ? 1 : -1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const lista = filtrarParafusos();
    const p = state.parafAtivo > -1 ? lista[state.parafAtivo] : lista.length === 1 ? lista[0] : null;
    if (p) escolherParafuso(p.id);
  } else if (e.key === 'Escape') {
    esconderListaParafusos();
  }
});

document.addEventListener('change', e => {
  if (e.target.name === 'liberacao') atualizarAgendaServico(e.target.form);
  if (e.target.matches('[data-foto]')) prepararFoto(e.target);
  if (e.target.matches('[data-anexar-foto]')) anexarFotoAoLancamento(e.target);
  // Formulário de movimentação de ferramentas: a ferramenta escolhida entra na lista; o marceneiro só fica guardado
  if (e.target.matches('select[data-mov]')) {
    const campo = e.target.dataset.mov;
    if (campo === 'item') {
      adicionarItemMov(e.target.value);
      render(); // a lista volta para "+ Adicionar outra ferramenta"
    } else {
      state.ferrForm[campo] = e.target.value;
    }
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

// Abriu o app tocando no link do e-mail: entra direto (ou pede o e-mail, se abriu em outro aparelho)
async function entrarPeloLinkDoEmail() {
  const email = Store.emailDoLink() || lerEmailLembrado();
  if (!email) {
    state.loginModo = 'link-confirmar';
    render();
    return;
  }
  state.loginModo = 'link-entrando';
  try {
    await Store.entrarPeloLink(email);
  } catch (err) {
    console.error(err);
    // E-mail guardado diferente do link: pede para digitar
    state.loginModo = err?.code === 'auth/invalid-email' ? 'link-confirmar' : 'link';
    go('login');
    if (err?.code !== 'auth/invalid-email') fail(mensagemErro(err));
  }
}

// Anexar ou trocar a foto direto no comprovante
async function anexarFotoAoLancamento(campo) {
  const l = state.lancamentos.find(x => x.id === campo.dataset.anexarFoto);
  const arquivo = campo.files?.[0];
  if (!l || !arquivo || !exigeInternet()) return;
  const rotulo = campo.parentElement;
  rotulo.classList.add('carregando');
  try {
    const foto = await comprimirFoto(arquivo);
    await Store.anexarFoto(l, marceneiroDe(l.marcId), foto);
    toast('Foto do comprovante salva.');
    openLancamento(l.id);
  } catch (err) {
    console.error(err);
    fail(err.code ? mensagemErro(err) : err.message);
  } finally {
    rotulo.classList.remove('carregando');
  }
}

// ================= INÍCIO =================

atualizarAvisoOffline();

if (Store.configurado) {
  render(); // "Carregando…" até o Firebase dizer se já tem alguém logado
  if (Store.chegouPeloLink()) entrarPeloLinkDoEmail();
  Store.onAuthChange(aoMudarLogin);
} else {
  go('config');
}

// Permite instalar no celular (só funciona em http/https)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js');
}
