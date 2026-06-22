# Session Management — Guia do Cliente (Postman · Browser · Node)

> **TL;DR:** esta API usa **JWT par (access + refresh)**. O `accessToken` é o crachá do dia-a-dia (15 min); o `refreshToken` é a chave de renovação (7 dias). Toda chamada autenticada envia `Authorization: Bearer <accessToken>`. Quando o access expira, troque o par chamando `mutation refresh(refreshToken: "...")` — o servidor **revoga o refreshToken antigo e emite um novo par** (rotação estrita).

---

## 1. Modelo mental (o que cada token faz)

| Token | Quem emite | Quem usa | TTL (default) | Onde guardar (cliente) |
| --- | --- | --- | --- | --- |
| `accessToken` | `mutation login` ou `mutation refresh` | Toda request autenticada (header `Authorization`) | `15m` (`JWT_ACCESS_TTL`) | Memória volátil + armazenamento do cliente (localStorage / cookie httpOnly / session storage) |
| `refreshToken` | `mutation login` ou `mutation refresh` | **Apenas** `mutation refresh` | `7d` (`JWT_REFRESH_TTL`) | **Mais protegido que o access** — usar httpOnly cookie quando possível; senão, variável de sessão/ambiente, nunca localStorage em produção |
| `user` | vem junto no `AuthPayload` | UI (mostrar nome, role, esconder botões de admin) | até logout | Mesmo local do access |

**Regras inegociáveis do servidor (Apollo auth plugin — `src/auth/authPlugin.ts`):**

1. Header é lido como `Authorization: Bearer <token>`. **Espaço único depois de `Bearer`**, sem aspas.
2. Se o header não começar com `Bearer `, ou se o JWT for inválido/expirado, `ctx.user = null`. O resolver decide se isso vira `UNAUTHENTICATED` ou segue anônimo.
3. Endpoints públicos (sem checagem): `health`, `login`, `refresh`. **Todos os demais exigem `Authorization`.**
4. **Apollo Server 4+ tem CSRF protection** — toda POST precisa dos headers `Content-Type: application/json` **E** `apollo-require-preflight: true` (já incluídos na collection do Postman).

---

## 2. Fluxo end-to-end (passo a passo)

```
┌─────────┐  1. login(email, password)   ┌──────────────┐
│ Cliente │ ───────────────────────────▶ │   API        │
│         │ ◀─────────────────────────── │ (Apollo)     │
│         │   { accessToken,             │              │
│         │     refreshToken, user }     │              │
└────┬────┘                              └──────────────┘
     │ 2. guarda accessToken em
     │    header; refreshToken em local seguro
     ▼
┌─────────┐  3. POST /graphql + Bearer <accessToken>
│ Cliente │ ───────────────────────────▶ ┌──────────────┐
│         │ ◀─────────────────────────── │   200 OK     │
└────┬────┘                              └──────────────┘
     │ ... 14 minutos se passam ...
     ▼
┌─────────┐  4. POST /graphql + Bearer <accessToken> (expirado)
│ Cliente │ ───────────────────────────▶ ┌──────────────┐
│         │ ◀─────────────────────────── │  401 / err   │
└────┬────┘                              └──────────────┘
     │ 5. pega refreshToken guardado
     ▼
┌─────────┐  6. mutation refresh(refreshToken: "<rt>")
│ Cliente │ ───────────────────────────▶ ┌──────────────┐
│         │ ◀─────────────────────────── │ novo { accessToken,
│         │                              │        refreshToken, user }
└────┬────┘                              └──────────────┘
     │ 7. atualiza AMBOS os tokens guardados
     │ 8. refaz a request original com o novo accessToken
     ▼
   sucesso
```

> **Detalhe crítico — rotação:** cada `refreshToken` só pode ser usado **uma vez**. Quando você chama `mutation refresh`, o token anterior é marcado `revoked_at = now()` no banco (`refresh_tokens` table). Tentar reusar retorna `Invalid refresh token`. Isso é intencional — se um atacante roubar o refreshToken, a próxima request legítima já invalida o dele.

