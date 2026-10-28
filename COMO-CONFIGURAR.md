# Como colocar o Caixa dos Marceneiros no ar

Tudo aqui é gratuito e não pede cartão. Leva uns 40 minutos, uma vez só.

| Peça | Para que serve |
|---|---|
| **Firebase** (Google) | Login e banco de dados |
| **Google Apps Script** | Mandar os e-mails de aviso |
| **GitHub** (privado) | Guardar todas as versões do código, sem ninguém ver |
| **Netlify** | Publicar o site, atualizado sozinho a cada versão |

---

## 1. Criar o projeto no Firebase

1. Entre em <https://console.firebase.google.com> com sua conta Google.
2. Clique em **Adicionar projeto**, dê o nome `caixa-noart` e avance. Pode desativar o Google Analytics.

## 2. Ativar o login

1. No menu da esquerda: **Criação > Authentication > Vamos começar**.
2. Na aba **Método de login**, escolha **E-mail/senha**, ative a primeira chave e salve.
3. Na aba **Usuários**, clique em **Adicionar usuário** e crie **o seu acesso de administrador**: seu e-mail e uma senha forte.
4. Na aba **Modelos**, clique no lápis e mude o **idioma** para **Português (Brasil)**. Assim, o e-mail de criar senha que os marceneiros recebem chega em português.

## 3. Criar o banco de dados

1. No menu: **Criação > Firestore Database > Criar banco de dados**.
2. Local: **southamerica-east1 (São Paulo)**. Modo: **produção**.
3. Abra a aba **Regras**, apague o que estiver lá e cole o conteúdo do arquivo `firestore.rules`.
4. Nas regras, troque `COLE_SEU_EMAIL_AQUI` pelo **mesmo e-mail do passo 2** e clique em **Publicar**.

## 4. Ligar o app ao Firebase

1. Clique na engrenagem ⚙ e depois em **Configurações do projeto**.
2. Em **Seus apps**, clique no ícone **`</>`** (Web), dê um apelido (ex.: `caixa`) e clique em **Registrar app**.
3. Copie os valores do bloco `firebaseConfig` para o arquivo `firebase-config.js`.
4. No mesmo arquivo, troque `COLE_SEU_EMAIL_AQUI` pelo seu e-mail de administrador.

## 5. Avisos por e-mail

Quando um marceneiro pede uma retirada, **você recebe um e-mail**. Quando você aprova ou recusa, **ele recebe um e-mail**. Os e-mails saem da sua própria conta Google (limite de 100 por dia).

1. Entre em <https://script.google.com> e clique em **Novo projeto**.
2. Apague o que estiver lá e cole o conteúdo do arquivo `email-script.gs`.
3. No topo do código, troque:
   - `COLE_SEU_EMAIL_AQUI` pelo seu e-mail de administrador;
   - `COLE_A_API_KEY_DO_FIREBASE_AQUI` pelo `apiKey` que está no `firebase-config.js`.
4. Clique em **Implantar > Nova implantação**. Na engrenagem, escolha **App da Web**, depois:
   - **Executar como:** Eu;
   - **Quem pode acessar:** Qualquer pessoa.
5. Clique em **Implantar** e autorize com a sua conta Google. Se aparecer "app não verificado", vá em **Avançado > Acessar**: o app é seu.
6. Copie o **URL do app da Web** (termina em `/exec`) e cole em `EMAIL_WEBHOOK_URL`, no `firebase-config.js`.

> Mesmo com o endereço público, ninguém consegue usar o script para mandar e-mail. Ele confere no Firebase quem está logado: marceneiro só manda para você, e só você manda para os marceneiros.

## 6. GitHub: guardar as versões (privado)

1. Crie uma conta grátis em <https://github.com>.
2. Instale o **GitHub Desktop**: <https://desktop.github.com>. Abra e entre com a conta do GitHub.
3. No GitHub Desktop: **File > Add local repository** e escolha a pasta **Documentos\Caixa Marceneiros**. Ela já tem versões salvas, então ele reconhece direto.
4. Clique em **Publish repository**, deixe **"Keep this code private" MARCADO** e confirme.

Pronto: o código fica guardado no GitHub e só você vê.

## 7. Netlify: publicar o site

O GitHub só publica site grátis de repositório público. Por isso quem publica é o Netlify, que funciona com o repositório privado.

1. Entre em <https://app.netlify.com/signup> e escolha **Sign up with GitHub** (usa a mesma conta).
2. Clique em **Add new project > Import an existing project > GitHub** e autorize o Netlify.
   Se pedir, libere o acesso só ao repositório **Caixa-Marceneiros**.
3. Escolha o repositório. Nas configurações:
   - **Branch to deploy:** `main`;
   - **Build command:** deixe **vazio**;
   - **Publish directory:** deixe **vazio** (ou `.`).
4. Clique em **Deploy**. Em 1 minuto aparece o endereço, algo como `https://nome-aleatorio.netlify.app`.
5. Para um nome melhor, vá em **Project configuration > Change project name** (ex.: `caixa-noart` vira `https://caixa-noart.netlify.app`).

### A cada alteração

1. Abra o GitHub Desktop. Ele mostra o que mudou.
2. Embaixo à esquerda, escreva um resumo (ex.: "Mudei a cor do botão") e clique em **Commit to main**.
3. Clique em **Push origin**. O Netlify percebe sozinho e o site atualiza em 1 ou 2 minutos.

### Voltar uma versão anterior

- Na aba **History** do GitHub Desktop aparecem todas as versões salvas, com data e resumo.
- Clique com o botão direito numa alteração e escolha **Revert changes in commit** para desfazê-la. Depois clique em **Push origin**.

> Com o Netlify também dá para voltar o **site** para uma versão anterior na hora: em **Deploys**, clique numa publicação antiga e depois em **Publish deploy**.

---

## 8. Usar

1. Abra o endereço do site e entre com seu e-mail e senha de administrador.
2. Toque em **Novo marceneiro** e informe o nome e o **e-mail** dele. Ele recebe um e-mail para **criar a própria senha** (peça para olhar no spam).
3. Passe o endereço do site para os marceneiros.

### Instalar no celular

- **Android (Chrome):** abra o endereço, toque no menu ⋮ e depois em **Instalar app** ou **Adicionar à tela inicial**.
- **iPhone (Safari):** abra o endereço, toque em **Compartilhar** ⬆ e depois em **Adicionar à Tela de Início**.

## O que cada um pode fazer

| | Administrador | Marceneiro |
|---|---|---|
| Ver saldo e extrato | Todos | Só o dele |
| Lançar serviço, retirada e parcelado | ✅ | ❌ |
| Excluir lançamentos e contas | ✅ | ❌ |
| Pedir retirada | — | ✅ |
| Aprovar ou recusar pedidos | ✅ | ❌ |

Esses limites são garantidos pelas regras do banco, não só pelas telas.

## Situações do dia a dia

- **O marceneiro esqueceu a senha:** na tela de entrada, ele digita o e-mail e toca em **Esqueci minha senha**. Você também pode mandar pelo lápis ✏, em **Enviar e-mail para criar nova senha**.
- **O e-mail de criar senha não chegou:** peça para olhar no spam. Depois reenvie pelo lápis ✏.
- **Excluir um marceneiro:** apaga a conta, o histórico e os pedidos. Para cadastrar o **mesmo e-mail** de novo depois, apague antes o login dele em **Authentication > Usuários**, no Console do Firebase.
- **Os e-mails de aviso pararam:** se você mudar o código do script, faça **Implantar > Gerenciar implantações > editar > Nova versão**. O endereço continua o mesmo.
