import { describe, it, expect } from 'vitest';
import {
  SCREEN_SHARE_RESOLUTIONS,
  SCREEN_SHARE_FPS,
  SCREEN_SHARE_CONFIG,
} from './screenShare';

describe('screenShare Configuration Constants', () => {
  it('exposes supported resolutions and fps lists', () => {
    expect(SCREEN_SHARE_RESOLUTIONS).toContain('720p');
    expect(SCREEN_SHARE_RESOLUTIONS).toContain('480p');
    expect(SCREEN_SHARE_RESOLUTIONS).toContain('240p');

    expect(SCREEN_SHARE_FPS).toEqual([60, 45, 30]);
  });

  it('maps resolutions to correct dimensions and labels', () => {
    expect(SCREEN_SHARE_CONFIG['720p'].width).toBe(1280);
    expect(SCREEN_SHARE_CONFIG['720p'].height).toBe(720);

    expect(SCREEN_SHARE_CONFIG['480p'].width).toBe(854);
    expect(SCREEN_SHARE_CONFIG['480p'].height).toBe(480);

    expect(SCREEN_SHARE_CONFIG['240p'].width).toBe(426);
    expect(SCREEN_SHARE_CONFIG['240p'].height).toBe(240);
  });
});
