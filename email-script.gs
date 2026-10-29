/* =========================================================
   Avisos do Caixa dos Marceneiros (Google Apps Script)
   Este arquivo NÃO roda no site: o conteúdo fica em script.google.com,
   publicado como "App da Web" (projeto "Caixa Marceneiros - Avisos").

   Manda e-mail e notificação no celular, e faz o backup semanal no Drive.
   Não usa nenhuma chave secreta:
   o script age com a permissão da conta Google dona do projeto Firebase.

   Segurança: o script confere no Firebase quem está pedindo o envio.
   - Marceneiro: só consegue avisar o administrador.
   - Administrador: pode avisar qualquer marceneiro.
   ========================================================= */

const ADMIN_EMAIL = 'noartemoveis@gmail.com';
const FIREBASE_API_KEY = 'AIzaSyDwmNJIMrO-agVmbfF-QEHNS1XEKBiJh3I';
const PROJETO = 'caixa-noart';
const SITE_URL = 'https://noartemoveis.github.io/Caixa-Marceneiros/';
const FUSO = 'America/Sao_Paulo';

// ---------- Chamado pelo app ----------
// { idToken, email?: { para, assunto, mensagem }, push?: { para: 'admin' | uid, titulo, corpo } }

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    const remetente = loginDe(dados.idToken);
    if (!remetente) return responder({ ok: false, erro: 'Login inválido' });
    const ehAdmin = remetente.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    // Versão antiga do app (ainda guardada em algum celular) mandava o e-mail solto
    const email = dados.email || (dados.assunto ? { para: dados.para, assunto: dados.assunto, mensagem: dados.mensagem } : null);

    if (email) {
      MailApp.sendEmail({
        to: ehAdmin && email.para ? email.para : ADMIN_EMAIL,
        replyTo: remetente.email,
        name: 'Caixa dos Marceneiros',
        subject: String(email.assunto || 'Aviso').slice(0, 150),
        body: String(email.mensagem || '').slice(0, 2000),
      });
    }
    if (dados.push) {
      enviarNotificacao(ehAdmin ? dados.push.para : 'admin', dados.push.titulo, dados.push.corpo);
    }
    return responder({ ok: true });
  } catch (err) {
    return responder({ ok: false, erro: String(err) });
  }
}

// Pergunta ao Firebase quem é o login que enviou o pedido
function loginDe(idToken) {
  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY;
  const resposta = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ idToken: idToken }),
    muteHttpExceptions: true,
  });
  if (resposta.getResponseCode() !== 200) return null;
  const usuario = (JSON.parse(resposta.getContentText()).users || [])[0];
  return usuario ? { email: usuario.email, uid: usuario.localId } : null;
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Notificações ----------

// Chama uma API do Google com a permissão da conta dona do projeto (sem chave secreta)
function googleApi(url, corpo, metodo) {
  const resposta = UrlFetchApp.fetch(url, {
    method: metodo || 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'x-goog-user-project': PROJETO, // usa o projeto do Firebase para as cotas
    },
    payload: corpo ? JSON.stringify(corpo) : undefined,
    muteHttpExceptions: true,
  });
  return { codigo: resposta.getResponseCode(), texto: resposta.getContentText() };
}

const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/' + PROJETO + '/databases/(default)/documents';

// Busca documentos de uma coleção com um filtro "campo == valor"
function buscar(colecao, campo, valor) {
  const r = googleApi(FIRESTORE + ':runQuery', {
    structuredQuery: {
      from: [{ collectionId: colecao }],
      where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: { stringValue: valor } } },
    },
  });
  if (r.codigo !== 200) throw new Error('Firestore ' + r.codigo + ': ' + r.texto);
  return JSON.parse(r.texto).filter(x => x.document).map(x => x.document);
}

// Aparelhos de alguém: 'admin' = todos os aparelhos do administrador; senão, o uid do marceneiro
function aparelhosDe(alvo) {
  const docs = alvo === 'admin' ? buscar('dispositivos', 'papel', 'admin') : buscar('dispositivos', 'uid', alvo);
  return docs.map(d => d.name.split('/').pop());
}

