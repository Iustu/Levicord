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

## Criptografia de Dados em Repouso (AES-256-GCM)

As mensagens diretas privadas (DMs) são protegidas por criptografia de campo (Field-Level Encryption) utilizando AES-256-GCM autenticado antes de serem gravadas no PostgreSQL (`enc:v1:<iv>:<tag>:<ciphertext>`).

1. Para configurar a chave mestre de criptografia no `.env`:
   ```bash
   DATABASE_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   ```
2. `DATABASE_ENCRYPTION_KEY` é **obrigatória** — o servidor não inicia sem ela. O fallback por `JWT_SECRET` mantém-se como última reserva, mas nunca deve faltar em produção.
3. O leitor decifra automaticamente textos legados que não possuem o prefixo `enc:v1:`, garantindo zero downtime e compatibilidade retroativa.

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

---

## Matriz de Escalação

| Situação | Primeiro contacto | Escalação |
|----------|------------------|----------|
| Indisponibilidade total | On-call engineer | CTO em 30 min |
| Fuga de dados suspeita | On-call engineer | CISO + DPO em 15 min |
| Credencial comprometida | On-call engineer | CTO + CISO em 15 min |
| CVE CRITICAL na imagem | Responsável de DevSecOps | CTO em 2h |

---

## Divulgação Pública de Vulnerabilidades (Responsible Disclosure)

(BSRS Cap.17 — Crisis Management)

1. **Contenção**: isolar o sistema afetado antes de divulgar publicamente.
2. **Notificação interna**: abrir issue de segurança confidencial no repositório privado.
3. **Notificação a utilizadores**: enviar e-mail a todos os utilizadores afetados com:
   - O que aconteceu e quando
   - Que dados foram expostos
   - Ações tomadas para mitigar
   - O que o utilizador deve fazer (ex: alterar passwords)
4. **Embargo**: coordenar com investigadores externos antes de publicar CVE.
5. **Post-mortem público**: publicar relatório simplificado após 30 dias.

---

## Template de Post-Mortem

(BSRS Cap.18 — Investigating Systems)

```markdown
# Post-Mortem — [Título do Incidente]

**Data**: YYYY-MM-DD  
**Duração do impacto**: HH:MM – HH:MM UTC  
**Severity**: SEV-1 / SEV-2 / SEV-3  
**Autor**: [Nome]

## Resumo
[2–3 frases descrevendo o que aconteceu e o impacto.]

## Cronologia
| Hora (UTC) | Evento |
|-----------|--------|
| HH:MM | Alerta disparado por ... |
| HH:MM | Diagnóstico: causa raiz identificada como ... |
| HH:MM | Mitigação aplicada: ... |
| HH:MM | Serviço restaurado. |

## Causa Raiz
[Descrição técnica da causa raiz. Porquê aconteceu?]

## Fator Contribuinte
[O que facilitou o incidente? Ex: ausência de teste, TTL demasiado alto.]

## Impacto
- Utilizadores afetados: N
- Dados expostos: Sim / Não (especificar)
- SLA violado: Sim / Não

## Ações Corretivas
| Ação | Responsável | Prazo | Issue |
|------|------------|-------|-------|
| ... | @user | YYYY-MM-DD | #123 |

## Lições Aprendidas
- ...

## Métricas de Resposta
- MTTD (Mean Time to Detect): HH:MM
- MTTR (Mean Time to Resolve): HH:MM
```