---

## 3. Setup no Postman (passo a passo, do zero)

### 3.1. Importar schema e collection

1. Abra o Postman → **APIs** → **+ Create new API** → escolha **GraphQL**.
2. Em **Define schema** → **Schema type**: `SDL` → cole o conteúdo de [`schema.graphql`](../schema.graphql) (raiz do repo).
   - **Download direto:** [`schema.graphql`](../schema.graphql) (link relativo ao repo) — copie o conteúdo e cole no Postman.
   - **Mirror público** (raw): `https://raw.githubusercontent.com/<owner>/Api-Orquestrador/main/schema.graphql` — substitua `<owner>` pelo usuário correto do repo.
3. Em **Configure requests** → URL `https://orcapi.martiellima.com/` e headers padrão `Content-Type: application/json` + `apollo-require-preflight: true`.
4. Salve. Agora cada request dessa API ganha autocomplete de campos enquanto digita.
5. **Import** → selecione [`audit-log.postman_collection.json`](../audit-log.postman_collection.json) (raiz do repo). Essa collection já tem o request `Login (admin)` configurado (ver §3.3).

### 3.2. Variáveis de ambiente/collection

A collection já vem com 3 variáveis:

| Nome | Valor inicial | Função |
| --- | --- | --- |
| `baseUrl` | `https://orcapi.martiellima.com/` | Endpoint raiz |
| `token` | `""` (vazio) | `accessToken` corrente — usado em `Authorization: Bearer {{token}}` |
| `targetUserId` | `""` | Auxiliar para requests que precisam de um `id` específico |

> **Dica:** para isolar ambientes (dev/staging/prod), crie **Environments** separados (engrenagem → Environments) e duplique as vars com outros valores. Selecione o env ativo no canto superior direito.

### 3.3. Request `Login (admin)`

A request `1. Setup > Login (admin)` faz:

**Body (raw JSON):**
```graphql
mutation L($e: String!, $p: String!) {
  login(email: $e, password: $p) {
    accessToken
    refreshToken
    user { id email role }
  }
}
```
com variables `{ "e": "admin@local.dev", "p": "admin1234" }` (ajuste conforme seu seed — ver `.env`/`SEED_ADMIN_EMAIL`).

**Aba Tests (já configurado):**
```js
const json = pm.response.json();
if (json.data && json.data.login && json.data.login.accessToken) {
  pm.collectionVariables.set('token', json.data.login.accessToken);
  pm.collectionVariables.set('refreshToken', json.data.login.refreshToken);
  console.log('Tokens salvos em {{token}} e {{refreshToken}}');
} else {
  console.error('Login falhou:', JSON.stringify(json));
}
```

> ⚠️ **Por que `refreshToken` na seleção?** O GraphQL só retorna os campos que você pede. Se você pedir só `accessToken` e `user`, o `refreshToken` simplesmente **não vem na resposta** — não é o servidor escondendo, é a spec. Sempre inclua `refreshToken` no selection set do login.

### 3.4. Pre-request Script (renovação automática) — collection level

A collection tem um **Pre-request Script no nível da collection** que:

1. Lê `accessToken` da variável `token`.
2. Decodifica o payload (sem validar assinatura — só pra ler `exp`).
3. Se estiver expirado (ou faltando), chama `mutation refresh` automaticamente com `{{refreshToken}}`, salva os novos tokens e segue.
4. Se o refresh também falhar, **limpa as vars e loga erro** — você precisa logar de novo.

