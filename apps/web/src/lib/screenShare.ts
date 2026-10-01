export type ScreenShareResolution = '720p' | '480p' | '240p';
export type ScreenShareFps = 60 | 45 | 30;

export interface ScreenShareOptions {
  resolution?: ScreenShareResolution;
  fps?: ScreenShareFps;
}

export const SCREEN_SHARE_RESOLUTIONS: readonly ScreenShareResolution[] = [
  '720p',
  '480p',
  '240p',
] as const;

export const SCREEN_SHARE_FPS: readonly ScreenShareFps[] = [
  60,
  45,
  30,
] as const;

export const SCREEN_SHARE_CONFIG: Record<
  ScreenShareResolution,
  { width: number; height: number; label: string; description: string }
> = {
  '720p': {
    width: 1280,
    height: 720,
    label: '720p',
    description: 'Alta Definição (HD)',
  },
  '480p': {
    width: 854,
    height: 480,
    label: '480p',
    description: 'Qualidade Padrão (SD)',
  },
  '240p': {
    width: 426,
    height: 240,
    label: '240p',
    description: 'Econômico (Baixo Uso de Dados)',
  },
};
