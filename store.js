/* =========================================================
   Store — camada de dados (Firebase)
   Login: Firebase Authentication (e-mail e senha, ou link de entrada mandado por e-mail).
   Dados: Cloud Firestore. Avisos por e-mail e notificação: Google Apps Script.
   A interface (app.js) só conversa com as funções exportadas aqui.

   Coleções no Firestore:
     marceneiros/{id}  → { nome, email, uid, criadoEm }
     lancamentos/{id}  → { marcId, uid, tipo, data, desc, cliente, obra, valor, criadoEm, temFoto?,
                           estornado?, estornadoEm?, estornoDe?, cancelado?, canceladoEm?, alteracoes? }
     pedidos/{id}      → { marcId, uid, valor, motivo, status, criadoEm, respondidoEm, valorAprovado?, resposta? }
     comprovantes/{id do lançamento} → { marcId, uid, foto, criadoEm }  (foto do comprovante, em JPEG pequeno)
     fechamentos/{conta_mês} → { marcId, uid, mes, entradas, saidas, saldoFinal, confirmadoEm }  ("Estou de acordo")
     dispositivos/{código do aparelho} → { uid, papel, atualizadoEm }  (quem recebe notificações)
   O campo "uid" liga cada registro ao login do marceneiro (usado nas regras de segurança).

   Controle de ferramentas (só o administrador vê e mexe):
     ferramentas/{id}  → { codigo, nome, tipo, ativo, comQuem: null | { pessoaId, nome, desde, obs }, criadoEm,
                           situacao?: null | 'defeito' | 'assistencia', situacaoDesde?, situacaoObs?,
                           revisaoMeses?, ultimaRevisao? }
     equipe/{id}       → { nome, ativo, criadoEm }  (quem pega ferramenta; não precisa ter conta no Caixa)
     movimentos/{id}   → { ferramentaId, ferramenta, pessoaId, pessoa, acao, obs, criadoEm, estado?,
                           alteracoes?, excluido?, excluidoEm? }
                         acao: 'retirada' | 'devolucao' (estado 'ok' | 'defeito') | 'defeito' | 'assistencia' | 'conserto' | 'revisao'
     config/ferramentas → { prazos: { maquina, ferramenta, broca, outro } }  (dias até a ferramenta contar como atrasada)
    config/parafusos   → { itens: { [id]: { nome, peso, amostra } } }  (peso de 1 peça em gramas, pela contagem de amostra)
   ========================================================= */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, query, where, onSnapshot, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc, deleteField, writeBatch, runTransaction, serverTimestamp, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getMessaging, getToken, isSupported } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';
import { firebaseConfig, ADMIN_EMAIL, EMAIL_WEBHOOK_URL, VAPID_KEY } from './firebase-config.js';

const naoPreenchido = valor => !valor || valor.startsWith('COLE');

export const configurado = !naoPreenchido(firebaseConfig.apiKey) && !naoPreenchido(ADMIN_EMAIL);
export const emailConfigurado = !naoPreenchido(EMAIL_WEBHOOK_URL);

const app = configurado ? initializeApp(firebaseConfig) : null;
const auth = app && getAuth(app);
const db = app && abrirBanco(app);

// Guarda uma cópia dos dados no aparelho: o app abre na hora e mostra o último
// saldo mesmo sem internet. Se o navegador não permitir, funciona só online.
function abrirBanco(firebaseApp) {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn('Sem cópia local dos dados', err);
    return getFirestore(firebaseApp);
  }
}
if (auth) auth.languageCode = 'pt-BR'; // e-mails do Firebase (redefinir senha) em português

// ---------- Auxiliares ----------

const roundCents = v => Math.round(v * 100) / 100;
const pad = n => String(n).padStart(2, '0');
const normalizarEmail = email => email.trim().toLowerCase();
const ehAdmin = user => user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