function enviarNotificacao(alvo, titulo, corpo) {
  if (!alvo) return;
  const erros = [];
  aparelhosDe(alvo).forEach(codigo => {
    const r = googleApi('https://fcm.googleapis.com/v1/projects/' + PROJETO + '/messages:send', {
      message: {
        token: codigo,
        data: { titulo: String(titulo || ''), corpo: String(corpo || ''), url: SITE_URL },
        webpush: { headers: { Urgency: 'high', TTL: '86400' } },
      },
    });
    // Aparelho que desinstalou o app ou bloqueou os avisos: sai da lista
    if (r.codigo === 404 || (r.codigo === 400 && r.texto.indexOf('registration token') >= 0)) {
      googleApi(FIRESTORE + '/dispositivos/' + encodeURIComponent(codigo), null, 'delete');
    } else if (r.codigo !== 200) {
      erros.push('Notificação ' + r.codigo + ': ' + r.texto); // tenta os outros aparelhos antes de avisar
    }
  });
  if (erros.length) throw new Error(erros.join(' | '));
}

// O Firestore devolve cada campo como { stringValue }, { booleanValue }, { doubleValue }...
// Aqui vira um objeto comum: { id, nome, valor, criadoEm (data) ... }
function comoObjeto(documento) {
  const objeto = { id: documento.name.split('/').pop() };
  const campos = documento.fields || {};
  Object.keys(campos).forEach(chave => {
    const v = campos[chave];
    if ('stringValue' in v) objeto[chave] = v.stringValue;
    else if ('booleanValue' in v) objeto[chave] = v.booleanValue;
    else if ('integerValue' in v) objeto[chave] = Number(v.integerValue);
    else if ('doubleValue' in v) objeto[chave] = Number(v.doubleValue);
    else if ('timestampValue' in v) objeto[chave] = new Date(v.timestampValue);
  });
  return objeto;
}

// Todos os documentos de uma coleção (de 300 em 300)
function listar(colecao) {
  let documentos = [];
  let pagina = '';
  do {
    const r = googleApi(FIRESTORE + '/' + colecao + '?pageSize=300' + (pagina ? '&pageToken=' + pagina : ''), null, 'get');
    if (r.codigo !== 200) throw new Error('Firestore ' + r.codigo + ': ' + r.texto);
    const resposta = JSON.parse(r.texto);
    documentos = documentos.concat(resposta.documents || []);
    pagina = resposta.nextPageToken || '';
  } while (pagina);
  return documentos.map(comoObjeto);
}

const hojeISO = () => Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
const diaDe = data => Utilities.formatDate(data, FUSO, 'yyyy-MM-dd');

function dinheiro(valor) {
  const [inteiro, centavos] = Number(valor).toFixed(2).split('.');
  return 'R$ ' + inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + centavos;
}

// ---------- Aviso diário (roda sozinho todo dia às 8h) ----------
// Avisa o marceneiro quando um valor agendado chega na data: serviço liberado ou parcela descontada.

function avisarAgendadosDeHoje() {
  const hoje = hojeISO();
  buscar('lancamentos', 'data', hoje).map(comoObjeto).forEach(l => {
    if (l.cancelado || l.estornado || l.estornoDe) return;
    // Lançado hoje mesmo não era agendado: o marceneiro já foi avisado na hora
    if (!l.criadoEm || diaDe(l.criadoEm) >= hoje) return;

    const credito = l.tipo === 'credito';
    enviarNotificacao(l.uid,
      credito ? 'Valor liberado hoje' : 'Desconto agendado para hoje',
      l.desc + ' · ' + (credito ? '+ ' : '− ') + dinheiro(l.valor));
  });
}

// ---------- Backup semanal no Google Drive (toda segunda às 7h) ----------
// Cria uma planilha com tudo na pasta "Caixa Nô Art - Backups" do Drive.

const PASTA_BACKUP = 'Caixa Nô Art - Backups';

