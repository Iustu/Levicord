# Backlog — Otimizações Computacionais e Hardware

Severidade: 🔴 Alto · 🟡 Médio · 🟢 Baixo

---

## WebRTC / Frontend

### 🔴 OPT-01 — Codec capabilities cacheado globalmente, não por peer

**Arquivo:** `apps/web/src/hooks/useWebRTC.ts` — `applyHardwareAcceleratedCodecPreferences`

**Problema:** `RTCRtpReceiver.getCapabilities('video')` retorna sempre o mesmo resultado (capacidades do browser, estáticas). Está sendo chamado dentro de `createPeer`, ou seja, **uma vez por participante** que entra na chamada. N peers = N chamadas desnecessárias.

**Fix:**
```ts
// Fora do componente/hook, ao nível do módulo:
const _cachedCodecs: RTCRtpCodecCapability[] | null = (() => {
  if (typeof RTCRtpReceiver === 'undefined' || !RTCRtpReceiver.getCapabilities) return null;
  const caps = RTCRtpReceiver.getCapabilities('video');
  if (!caps?.codecs?.length) return null;
  return [...caps.codecs].sort((a, b) => {
    const rank = (m: string) => {
      const l = m.toLowerCase();
      if (l === 'video/h264') return 1;
      if (l === 'video/av1')  return 2;
      if (l === 'video/vp9')  return 3;
      if (l === 'video/vp8')  return 4;
      return 5;
    };
    return rank(a.mimeType) - rank(b.mimeType);
  });
})();

function applyHardwareAcceleratedCodecPreferences(t: RTCRtpTransceiver) {
  if (_cachedCodecs && typeof t.setCodecPreferences === 'function') {
    try { t.setCodecPreferences(_cachedCodecs); } catch {}
  }
}
```

---

### 🔴 OPT-02 — Race condition em `onnegotiationneeded` (glare WebRTC)

**Arquivo:** `apps/web/src/hooks/useWebRTC.ts:165`

**Problema:** `onnegotiationneeded` não verifica `signalingState !== 'stable'` antes de criar offer. Se dois peers renegociam simultaneamente ou o evento dispara enquanto uma negociação já está em curso, o browser entra em estado "glare" — chamada cai ou fica em loop de renegociação infinito.

**Fix:**
```ts
peer.onnegotiationneeded = async () => {
  if (peer.signalingState !== 'stable') return; // ← adicionar esta guarda
  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket?.emit('webrtc_offer', { targetSocketId, offer, channelId });
  } catch (err) {
    console.warn('Re-negociação falhou:', err);
  }
};
```

---

### 🔴 OPT-03 — ICE candidates sem fila de buffer (falha silenciosa em NAT)

**Arquivo:** `apps/web/src/hooks/useWebRTC.ts:218`

**Problema:** `handleCandidate` chama `peer.addIceCandidate` diretamente. Se o evento `webrtc_ice_candidate` chegar antes do `setRemoteDescription` concluir (comum em redes lentas), o `addIceCandidate` lança `InvalidStateError`. A chamada falha silenciosamente.

**Fix:** Buffer de candidatos por peer:
```ts
const iceCandidateQueues = useRef<Record<string, RTCIceCandidateInit[]>>({});

// Em handleCandidate:
const peer = peersRef.current[fromSocketId];
if (!peer || peer.remoteDescription === null) {
  iceCandidateQueues.current[fromSocketId] ??= [];
  iceCandidateQueues.current[fromSocketId].push(candidate);
  return;
}
await peer.addIceCandidate(new RTCIceCandidate(candidate));

// No final de handleOffer e handleAnswer, após setRemoteDescription:
const queued = iceCandidateQueues.current[fromSocketId] ?? [];
for (const c of queued) await peer.addIceCandidate(new RTCIceCandidate(c));
delete iceCandidateQueues.current[fromSocketId];
```

---

### 🟡 OPT-04 — `stopScreenShare` usa label de track (frágil, browser-dependente)

**Arquivo:** `apps/web/src/hooks/useWebRTC.ts:476`

**Problema:** `s.track?.label?.toLowerCase().includes('screen')` — o formato do label de tracks de `getDisplayMedia` não é especificado pelo W3C. Chrome usa `"screen:0"`, Firefox usa `"Screen"`, Safari usa string vazia. Em alguns browsers, o `find` retorna `undefined` e o sender de tela fica na conexão vazando bitrate.

