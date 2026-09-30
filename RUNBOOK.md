# Runbook — Levicord

Procedimentos operacionais para incidentes e manutenção.

---

## Reiniciar serviços

```bash
# Todos os serviços
docker compose restart

# Serviço específico
docker compose restart server
docker compose restart postgres
docker compose restart redis
docker compose restart minio
```

Verificar saúde após restart:
```bash
curl http://localhost:3000/livez   # deve retornar {"status":"ok"}
curl http://localhost:3000/readyz  # deve retornar {"status":"ready"}
```

---

## Backup manual do PostgreSQL

```bash
# Gerar dump comprimido
docker compose exec postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Restaurar dump
gunzip -c backup_YYYYMMDD_HHMMSS.sql.gz | docker compose exec -T postgres psql -U $POSTGRES_USER $POSTGRES_DB
```

---

## Backup manual do MinIO

```bash
# Espelhar bucket para diretório local
docker compose exec minio mc mirror /data/discord-uploads /tmp/minio-backup

# Ou via mc CLI instalado localmente
mc mirror minio/discord-uploads ./minio-backup-$(date +%Y%m%d)
```

---

## Rotacionar JWT_SECRET sem downtime

1. Gere novo segredo:
   ```bash
   openssl rand -hex 64
   ```

2. Atualize `.env` na produção com o novo valor de `JWT_SECRET`.

3. Faça rolling restart do server (usuários ativos perdem sessão — tokens antigos invalidados imediatamente):
   ```bash
   docker compose up -d --no-deps server
   ```

4. Monitore erros 401 no Grafana por 5 minutos. Usuários devem re-autenticar via Google OAuth.

> **Sem downtime total**: o load balancer continua servindo requisições enquanto o container reinicia.

---

## Rotacionar credenciais do MinIO

1. Atualize `MINIO_ACCESS_KEY` e `MINIO_SECRET_KEY` no `.env`.
2. Recrie o cliente MinIO:
   ```bash
   docker compose up -d --no-deps minio server
   ```

---

## Incident Response — Checklist

### Credencial comprometida (JWT_SECRET, DB password, etc.)

- [ ] Revogar / rotacionar o segredo afetado (ver procedimentos acima)
- [ ] Invalidar sessões ativas (restart do server)
- [ ] Verificar logs de acesso: `docker compose logs server --since 24h | grep -E 'event.*auth|WARN'`
- [ ] Abrir issue de segurança interna com timeline
- [ ] Notificar usuários se dados foram acessados

### Banco de dados inacessível

- [ ] Verificar logs: `docker compose logs postgres --tail 50`
- [ ] Verificar disco: `df -h`
- [ ] Reiniciar: `docker compose restart postgres`
- [ ] Se dados corrompidos: restaurar do último backup

### MinIO inacessível

- [ ] `/readyz` retornará `{"status":"not_ready","degraded":["minio"]}`
- [ ] Uploads retornam 503 automaticamente
- [ ] Reiniciar: `docker compose restart minio`
- [ ] Verificar bucket após reinício: `curl http://localhost:3000/readyz`

---

## SLA de Patching

| Severidade | Prazo |
|------------|-------|
| CRITICAL   | ≤ 48h |
| HIGH       | ≤ 7 dias |
| MEDIUM     | ≤ 30 dias |

CVEs detectados pelo Dependabot → abrir issue → assignar responsável → merge com testes passando.
