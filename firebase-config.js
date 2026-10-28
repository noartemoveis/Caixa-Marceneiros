/* =========================================================
   Configuração — o único arquivo que você edita.
   Veja o passo a passo em COMO-CONFIGURAR.md
   ========================================================= */

// 1) Cole aqui os dados do seu projeto Firebase
//    (Console do Firebase > Configurações do projeto > Seus apps > App da Web)
export const firebaseConfig = {
  apiKey: 'AIzaSyDwmNJIMrO-agVmbfF-QEHNS1XEKBiJh3I',
  authDomain: 'caixa-noart.firebaseapp.com',
  projectId: 'caixa-noart',
  storageBucket: 'caixa-noart.firebasestorage.app',
  messagingSenderId: '974637842008',
  appId: '1:974637842008:web:39c93b957237f016e0542d',
};

// 2) E-mail do administrador (o mesmo que vai nas regras do Firestore e no script de e-mail)
export const ADMIN_EMAIL = 'noartemoveis@gmail.com';

// 3) Endereço do script de avisos por e-mail (Google Apps Script).
//    Enquanto estiver "COLE_AQUI", o app funciona normalmente, só não manda e-mail.
export const EMAIL_WEBHOOK_URL = 'COLE_AQUI';