**Fix:** Rastrear o sender ref diretamente:
```ts
// Adicionar ref:
const screenSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());

// Em startScreenShare, ao addTrack:
for (const [id, peer] of Object.entries(peersRef.current)) {
  const sender = peer.addTrack(screenTrack, screenStream);
  screenSendersRef.current.set(id, sender);
}

// Em stopScreenShare:
for (const [id, peer] of Object.entries(peersRef.current)) {
  const sender = screenSendersRef.current.get(id);
  if (sender) peer.removeTrack(sender);
}
screenSendersRef.current.clear();
```

---

### 🟡 OPT-05 — `applyConstraints` duplicado em `startScreenShare`

**Arquivo:** `apps/web/src/hooks/useWebRTC.ts:406-413`

**Problema:** Constraints são passados para `getDisplayMedia` (o browser aplica na captura) e depois imediatamente re-aplicados via `applyConstraints` na mesma track. A segunda chamada é redundante — a track acabou de ser criada com essas constraints — e faz uma round-trip desnecessária com o media pipeline.

**Fix:** Remover o bloco `try { await screenTrack.applyConstraints(...) }` em `startScreenShare`. Manter apenas em `changeScreenShareQuality` (lá faz sentido pois altera track já existente).

---

### 🟡 OPT-06 — `new MediaStream(tracks)` desnecessário em `toggleMute` / `toggleVideo`

**Arquivo:** `apps/web/src/hooks/useWebRTC.ts:319, 367`

**Problema:** `setLocalStream(new MediaStream(localStreamRef.current.getTracks()))` cria um novo objeto `MediaStream`, forçando `useEffect` no `VideoPlayer` a reatribuir `video.srcObject`. Isso causa um flash no vídeo local e re-inicializa o pipeline de decoding do browser sem necessidade — o stream não mudou, só foi adicionada uma track.

**Fix:** Notificar o React de mudança via contador sem recriar o stream:
```ts
const [localStreamVersion, setLocalStreamVersion] = useState(0);
// No lugar de setLocalStream(new MediaStream(...)):
setLocalStreamVersion(v => v + 1);
// VideoPlayer recebe localStream (mesmo ref) + version como key secundária se necessário
```

---

### 🟡 OPT-07 — `users.find()` em O(n×m) dentro do render loop

**Arquivo:** `apps/web/src/components/WebRTCGrid.tsx:131`

**Problema:** Para cada `remoteStream` (potencialmente 10-20 peers), faz `users.find()` que percorre o array `users` inteiro. Em canais grandes: 20 peers × 100 usuários no store = 2.000 comparações em cada re-render do componente.

**Fix:** Memoizar o mapa:
```ts
const userMap = useMemo(
  () => Object.fromEntries(users.map(u => [u.id, u])),
  [users]
);
// Uso: userMap[data.userId]?.displayName ?? 'Usuário'
```

---

### 🟢 OPT-08 — `VideoPlayer` re-renderiza em mudanças não relacionadas

**Arquivo:** `apps/web/src/components/WebRTCGrid.tsx:9`

**Problema:** `VideoPlayer` é um componente puro sem `React.memo`. Qualquer mudança de estado no `WebRTCGrid` (e.g. abrir `ScreenShareModal`, mudar `isScreenSharing`) causa re-render de todos os `VideoPlayer` ativos. Em chamadas com 10+ participantes, cada clique no botão de configuração re-renderiza todos.

**Fix:**
```ts
const VideoPlayer = React.memo(function VideoPlayer({ stream, muted, label, isSpeaking, showAvatarOverlay }: ...) {
  // ... mesmo conteúdo
});
```

---

### 🟢 OPT-09 — `localVideoActive` recalculado em cada render

**Arquivo:** `apps/web/src/components/WebRTCGrid.tsx:89`

**Problema:** `localStream?.getVideoTracks?.()?.some(t => t.enabled)` cria um array de tracks a cada render via `getVideoTracks()`. Barato individualmente, mas executado em cada re-render (controle de mute, abertura de modal, etc.).

**Fix:**
```ts
const localVideoActive = useMemo(
  () => !!(localStream?.getVideoTracks?.()?.some(t => t.enabled)),
  [localStream, isVideoOff] // isVideoOff é o sinal de mudança real
);
```

---

## Docker / Infraestrutura

### 🔴 OPT-10 — `DATABASE_URL` ignora `${POSTGRES_PASSWORD}` — senha hardcoded

**Arquivo:** `docker-compose.yml:79`

**Problema:** O container `server` tem `DATABASE_URL: postgresql://postgres:password@...` com senha literal `password`, ignorando a env var `${POSTGRES_PASSWORD:-password}` definida para o Postgres. Se a senha for trocada via env, o server não conecta.

