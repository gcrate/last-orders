import { maxHp, powerOf } from '../../engine/adventurers';
import { traitDef } from '../../engine/traits';
import type { Adventurer, GameState } from '../../engine/types';
import { CLASS_LABELS, moodWord } from '../format';
import { Sprite } from './Sprite';
import styles from './AdventurerCard.module.css';

export function Meter({ value, max, kind }: { value: number; max: number; kind: 'hp' | 'morale' | 'loyalty' }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={styles.meter} title={`${Math.round(value)} / ${Math.round(max)}`}>
      <div className={`${styles.fill} ${styles[kind]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TraitChips({ a }: { a: Adventurer }) {
  return (
    <span className={styles.traits}>
      {a.traits.map((t) => (
        <span key={t} className={styles.trait} title={traitDef(t).description}>
          {traitDef(t).name}
        </span>
      ))}
      {a.maimed && (
        <span className={`${styles.trait} ${styles.maimed}`} title="An old wound. Weaker in a fight.">
          Maimed
        </span>
      )}
    </span>
  );
}

interface Props {
  s: GameState;
  a: Adventurer;
  compact?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  selected?: boolean;
}

export function AdventurerCard({ s, a, compact, onClick, children, selected }: Props) {
  const mhp = maxHp(s, a);
  return (
    <div className={`${styles.card} ${selected ? styles.selected : ''} ${onClick ? styles.clickable : ''}`} onClick={onClick}>
      <Sprite id={a.portrait} scale={compact ? 1 : 2} title={a.name} />
      <div className={styles.body}>
        <div className={styles.name}>
          {a.name} <span className="muted">
            {CLASS_LABELS[a.classId]} {a.level}, age {a.age}
          </span>
        </div>
        <TraitChips a={a} />
        <div className={styles.meters}>
          <span className="faint">HP</span>
          <Meter value={a.hp} max={mhp} kind="hp" />
          <span className="faint">Morale</span>
          <Meter value={a.morale} max={100} kind="morale" />
          {!compact && (
            <>
              <span className="faint">Loyalty</span>
              <Meter value={a.loyalty} max={100} kind="loyalty" />
            </>
          )}
        </div>
        {!compact && (
          <div className="faint" style={{ fontSize: 12 }}>
            Power {Math.round(powerOf(s, a))} · morale {moodWord(a.morale)} · loyalty {moodWord(a.loyalty)}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
