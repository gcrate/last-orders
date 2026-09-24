import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../../engine/types';
import type { LogLine } from '../../text/templates';
import { firstName, logStamp } from '../format';
import styles from './EventLog.module.css';

interface Props {
  state: GameState;
  log: LogLine[];
}

/** The story feed. Filterable by party; auto-scrolls unless the reader has scrolled up. */
export function EventLog({ state, log }: Props) {
  const [filter, setFilter] = useState<string>('all');
  const [hideQuiet, setHideQuiet] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // Parties that appear in the log, newest first, labelled by their members.
  const parties = useMemo(() => {
    const seen = new Map<string, string>();
    for (let i = log.length - 1; i >= 0; i--) {
      const id = log[i].expeditionId;
      if (id && !seen.has(id)) {
        const exp = state.expeditions[id];
        const names = exp ? exp.originalMemberIds.map((m) => firstName(state.adventurers[m]?.name ?? '?')).join(', ') : `party ${id}`;
        seen.set(id, names);
      }
      if (seen.size > 12) break;
    }
    return [...seen.entries()];
  }, [log, state]);

  const shown = log.filter((l) => {
    if (hideQuiet && l.tone === 'quiet') return false;
    if (filter === 'all') return true;
    if (filter === 'tavern') return l.expeditionId === null;
    return l.expeditionId === filter;
  });

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Everything</option>
          <option value="tavern">The tavern</option>
          {parties.map(([id, names]) => (
            <option key={id} value={id}>
              {names}
            </option>
          ))}
        </select>
        <label className="muted">
          <input type="checkbox" checked={hideQuiet} onChange={(e) => setHideQuiet(e.target.checked)} /> hide minor
        </label>
      </div>
      <div
        className={styles.lines}
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {shown.length === 0 && <p className="faint">Nothing has happened yet. The fire is lit; the door is open.</p>}
        {shown.map((l, i) => (
          <div key={i} className={styles.line}>
            <span className={styles.stamp}>{logStamp(state, l.hour)}</span>
            <span className={`tone-${l.tone}`}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