**Fix:**
```yaml
DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-password}@postgres:5432/discord?schema=public
```

---

### 🔴 OPT-11 — MinIO healthcheck quebrado em imagem distroless

**Arquivo:** `docker-compose.yml:68`

**Problema:** `cgr.dev/chainguard/minio:latest` é uma imagem distroless — sem shell (`bash`, `sh`). O healthcheck `CMD-SHELL "bash -c 'exec 3<>/dev/tcp/127.0.0.1/9000'"` falha sempre (`exec: bash: not found`), deixando o container eternamente em estado `starting`. Os serviços que dependem do MinIO (`condition: service_healthy`) nunca sobem.

**Fix:** Usar MinIO Client incluído na imagem:
```yaml
healthcheck:
  test: ["CMD", "mc", "ready", "local"]
  interval: 10s
  timeout: 5s
  retries: 5
```

---

### 🟡 OPT-12 — Redis `maxmemory` igual ao limite Docker (sem headroom)

**Arquivo:** `docker-compose.yml:31,38`

**Problema:** Redis configurado com `--maxmemory 256mb` e container limitado a `memory: 256M`. O Redis consome memória além dos dados (overhead de conexões, buffers de output, estruturas internas — ~10-20MB). Quando o processo ultrapassa 256MB, o OOM killer do kernel mata o container antes do Redis aplicar a política `volatile-lru`.

**Fix:** Reduzir `maxmemory` para 80% do limite:
```yaml
command: redis-server --maxmemory 200mb --maxmemory-policy volatile-lru
```

---

### 🟡 OPT-13 — Sem TURN server (falha em NAT simétrico ~20% usuários)

**Arquivo:** `docker-compose.yml` + `apps/web/src/hooks/useWebRTC.ts:139`

**Problema:** Apenas `stun:stun.l.google.com:19302` configurado. STUN funciona em ~80% dos cenários, mas NAT simétrico (redes corporativas, 4G) requer TURN para relay. Sem TURN, chamadas falham silenciosamente.

**Fix:** Adicionar serviço `coturn` no compose + configurar no cliente:
```yaml
# docker-compose.yml
coturn:
  image: coturn/coturn:latest
  network_mode: host
  command: >
    -n --log-file=stdout
    --min-port=49152 --max-port=65535
    --lt-cred-mech --fingerprint
    --realm=levicord.uk
    --user=${TURN_USER:-turn}:${TURN_PASSWORD:-turn}
  deploy:
    resources:
      limits:
        cpus: '0.5'
        memory: 128M
```
```ts
// useWebRTC.ts — iceServers:
[
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:levicord.uk:3478',
    username: import.meta.env.VITE_TURN_USER,
    credential: import.meta.env.VITE_TURN_PASSWORD,
  },
]
```

---

### 🟢 OPT-14 — `server` sem reserva de CPU (pode ser starved sob carga)

**Arquivo:** `docker-compose.yml:105`

**Problema:** `server` tem limite de 2 CPUs mas sem `reservations.cpus`. Em host com carga alta, o scheduler do Docker pode alocar 0 CPU para o server enquanto outros containers com reservas têm prioridade garantida.

**Fix:**
```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 1024M
    reservations:
      cpus: '0.5'
      memory: 256M
```

---

## Resumo de Prioridade

| ID | Severidade | Área | Impacto |
|----|-----------|------|---------|
| OPT-11 | 🔴 | Docker | MinIO nunca healthy → deploy quebrado |
| OPT-10 | 🔴 | Docker | DB quebra se senha mudar |
| OPT-02 | 🔴 | WebRTC | Glare → chamadas caem |
| OPT-03 | 🔴 | WebRTC | ICE candidates perdidos em redes lentas |
| OPT-01 | 🔴 | WebRTC | CPU desnecessário a cada peer join |
| OPT-13 | 🟡 | Docker | ~20% usuários não conectam (NAT simétrico) |
| OPT-12 | 🟡 | Docker | Redis morto por OOM killer |
| OPT-04 | 🟡 | WebRTC | Screen share vaza bitrate em Firefox/Safari |
| OPT-05 | 🟡 | WebRTC | Round-trip desnecessária no media pipeline |
| OPT-06 | 🟡 | WebRTC | Flash de vídeo ao ligar mic/câmera |
| OPT-07 | 🟡 | React | CPU em renders com muitos participantes |
| OPT-14 | 🟢 | Docker | Server CPU starved sob carga |
| OPT-08 | 🟢 | React | Re-renders desnecessários de VideoPlayer |
| OPT-09 | 🟢 | React | Array allocation em cada render |
