import { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, AlertTriangle } from 'lucide-react';
import { useWebRTC } from '../hooks/useWebRTC';
import { useChatStore } from '../stores/useChatStore';
import './WebRTCGrid.css';

function VideoPlayer({ stream, muted = false, label }: { stream: MediaStream | null, muted?: boolean, label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-container">
      <video ref={videoRef} autoPlay playsInline muted={muted} />
      <div className="video-label">{label}</div>
    </div>
  );
}

export function WebRTCGrid({ channelId, onDisconnect }: { channelId: string, onDisconnect: () => void }) {
  const { localStream, remoteStreams, isMuted, isVideoOff, toggleMute, toggleVideo, error } = useWebRTC(channelId, true);
  const users = useChatStore(state => state.users);

  if (error) {
    return (
      <div className="webrtc-wrapper error-state">
        <AlertTriangle size={48} className="error-icon" />
        <h3>Falha no WebRTC</h3>
        <p>{error}</p>
        <button className="btn-retry" onClick={onDisconnect}>Voltar</button>
      </div>
    );
  }

  return (
    <div className="webrtc-wrapper">
      <div className="webrtc-grid">
        <VideoPlayer stream={localStream} muted={true} label="Você" />
        
        {Object.entries(remoteStreams).map(([socketId, data]) => {
          const user = users.find(u => u.id === data.userId);
          const label = user ? user.displayName : 'Usuário';
          return (
            <VideoPlayer key={socketId} stream={data.stream} label={label} />
          );
        })}
      </div>

      <div className="webrtc-controls">
        <button className={`control-btn ${isMuted ? 'danger' : ''}`} onClick={toggleMute} aria-label="Mutar Microfone">
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button className={`control-btn ${isVideoOff ? 'danger' : ''}`} onClick={toggleVideo} aria-label="Desligar Câmera">
          {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>
        <button className="control-btn disconnect" onClick={onDisconnect} aria-label="Desconectar">
          <PhoneOff size={20} />
        </button>
      </div>
    </div>
  );
}
