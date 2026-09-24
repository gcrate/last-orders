import { useState } from 'react';
import { balance } from '../../engine/balance';
import { partyHp } from '../../engine/combat';
import { shopCatalog } from '../../engine/economy';
import { ITEM_KINDS, isEquipSlot, sellPrice, upgradeCost as itemUpgradeCost } from '../../engine/items';
import { estimate, isResting, portraitStage } from '../../engine/keeper';
import { housedCount, roomCapacity, upgradeCost } from '../../engine/tavern';
import type { GameState, Item, UpgradeId } from '../../engine/types';
import { UPGRADES } from '../../engine/types';
import { estimateText, objectiveText, upgradeName } from '../../text/templates';
import { AdventurerCard, Meter } from '../components/AdventurerCard';
import { Sprite } from '../components/Sprite';
import { firstName } from '../format';
import type { GameApi } from '../useGame';
import styles from './Tavern.module.css';

interface Props {
  game: GameApi;
  onOpenAdventurer: (id: string) => void;
}

export function keeperPortraitId(s: GameState): string {
  const stage = portraitStage(s.keeper);
  return s.keeper.portrait === 'keeper' ? `keeper_stage${stage}` : `${s.keeper.portrait}_stage${stage}`;
}

function tavernBackground(s: GameState): string {
  const total = UPGRADES.reduce((t, u) => t + s.upgrades[u], 0);
  if (total >= 8) return 'tavern_prosperous';
  if (total >= 3) return 'tavern_restored';
  return 'tavern_rundown';
}

const STAGE_TEXT = ['', 'Tired, but upright.', 'Thinner. The cough lingers.', 'Grey and slow. The stairs are hard now.', 'Near the end.'];

const UPGRADE_TEXT: Record<UpgradeId, string> = {
  rooms: 'More residents, more faces at the bar.',
  forge: 'Better gear to buy; rework old gear.',
  library: 'Scrolls to buy; insights come quicker.',
  shrine: 'A chance to revive the recently dead; steadier morale.',
  noticeBoard: 'Post bounties for graves; hear rumours.',
  commonRoom: 'Reputation grows faster; better recruits.',
};