```js
// pm.collectionVariables.get('refreshUrl') é opcional; aqui usamos baseUrl
const baseUrl = pm.collectionVariables.get('baseUrl');
const token = pm.collectionVariables.get('token');
const refreshToken = pm.collectionVariables.get('refreshToken');

function decodeJwtExp(jwt) {
  if (!jwt) return 0;
  const part = jwt.split('.')[1];
  if (!part) return 0;
  try {
    const pad = part + '='.repeat((4 - part.length % 4) % 4);
    return JSON.parse(atob(pad.replace(/-/g, '+').replace(/_/g, '/'))).exp || 0;
  } catch { return 0; }
}

async function callRefresh(rt) {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apollo-require-preflight': 'true'
    },
    body: JSON.stringify({
      query: 'mutation R($rt: String!) { refresh(refreshToken: $rt) { accessToken refreshToken user { id email role } } }',
      variables: { rt }
    })
  });
  return res.json();
}

(async () => {
  const exp = decodeJwtExp(token);
  const now = Math.floor(Date.now() / 1000);
  if (exp > now + 30) return; // token ainda válido (margem 30s)

  if (!refreshToken) {
    console.warn('[pre-request] sem refreshToken — execute Login primeiro');
    return;
  }
  const json = await callRefresh(refreshToken);
  if (json.data?.refresh?.accessToken) {
    pm.collectionVariables.set('token', json.data.refresh.accessToken);
    pm.collectionVariables.set('refreshToken', json.data.refresh.refreshToken);
    console.log('[pre-request] tokens renovados automaticamente');
  } else {
    pm.collectionVariables.unset('token');
    pm.collectionVariables.unset('refreshToken');
    console.error('[pre-request] refresh falhou — faça Login novamente', json);
  }
})();
```

> **Como colar isso na collection:** clique direito na collection → **Edit** → aba **Pre-request Scripts** → cole o bloco acima. Ele roda **antes de cada request** da collection. Requests em sub-folders herdam scripts do pai (a menos que você sobrescreva).

### 3.5. Autenticação nos demais requests

Para qualquer request autenticada (`me`, `users`, `veiculos`, `auditLog`, etc.):

**Opção A — Header manual (mais explícito):**
- Aba **Headers** → adicione `Authorization` = `Bearer {{token}}`.

**Opção B — Aba Authorization (recomendado):**
- Aba **Authorization** → Type: **Bearer Token** → Token: `{{token}}`.
- Postman adiciona o header automaticamente.

> ⚠️ **Erro comum:** se a aba **Authorization** estiver como **Inherit auth from parent** mas a collection **não tiver** auth configurada, a request sai **sem header**. Solução: ou configure auth na raiz da collection (edit collection → Authorization), ou defina explicitamente em cada request.

---

## 4. Setup no navegador (vanilla JS + fetch)

```js
// session.js — gerenciador único de tokens
const session = {
  accessToken: localStorage.getItem('accessToken') || null,
  refreshToken: localStorage.getItem('refreshToken') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  async login(email, password) {
    const r = await fetch('https://orcapi.martiellima.com/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apollo-require-preflight': 'true' },
      body: JSON.stringify({
        query: `mutation($e:String!,$p:String!){
          login(email:$e,password:$p){
            accessToken refreshToken user{ id email role }
          }
        }`,
        variables: { e: email, p: password }
      })
    });
    const { data, errors } = await r.json();
    if (errors) throw new Error(errors[0].message);
    this._save(data.login);
    return data.login.user;
  },

  async refresh() {
    const r = await fetch('https://orcapi.martiellima.com/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apollo-require-preflight': 'true' },
      body: JSON.stringify({
        query: `mutation($rt:String!){
          refresh(refreshToken:$rt){ accessToken refreshToken user{ id email role } }
        }`,
        variables: { rt: this.refreshToken }
      })
    });
    const { data, errors } = await r.json();
    if (errors) { this.logout(); throw new Error(errors[0].message); }
    this._save(data.refresh);
  },

  async gql(query, variables = {}) {
    if (!this.accessToken) throw new Error('não autenticado');
    const r = await fetch('https://orcapi.martiellima.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apollo-require-preflight': 'true',
        'Authorization': `Bearer ${this.accessToken}`
      },
      body: JSON.stringify({ query, variables })
    });
    if (r.status === 401 || r.status === 403) {
      // access expirou → tenta refresh e refaz
      await this.refresh();
      return this.gql(query, variables);
    }
    return r.json();
  },

  _save({ accessToken, refreshToken, user }) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.user = user;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
  },

  logout() {
    this.accessToken = this.refreshToken = this.user = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
};

// uso:
await session.login('admin@local.dev', 'admin1234');
const { data } = await session.gql(`query { veiculos(quantidade: 5) { idVeiculo placa } }`);
```

