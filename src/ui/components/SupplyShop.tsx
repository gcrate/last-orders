import { useEffect } from 'react';
import { shopCatalog } from '../../engine/economy';
import { ITEM_KINDS, isEquipSlot, itemAsset, itemStatsFor } from '../../engine/items';
import type { ItemKind } from '../../engine/types';
import type { GameApi } from '../useGame';
import { ItemTooltip } from './ItemTooltip';
import { Sprite } from './Sprite';
import styles from './SupplyShop.module.css';

/** A quick counter for consumables and scrolls, so the party builder doesn't need a trip to the market. */
export function SupplyShop({ game, onClose }: { game: GameApi; onClose: () => void }) {
  const { state: s, dispatch } = game;
  const entries = shopCatalog(s).filter((e) => !isEquipSlot(ITEM_KINDS[e.kind].slot));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const owned = (kind: ItemKind) => s.stash.filter((id) => s.items[id]?.kind === kind).length;
  const buy = (kind: ItemKind, n: number) => {
    for (let i = 0; i < n; i++) dispatch({ type: 'BUY', kind, tier: 1 });
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={`panel ${styles.shop}`} onClick={(e) => e.stopPropagation()}>
        <h3>Supplies</h3>
        <p className="faint">You have {s.gold}g. Bought supplies go to the stash.</p>
        <table>
          <tbody>
            {entries.map((e) => {
              const name = ITEM_KINDS[e.kind].names[0];
              return (
                <tr key={e.kind}>
                  <td>
                    <ItemTooltip kind={e.kind} name={name} tier={1} stats={itemStatsFor(e.kind, 1)}>
                      <span className="row" style={{ gap: 6 }}>
                        <Sprite id={itemAsset(e.kind, 1, ITEM_KINDS[e.kind].slot)} />
                        {name}
                      </span>
                    </ItemTooltip>
                  </td>
                  <td className="faint">have {owned(e.kind)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button onClick={() => buy(e.kind, 1)} disabled={s.gold < e.price}>
                      Buy ({e.price}g)
                    </button>{' '}
                    <button onClick={() => buy(e.kind, 5)} disabled={s.gold < e.price * 5}>
                      ×5 ({e.price * 5}g)
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button onClick={onClose} style={{ alignSelf: 'flex-end' }}>
          Done
        </button>
      </div>
    </div>
  );
}