// Soma meses sem pular mês (31/01 + 1 mês = 28/02, e não 03/03)
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const lastDay = new Date(y, m - 1 + n + 1, 0).getDate();
  const date = new Date(y, m - 1 + n, Math.min(d, lastDay));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Segunda instância do Firebase só para criar logins de marceneiros
// sem desconectar o administrador que está usando o app.
let authCriacao;
function getAuthCriacao() {
  authCriacao ??= initializeAuth(initializeApp(firebaseConfig, 'criacao-de-logins'), { persistence: inMemoryPersistence });
  return authCriacao;
}

// Senha aleatória provisória: o marceneiro cria a dele pelo e-mail que recebe
function senhaProvisoria() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes));
}

async function docsDoMarceneiro(colecao, marcId) {
  const snap = await getDocs(query(collection(db, colecao), where('marcId', '==', marcId)));
  return snap.docs;
}

// O Firestore aceita no máximo 500 operações por lote
async function emLotes(docs, aplicar) {
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db);
    docs.slice(i, i + 450).forEach(d => aplicar(batch, d));
    await batch.commit();
  }
}

// Lista "ao vivo": o callback roda de novo sempre que algo muda no banco
function escutar(nome, user, callback, onError) {
  const ref = collection(db, nome);
  const q = user.role === 'admin' ? ref : query(ref, where('uid', '==', user.uid));
  // "estimate": logo após salvar, usa a hora do aparelho até o servidor confirmar (mantém a ordem certa)
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))), onError);
}

// ---------- Login ----------

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, user => {
    if (!user) return callback(null);
    callback({ role: ehAdmin(user) ? 'admin' : 'marceneiro', uid: user.uid, email: user.email });
  });
}

export const login = (email, senha) => signInWithEmailAndPassword(auth, normalizarEmail(email), senha);
export const logout = () => signOut(auth);
export const enviarEmailSenha = email => sendPasswordResetEmail(auth, normalizarEmail(email));

// Entrar sem senha: manda um link por e-mail; tocar nele abre o app já com a pessoa conectada.
// O e-mail fica guardado no aparelho para não precisar digitar de novo ao voltar pelo link.
const CHAVE_EMAIL_LINK = 'caixa_email_link';
const guardarEmailLink = email => { try { localStorage.setItem(CHAVE_EMAIL_LINK, email); } catch { /* sem armazenamento */ } };

export async function enviarLinkDeEntrada(email) {
  const e = normalizarEmail(email);
  await sendSignInLinkToEmail(auth, e, { url: location.origin + location.pathname, handleCodeInApp: true });
  guardarEmailLink(e);
}

export const chegouPeloLink = () => Boolean(auth) && isSignInWithEmailLink(auth, location.href);

export function emailDoLink() {
  try { return localStorage.getItem(CHAVE_EMAIL_LINK) || ''; } catch { return ''; }
}

export async function entrarPeloLink(email) {
  await signInWithEmailLink(auth, normalizarEmail(email), location.href);
  try { localStorage.removeItem(CHAVE_EMAIL_LINK); } catch { /* sem armazenamento */ }
  history.replaceState(null, '', location.pathname + location.hash); // tira o código do link do endereço
}

// ---------- Leitura ----------

export const watchMarceneiros = (user, cb, onError) => escutar('marceneiros', user, cb, onError);
export const watchLancamentos = (user, cb, onError) => escutar('lancamentos', user, cb, onError);
export const watchPedidos = (user, cb, onError) => escutar('pedidos', user, cb, onError);

// ---------- Marceneiros (só admin) ----------

// Cria o login e manda para o marceneiro um e-mail para ele criar a própria senha
export async function addMarceneiro({ nome, email }) {
  const cred = await createUserWithEmailAndPassword(getAuthCriacao(), normalizarEmail(email), senhaProvisoria());
  await signOut(getAuthCriacao());
  await addDoc(collection(db, 'marceneiros'), {
    nome,
    email: normalizarEmail(email),
    uid: cred.user.uid,
    criadoEm: serverTimestamp(),
  });
  await enviarEmailSenha(email);
}

