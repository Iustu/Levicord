#!/usr/bin/env bash
# =============================================================================
#  Levicord — Script de Setup Automático
#  Uso: bash setup.sh
#
#  O que este script faz:
#   1. Verifica dependências (Docker, Docker Compose, Git, openssl)
#   2. Gera segredos criptográficos seguros (JWT_SECRET, DATABASE_ENCRYPTION_KEY)
#   3. Cria o arquivo .env interativamente (só pede o que não tem valor padrão)
#   4. Corrige o docker-compose.yml para usar variáveis do .env
#   5. Sobe todos os containers
#   6. Aguarda healthchecks
#   7. Roda as migrations do Prisma
#   8. Imprime o resumo final com as URLs
# =============================================================================

set -euo pipefail

# ── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*" >&2; exit 1; }
header()  { echo -e "\n${BOLD}${BLUE}═══ $* ═══${NC}\n"; }

# ── Funções utilitárias ───────────────────────────────────────────────────────
gen_secret() {
  # Gera string hex aleatória de 64 bytes (128 chars) via openssl
  openssl rand -hex 64
}

gen_password() {
  # Gera senha alfanumérica de 32 chars
  openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32
}

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    error "'$1' não encontrado. Instale-o antes de continuar."
  fi
  success "$1 encontrado: $(command -v "$1")"
}

wait_healthy() {
  local service="$1"
  local max_tries="${2:-30}"
  local try=0
  info "Aguardando $service ficar healthy..."
  while [ $try -lt $max_tries ]; do
    status=$(docker compose ps --format json "$service" 2>/dev/null \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health',''))" 2>/dev/null || echo "")
    if [ "$status" = "healthy" ]; then
      success "$service está healthy"
      return 0
    fi
    try=$((try + 1))
    sleep 2
  done
  warn "$service não ficou healthy em tempo — verificar com: docker compose logs $service"
}

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ██╗     ███████╗██╗   ██╗██╗ ██████╗ ██████╗ ██████╗ ██████╗ "
echo "  ██║     ██╔════╝██║   ██║██║██╔════╝██╔═══██╗██╔══██╗██╔══██╗"
echo "  ██║     █████╗  ██║   ██║██║██║     ██║   ██║██████╔╝██║  ██║"
echo "  ██║     ██╔══╝  ╚██╗ ██╔╝██║██║     ██║   ██║██╔══██╗██║  ██║"
echo "  ███████╗███████╗ ╚████╔╝ ██║╚██████╗╚██████╔╝██║  ██║██████╔╝"
echo "  ╚══════╝╚══════╝  ╚═══╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ "
echo -e "${NC}"
echo -e "${BOLD}  Setup Automático — Levicord${NC}"
echo ""

# ── 1. Verificar dependências ─────────────────────────────────────────────────
header "1. Verificando dependências"

check_cmd docker
check_cmd git
check_cmd openssl

# Docker Compose v2 (plugin)
if docker compose version &>/dev/null; then
  success "docker compose (plugin v2) encontrado"
else
  error "Docker Compose v2 não encontrado. Instale: sudo apt install docker-compose-plugin"
fi

# ── 2. Garantir que está no diretório correto ─────────────────────────────────
header "2. Verificando diretório"

if [ ! -f "docker-compose.yml" ]; then
  error "docker-compose.yml não encontrado. Execute este script na raiz do projeto Levicord."
fi
success "Diretório correto: $(pwd)"

# ── 3. Criar ou atualizar .env ────────────────────────────────────────────────
header "3. Configurando variáveis de ambiente"

ENV_FILE=".env"

if [ -f "$ENV_FILE" ]; then
  warn ".env já existe — mantendo valores existentes e adicionando os que faltam."
  # Carregar variáveis já existentes
  set -o allexport
  source "$ENV_FILE"
  set +o allexport
fi

# Função para ler variável do .env ou pedir ao utilizador
require_var() {
  local var="$1"
  local prompt="$2"
  local default="${3:-}"
  local current
  current=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)

  if [ -n "$current" ] && [ "$current" != "CHANGE_ME" ]; then
    info "$var já definido — mantendo."
    return
  fi

  if [ -n "$default" ]; then
    info "$var (pressione Enter para usar o valor gerado automaticamente)"
    read -rp "  $prompt [$default]: " val
    val="${val:-$default}"
  else
    read -rp "  $prompt: " val
    while [ -z "$val" ]; do
      warn "Este campo é obrigatório."
      read -rp "  $prompt: " val
    done
  fi

  # Atualizar ou adicionar no .env
  if grep -q "^${var}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${var}=.*|${var}=${val}|" "$ENV_FILE"
  else
    echo "${var}=${val}" >> "$ENV_FILE"
  fi
}

# Criar .env base se não existir
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << 'ENVTEMPLATE'
# ─── Gerado automaticamente por setup.sh ──────────────────────────────────────
# NÃO commitar este arquivo. Está no .gitignore.

# Banco de dados
POSTGRES_PASSWORD=CHANGE_ME

# Autenticação JWT — gerado automaticamente
JWT_SECRET=CHANGE_ME

