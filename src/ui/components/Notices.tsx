import { useEffect } from 'react';
import type { Notice } from '../useGame';
import styles from './Notices.module.css';

interface Props {
  notices: Notice[];
  onDismiss: (id: number) => void;
}

/** Toast notifications for important events. They fade after a while. */
export function Notices({ notices, onDismiss }: Props) {
  useEffect(() => {
    if (notices.length === 0) return;
    const oldest = notices[0];
    const t = window.setTimeout(() => onDismiss(oldest.id), 7000);
    return () => window.clearTimeout(t);
  }, [notices, onDismiss]);

  return (
    <div className={styles.stack}>
      {notices.map((n) => (
        <div key={n.id} className={`${styles.notice} tone-${n.tone}`} onClick={() => onDismiss(n.id)}>
          {n.text}
        </div>
      ))}
    </div>
  );
}