export const updateMarceneiro = (id, { nome }) => updateDoc(doc(db, 'marceneiros', id), { nome });

export async function removeMarceneiro({ id, uid }) {
  for (const colecao of ['lancamentos', 'comprovantes', 'pedidos', 'fechamentos']) {
    await emLotes(await docsDoMarceneiro(colecao, id), (batch, d) => batch.delete(d.ref));
  }
  // Aparelhos dele deixam de receber notificações
  const aparelhos = await getDocs(query(collection(db, 'dispositivos'), where('uid', '==', uid)));
  await emLotes(aparelhos.docs, (batch, d) => batch.delete(d.ref));
  await deleteDoc(doc(db, 'marceneiros', id));
}

// ---------- Lançamentos (só admin) ----------
// tipo: 'credito' (serviço) ou 'debito' (retirada)

function dadosLancamento(marceneiro, { tipo, data, desc, cliente = '', obra = '', valor }) {
  return {
    marcId: marceneiro.id,
    uid: marceneiro.uid,
    tipo, data, desc, cliente, obra,
    valor: roundCents(valor),
    criadoEm: serverTimestamp(),
  };
}

// Foto do comprovante: num documento à parte (com o mesmo código do lançamento),
// para o extrato continuar leve; só é baixada quando alguém abre o comprovante
const dadosFoto = (marceneiro, foto) => ({ marcId: marceneiro.id, uid: marceneiro.uid, foto, criadoEm: serverTimestamp() });

export async function addLancamento(marceneiro, lancamento, foto = null) {
  const ref = doc(collection(db, 'lancamentos'));
  const batch = writeBatch(db);
  batch.set(ref, { ...dadosLancamento(marceneiro, lancamento), ...(foto ? { temFoto: true } : {}) });
  if (foto) batch.set(doc(db, 'comprovantes', ref.id), dadosFoto(marceneiro, foto));
  await batch.commit();
}

export async function anexarFoto(lancamento, marceneiro, foto) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'comprovantes', lancamento.id), dadosFoto(marceneiro, foto));
  batch.update(doc(db, 'lancamentos', lancamento.id), { temFoto: true });
  await batch.commit();
}

export async function removerFoto(lancamento) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'comprovantes', lancamento.id));
  batch.update(doc(db, 'lancamentos', lancamento.id), { temFoto: false });
  await batch.commit();
}

export async function buscarFoto(lancId) {
  return (await getDoc(doc(db, 'comprovantes', lancId))).data()?.foto ?? null;
}

// Divide em centavos para a soma das parcelas bater exatamente com o total
export function dividirParcelas(total, parcelas, dataInicio) {
  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / parcelas);
  return Array.from({ length: parcelas }, (_, i) => {
    const isLast = i === parcelas - 1;
    const cents = isLast ? totalCents - baseCents * (parcelas - 1) : baseCents;
    return { numero: i + 1, data: addMonths(dataInicio, i), valor: cents / 100 };
  });
}

export async function addParcelado(marceneiro, { desc, total, parcelas, dataInicio }) {
  const batch = writeBatch(db);
  dividirParcelas(total, parcelas, dataInicio).forEach(p => {
    batch.set(doc(collection(db, 'lancamentos')), dadosLancamento(marceneiro, {
      tipo: 'debito',
      data: p.data,
      desc: `Parcela ${p.numero}/${parcelas} - ${desc}`,
      valor: p.valor,
    }));
  });
  await batch.commit();
}

// Lançamentos nunca são apagados (só a conta inteira, ao excluir o marceneiro).
// Erros se corrigem como num banco: estorno, cancelamento de agendado ou edição com histórico.

