import { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';
import { useWebRTC } from '../hooks/useWebRTC';
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
  const { localStream, remoteStreams, isMuted, isVideoOff, toggleMute, toggleVideo } = useWebRTC(channelId, true);

  return (
    <div className="webrtc-wrapper">
      <div className="webrtc-grid">
        <VideoPlayer stream={localStream} muted={true} label="Você" />
        
        {Object.entries(remoteStreams).map(([socketId, data]) => (
          <VideoPlayer key={socketId} stream={data.stream} label={`Usuário`} />
        ))}
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
