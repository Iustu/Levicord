# Backlog Playbook — Webcam e Compartilhamento de Tela

> Analise tecnica baseada no codigo existente em `apps/web/src/hooks/useWebRTC.ts`,
> `apps/server/src/socket/voiceHandler.ts` e `apps/web/src/components/WebRTCGrid.tsx`.
>
> Objetivo: implementar **video de webcam** e **compartilhamento de tela** de forma
> incremental, sem quebrar o que ja funciona (audio P2P).

---

## Estado Atual — O que ja existe

| Componente | Arquivo | Estado |
|-----------|---------|--------|
| Sinalizador WebRTC (offer/answer/ICE) | `voiceHandler.ts` | Completo |
| Hook `useWebRTC` com peer connections P2P | `useWebRTC.ts` | Completo |
| `toggleVideo()` com `getUserMedia({video:true})` | `useWebRTC.ts:185-207` | Implementado, sem UI conectada |
| `isVideoOff` state e botao na UI | `WebRTCGrid.tsx:75-76` | Botao existe, funcao existe |
| `VideoPlayer` component com `<video>` | `WebRTCGrid.tsx:7-35` | Completo |
| Transceivers `recvonly` para audio e video | `useWebRTC.ts:74-82` | Completo |
| Estado `isVideoOff=true` por padrao | `useWebRTC.ts:13` | Correto |

**Conclusao**: webcam ja tem ~70% da implementacao de fundo. O botao de video ja existe
e chama `toggleVideo()`. A lacuna e que `addTrack` apos conexao estabelecida nao
dispara re-negociacao automaticamente nos peers existentes. Falta o **renegotiation flow**.

Compartilhamento de tela nao existe ainda (zero codigo).

---

## Feature 1 — Video de Webcam

### Diagnostico do gap atual

O `toggleVideo()` atual (linha 185-207 de `useWebRTC.ts`) adiciona a faixa de video
(`addTrack`) nos peers ja existentes, mas **nao dispara re-negociacao**.

Na spec WebRTC, `addTrack` em uma `RTCPeerConnection` ja estabelecida coloca a
conexao em estado `have-local-offer` pendente — o navegador nao cria e envia um
novo offer automaticamente. E necessario detectar o evento `negotiationneeded` e
iniciar um novo ciclo offer/answer.

```
Estado atual:
  toggleVideo() → addTrack() → [sem re-negociacao] → peers remotos nunca recebem o video

Estado correto:
  toggleVideo() → addTrack() → onNegotiationNeeded() → createOffer() → socket offer → answer → video fluindo
```

### Plano de implementacao — Webcam

#### Tarefa 1.1 — Adicionar handler `onnegotiationneeded` em `createPeer()`

**Arquivo**: `apps/web/src/hooks/useWebRTC.ts`

Dentro da funcao `createPeer()` (linha 63), apos criar o `RTCPeerConnection`,
adicionar:

```typescript
peer.onnegotiationneeded = async () => {
  try {
    // Evitar race condition: so renegociar se conexao ainda aberta
    if (peer.signalingState === 'closed') return;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket?.emit('webrtc_offer', { targetSocketId, offer, channelId });
  } catch (err) {
    console.warn('Re-negociacao falhou:', err);
  }
};
```

**Por que funciona**: o browser dispara `onnegotiationneeded` automaticamente apos
`addTrack()`. O handler reusa o mesmo canal de sinalizacao existente (socket.io).
Nenhuma mudanca no servidor necessaria.

#### Tarefa 1.2 — Corrigir `toggleVideo()` para usar `replaceTrack` quando possivel

**Arquivo**: `apps/web/src/hooks/useWebRTC.ts`, linha 185-207

Quando o video ja foi adicionado antes (track existe mas esta `enabled=false`),
prefer `enabled = true` em vez de adicionar nova faixa. Quando nao existe faixa,
usar `RTCRtpSender.replaceTrack()` em vez de `addTrack()` para evitar multiplas
faixas de video na mesma conexao:

