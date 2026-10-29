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

// 3) Endereço do script de avisos por e-mail e notificação (Google Apps Script).
//    Enquanto estiver "COLE_AQUI", o app funciona normalmente, só não manda avisos.
export const EMAIL_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzqHXhRkQ4GoPpUvUxkDUDCA7dN2ckClgJe_5JNW0mHfRZ1O4IrQs4iJxQhhnFEfwj0Hw/exec';

// 4) Chave PÚBLICA para notificações no celular (pode ficar à mostra, não é segredo)
//    Console do Firebase > Configurações do projeto > Cloud Messaging > Certificados push da Web
export const VAPID_KEY = 'BPFvuIq-65eDneh1280ApYuFb8PHWC0Zo-stcVPxGqVRgN9XKqgmCNOrPfAsrPbiAD6Vm6v630Ip4nY78S5nglc';
