/* =========================================================
   Store — camada de dados (Firebase)
   Login: Firebase Authentication (e-mail e senha).
   Dados: Cloud Firestore. Avisos por e-mail: Google Apps Script.
   A interface (app.js) só conversa com as funções exportadas aqui.

   Coleções no Firestore:
     marceneiros/{id}  → { nome, email, uid, criadoEm }
     lancamentos/{id}  → { marcId, uid, tipo, data, desc, cliente, valor, criadoEm,
                           estornado?, estornadoEm?, estornoDe?, cancelado?, canceladoEm?, alteracoes? }
     pedidos/{id}      → { marcId, uid, valor, motivo, status, criadoEm, respondidoEm }
   O campo "uid" liga cada registro ao login do marceneiro (usado nas regras de segurança).
   ========================================================= */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, query, where, onSnapshot, getDocs,
  addDoc, updateDoc, deleteDoc, writeBatch, runTransaction, serverTimestamp, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, ADMIN_EMAIL, EMAIL_WEBHOOK_URL } from './firebase-config.js';

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

export async function removeMarceneiro(id) {
  for (const colecao of ['lancamentos', 'pedidos']) {
    await emLotes(await docsDoMarceneiro(colecao, id), (batch, d) => batch.delete(d.ref));
  }
  await deleteDoc(doc(db, 'marceneiros', id));
}

// ---------- Lançamentos (só admin) ----------
// tipo: 'credito' (serviço) ou 'debito' (retirada)

function dadosLancamento(marceneiro, { tipo, data, desc, cliente = '', valor }) {
  return {
    marcId: marceneiro.id,
    uid: marceneiro.uid,
    tipo, data, desc, cliente,
    valor: roundCents(valor),
    criadoEm: serverTimestamp(),
  };
}

export const addLancamento = (marceneiro, lancamento) =>
  addDoc(collection(db, 'lancamentos'), dadosLancamento(marceneiro, lancamento));

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
export async function estornarLancamento(lancamento, marceneiro, data) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'lancamentos', lancamento.id), { estornado: true, estornadoEm: serverTimestamp() });
  batch.set(doc(collection(db, 'lancamentos')), {
    ...dadosLancamento(marceneiro, {
      tipo: lancamento.tipo === 'credito' ? 'debito' : 'credito',
      data,
      desc: `Estorno - ${lancamento.desc}`,
      valor: lancamento.valor,
    }),
    estornoDe: lancamento.id,
  });
  await batch.commit();
}

// Agendado que ainda não aconteceu: sai das contas, mas o registro continua no banco
export const cancelarAgendado = id =>
  updateDoc(doc(db, 'lancamentos', id), { cancelado: true, canceladoEm: serverTimestamp() });

// Edição guarda como era antes, para ficar registrado no comprovante
export function editarLancamento(lancamento, { valor, desc, cliente, data }) {
  const antes = { valor: lancamento.valor, desc: lancamento.desc, cliente: lancamento.cliente || '', data: lancamento.data };
  return updateDoc(doc(db, 'lancamentos', lancamento.id), {
    valor: roundCents(valor), desc, cliente, data,
    alteracoes: arrayUnion({ em: new Date().toISOString(), antes }),
  });
}

// ---------- Pedidos de retirada ----------

// Único registro que o marceneiro pode criar (as regras do Firestore garantem isso)
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
async function responder(pedido, status, extra) {
  const ref = doc(db, 'pedidos', pedido.id);
  await runTransaction(db, async tx => {
    const atual = await tx.get(ref);
    if (atual.data()?.status !== 'pendente') throw new Error('Esse pedido já foi respondido.');
    tx.update(ref, { status, respondidoEm: serverTimestamp() });
    extra?.(tx);
  });
}

// Aprovar gera a retirada no extrato, tudo de uma vez
export const aprovarPedido = (pedido, marceneiro, data) =>
  responder(pedido, 'aprovado', tx => tx.set(doc(collection(db, 'lancamentos')), dadosLancamento(marceneiro, {
    tipo: 'debito',
    data,
    desc: pedido.motivo ? `Retirada pedida - ${pedido.motivo}` : 'Retirada pedida',
    valor: pedido.valor,
  })));

export const recusarPedido = pedido => responder(pedido, 'recusado');

// ---------- Avisos por e-mail ----------
// O script do Google confere quem está enviando:
// marceneiro só consegue mandar para o administrador; o administrador manda para qualquer marceneiro.

export async function notificar({ para = '', assunto, mensagem }) {
  if (!emailConfigurado) return;
  const idToken = await auth.currentUser.getIdToken();
  const resposta = await fetch(EMAIL_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita bloqueio de CORS do Google
    body: JSON.stringify({ idToken, para, assunto, mensagem }),
  });
  const resultado = await resposta.json();
  if (!resultado.ok) throw new Error(resultado.erro || 'Falha ao enviar e-mail');
}