```typescript
const toggleVideo = async () => {
  if (!localStreamRef.current) return;
  const videoTrack = localStreamRef.current.getVideoTracks()[0];

  if (videoTrack) {
    // Faixa ja existe — apenas ligar/desligar
    videoTrack.enabled = !videoTrack.enabled;
    setIsVideoOff(!videoTrack.enabled);
    return;
  }

  // Nao tem faixa — pedir permissao e adicionar via replaceTrack
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const newTrack = stream.getVideoTracks()[0];
    if (!newTrack) return;

    localStreamRef.current.addTrack(newTrack);

    // replaceTrack nos senders existentes (evita duplicatas)
    for (const peer of Object.values(peersRef.current)) {
      const videoSender = peer.getSenders().find(s => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(newTrack);
      } else {
        peer.addTrack(newTrack, localStreamRef.current!);
        // onnegotiationneeded vai disparar automaticamente
      }
    }

    setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    setIsVideoOff(false);
  } catch (err) {
    console.warn('Camera nao encontrada ou permissao negada:', err);
  }
};
```

#### Tarefa 1.3 — Indicador visual "camera ligada" no VideoPlayer

**Arquivo**: `apps/web/src/components/WebRTCGrid.tsx`

O `VideoPlayer` ja renderiza a `<video>`. Quando `isVideoOff=true` e stream local
nao tem faixa de video ativa, mostrar avatar do utilizador em vez de tela preta:

```tsx
// Dentro de VideoPlayer, apos o <video>:
{(!stream || stream.getVideoTracks().every(t => !t.enabled)) && (
  <div className="video-avatar-overlay" aria-hidden="true">
    <Avatar userId={userId} size={64} />
  </div>
)}
```

Prop `userId` precisa ser passada ao `VideoPlayer` — ja existe `data.userId` no
`remoteStreams` (linha 95 de `useWebRTC.ts`), so passar ao componente.

#### Tarefa 1.4 — Desligar camera ao sair da chamada

**Arquivo**: `apps/web/src/hooks/useWebRTC.ts`, funcao cleanup (linha 48-57)

Ja existe `.getTracks().forEach(track => track.stop())`. Nenhuma mudanca necessaria —
tracks de video tambem sao parados. Verificar que o `MediaStream` local inclui
os tracks de video quando a cleanup roda.

---

### Estimativa de esforco — Webcam

| Tarefa | Complexidade | Tempo estimado |
|--------|-------------|---------------|
| 1.1 `onnegotiationneeded` | Baixa — 5 linhas | 30min |
| 1.2 `toggleVideo` com `replaceTrack` | Media — 20 linhas | 1h |
| 1.3 Avatar overlay no VideoPlayer | Baixa — 10 linhas + CSS | 30min |
| 1.4 Cleanup (verificar) | Minima | 15min |
| Testes unitarios (mock getUserMedia) | Media | 1h |
| **Total** | | **~3h** |

### Sinais de validacao

- [ ] Ao clicar o botao de camera, video local aparece no `WebRTCGrid`
- [ ] Peer remoto recebe o video sem recarregar a pagina
- [ ] Ao desligar camera, tela do remoto para de mostrar video (track.enabled=false)
- [ ] Ao sair da chamada, camera LED do sistema apaga (tracks paradas)
- [ ] Em modo ouvinte (sem microfone), video funciona independentemente

---

## Feature 2 — Compartilhamento de Tela

### Diagnostico do gap atual

Nao existe nenhum codigo de screen share. E necessario implementar do zero,
mas a infra de sinalizacao (voiceHandler) ja suporta — usa os mesmos
`webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`.

O desafio principal e que screen share e **uma segunda faixa de video** na mesma
`RTCPeerConnection` — nao substitui a webcam. Os peers precisam distinguir qual
faixa e camera e qual e tela.

WebRTC nao tem metadado nativo de "tipo de faixa". A solucao padrao e usar
`RTCRtpSender.setParameters()` com um encoding ID customizado, ou mais simplesmente,
uma **segunda RTCPeerConnection** dedicada ao screen share (abordagem Discord).

