/* =========================================================
   Avisos do Caixa dos Marceneiros (Google Apps Script)
   Este arquivo NÃO roda no site: o conteúdo fica em script.google.com,
   publicado como "App da Web" (projeto "Caixa Marceneiros - Avisos").

   Manda e-mail e notificação no celular. Não usa nenhuma chave secreta:
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

// ---------- Aviso diário (roda sozinho todo dia às 8h) ----------
// Avisa o marceneiro quando um valor agendado chega na data: serviço liberado ou parcela descontada.

function avisarAgendadosDeHoje() {
  const hoje = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
  buscar('lancamentos', 'data', hoje).forEach(d => {
    const f = d.fields || {};
    // O Firestore devolve cada campo como { stringValue }, { booleanValue }, { doubleValue }...
    const lido = campo => {
      const v = f[campo];
      if (!v) return undefined;
      if ('stringValue' in v) return v.stringValue;
      if ('booleanValue' in v) return v.booleanValue;
      return Number(v.doubleValue || v.integerValue);
    };
    if (lido('cancelado') || lido('estornado') || lido('estornoDe')) return;
    // Lançado hoje mesmo não era agendado: o marceneiro já foi avisado na hora
    const criado = f.criadoEm && Utilities.formatDate(new Date(f.criadoEm.timestampValue), FUSO, 'yyyy-MM-dd');
    if (!criado || criado >= hoje) return;

    const credito = lido('tipo') === 'credito';
    enviarNotificacao(lido('uid'),
      credito ? 'Valor liberado hoje' : 'Desconto agendado para hoje',
      lido('desc') + ' · ' + (credito ? '+ ' : '− ') + dinheiro(lido('valor')));
  });
}

function dinheiro(valor) {
  const [inteiro, centavos] = Number(valor).toFixed(2).split('.');
  return 'R$ ' + inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + centavos;
}

// Rode esta função UMA vez pelo editor para ligar o aviso diário das 8h
function instalarAvisoDiario() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'avisarAgendadosDeHoje')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('avisarAgendadosDeHoje').timeBased().atHour(8).everyDays(1).inTimezone(FUSO).create();
}