// Estorno: o original fica no extrato marcado como estornado e entra um lançamento contrário
// Confere no servidor que ainda não foi estornado (evita estorno duplo com dois aparelhos)
export async function estornarLancamento(lancamento, marceneiro, data) {
  const ref = doc(db, 'lancamentos', lancamento.id);
  await runTransaction(db, async tx => {
    const atual = await tx.get(ref);
    if (atual.data()?.estornado) throw new Error('Esse lançamento já foi estornado.');
    tx.update(ref, { estornado: true, estornadoEm: serverTimestamp() });
    tx.set(doc(collection(db, 'lancamentos')), {
      ...dadosLancamento(marceneiro, {
        tipo: lancamento.tipo === 'credito' ? 'debito' : 'credito',
        data,
        desc: `Estorno - ${lancamento.desc}`,
        valor: lancamento.valor,
      }),
      estornoDe: lancamento.id,
    });
  });
}

// Agendado que ainda não aconteceu: sai das contas, mas o registro continua no banco
export const cancelarAgendado = id =>
  updateDoc(doc(db, 'lancamentos', id), { cancelado: true, canceladoEm: serverTimestamp() });

// Edição guarda como era antes, para ficar registrado no comprovante
export function editarLancamento(lancamento, { valor, desc, cliente, obra, data }) {
  const antes = { valor: lancamento.valor, desc: lancamento.desc, cliente: lancamento.cliente || '', obra: lancamento.obra || '', data: lancamento.data };
  return updateDoc(doc(db, 'lancamentos', lancamento.id), {
    valor: roundCents(valor), desc, cliente, obra, data,
    alteracoes: arrayUnion({ em: new Date().toISOString(), antes }),
  });
}

// ---------- Fechamento do mês ----------
// O marceneiro confere o extrato do mês e toca em "Estou de acordo".
// Um registro por conta e mês (o código do documento é conta_mês), que não pode ser mudado depois.

export const watchFechamentos = (user, cb, onError) => escutar('fechamentos', user, cb, onError);

export const confirmarFechamento = (marceneiro, { mes, entradas, saidas, saldoFinal }) =>
  setDoc(doc(db, 'fechamentos', `${marceneiro.id}_${mes}`), {
    marcId: marceneiro.id,
    uid: marceneiro.uid,
    mes,
    entradas: roundCents(entradas),
    saidas: roundCents(saidas),
    saldoFinal: roundCents(saldoFinal),
    confirmadoEm: serverTimestamp(),
  });

// ---------- Pedidos de retirada ----------

// O marceneiro só pode criar isto e a confirmação do mês (as regras do Firestore garantem isso)
export const criarPedido = (marceneiro, { valor, motivo }) =>
  addDoc(collection(db, 'pedidos'), {
    marcId: marceneiro.id,
    uid: marceneiro.uid,
    valor: roundCents(valor),
    motivo,
    status: 'pendente',
    criadoEm: serverTimestamp(),
  });

// Responde o pedido só se ele ainda estiver aguardando
// (evita lançar duas vezes com clique duplo ou dois aparelhos ao mesmo tempo)
// "resposta" é a mensagem do administrador (motivo da recusa ou recado na aprovação)
async function responder(pedido, status, campos, extra) {
  const ref = doc(db, 'pedidos', pedido.id);
  await runTransaction(db, async tx => {
    const atual = await tx.get(ref);
    if (atual.data()?.status !== 'pendente') throw new Error('Esse pedido já foi respondido.');
    tx.update(ref, { status, respondidoEm: serverTimestamp(), ...campos });
    extra?.(tx);
  });
}

// Aprovar gera a retirada no extrato, tudo de uma vez. O valor pode ser menor que o pedido.
// Com foto, o comprovante (ex.: print do PIX) fica junto da retirada.
export const aprovarPedido = (pedido, marceneiro, data, { valor, resposta = '', foto = null }) =>
  responder(pedido, 'aprovado', { valorAprovado: roundCents(valor), resposta }, tx => {
    const ref = doc(collection(db, 'lancamentos'));
    tx.set(ref, {
      ...dadosLancamento(marceneiro, {
        tipo: 'debito',
        data,
        desc: pedido.motivo ? `Retirada pedida - ${pedido.motivo}` : 'Retirada pedida',
        valor,
      }),
      ...(foto ? { temFoto: true } : {}),
    });
    if (foto) tx.set(doc(db, 'comprovantes', ref.id), dadosFoto(marceneiro, foto));
  });

