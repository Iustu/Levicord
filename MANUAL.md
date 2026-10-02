# Manual de Deploy — Levicord

Guia completo para implantar a aplicação num servidor novo usando **Docker no WSL2**,
do zero ao funcionamento em produção, com um único script automático.

---

## Sumario Rapido

| Passo | O que fazer |
|-------|-------------|
| 1 | Instalar WSL2 e Docker no servidor |
| 2 | Clonar o repositório |
| 3 | Configurar Google OAuth |
| 4 | Configurar Cloudflare Tunnel |
| 5 | Executar `setup.ps1` no Windows ou `bash setup.sh` no Linux — faz tudo automaticamente |
| 6 | Verificar saúde dos containers |

### Windows com Docker Desktop

Se o projeto estiver no Windows e o Docker Desktop estiver instalado, não use
`bash setup.sh` a menos que exista uma distribuição Ubuntu no WSL. O comando
`bash` do Windows tenta usar o WSL; a distribuição interna `docker-desktop` não
possui `/bin/bash`, causando o erro `execvpe(/bin/bash) failed`.

Na raiz do projeto, abra o PowerShell e execute:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup.ps1
```

O `setup.ps1` cria e atualiza o `.env`, gera os segredos, constrói as imagens,
sobe todos os containers, aguarda Postgres/Redis/MinIO e aplica as migrations.
O Docker Desktop deve estar aberto antes da execução. Para atualizações futuras:

```powershell
docker compose up -d --build
docker compose exec server pnpm exec prisma migrate deploy
```

Em um servidor Ubuntu/WSL com Bash instalado, o `setup.sh` continua disponível.

---

## Pre-requisitos do servidor

O servidor precisa ser Ubuntu 22.04+ (físico, VPS, ou VM).
Em Windows com WSL2, o ambiente Ubuntu dentro do WSL serve como o servidor.

### Instalar Docker no Ubuntu/WSL2

Execute os comandos abaixo dentro do terminal WSL/Ubuntu:

```bash
# Remover versões antigas
sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Instalar dependências
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release

# Adicionar chave GPG oficial do Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Adicionar repositório
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker Engine + Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Permitir usar Docker sem sudo (fazer logout e login novamente após este passo)
sudo usermod -aG docker $USER

# Verificar
docker --version
docker compose version
```

> **WSL2 especifico**: o Docker no WSL2 usa o daemon do Windows (Docker Desktop) ou
> o daemon nativo do WSL. Se usar Docker Desktop, certifique-se de que
> "Enable integration with my default WSL distro" esta ativo nas configuracoes.

### Instalar Git e openssl

```bash
sudo apt install -y git openssl curl
```

---

## Estrutura de servicos

```
Internet
    |
Cloudflare CDN + HTTPS (certificado automatico)
    |
cloudflared (tunnel — container Docker)
    |--- web:80          → React (nginx)
    |--- server:3000     → Fastify API
                |
        ┌───────┼───────┐
   postgres  redis    minio
   :5432     :6379    :9000
        |
   prometheus:9090 ← scrape ← server/metrics
   grafana:3001    ← datasource ← prometheus
```

Todos os servicos correm em containers Docker isolados.
O Cloudflare Tunnel expoe a aplicacao publicamente sem abrir portas no firewall.

---

## 1. Clonar o repositório

```bash
git clone <URL_DO_REPO> levicord
cd levicord
```

---

## 2. Configurar Google OAuth (uma unica vez)

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um projeto (ou use existente)
3. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Adicionar em **Authorized redirect URIs**:
   ```
   https://SEU_DOMINIO/api/auth/google/callback
   ```
6. Copiar `Client ID` e `Client Secret` — serão pedidos pelo `setup.sh`

---

## 3. Configurar Cloudflare Tunnel (uma unica vez)

O tunnel permite acesso HTTPS público sem abrir portas no firewall.

1. Acesse [one.dash.cloudflare.com](https://one.dash.cloudflare.com)
2. **Networks → Tunnels → Create a tunnel**
3. Nome: `levicord`
4. Connector: **Docker**
5. Cloudflare exibe um comando como:
   ```
   docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token TOKEN_AQUI
   ```
6. Copiar apenas o `TOKEN_AQUI` — será pedido pelo `setup.sh`

### Rotas do tunnel

Na aba **Public Hostname** do tunnel, adicionar:

| Subdomínio/Path | Serviço interno |
|-----------------|-----------------|
| `levicord.uk` (raiz) | `http://web:80` |
| `levicord.uk/api` | `http://server:3000` |

> O Cloudflare cuida do HTTPS automaticamente. Sem certificados para gerir.

---

## 4. Executar o setup automatico

O script `setup.sh` faz tudo de uma vez:

- Verifica se Docker e Git estao instalados
- Gera `JWT_SECRET`, `DATABASE_ENCRYPTION_KEY` e senhas de forma criptograficamente segura
- Cria o `.env` interativamente (pede apenas o que nao pode ser gerado automaticamente)
- Corrige o `docker-compose.yml` para usar as variaveis do `.env`
- Define `NODE_ENV=production`
- Faz `docker compose up -d --build`
- Aguarda os healthchecks de Postgres, Redis e MinIO
- Roda as migrations do Prisma automaticamente
- Exibe o resumo com todas as URLs

```bash
# Na raiz do projeto:
bash setup.sh
```

O script vai pedir interativamente apenas:

| Campo | Por que precisa ser manual |
|-------|--------------------------|
| `DOMAIN` | Seu dominio publico (ex: levicord.uk) |
| `GOOGLE_CLIENT_ID` | Obtido no Google Console |
| `GOOGLE_CLIENT_SECRET` | Obtido no Google Console |
| `ADMIN_EMAILS` | Decisao sua quais emails sao admin |
| `CLOUDFLARED_TOKEN` | Obtido no Cloudflare Dashboard |

Todo o resto (JWT_SECRET, DATABASE_ENCRYPTION_KEY, POSTGRES_PASSWORD, MINIO_ACCESS_KEY,
MINIO_SECRET_KEY, GRAFANA_PASSWORD) e **gerado automaticamente** com openssl.

---

## 5. Verificar que esta funcionando

```bash
# Estado dos containers (todos devem estar Up)
docker compose ps

# Health da API
curl http://localhost:3000/livez
# → {"status":"ok"}

curl http://localhost:3000/readyz
# → {"status":"ready"}   (confirma Postgres + Redis + MinIO conectados)

# Logs em tempo real
docker compose logs -f server
docker compose logs -f cloudflared
```

Saida esperada do `docker compose ps`:

```
NAME                 STATUS
discord_postgres     Up (healthy)
discord_redis        Up (healthy)
discord_minio        Up (healthy)
discord_server       Up
discord_web          Up
discord_cloudflared  Up
discord_prometheus   Up
discord_grafana      Up
```

### URLs de acesso

| URL | Servico |
|-----|---------|
| `https://SEU_DOMINIO` | App principal (via Cloudflare) |
| `http://localhost:3000/api/docs` | Swagger UI da API |
| `http://localhost:9001` | MinIO Console (gerir ficheiros) |
| `http://localhost:9090` | Prometheus (metricas) |
| `http://localhost:3001` | Grafana (user: `admin`, senha: `GRAFANA_PASSWORD` do `.env`) |

---

## 6. Atualizar a aplicacao

```bash
git pull
docker compose up -d --build
docker compose exec server pnpm exec prisma migrate deploy
```

> `migrate deploy` aplica migrations pendentes sem interacao. Nunca usar `migrate dev` em producao.

---

## 7. Comandos uteis

```bash
# Ver logs de um servico
docker compose logs -f server
docker compose logs -f cloudflared
docker compose logs -f postgres

# Estado de todos os containers
docker compose ps

# Parar tudo (mantém volumes/dados)
docker compose down

# Parar e APAGAR todos os dados (volumes) — IRREVERSIVEL
docker compose down -v

# Reiniciar apenas um servico
docker compose restart server

# Acessar shell do container do servidor
docker compose exec server sh

# Abrir psql no banco
docker compose exec postgres psql -U postgres -d discord

# Backup manual do banco
docker compose exec postgres pg_dump -U postgres discord > backup_$(date +%Y%m%d_%H%M).sql

# Restaurar backup
docker compose exec -T postgres psql -U postgres discord < backup_20260101_1200.sql

# Roda migrations manualmente
docker compose exec server pnpm exec prisma migrate deploy

# Abrir Prisma Studio (inspecionar dados)
docker compose exec server pnpm exec prisma studio
```

---

## 8. Variáveis de ambiente — referencia completa

| Variavel | Gerada automaticamente | Obrigatoria | Descricao |
|----------|----------------------|-------------|-----------|
| `POSTGRES_PASSWORD` | Sim | Sim | Senha do PostgreSQL |
| `JWT_SECRET` | Sim | Sim | Chave de assinatura JWT (128 chars hex) |
| `DATABASE_ENCRYPTION_KEY` | Sim | Sim | Chave de cifra AES-256 para mensagens e DMs |
| `MINIO_ACCESS_KEY` | Sim | Sim | Usuario do MinIO |
| `MINIO_SECRET_KEY` | Sim | Sim | Senha do MinIO |
| `GRAFANA_PASSWORD` | Sim | Nao | Senha do Grafana (default: gerada) |
| `DOMAIN` | Nao | Sim | Dominio publico (ex: levicord.uk) |
| `GOOGLE_CLIENT_ID` | Nao | Sim | OAuth Google Client ID |
| `GOOGLE_CLIENT_SECRET` | Nao | Sim | OAuth Google Client Secret |
| `ADMIN_EMAILS` | Nao | Sim | Emails admin separados por virgula |
| `CLOUDFLARED_TOKEN` | Nao | Sim | Token do tunnel Cloudflare |
| `MINIO_BUCKET` | Nao | Nao | Nome do bucket (default: discord-uploads) |

