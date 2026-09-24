import { type ReactNode, useState } from 'react';
import { type ItemStats, ITEM_KINDS, isEquipSlot } from '../../engine/items';
import type { ItemKind } from '../../engine/types';
import { affinityText, itemDescription } from '../../text/items';
import styles from './ItemTooltip.module.css';

interface Props {
  kind: ItemKind;
  name: string;
  tier: number;
  stats: ItemStats;
  legendary?: boolean;
  children: ReactNode;
}

const STAT_LABELS: [keyof ItemStats, string][] = [
  ['attack', 'Attack'],
  ['spell', 'Spell'],
  ['defence', 'Defence'],
  ['hpBonus', 'Max HP'],
  ['trapSense', 'Trap sense'],
];

const CARD_ROOM = 200; // px; roughly the tallest card

/** Wraps an item name; hovering (or focusing) it shows the item's stats and what it does. */
export function ItemTooltip({ kind, name, tier, stats, legendary, children }: Props) {
  const gear = isEquipSlot(ITEM_KINDS[kind].slot);
  const statRows = STAT_LABELS.filter(([k]) => stats[k]);
  const affinity = gear ? affinityText(kind) : null;
  // Open upward when there isn't room for the card below the item.
  const [above, setAbove] = useState(false);
  const place = (el: HTMLElement) => setAbove(el.getBoundingClientRect().bottom + CARD_ROOM > window.innerHeight);
  return (
    <span
      className={styles.anchor}
      tabIndex={0}
      onMouseEnter={(e) => place(e.currentTarget)}
      onFocus={(e) => place(e.currentTarget)}
    >
      {children}
      <span className={`panel ${styles.card} ${above ? styles.above : ''}`} role="tooltip">
        <span className={legendary ? 'tone-good' : styles.name}>{name}</span>
        {gear && <span className="faint">{legendary ? 'Legendary' : `Tier ${tier}`}</span>}
        {statRows.length > 0 && (
          <span className={styles.stats}>
            {statRows.map(([k, label]) => (
              <span key={k}>
                {label} <b>+{stats[k]}</b>
              </span>
            ))}
          </span>
        )}
        {affinity && <span className="tone-good">{affinity}</span>}
        <span className={styles.desc}>{itemDescription(kind)}</span>
      </span>
    </span>
  );
}