export function Tavern({ game, onOpenAdventurer }: Props) {
  const { state: s, dispatch } = game;
  const recruits = Object.values(s.adventurers).filter((a) => a.status === 'recruit');
  const residents = Object.values(s.adventurers).filter((a) => a.status === 'resident');
  const expeditions = Object.values(s.expeditions);
  const k = balance.keeper;
  const resting = isResting(s);

  return (
    <div className={styles.grid}>
      {/* Keeper */}
      <section className={`panel ${styles.keeper}`}>
        <Sprite id={keeperPortraitId(s)} scale={2} title={s.keeper.name} />
        <div className="col" style={{ gap: 4 }}>
          <h2>{s.keeper.name}</h2>
          <div className="muted">{STAGE_TEXT[portraitStage(s.keeper)]}</div>
          <div>
            The healer's last word: <em>{estimateText(estimate(s.keeper))}</em>
          </div>
          {s.generation > 1 && <div className="faint">Keeper of generation {s.generation} of {balance.generation.maxGenerations}</div>}
          {resting && <div className="tone-keeper">Resting today.</div>}
          <div className="row" style={{ marginTop: 4 }}>
            <button onClick={() => dispatch({ type: 'KEEPER', action: { type: 'REST' } })} disabled={resting} title="Do nothing strenuous today. The illness slows a little.">
              Rest today
            </button>
            <button onClick={() => dispatch({ type: 'KEEPER', action: { type: 'TONIC' } })} disabled={s.gold < k.tonicCost} title="A few more days, less each time.">
              Buy tonic ({k.tonicCost}g)
            </button>
            <button onClick={() => dispatch({ type: 'KEEPER', action: { type: 'HEALER' } })} disabled={s.gold < k.healerCost} title="A clearer estimate of the time you have.">
              Call the healer ({k.healerCost}g)
            </button>
          </div>
        </div>
      </section>

      {/* The bar */}
      <section className={`panel ${styles.bar}`}>
        <div className={styles.scene}>
          <Sprite id={tavernBackground(s)} scale={2} />
        </div>
        <h3>
          At the bar tonight <span className="faint">rooms {housedCount(s)}/{roomCapacity(s)}</span>
        </h3>
        {recruits.length === 0 && <p className="faint">Nobody new. More will come in the evening.</p>}
        <div className={styles.cards}>
          {recruits.map((a) => (
            <AdventurerCard key={a.id} s={s} a={a}>
              <div className="row">
                <button
                  className="primary"
                  onClick={() => dispatch({ type: 'RECRUIT', adventurerId: a.id })}
                  disabled={housedCount(s) >= roomCapacity(s) || s.gold < a.signingCost}
                >
                  {a.signingCost > 0 ? `Hire (${a.signingCost}g)` : 'Offer a room'}
                </button>
              </div>
            </AdventurerCard>
          ))}
        </div>
      </section>

      {/* Parties out */}
      <section className="panel">
        <h3>In the dungeon</h3>
        {expeditions.length === 0 && <p className="faint">No one is below.</p>}
        {expeditions.map((e) => {
          const hp = partyHp(s, e);
          return (
            <div key={e.id} className={styles.party}>
              <div>
                <strong>{e.memberIds.map((id) => firstName(s.adventurers[id].name)).join(', ')}</strong>{' '}
                <span className="muted">
                  {e.phase === 'returning' ? `heading home, level ${e.level}` : `level ${e.level}`} · {objectiveText(e.orders.objective)}
                </span>
              </div>
              <div className="row">
                <span className="faint">HP</span>
                <div style={{ width: 160 }}>
                  <Meter value={hp.hp} max={hp.max} kind="hp" />
                </div>
                <span className="faint">{e.daysOut} days out</span>
              </div>
            </div>
          );
        })}
      </section>

      {/* Residents */}
      <section className="panel">
        <h3>Staying here</h3>
        {residents.length === 0 && <p className="faint">The rooms are empty.</p>}
        <div className={styles.cards}>
          {residents.map((a) => (
            <AdventurerCard key={a.id} s={s} a={a} compact onClick={() => onOpenAdventurer(a.id)} />
          ))}
        </div>
      </section>

      <Market game={game} />

      {/* Upgrades */}
      <section className="panel">
        <h3>The tavern</h3>
        <table>
          <tbody>
            {UPGRADES.map((u) => {
              const cost = upgradeCost(s, u);
              return (
                <tr key={u}>
                  <td style={{ textTransform: 'capitalize' }}>{upgradeName(u)}</td>
                  <td className="muted">
                    {'●'.repeat(s.upgrades[u])}
                    {'○'.repeat(balance.upgrades.maxTier - s.upgrades[u])}
                  </td>
                  <td className="faint">{UPGRADE_TEXT[u]}</td>
                  <td>
                    {cost === null ? (
                      <span className="faint">complete</span>
                    ) : (
                      <button onClick={() => dispatch({ type: 'BUY_UPGRADE', upgrade: u })} disabled={s.gold < cost}>
                        Improve ({cost}g)
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function itemStats(i: Item): string {
  const parts: string[] = [];
  if (i.attack) parts.push(`atk ${i.attack}`);
  if (i.spell) parts.push(`spell ${i.spell}`);
  if (i.defence) parts.push(`def ${i.defence}`);
  if (i.hpBonus) parts.push(`hp ${i.hpBonus}`);
  if (i.trapSense) parts.push(`traps ${i.trapSense}`);
  return parts.join(' · ');
}

export function ItemLabel({ item }: { item: Item }) {
  return (
    <span className="row" style={{ gap: 6 }} title={itemStats(item)}>
      <Sprite id={item.asset} />
      <span className={item.legendary ? 'tone-good' : ''}>{item.name}</span>
      <span className="faint" style={{ fontSize: 12 }}>
        {itemStats(item)}
      </span>
    </span>
  );
}

function Market({ game }: { game: GameApi }) {
  const { state: s, dispatch } = game;
  const [showShop, setShowShop] = useState(false);
  const catalog = shopCatalog(s);
  const stash = s.stash.map((id) => s.items[id]).filter(Boolean);
  // Group consumables and scrolls by kind so the stash stays readable.
  const counts = new Map<string, number>();
  for (const i of stash) if (!isEquipSlot(i.slot)) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  const gear = stash.filter((i) => isEquipSlot(i.slot));

  return (
    <section className="panel">
      <h3>Stash and market</h3>
      <div className="row" style={{ marginBottom: 6 }}>
        {[...counts.entries()].map(([kind, n]) => (
          <span key={kind} className="row" style={{ gap: 4 }}>
            <Sprite id={stash.find((i) => i.kind === kind)!.asset} />
            {ITEM_KINDS[kind as keyof typeof ITEM_KINDS].names[0]} ×{n}
          </span>
        ))}
      </div>
      <table>
        <tbody>
          {gear.map((i) => {
            const up = itemUpgradeCost(i);
            const canForge = s.upgrades.forge > 0 && i.tier < balance.shop.forgeMaxTier[s.upgrades.forge] && !i.legendary;
            return (
              <tr key={i.id}>
                <td>
                  <ItemLabel item={i} />
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {canForge && (
                    <button onClick={() => dispatch({ type: 'UPGRADE_ITEM', itemId: i.id })} disabled={s.gold < up}>
                      Rework ({up}g)
                    </button>
                  )}{' '}
                  <button onClick={() => dispatch({ type: 'SELL', itemId: i.id })}>Sell ({sellPrice(i)}g)</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {gear.length === 0 && <p className="faint">No spare gear.</p>}
      <button onClick={() => setShowShop(!showShop)} style={{ marginTop: 8 }}>
        {showShop ? 'Close the market' : 'Visit the market'}
      </button>
      {showShop && (
        <table style={{ marginTop: 6 }}>
          <tbody>
            {catalog.map((e) => (
              <tr key={`${e.kind}-${e.tier}`}>
                <td>
                  {ITEM_KINDS[e.kind].names[Math.min(2, e.tier - 1)]}
                  {isEquipSlot(ITEM_KINDS[e.kind].slot) && <span className="faint"> (tier {e.tier})</span>}
                </td>
                <td>
                  <button onClick={() => dispatch({ type: 'BUY', kind: e.kind, tier: e.tier })} disabled={s.gold < e.price}>
                    Buy ({e.price}g)
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