# Criptografia do banco — gerado automaticamente
DATABASE_ENCRYPTION_KEY=CHANGE_ME

# Google OAuth — obter em: console.cloud.google.com
GOOGLE_CLIENT_ID=CHANGE_ME
GOOGLE_CLIENT_SECRET=CHANGE_ME

# Emails de administradores (separados por vírgula)
ADMIN_EMAILS=CHANGE_ME

# MinIO (armazenamento de arquivos)
MINIO_ACCESS_KEY=CHANGE_ME
MINIO_SECRET_KEY=CHANGE_ME
MINIO_BUCKET=discord-uploads

# Cloudflare Tunnel — obter em: one.dash.cloudflare.com
CLOUDFLARED_TOKEN=CHANGE_ME

# Grafana
GRAFANA_PASSWORD=CHANGE_ME

# Domínio público
DOMAIN=levicord.uk
ENVTEMPLATE
  success ".env base criado."
fi

# Gerar segredos automaticamente
JWT_CURRENT=$(grep "^JWT_SECRET=" "$ENV_FILE" | cut -d= -f2-)
if [ "$JWT_CURRENT" = "CHANGE_ME" ] || [ -z "$JWT_CURRENT" ]; then
  NEW_JWT=$(gen_secret)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${NEW_JWT}|" "$ENV_FILE"
  success "JWT_SECRET gerado automaticamente."
fi

ENC_CURRENT=$(grep "^DATABASE_ENCRYPTION_KEY=" "$ENV_FILE" | cut -d= -f2-)
if [ "$ENC_CURRENT" = "CHANGE_ME" ] || [ -z "$ENC_CURRENT" ]; then
  NEW_ENC=$(gen_secret)
  sed -i "s|^DATABASE_ENCRYPTION_KEY=.*|DATABASE_ENCRYPTION_KEY=${NEW_ENC}|" "$ENV_FILE"
  success "DATABASE_ENCRYPTION_KEY gerado automaticamente."
fi

POSTGRES_CURRENT=$(grep "^POSTGRES_PASSWORD=" "$ENV_FILE" | cut -d= -f2-)
if [ "$POSTGRES_CURRENT" = "CHANGE_ME" ] || [ -z "$POSTGRES_CURRENT" ]; then
  NEW_PG=$(gen_password)
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${NEW_PG}|" "$ENV_FILE"
  success "POSTGRES_PASSWORD gerado automaticamente."
fi

GRAFANA_CURRENT=$(grep "^GRAFANA_PASSWORD=" "$ENV_FILE" | cut -d= -f2-)
if [ "$GRAFANA_CURRENT" = "CHANGE_ME" ] || [ -z "$GRAFANA_CURRENT" ]; then
  NEW_GF=$(gen_password)
  sed -i "s|^GRAFANA_PASSWORD=.*|GRAFANA_PASSWORD=${NEW_GF}|" "$ENV_FILE"
  success "GRAFANA_PASSWORD gerado automaticamente."
fi

MINIO_ACCESS_CURRENT=$(grep "^MINIO_ACCESS_KEY=" "$ENV_FILE" | cut -d= -f2-)
if [ "$MINIO_ACCESS_CURRENT" = "CHANGE_ME" ] || [ -z "$MINIO_ACCESS_CURRENT" ]; then
  NEW_MA=$(gen_password)
  sed -i "s|^MINIO_ACCESS_KEY=.*|MINIO_ACCESS_KEY=${NEW_MA}|" "$ENV_FILE"
  success "MINIO_ACCESS_KEY gerado automaticamente."
fi

MINIO_SECRET_CURRENT=$(grep "^MINIO_SECRET_KEY=" "$ENV_FILE" | cut -d= -f2-)
if [ "$MINIO_SECRET_CURRENT" = "CHANGE_ME" ] || [ -z "$MINIO_SECRET_CURRENT" ]; then
  NEW_MS=$(gen_password)
  sed -i "s|^MINIO_SECRET_KEY=.*|MINIO_SECRET_KEY=${NEW_MS}|" "$ENV_FILE"
  success "MINIO_SECRET_KEY gerado automaticamente."
fi

echo ""
info "Os seguintes campos precisam ser preenchidos manualmente:"
echo ""

# Recarregar .env
set -o allexport
source "$ENV_FILE"
set +o allexport

require_var "DOMAIN"               "Domínio público (ex: levicord.uk)" "levicord.uk"
require_var "GOOGLE_CLIENT_ID"     "Google OAuth Client ID"
require_var "GOOGLE_CLIENT_SECRET" "Google OAuth Client Secret"
require_var "ADMIN_EMAILS"         "Emails admin separados por vírgula (ex: seu@email.com)"
require_var "CLOUDFLARED_TOKEN"    "Token do Cloudflare Tunnel (obtido em one.dash.cloudflare.com)"

# Recarregar .env com os novos valores
set -o allexport
source "$ENV_FILE"
set +o allexport

# ── 4. Corrigir docker-compose.yml com variáveis do .env ─────────────────────
header "4. Atualizando docker-compose.yml"