export const recusarPedido = (pedido, resposta = '') => responder(pedido, 'recusado', { resposta });

// ---------- Ferramentas (só admin) ----------
// Quem está com cada ferramenta fica na própria ferramenta (comQuem);
// cada retirada e devolução também vira um movimento, para o histórico.

export const watchFerramentas = (user, cb, onError) => escutar('ferramentas', user, cb, onError);
export const watchEquipe = (user, cb, onError) => escutar('equipe', user, cb, onError);
export const watchConfig = (user, cb, onError) => escutar('config', user, cb, onError);

const comoLista = snap => snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));

// Histórico ao vivo só a partir de uma data (os meses recentes): o app abre leve mesmo depois de anos.
// O mais antigo é buscado só quando alguém pede (filtro de data, PDF ou backup).
export function watchMovimentos(desde, cb, onError) {
  const q = query(collection(db, 'movimentos'), where('criadoEm', '>=', desde));
  return onSnapshot(q, snap => cb(comoLista(snap)), onError);
}

// Movimentações de um período (inicio/fim: Date ou null = sem limite)
export async function buscarMovimentos(inicio, fim) {
  const filtros = [inicio && where('criadoEm', '>=', inicio), fim && where('criadoEm', '<', fim)].filter(Boolean);
  return comoLista(await getDocs(query(collection(db, 'movimentos'), ...filtros)));
}

// Todas as movimentações de uma ferramenta (para corrigir o histórico sem depender do que está carregado)
export async function movimentosDaFerramenta(ferramentaId) {
  return comoLista(await getDocs(query(collection(db, 'movimentos'), where('ferramentaId', '==', ferramentaId))));
}

export const salvarPrazos = prazos => setDoc(doc(db, 'config', 'ferramentas'), { prazos }, { merge: true });

// Peso dos parafusos: todos num documento só (são poucos itens), cada um com um código próprio
const refParafusos = () => doc(db, 'config', 'parafusos');
const novoIdParafuso = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const salvarParafuso = (id, item) => setDoc(refParafusos(), { itens: { [id || novoIdParafuso()]: item } }, { merge: true });
export const excluirParafuso = id => updateDoc(refParafusos(), { [`itens.${id}`]: deleteField() });
export const cadastrarParafusos = lista =>
  setDoc(refParafusos(), { itens: Object.fromEntries(lista.map(p => [novoIdParafuso(), p])) }, { merge: true });

export const addFerramenta = ({ codigo, nome, tipo, revisaoMeses = 0 }) =>
  addDoc(collection(db, 'ferramentas'), {
    codigo, nome, tipo, revisaoMeses, ativo: true, comQuem: null, situacao: null, criadoEm: serverTimestamp(),
  });

export const updateFerramenta = (id, campos) => updateDoc(doc(db, 'ferramentas', id), campos);

export const addPessoa = nome => addDoc(collection(db, 'equipe'), { nome, ativo: true, criadoEm: serverTimestamp() });

export const updatePessoa = (id, campos) => updateDoc(doc(db, 'equipe', id), campos);

// Primeira vez: cadastra a lista que veio da planilha
export async function cadastrarListaInicial(ferramentas, nomes) {
  const batch = writeBatch(db);
  ferramentas.forEach(f => batch.set(doc(collection(db, 'ferramentas')),
    { ...f, ativo: true, comQuem: null, criadoEm: serverTimestamp() }));
  nomes.forEach(nome => batch.set(doc(collection(db, 'equipe')), { nome, ativo: true, criadoEm: serverTimestamp() }));
  await batch.commit();
}