---

## 5. Setup em Node.js (axios com interceptor)

```ts
import axios, { AxiosError, AxiosRequestConfig } from 'axios';

const ENDPOINT = 'https://orcapi.martiellima.com/';

type AuthPayload = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
};

let tokens: AuthPayload | null = null;

const api = axios.create({ baseURL: ENDPOINT });

api.interceptors.request.use((cfg: AxiosRequestConfig) => {
  if (tokens?.accessToken) {
    cfg.headers = cfg.headers ?? {};
    (cfg.headers as Record<string, string>).Authorization =
      `Bearer ${tokens.accessToken}`;
  }
  (cfg.headers as Record<string, string>)['apollo-require-preflight'] = 'true';
  return cfg;
});

let refreshing: Promise<void> | null = null;
api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as AxiosRequestConfig & { _retry?: boolean };
    if (err.response?.status !== 401 || original._retry || !tokens?.refreshToken) {
      throw err;
    }
    original._retry = true;
    refreshing ??= (async () => {
      const { data } = await axios.post<{ data: { refresh: AuthPayload } }>(
        ENDPOINT,
        {
          query: `mutation($rt:String!){
            refresh(refreshToken:$rt){ accessToken refreshToken user{ id email role } }
          }`,
          variables: { rt: tokens!.refreshToken }
        },
        { headers: { 'Content-Type': 'application/json', 'apollo-require-preflight': 'true' } }
      );
      tokens = data.data.refresh;
    })().finally(() => { refreshing = null; });
    await refreshing;
    return api.request(original);
  }
);

// bootstrap
async function login(email: string, password: string) {
  const { data } = await axios.post<{ data: { login: AuthPayload } }>(
    ENDPOINT,
    {
      query: `mutation($e:String!,$p:String!){
        login(email:$e,password:$p){ accessToken refreshToken user{ id email role } }
      }`,
      variables: { e: email, p: password }
    },
    { headers: { 'Content-Type': 'application/json', 'apollo-require-preflight': 'true' } }
  );
  tokens = data.data.login;
}

// uso
await login('admin@local.dev', 'admin1234');
const veiculos = await api.post('/', {
  query: `query { veiculos(quantidade: 5) { idVeiculo placa } }`
});
```

> **Por que `refreshing` é uma promise compartilhada?** Se 5 requests falharem com 401 ao mesmo tempo, você não quer fazer 5 chamadas de refresh — você quer fazer 1 e reusar. O padrão acima (lock com reassign) é o mesmo que [`src/tui/api/withRefreshRetry.ts`](../src/tui/api/withRefreshRetry.ts) usa internamente.

---

## 6. Segurança — o que **NÃO** fazer

| ❌ Errado | ✅ Certo |
| --- | --- |
| `localStorage.setItem('refreshToken', rt)` em SPA de produção | httpOnly cookie setado pelo backend (`Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict`) |
| Mandar access no body da request | Sempre no header `Authorization` |
| Logar token no console em produção | Logar só `request id` ou hash curto |
| Reusar o mesmo refreshToken em vários clients | 1 sessão por dispositivo; revogue as antigas via `revokeRefreshToken(id)` |
| Confiar em `exp` no client sem validar no server | Server valida assinatura (`JWT_ACCESS_SECRET`) — `exp` é dica de UX, não segurança |
| Ignorar `User.active = false` no client | Server retorna `Invalid credentials`; client limpa sessão |

---

## 7. Troubleshooting

### "Não autenticado" mesmo com Bearer Token configurado

Siga essa checklist em ordem:

1. **A variável `{{token}}` está mesmo preenchida?**
   - Abra **Edit collection** → aba **Variables** → veja o valor atual de `token`. Se estiver vazio, **execute `Login (admin)` primeiro** (ele salva via script de Tests).
2. **A request usa a variável certa?**
   - Na aba **Authorization**, o campo Token deve ser exatamente `{{token}}` (não `Bearer {{token}}` — o Postman adiciona o prefixo sozinho quando o type é Bearer Token).
3. **A aba Authorization está herdando mas a collection não tem auth?**
   - **Edit collection → Authorization** → configure `Bearer Token` + `{{token}}` lá, OU defina explicitamente em cada request.
4. **O token expirou?**
   - Decodifique em [jwt.io](https://jwt.io) — campo `exp` em segundos. Se passou, faça login de novo ou deixe o Pre-request Script (§3.4) cuidar.
5. **Você está rodando contra o servidor certo?**
   - `baseUrl` aponta pra `https://orcapi.martiellima.com/`? Os tokens emitidos por um servidor **não funcionam em outro** (a assinatura usa `JWT_ACCESS_SECRET`, e cada deploy tem o seu).
6. **Headers faltando?**
   - Em **Headers**, garanta `Content-Type: application/json` e `apollo-require-preflight: true`. Apollo Server 4 rejeita POST sem isso (CSRF).

### "Invalid refresh token" ao tentar renovar

- O token já foi usado antes (rotação estrita — cada refresh só vale 1x). **Faça login de novo.**
- O token expirou (7 dias). **Faça login de novo.**
- O usuário foi desativado (`active = false`). **Faça login com outro user.**
- O token foi revogado manualmente (`revokeRefreshToken`). **Faça login de novo.**

### Login retorna `Invalid credentials`

- Email errado (case-insensitive, mas deve existir no banco).
- Senha errada.
- Usuário `active = false` — `mutation updateUser(id, { active: true })` (admin).

### Apollo reclama de CSRF mesmo com `apollo-require-preflight: true`

- Você está mandando `Content-Type` errado? Precisa ser `application/json` exato. `text/plain` ou ausente dispara CSRF.
- Está mandando via GET? Apollo Server 4 só aceita mutations/queries em POST.

---

## 8. Endpoints do servidor relacionados

- `mutation login(email, password): AuthPayload!` — [`docs/api.md` § Auth → login](api.md#loginnome-string-password-string-authpayload)
- `mutation refresh(refreshToken): AuthPayload!` — [`docs/api.md` § Auth → refresh](api.md#refreshrefreshtoken-string-authpayload)
- `query me: User!` — [`docs/api.md` § User → me](api.md#me-user)
- `query refreshTokens(userId): [RefreshToken!]!` (admin) — [`docs/api.md` § User → refreshTokens](api.md#refreshtokensuserid-id-refreshtoken-admin)
- `mutation revokeRefreshToken(id): Boolean!` (admin) — [`docs/api.md` § User → revokeRefreshToken](api.md#revokerefreshtokenid-id-boolean-admin)

---

## 9. Apêndice — Schema GraphQL (download)

O SDL completo está em [`schema.graphql`](../schema.graphql) na raiz do repo.

- **Caminho local:** `./schema.graphql`
- **Como usar:** abra o arquivo no editor, copie o conteúdo, cole em **Postman → APIs → Create API → GraphQL → SDL** (autocomplete grátis nos requests).
- **Referência navegável:** [`docs/api-schema-reference.md`](api-schema-reference.md).

---

## 10. Resumo em 30 segundos

1. **Login** → guarde `accessToken` (15min) e `refreshToken` (7d).
2. **Request** → sempre `Authorization: Bearer {{accessToken}}` + `apollo-require-preflight: true`.
3. **Expirou?** → `mutation refresh(refreshToken: "{{refreshToken}}")` → atualize ambos.
4. **Logout** → limpe os dois tokens e redirecione pro login.
5. **Bug** → confira checklist da §7.