**Abordagem recomendada: `RTCRtpTransceiver.mid` + sinalizacao de metadata via socket**

A cada `addTrack` de screen share, o servidor retransmite um evento extra
`screen_share_started` com `{ fromUserId, socketId }`. O cliente receptor
sabe que a proxima faixa de video e tela, nao webcam.

### Plano de implementacao — Screen Share

#### Tarefa 2.1 — Novos eventos socket no servidor

**Arquivo**: `apps/server/src/socket/voiceHandler.ts`

Adicionar dois eventos relay (mesmo padrao dos existentes — apenas relay autorizado):

```typescript
// Dentro de registerVoiceHandler, apos webrtc_ice_candidate:

socket.on('screen_share_started', (data: { channelId: string }) => {
  if (socket.data.voiceChannelId !== data.channelId) return;
  // Avisar todos no canal que este utilizador iniciou screen share
  socket.to(`voice_${data.channelId}`).emit('screen_share_started', {
    fromUserId: userId,
    fromSocketId: socket.id,
  });
});

socket.on('screen_share_stopped', (data: { channelId: string }) => {
  if (socket.data.voiceChannelId !== data.channelId) return;
  socket.to(`voice_${data.channelId}`).emit('screen_share_stopped', {
    fromUserId: userId,
    fromSocketId: socket.id,
  });
});
```

Nenhuma mudanca no schema Prisma ou no banco — so relay de eventos em memoria.

#### Tarefa 2.2 — `startScreenShare()` no hook `useWebRTC`

**Arquivo**: `apps/web/src/hooks/useWebRTC.ts`

Adicionar estado e funcao:

```typescript
const [isScreenSharing, setIsScreenSharing] = useState(false);
const screenTrackRef = useRef<MediaStreamTrack | null>(null);

const startScreenShare = async () => {
  if (!localStreamRef.current || !channelId) return;

    // Configurações suportadas: 720p, 480p e 240p | FPS: 60, 45 e 30
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'monitor',   // preferencia: monitor inteiro
        frameRate: { ideal: chosenFps, max: chosenFps }, // 60, 45 ou 30 fps
        width: { ideal: targetConfig.width, max: targetConfig.width },   // 720p (1280x720), 480p (854x480) ou 240p (426x240)
        height: { ideal: targetConfig.height, max: targetConfig.height },
      },
      audio: false, // audio de sistema e tratado separadamente
    });

    const screenTrack = screenStream.getVideoTracks()[0];
    if (!screenTrack) return;

    screenTrackRef.current = screenTrack;

    // Adicionar faixa de tela em cada peer
    for (const peer of Object.values(peersRef.current)) {
      peer.addTrack(screenTrack, screenStream);
      // onnegotiationneeded dispara automaticamente
    }

    // Avisar peers que este utilizador iniciou screen share
    socket?.emit('screen_share_started', { channelId });
    setIsScreenSharing(true);

    // Listener: utilizador clicou "Parar partilha" no navegador
    screenTrack.onended = () => {
      stopScreenShare();
    };
  } catch (err) {
    // Utilizador cancelou o seletor de janela — nao e erro critico
    console.warn('Screen share cancelado ou negado:', err);
  }
};

const stopScreenShare = () => {
  if (screenTrackRef.current) {
    screenTrackRef.current.stop();
    screenTrackRef.current = null;
  }

  // Remover faixa de tela dos peers
  for (const peer of Object.values(peersRef.current)) {
    const sender = peer.getSenders().find(
      s => s.track?.kind === 'video' && s.track?.label?.includes('screen')
    );
    if (sender) {
      peer.removeTrack(sender);
      // onnegotiationneeded dispara automaticamente
    }
  }

  socket?.emit('screen_share_stopped', { channelId });
  setIsScreenSharing(false);
};
```

**Retornar do hook**: adicionar `isScreenSharing`, `startScreenShare`, `stopScreenShare`
ao objeto retornado em linha 209.

#### Tarefa 2.3 — Distinguir faixa de tela no receptor