const rotuloFerramenta = f => `${f.codigo} · ${f.nome}`;

// Confere no servidor que ninguém pegou antes (dois aparelhos ao mesmo tempo)
// Retirada de uma ou várias ferramentas de uma vez, para a mesma pessoa.
// Confere no servidor que nenhuma está fora nem em manutenção (dois aparelhos ao mesmo tempo).
export async function retirarFerramentas(ferramentas, pessoa, obs = '') {
  const refs = ferramentas.map(f => doc(db, 'ferramentas', f.id));
  await runTransaction(db, async tx => {
    const atuais = await Promise.all(refs.map(ref => tx.get(ref)));
    atuais.forEach((snap, i) => {
      const atual = snap.data();
      const nome = rotuloFerramenta(ferramentas[i]);
      if (atual?.comQuem) throw new Error(`${nome} já está com ${atual.comQuem.nome}.`);
      if (atual?.situacao) throw new Error(`${nome} está ${SITUACAO_TEXTO[atual.situacao]}.`);
    });
    refs.forEach((ref, i) => {
      tx.update(ref, { comQuem: { pessoaId: pessoa.id, nome: pessoa.nome, desde: serverTimestamp(), obs } });
      tx.set(doc(collection(db, 'movimentos')), {
        ferramentaId: ferramentas[i].id, ferramenta: rotuloFerramenta(ferramentas[i]),
        pessoaId: pessoa.id, pessoa: pessoa.nome,
        acao: 'retirada', obs, criadoEm: serverTimestamp(),
      });
    });
  });
}

// Devolução de uma ou várias. estado: 'ok' ou 'defeito' (com defeito, a ferramenta fica separada até o conserto)
export async function devolverFerramentas(ferramentas, { estado = 'ok', obs = '' } = {}) {
  const refs = ferramentas.map(f => doc(db, 'ferramentas', f.id));
  await runTransaction(db, async tx => {
    const atuais = await Promise.all(refs.map(ref => tx.get(ref)));
    atuais.forEach((snap, i) => {
      if (!snap.data()?.comQuem) throw new Error(`${rotuloFerramenta(ferramentas[i])} já foi devolvida.`);
    });
    refs.forEach((ref, i) => {
      const { comQuem } = atuais[i].data();
      tx.update(ref, estado === 'defeito'
        ? { comQuem: null, situacao: 'defeito', situacaoDesde: serverTimestamp(), situacaoObs: obs }
        : { comQuem: null });
      tx.set(doc(collection(db, 'movimentos')), {
        ferramentaId: ferramentas[i].id, ferramenta: rotuloFerramenta(ferramentas[i]),
        pessoaId: comQuem.pessoaId, pessoa: comQuem.nome,
        acao: 'devolucao', estado, obs, criadoEm: serverTimestamp(),
      });
    });
  });
}

// ---------- Manutenção ----------
// situacao da ferramenta: null (normal) | 'defeito' (separada, esperando conserto) | 'assistencia' (fora, consertando)
// acao: 'defeito', 'assistencia', 'conserto' (voltou boa) ou 'revisao' (revisão feita, continua em uso normal).
// Cada uma também entra no histórico, sem pessoa.

const SITUACAO_TEXTO = { defeito: 'com defeito', assistencia: 'na assistência' };

export async function manutencaoFerramenta(ferramenta, acao, obs = '') {
  const ref = doc(db, 'ferramentas', ferramenta.id);
  await runTransaction(db, async tx => {
    const atual = (await tx.get(ref)).data();
    if (atual?.comQuem) throw new Error(`${rotuloFerramenta(ferramenta)} está com ${atual.comQuem.nome}. Registre a devolução antes.`);
    const campos = {
      defeito: { situacao: 'defeito', situacaoDesde: serverTimestamp(), situacaoObs: obs },
      assistencia: { situacao: 'assistencia', situacaoDesde: serverTimestamp(), situacaoObs: obs },
      conserto: { situacao: null, situacaoObs: '', ultimaRevisao: serverTimestamp() },
      revisao: { ultimaRevisao: serverTimestamp() },
    }[acao];
    tx.update(ref, campos);
    tx.set(doc(collection(db, 'movimentos')), {
      ferramentaId: ferramenta.id, ferramenta: rotuloFerramenta(ferramenta),
      pessoaId: '', pessoa: '', acao, obs, criadoEm: serverTimestamp(),
    });
  });
}

