## Descrição

<!-- O que foi feito e por quê? -->

## Tipo de mudança

- [ ] Bug fix
- [ ] Nova feature
- [ ] Refactor
- [ ] Documentação
- [ ] Infra / CI

## Checklist de segurança

- [ ] Sem segredos hardcoded (tokens, senhas, chaves)
- [ ] Inputs validados e sanitizados no servidor
- [ ] Sem SQL injection (ORM ou prepared statements)
- [ ] Sem XSS introduzido (sanitize-html em conteúdo de usuário)
- [ ] Rotas novas protegidas por `requireAuth` e/ou `requireAdmin`
- [ ] Sem IDOR — dados de outros usuários inacessíveis
- [ ] Rate limiting adequado para endpoints novos
- [ ] Logs de eventos de segurança adicionados onde relevante

## Testes

- [ ] Testes unitários adicionados/atualizados
- [ ] Testes de integração passando
- [ ] `pnpm lint` e `pnpm format --check` passando
- [ ] `tsc --noEmit` sem erros

## Como testar

<!-- Passos para testar a mudança manualmente -->
