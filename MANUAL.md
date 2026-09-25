# Manual de Deploy — Levicord

Passo a passo para subir a aplicação do zero em qualquer máquina com Docker e tunel Cloudflare.

---

## Pré-requisitos

| Ferramenta | Versão mínima | Verificar |
|------------|---------------|-----------|
| Docker Engine | 24+ | `docker --version` |
| Docker Compose | v2 (plugin) | `docker compose version` |
| Git | qualquer | `git --version` |
| Conta Cloudflare | — | com domínio configurado |

Não é necessário Node.js, pnpm nem nenhuma dependência local — tudo roda dentro de container.

---

## 1. Clonar o repositório

```bash
git clone <URL_DO_REPO> levicord
cd levicord
```

---

## 2. Criar o arquivo `.env`

Crie `.env` na raiz do projeto. **Nunca commitar este arquivo.**

```env
# ─── Banco de dados ───────────────────────────────────────────
POSTGRES_PASSWORD=senha_forte_aqui

# ─── Autenticação JWT ─────────────────────────────────────────
# Gerar com: openssl rand -hex 64
JWT_SECRET=gere_uma_string_aleatoria_longa_aqui

# ─── Google OAuth ─────────────────────────────────────────────
# Criar em: https://console.cloud.google.com → APIs → Credentials → OAuth 2.0 Client IDs
GOOGLE_CLIENT_ID=seu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu_client_secret

# ─── Admin ────────────────────────────────────────────────────
# Emails separados por vírgula. Esses usuários viram ADMIN automaticamente no primeiro login.
ADMIN_EMAILS=seu@email.com,outro@email.com

# ─── MinIO (armazenamento de arquivos) ────────────────────────
MINIO_ACCESS_KEY=usuario_minio_forte
MINIO_SECRET_KEY=senha_minio_forte_minimo_8_chars
MINIO_BUCKET=discord-uploads

# ─── Cloudflare Tunnel ────────────────────────────────────────
# Ver seção 4 abaixo para obter este token
CLOUDFLARED_TOKEN=seu_tunnel_token_aqui

# ─── Grafana ──────────────────────────────────────────────────
GRAFANA_PASSWORD=senha_grafana
```

### Gerar JWT_SECRET seguro

```bash
openssl rand -hex 64
```

---

## 3. Configurar Google OAuth

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um projeto (ou use existente)
3. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Adicionar em **Authorized redirect URIs**:
   ```
   https://SEU_DOMINIO/api/auth/google/callback
   ```
6. Copiar `Client ID` e `Client Secret` para o `.env`

---

## 4. Configurar Cloudflare Tunnel

### 4.1 Criar o tunnel (uma única vez)

No [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com):

1. **Networks → Tunnels → Create a tunnel**
2. Nome: `levicord` (ou qualquer nome)
3. Connector: **Docker**
4. Cloudflare vai exibir o comando com o token — copiar apenas o token:
   ```
   docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <TOKEN_AQUI>
   ```
5. Colar o token em `CLOUDFLARED_TOKEN` no `.env`

### 4.2 Configurar as rotas públicas

Ainda no dashboard, aba **Public Hostname** do tunnel, adicionar:

| Subdomínio | Serviço |
|------------|---------|
| `levicord.uk` (ou seu domínio) | `http://web:80` |
| `levicord.uk/api` | `http://server:3000` |

> O Cloudflare cuida do HTTPS automaticamente. Não é necessário configurar certificados.

### 4.3 Atualizar URLs no docker-compose.yml

Se o domínio for diferente de `levicord.uk`, editar estas linhas em `docker-compose.yml`:

```yaml
server:
  environment:
    FRONTEND_URL: https://SEU_DOMINIO
    OAUTH_CALLBACK_URL: https://SEU_DOMINIO/api/auth/google/callback

web:
  build:
    args:
      VITE_API_URL: https://SEU_DOMINIO
```

---

## 5. Subir a aplicação

```bash
# Build e start de todos os containers
docker compose up -d --build
```

Aguardar todos os serviços ficarem healthy (~60s na primeira vez):

```bash
docker compose ps
```

Saída esperada — todos com `(healthy)` ou `Up`:

```
discord_postgres    Up (healthy)
discord_redis       Up (healthy)
discord_minio       Up (healthy)
discord_server      Up
discord_web         Up
discord_cloudflared Up
discord_prometheus  Up
discord_grafana     Up
```

---

## 6. Verificar que está funcionando