// Correções no histórico, como no extrato: nada é apagado de verdade.
// Editar guarda como era antes; excluir só marca (continua no backup).
// comQuem: undefined = não mexe na ferramenta; null = fica na empresa; objeto = fica com essa pessoa.
// (Usado quando a movimentação corrigida é a última da ferramenta e muda quem está com ela.)

export async function editarMovimento(mov, { pessoa, obs }, comQuem) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'movimentos', mov.id), {
    pessoaId: pessoa.id, pessoa: pessoa.nome, obs,
    alteracoes: arrayUnion({ em: new Date().toISOString(), antes: { pessoa: mov.pessoa, obs: mov.obs || '' } }),
  });
  if (comQuem !== undefined) batch.update(doc(db, 'ferramentas', mov.ferramentaId), { comQuem });
  await batch.commit();
}

// extra: outros campos da ferramenta a acertar junto (ex.: tirar o "com defeito" de uma devolução excluída)
export async function excluirMovimento(mov, comQuem, extra = {}) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'movimentos', mov.id), { excluido: true, excluidoEm: serverTimestamp() });
  if (comQuem !== undefined) batch.update(doc(db, 'ferramentas', mov.ferramentaId), { comQuem, ...extra });
  await batch.commit();
}

// ---------- Avisos (e-mail e notificação no celular) ----------
// Quem envia é o script do Google, que confere quem está pedindo o envio:
// marceneiro só consegue avisar o administrador; o administrador avisa qualquer marceneiro.
//   email: { para, assunto, mensagem }  → e-mail
//   push:  { para: 'admin' | uid, titulo, corpo } → notificação nos aparelhos dessa pessoa

export async function notificar({ email, push }) {
  if (!emailConfigurado) return;
  const idToken = await auth.currentUser.getIdToken();
  const resposta = await fetch(EMAIL_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita bloqueio de CORS do Google
    body: JSON.stringify({ idToken, email, push }),
  });
  const resultado = await resposta.json();
  if (!resultado.ok) throw new Error(resultado.erro || 'Falha ao enviar o aviso');
}

// ---------- Notificações no celular: cada aparelho que ativou fica guardado ----------
// dispositivos/{código do aparelho} → { uid, papel: 'admin' | 'marceneiro', atualizadoEm }

export const notificacoesConfiguradas = !naoPreenchido(VAPID_KEY);

// Código do aparelho para receber notificações (pede ao Firebase usando o service worker do app)
async function codigoDoAparelho() {
  if (!notificacoesConfiguradas || !(await suportaNotificacoes())) return null;
  const registro = await navigator.serviceWorker.ready;
  return getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registro });
}

export const suportaNotificacoes = () => isSupported().catch(() => false);

// Chamado depois que a pessoa permitiu as notificações (e a cada login, para manter atualizado)
export async function registrarAparelho(user) {
  const codigo = await codigoDoAparelho();
  if (!codigo) return false;
  await setDoc(doc(db, 'dispositivos', codigo), {
    uid: user.uid,
    papel: user.role,
    atualizadoEm: serverTimestamp(),
  });
  return true;
}

// Ao sair, o aparelho para de receber avisos daquela conta
export async function esquecerAparelho() {
  if (globalThis.Notification?.permission !== 'granted') return; // iPhone fora da tela de início não tem
  const codigo = await codigoDoAparelho();
  if (codigo) await deleteDoc(doc(db, 'dispositivos', codigo));
}