**Arquivo**: `apps/web/src/hooks/useWebRTC.ts`

Adicionar estado para rastrear qual socketId esta partilhando a tela:

```typescript
const [screenSharerSocketId, setScreenSharerSocketId] = useState<string | null>(null);

// Dentro do useEffect de listeners de socket:
socket.on('screen_share_started', ({ fromSocketId }: { fromSocketId: string }) => {
  setScreenSharerSocketId(fromSocketId);
});

socket.on('screen_share_stopped', ({ fromSocketId }: { fromSocketId: string }) => {
  setScreenSharerSocketId(prev => prev === fromSocketId ? null : prev);
});

// cleanup:
socket.off('screen_share_started', ...);
socket.off('screen_share_stopped', ...);
```

#### Tarefa 2.4 — UI: botao Screen Share e layout dedicado

**Arquivo**: `apps/web/src/components/WebRTCGrid.tsx`

Adicionar botao ao lado dos controles existentes:

```tsx
import { Monitor, MonitorOff } from 'lucide-react';

// No WebRTCGrid, receber as novas props do hook:
const {
  localStream, remoteStreams,
  isMuted, isVideoOff,
  isScreenSharing, screenSharerSocketId,
  toggleMute, toggleVideo,
  startScreenShare, stopScreenShare,
  error
} = useWebRTC(channelId, true);

// Botao no webrtc-controls:
<button
  className={`control-btn ${isScreenSharing ? 'active' : ''}`}
  onClick={isScreenSharing ? stopScreenShare : startScreenShare}
  aria-label={isScreenSharing ? 'Parar Partilha de Tela' : 'Partilhar Tela'}
  title={isScreenSharing ? 'Parar Partilha de Tela' : 'Partilhar Tela'}
>
  {isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
</button>
```

**Layout da tela partilhada**: quando `screenSharerSocketId` esta ativo, renderizar
a stream correspondente num tile maior (destaque), como o Discord faz:

```tsx
// Antes do grid normal, mostrar tela em destaque se alguem estiver partilhando:
{screenSharerSocketId && remoteStreams[screenSharerSocketId] && (
  <div className="screen-share-spotlight">
    <VideoPlayer
      stream={remoteStreams[screenSharerSocketId].stream}
      label={`${getNomeDoUsuario(screenSharerSocketId)} — Tela`}
    />
  </div>
)}

// Grid normal abaixo (webcams e voz)
<div className="webrtc-grid">
  {/* ... tiles de webcam existentes ... */}
</div>
```

#### Tarefa 2.5 — CSS: layout spotlight

**Arquivo**: `apps/web/src/components/WebRTCGrid.css`

```css
.screen-share-spotlight {
  width: 100%;
  flex: 1;
  min-height: 0;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.screen-share-spotlight video {
  width: 100%;
  height: 100%;
  object-fit: contain; /* nao cortar — tela completa visivel */
}

/* Quando spotlight ativo, reduzir grid de webcams */
.webrtc-wrapper:has(.screen-share-spotlight) .webrtc-grid {
  max-height: 120px;
}

.webrtc-wrapper:has(.screen-share-spotlight) .video-container {
  width: 100px;
  height: 75px;
}

/* Botao ativo (verde) para screen share em andamento */
.control-btn.active {
  background: var(--color-success, #23a55a);
  color: #fff;
}
```

---

### Estimativa de esforco — Screen Share

| Tarefa | Complexidade | Tempo estimado |
|--------|-------------|---------------|
| 2.1 Novos eventos relay no servidor | Baixa — 15 linhas | 30min |
| 2.2 `startScreenShare` / `stopScreenShare` | Media — 40 linhas | 1.5h |
| 2.3 Estado `screenSharerSocketId` | Baixa — 15 linhas | 30min |
| 2.4 Botao + layout spotlight | Media — 30 linhas JSX | 1h |
| 2.5 CSS spotlight | Baixa — 20 linhas | 30min |
| Testes unitarios (mock getDisplayMedia) | Media | 1.5h |
| **Total** | | **~5.5h** |