---

## 9. Solucao de problemas

### Container `server` reiniciando em loop

```bash
docker compose logs server --tail=50
```

Causas comuns:
- `JWT_SECRET` nao definido ou vazio → servidor faz throw no startup (`app.ts:32`)
- `DATABASE_ENCRYPTION_KEY` nao definido → servidor recusa iniciar (`app.ts:37`)
- Postgres nao terminou de inicializar → aguardar `docker compose ps` mostrar `(healthy)`
- `DATABASE_URL` com senha errada → verificar `POSTGRES_PASSWORD` no `.env`

### Tunnel nao conecta

```bash
docker compose logs cloudflared --tail=30
```

- Token invalido → gerar novo token no dashboard Cloudflare
- Tunnel deletado no dashboard → criar novo tunnel e atualizar `CLOUDFLARED_TOKEN` no `.env`

### OAuth retorna erro de redirect

- URI de redirect no Google Console nao bate com `OAUTH_CALLBACK_URL`
- Verificar se o dominio no Google Console e exatamente `https://SEU_DOMINIO/api/auth/google/callback`

### MinIO inacessivel

```bash
docker compose logs minio --tail=20
curl http://localhost:9000/minio/health/ready
```

- `MINIO_SECRET_KEY` com menos de 8 caracteres → MinIO rejeita e nao sobe
- O `setup.sh` garante senha com 32 chars, entao so ocorre se o `.env` for editado manualmente

### Migrations falham

```bash
docker compose logs server | grep -i migration
docker compose exec server pnpm exec prisma migrate status
```

- Executar manualmente: `docker compose exec server pnpm exec prisma migrate deploy`

---

## 10. Backup e restauracao

### Backup automatico (opcional)

Adicionar ao cron do servidor (fora do Docker):

```bash
# Abrir crontab
crontab -e

# Backup diario as 3h da manha, mantendo os ultimos 7 dias
0 3 * * * cd /caminho/para/levicord && docker compose exec -T postgres \
  pg_dump -U postgres discord > backups/backup_$(date +\%Y\%m\%d).sql \
  && find backups/ -name "backup_*.sql" -mtime +7 -delete
```

### Restaurar em servidor novo

```bash
# No servidor novo, apos setup.sh
mkdir -p backups
# Copiar o backup para backups/backup_YYYYMMDD.sql
docker compose exec -T postgres psql -U postgres discord < backups/backup_20260101.sql
```

---

## 11. Migrar para servidor novo — passo a passo completo

```bash
# ── No servidor ANTIGO ───────────────────────────────────────────────────────

# 1. Backup do banco
docker compose exec postgres pg_dump -U postgres discord > backup_migration.sql

# 2. Copiar .env (contém todos os segredos)
cat .env

# ── No servidor NOVO ─────────────────────────────────────────────────────────

# 1. Instalar Docker (ver secao "Pre-requisitos")

# 2. Clonar repositório
git clone <URL_DO_REPO> levicord
cd levicord

# 3. Copiar o .env do servidor antigo
#    (ou criar novo com setup.sh — mas usar as mesmas chaves para compatibilidade com dados cifrados!)
#    ATENCAO: DATABASE_ENCRYPTION_KEY e JWT_SECRET DEVEM ser os mesmos do servidor antigo
#    para que os dados criptografados possam ser descriptografados.
nano .env  # colar o conteudo do .env antigo

# 4. Subir containers (sem build da app por enquanto)
docker compose up -d postgres redis minio

# 5. Aguardar postgres ficar healthy
docker compose ps

# 6. Restaurar o backup
docker compose exec -T postgres psql -U postgres discord < backup_migration.sql

# 7. Subir o resto
docker compose up -d --build

# 8. Migrations (aplica apenas as pendentes)
docker compose exec server pnpm exec prisma migrate deploy

# 9. Verificar
curl http://localhost:3000/readyz
```

> **CRITICO**: Se usar um `DATABASE_ENCRYPTION_KEY` diferente no servidor novo,
> todas as mensagens e DMs armazenadas ficarao ilegíveis (decifra vai falhar).
> Sempre migrar o `.env` junto com o backup do banco.

---

*Ultima atualizacao: 2026-10-01. Para suporte, consultar tambem `RUNBOOK.md` (resposta a incidentes).*