function fazerBackup() {
  const hoje = hojeISO();
  const marceneiros = listar('marceneiros').sort((a, b) => a.nome.localeCompare(b.nome));
  const lancamentos = listar('lancamentos').sort((a, b) => (a.data > b.data ? 1 : a.data < b.data ? -1 : 0));
  const pedidos = listar('pedidos').sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));

  const nomeDe = {};
  marceneiros.forEach(m => { nomeDe[m.id] = m.nome; });
  const marceneiro = id => nomeDe[id] || '(conta excluída)';
  const quando = data => (data ? Utilities.formatDate(data, FUSO, 'dd/MM/yyyy HH:mm') : '');
  const dataBR = iso => (iso ? iso.split('-').reverse().join('/') : '');
  const situacao = l => (l.cancelado ? 'Cancelado' : l.estornado ? 'Estornado' : l.estornoDe ? 'Estorno' : l.data > hoje ? 'Agendado' : 'Normal');
  const STATUS = { pendente: 'Aguardando', aprovado: 'Aprovado', recusado: 'Recusado' };

  // Saldo de hoje: o que já aconteceu, sem os agendados cancelados
  const saldoDe = id => lancamentos
    .filter(l => l.marcId === id && !l.cancelado && l.data <= hoje)
    .reduce((s, l) => s + (l.tipo === 'credito' ? l.valor : -l.valor), 0);

  const planilha = SpreadsheetApp.create('Caixa Nô Art - backup ' + hoje);
  const primeira = planilha.getSheets()[0].setName('Lançamentos');

  escreverAba(primeira,
    ['Marceneiro', 'Data', 'Tipo', 'Descrição', 'Cliente', 'Entrada', 'Saída', 'Situação', 'Lançado em'],
    lancamentos.map(l => [marceneiro(l.marcId), dataBR(l.data), l.tipo === 'credito' ? 'Entrada' : 'Saída', l.desc,
      l.cliente || '', l.tipo === 'credito' ? l.valor : '', l.tipo === 'debito' ? l.valor : '', situacao(l), quando(l.criadoEm)]),
    [6, 7]);

  escreverAba(planilha.insertSheet('Pedidos'),
    ['Marceneiro', 'Pedido em', 'Valor', 'Motivo', 'Situação', 'Valor aprovado', 'Respondido em', 'Resposta'],
    pedidos.map(p => [marceneiro(p.marcId), quando(p.criadoEm), p.valor, p.motivo || '', STATUS[p.status] || p.status,
      p.status === 'aprovado' ? (p.valorAprovado || p.valor) : '', quando(p.respondidoEm), p.resposta || '']),
    [3, 6]);

  escreverAba(planilha.insertSheet('Marceneiros'),
    ['Nome', 'E-mail', 'Saldo atual'],
    marceneiros.map(m => [m.nome, m.email, saldoDe(m.id)]),
    [3]);

  DriveApp.getFileById(planilha.getId()).moveTo(pastaDeBackup());
  return planilha.getUrl();
}

function escreverAba(aba, cabecalho, linhas, colunasDinheiro) {
  aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
    .setFontWeight('bold').setBackground('#A0522D').setFontColor('#FFFFFF');
  if (linhas.length) {
    aba.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);
    colunasDinheiro.forEach(c => aba.getRange(2, c, linhas.length, 1).setNumberFormat('"R$" #,##0.00'));
  }
  aba.setFrozenRows(1);
  aba.autoResizeColumns(1, cabecalho.length);
}

function pastaDeBackup() {
  const pastas = DriveApp.getFoldersByName(PASTA_BACKUP);
  return pastas.hasNext() ? pastas.next() : DriveApp.createFolder(PASTA_BACKUP);
}

// ---------- Rotinas automáticas ----------
// Rode esta função UMA vez pelo editor: liga o aviso diário (8h) e o backup semanal (segunda, 7h)
function instalarRotinas() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('avisarAgendadosDeHoje').timeBased().atHour(8).everyDays(1).inTimezone(FUSO).create();
  ScriptApp.newTrigger('fazerBackup').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).inTimezone(FUSO).create();
  fazerBackup(); // já deixa o primeiro backup pronto
}
