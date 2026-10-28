/* =========================================================
   Configuração — o único arquivo que você edita.
   Veja o passo a passo em COMO-CONFIGURAR.md
   ========================================================= */

// 1) Cole aqui os dados do seu projeto Firebase
//    (Console do Firebase > Configurações do projeto > Seus apps > App da Web)
export const firebaseConfig = {
  apiKey: 'COLE_AQUI',
  authDomain: 'COLE_AQUI',
  projectId: 'COLE_AQUI',
  storageBucket: 'COLE_AQUI',
  messagingSenderId: 'COLE_AQUI',
  appId: 'COLE_AQUI',
};

// 2) E-mail do administrador (o mesmo que vai nas regras do Firestore e no script de e-mail)
export const ADMIN_EMAIL = 'COLE_SEU_EMAIL_AQUI';

// 3) Endereço do script de avisos por e-mail (Google Apps Script).
//    Enquanto estiver "COLE_AQUI", o app funciona normalmente, só não manda e-mail.
export const EMAIL_WEBHOOK_URL = 'COLE_AQUI';