```bash
# Health do servidor
curl http://localhost:3000/livez
# → {"status":"ok"}

curl http://localhost:3000/readyz
# → {"status":"ok"} (confirma Postgres + Redis conectados)

# Logs em tempo real
docker compose logs -f server
docker compose logs -f cloudflared
```

Acesso via browser:

| URL | Serviço |
|-----|---------|
| `https://SEU_DOMINIO` | App principal |
| `http://localhost:9001` | MinIO Console (gerenciar arquivos) |
| `http://localhost:9090` | Prometheus |
| `http://localhost:3001` | Grafana (user: `admin`, senha: `GRAFANA_PASSWORD` do `.env`) |

---

## 7. Primeira execução — migração do banco

Na primeira vez (ou após atualizar o schema Prisma), rodar as migrations:

```bash
docker compose exec server pnpm exec prisma migrate deploy
```

> `migrate deploy` aplica migrations pendentes sem interação. Não usar `migrate dev` em produção.

---

## 8. Atualizar a aplicação

```bash
git pull
docker compose up -d --build
docker compose exec server pnpm exec prisma migrate deploy
```

---

## 9. Comandos úteis

```bash
# Ver logs de um serviço específico
docker compose logs -f server
docker compose logs -f cloudflared

# Parar tudo (mantém volumes/dados)
docker compose down

# Parar e APAGAR todos os dados (volumes)
docker compose down -v

# Reiniciar apenas um serviço
docker compose restart server

# Acessar shell do container do servidor
docker compose exec server sh

# Abrir psql no banco
docker compose exec postgres psql -U postgres -d discord

# Backup manual do banco
docker compose exec postgres pg_dump -U postgres discord > backup_$(date +%Y%m%d).sql

# Restaurar backup
docker compose exec -T postgres psql -U postgres discord < backup_YYYYMMDD.sql
```

---

## 10. Estrutura de serviços

```
┌─────────────────────────────────────────────────────┐
│  Internet                                            │
│       │                                              │
│  Cloudflare CDN + HTTPS                             │
│       │                                              │
│  cloudflared (tunnel) ──► web:80 (nginx + React)   │
│                      └──► server:3000 (Fastify API) │
│                                 │                    │
│                    ┌────────────┼────────────┐       │
│                postgres:5432  redis:6379  minio:9000 │
│                                                      │
│  prometheus:9090 ◄─ scrape ─── server:3000/metrics  │
│  grafana:3001    ◄─ datasource ─ prometheus          │
└─────────────────────────────────────────────────────┘
```

---

## 11. Solução de problemas

### Container `server` reiniciando em loop

```bash
docker compose logs server --tail=50
```

Causas comuns:
- `JWT_SECRET` não definido no `.env` → servidor faz `throw` no startup
- Postgres não terminou de inicializar → aguardar `docker compose ps` mostrar `(healthy)`
- `DATABASE_URL` com senha errada → verificar `POSTGRES_PASSWORD` no `.env`

### Tunnel não conecta

```bash
docker compose logs cloudflared --tail=30
```

- Token inválido → gerar novo token no dashboard Cloudflare
- Tunnel deletado no dashboard → criar novo tunnel e atualizar `CLOUDFLARED_TOKEN`

### OAuth retorna erro de redirect

- URI de redirect no Google Console não bate com `OAUTH_CALLBACK_URL` no `.env`
- Verificar se o domínio no Google Console é exatamente `https://SEU_DOMINIO/api/auth/google/callback`

### MinIO inacessível

```bash
docker compose logs minio --tail=20
curl http://localhost:9000/minio/health/ready
```

- `MINIO_SECRET_KEY` com menos de 8 caracteres → MinIO rejeita e não sobe

---

## 12. Variáveis de ambiente — referência completa

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `POSTGRES_PASSWORD` | ✅ | Senha do PostgreSQL |
| `JWT_SECRET` | ✅ | Chave de assinatura JWT (mínimo 32 chars, idealmente 64) |
| `GOOGLE_CLIENT_ID` | ✅ | OAuth Google Client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | OAuth Google Client Secret |
| `ADMIN_EMAILS` | ✅ | Emails admin separados por vírgula |
| `CLOUDFLARED_TOKEN` | ✅ | Token do tunnel Cloudflare |
| `MINIO_ACCESS_KEY` | ✅ | Usuário do MinIO |
| `MINIO_SECRET_KEY` | ✅ | Senha do MinIO (mínimo 8 chars) |
| `MINIO_BUCKET` | ❌ | Nome do bucket (default: `discord-uploads`) |
| `GRAFANA_PASSWORD` | ❌ | Senha do Grafana (default: `admin`) |
