/* =========================================================
   Avisos por e-mail do Caixa dos Marceneiros (Google Apps Script)
   Este arquivo NÃO roda no site: cole o conteúdo em script.google.com
   e publique como "App da Web". Veja COMO-CONFIGURAR.md, passo 6.

   Segurança: o script confere no Firebase quem está pedindo o envio.
   - Marceneiro: o e-mail só vai para o administrador.
   - Administrador: pode mandar para o marceneiro (aprovação/recusa).
   ========================================================= */

const ADMIN_EMAIL = 'noartemoveis@gmail.com';
const FIREBASE_API_KEY = 'AIzaSyDwmNJIMrO-agVmbfF-QEHNS1XEKBiJh3I';

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    const remetente = emailDoLogin(dados.idToken);
    if (!remetente) return responder({ ok: false, erro: 'Login inválido' });

    const ehAdmin = remetente.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    MailApp.sendEmail({
      to: ehAdmin && dados.para ? dados.para : ADMIN_EMAIL,
      replyTo: remetente,
      name: 'Caixa dos Marceneiros',
      subject: String(dados.assunto || 'Aviso').slice(0, 150),
      body: String(dados.mensagem || '').slice(0, 2000),
    });
    return responder({ ok: true });
  } catch (err) {
    return responder({ ok: false, erro: String(err) });
  }
}

// Pergunta ao Firebase qual é o e-mail do login que enviou o pedido
function emailDoLogin(idToken) {
  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY;
  const resposta = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ idToken: idToken }),
    muteHttpExceptions: true,
  });
  if (resposta.getResponseCode() !== 200) return null;
  const usuario = (JSON.parse(resposta.getContentText()).users || [])[0];
  return usuario ? usuario.email : null;
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
