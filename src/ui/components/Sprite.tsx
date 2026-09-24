import { placeholderColour, resolveAsset } from '../assets';
import styles from './Sprite.module.css';

interface Props {
  id: string;
  scale?: number; // integer only
  title?: string;
  className?: string;
}

/** Pixel art at integer scale. Falls back to a coloured block with a label. */
export function Sprite({ id, scale = 1, title, className }: Props) {
  const s = Math.max(1, Math.round(scale));
  const asset = resolveAsset(id);
  const [w, h] = asset.size;
  const style = { width: w * s, height: h * s };
  if (asset.url) {
    return <img src={asset.url} alt={title ?? id} title={title} className={`${styles.sprite} ${className ?? ''}`} style={style} />;
  }
  return (
    <div className={`${styles.block} ${className ?? ''}`} style={{ ...style, background: placeholderColour(id) }} title={title ?? id}>
      <span>{id.replace(/_/g, ' ')}</span>
    </div>
  );
}