# Substituir valores hardcoded pelas variáveis do .env
# DATABASE_URL — usa POSTGRES_PASSWORD do .env
sed -i "s|DATABASE_URL:.*|DATABASE_URL: postgresql://postgres:\${POSTGRES_PASSWORD}@postgres:5432/discord?schema=public|" docker-compose.yml
success "DATABASE_URL corrigida para usar POSTGRES_PASSWORD do .env"

# JWT_SECRET — remover hardcoded
sed -i "s|JWT_SECRET: local-development-secret-change-in-production|JWT_SECRET: \${JWT_SECRET}|" docker-compose.yml
success "JWT_SECRET corrigido para usar variável do .env"

# DATABASE_ENCRYPTION_KEY — adicionar se não existir
if ! grep -q "DATABASE_ENCRYPTION_KEY" docker-compose.yml; then
  # Inserir após JWT_SECRET no bloco server
  sed -i '/JWT_SECRET: \${JWT_SECRET}/a\      DATABASE_ENCRYPTION_KEY: ${DATABASE_ENCRYPTION_KEY}' docker-compose.yml
  success "DATABASE_ENCRYPTION_KEY adicionado ao docker-compose.yml"
else
  success "DATABASE_ENCRYPTION_KEY já presente no docker-compose.yml"
fi

# FRONTEND_URL — usar DOMAIN do .env
sed -i "s|FRONTEND_URL: https://levicord.uk|FRONTEND_URL: https://\${DOMAIN:-levicord.uk}|" docker-compose.yml
sed -i "s|OAUTH_CALLBACK_URL: https://levicord.uk|OAUTH_CALLBACK_URL: https://\${DOMAIN:-levicord.uk}|" docker-compose.yml
sed -i "s|VITE_API_URL: https://levicord.uk|VITE_API_URL: https://\${DOMAIN:-levicord.uk}|g" docker-compose.yml
success "URLs do domínio atualizadas para usar DOMAIN do .env"

# NODE_ENV para production
sed -i "s|NODE_ENV: development|NODE_ENV: production|" docker-compose.yml
success "NODE_ENV definido como production"

# ── 5. Subir os containers ────────────────────────────────────────────────────
header "5. Subindo containers"

info "Fazendo build e subindo todos os serviços..."
docker compose up -d --build

# ── 6. Aguardar serviços de infraestrutura ────────────────────────────────────
header "6. Aguardando serviços ficarem saudáveis"

wait_healthy "postgres" 40
wait_healthy "redis" 20
wait_healthy "minio" 30

info "Aguardando container do server inicializar (10s)..."
sleep 10

# ── 7. Migrations do Prisma ───────────────────────────────────────────────────
header "7. Rodando migrations do Prisma"

if docker compose exec -T server pnpm exec prisma migrate deploy; then
  success "Migrations aplicadas com sucesso."
else
  warn "Migrations falharam ou já estavam aplicadas. Verificar com: docker compose logs server"
fi

# ── 8. Verificação final ──────────────────────────────────────────────────────
header "8. Verificação de saúde"

LIVEZ=$(curl -sf http://localhost:3000/livez 2>/dev/null || echo "FALHOU")
READYZ=$(curl -sf http://localhost:3000/readyz 2>/dev/null || echo "FALHOU")

if echo "$LIVEZ" | grep -q "ok"; then
  success "/livez: $LIVEZ"
else
  warn "/livez: $LIVEZ — servidor pode ainda estar iniciando"
fi

if echo "$READYZ" | grep -q "ready"; then
  success "/readyz: $READYZ"
else
  warn "/readyz: $READYZ — verificar dependências com: docker compose ps"
fi

# ── 9. Resumo final ───────────────────────────────────────────────────────────
header "Setup concluído!"

# Ler DOMAIN do .env
DOMAIN_VAL=$(grep "^DOMAIN=" "$ENV_FILE" | cut -d= -f2- || echo "levicord.uk")
GF_PASS=$(grep "^GRAFANA_PASSWORD=" "$ENV_FILE" | cut -d= -f2-)

echo -e "${BOLD}URLs públicas (via Cloudflare Tunnel):${NC}"
echo -e "  App:     ${GREEN}https://${DOMAIN_VAL}${NC}"
echo -e "  API:     ${GREEN}https://${DOMAIN_VAL}/api${NC}"
echo ""
echo -e "${BOLD}URLs locais:${NC}"
echo -e "  API Docs:  http://localhost:3000/api/docs"
echo -e "  MinIO:     http://localhost:9001"
echo -e "  Prometheus: http://localhost:9090"
echo -e "  Grafana:   http://localhost:3001  (admin / ${GF_PASS})"
echo ""
echo -e "${BOLD}Comandos úteis:${NC}"
echo "  docker compose ps                              # estado dos containers"
echo "  docker compose logs -f server                  # logs do servidor"
echo "  docker compose logs -f cloudflared             # status do túnel"
echo "  docker compose exec server pnpm exec prisma migrate deploy  # migrations"
echo ""
echo -e "${YELLOW}IMPORTANTE:${NC} O arquivo ${BOLD}.env${NC} contém todos os segredos."
echo "  Faça backup dele em local seguro. NÃO commitar no Git."
echo ""
