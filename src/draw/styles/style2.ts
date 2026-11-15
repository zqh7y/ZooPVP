import type { ArtStyle } from './api';
import { TEAM } from '../../theme';

/* Style sample 2. Placeholder until its style is drawn. */
export const style2: ArtStyle = {
  NAME: 'Style 2',
  BLURB: 'not drawn yet',
  drawPet(ctx, type, team, x, y, r) {
    ctx.fillStyle = TEAM[team].main;
    ctx.beginPath();
    ctx.arc(x, y - r, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f2733';
    ctx.font = `${Math.max(8, r * 0.5)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(type, x, y - r);
  },
  drawItem(ctx, type, x, y, size) {
    ctx.strokeStyle = '#1f2733';
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    ctx.fillStyle = '#1f2733';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(type, x, y);
  },
};