---

## Ordem de Implementacao Recomendada

```
Semana 1 — Webcam funcionando corretamente
  1.1 onnegotiationneeded (30min) — desbloqueia tudo
  1.2 toggleVideo com replaceTrack (1h)
  1.3 Avatar overlay (30min)
  Testes (1h)

Semana 2 — Screen Share
  2.1 Eventos servidor (30min)
  2.2 startScreenShare/stopScreenShare (1.5h)
  2.3 Estado receptor (30min)
  2.4 UI + botao (1h)
  2.5 CSS (30min)
  Testes (1.5h)
```

Webcam primeiro porque a infra de renegociacao (Tarefa 1.1) e prerequisito
para screen share tambem funcionar. Implementar fora de ordem vai duplicar trabalho.

---

## Limitacoes de Escala — P2P vs SFU

O sistema atual usa **WebRTC P2P em malha completa** (full mesh).
Cada participante envia sua stream para TODOS os outros.

```
4 participantes com video (720p):
  Cada peer envia para 3 outros = 3 streams enviadas
  Total de streams: 4 × 3 = 12 streams simultaneas
  Banda estimada por stream 720p: ~1.5 Mbps
  Banda total: 12 × 1.5 = 18 Mbps saindo de cada cliente
```

| Participantes | Upload necessario por cliente |
|---|---|
| 2 | ~1.5 Mbps |
| 4 | ~4.5 Mbps |
| 6 | ~7.5 Mbps |
| 10 | ~13.5 Mbps |
| 25 (MAX_VOICE_PARTICIPANTS atual) | ~36 Mbps — inviavel |

**Conclusao para dev e testes pequenos (2-6 pessoas)**: P2P funciona perfeitamente.
**Para producao com grupos maiores**: necessario migrar para SFU (Selective Forwarding Unit).

### Opcoes SFU para o futuro

| Solucao | Self-hosted | Custo | Complexidade de integracao |
|---------|------------|-------|--------------------------|
| **mediasoup** | Sim | Gratis | Alta (Node.js nativo, ideal para este stack) |
| **LiveKit** | Sim / Cloud | Free tier + pago | Media (SDK bem documentado) |
| **Janus Gateway** | Sim | Gratis | Alta (C, requer proxy) |
| **Cloudflare Calls** | Nao | Pago por minuto | Baixa (API REST simples) |

Recomendacao para quando o P2P chegar no limite: **LiveKit** ou **mediasoup**.
mediasoup e o mais alinhado ao stack atual (Node.js) e sem dependencia de cloud.
A API de sinalizacao do voiceHandler ja usa padrao compativel (offer/answer/ICE).

---

## Consideracoes de Seguranca

### Ja garantido pelo voiceHandler atual
- Sinalizacao so ocorre entre sockets autenticados no mesmo canal (`verifySocketsInSameRoom`)
- `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate` so sao retransmitidos se ambos
  os sockets estao na mesma sala `voice_{channelId}`
- Os novos eventos `screen_share_started` / `screen_share_stopped` usam o mesmo guard
  (`socket.data.voiceChannelId !== data.channelId`)

### Novos riscos a considerar
- **`getDisplayMedia` nao pode ser chamado sem gesto do utilizador** (browser policy).
  Nao chamar em `useEffect` automaticamente — apenas em resposta ao clique do botao.
- **Permissao de camera vs. tela**: sao permissoes diferentes no navegador.
  Erro de permissao deve ser tratado graciosamente (nao bloquear a chamada de voz).
- **Faixa de audio do sistema** (`getDisplayMedia({audio: true})`): pode capturar
  notificacoes e sons privados do SO. Desabilitado por padrao na Tarefa 2.2 (`audio: false`).

---

*Documento criado: 2026-10-01. Baseado em auditoria direta dos ficheiros:*
*`useWebRTC.ts`, `voiceHandler.ts`, `WebRTCGrid.tsx`, `VoiceScreen.tsx`, `WebRTCGrid.css`.*
