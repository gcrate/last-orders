import { useMemo, useState } from 'react';
import { complianceChance, orderFriction } from '../../engine/advice';
import { maxHp, powerOf } from '../../engine/adventurers';
import { complianceWord, frictionText } from '../../text/templates';
import { firstName } from '../format';
import { balance } from '../../engine/balance';
import { bossThreat, isBossLevel, level, levelThreat, portalsActive } from '../../engine/dungeon';
import { ITEM_KINDS } from '../../engine/items';
import { exertBlocked } from '../../engine/keeper';
import { dayOf } from '../../engine/time';
import type { Adventurer, EquipSlot, GameState, ItemKind, ObjectiveType, Stance } from '../../engine/types';
import { AdventurerCard } from '../components/AdventurerCard';
import { Sprite } from '../components/Sprite';
import { SupplyShop } from '../components/SupplyShop';
import type { GameApi } from '../useGame';
import { itemStats } from './Tavern';
import styles from './PartyBuilder.module.css';

/** Everything set up on this screen. Held by the App so it survives switching tabs. */
export interface PartyDraft {
  members: string[];
  objType: ObjectiveType;
  objLevel: number;
  graveId: string;
  setPortal: boolean;
  stance: Stance;
  retreat: number;
  returnBy: string;
  counsel: boolean;
  portalChoice: string | null; // null until the player picks: then we default to the deepest portal they can use
  supplies: Record<string, number>;
}

export function newPartyDraft(): PartyDraft {
  return {
    members: [],
    objType: 'push',
    objLevel: 1,
    graveId: '',
    setPortal: false,
    stance: 'balanced',
    retreat: 40,
    returnBy: '',
    counsel: false,
    portalChoice: null,
    supplies: {},
  };
}

interface Props {
  game: GameApi;
  draft: PartyDraft;
  onDraftChange: (draft: PartyDraft) => void;
  onSent: () => void;
}

const OBJECTIVES: { id: ObjectiveType; label: string; help: string }[] = [
  { id: 'push', label: 'Push to depth', help: 'Reach the level, then come home.' },
  { id: 'clear', label: 'Clear level', help: 'Explore the level fully and kill what lives there.' },
  { id: 'scout', label: 'Scout', help: 'Map the level and return. Faster exploring.' },
  { id: 'boss', label: 'Hunt the boss', help: 'Find and kill the boss on a boss level.' },
  { id: 'recover', label: 'Recover grave', help: 'Find a fallen adventurer\'s grave and bring back what\'s there.' },
];

function dangerRead(ratio: number): { text: string; tone: string } {
  if (ratio < 0.45) return { text: 'Should be easy for them.', tone: 'tone-good' };
  if (ratio < 0.7) return { text: 'Manageable, with care.', tone: 'tone-good' };
  if (ratio < 0.95) return { text: 'Risky. Some may not come back.', tone: 'tone-bad' };
  if (ratio < 1.3) return { text: 'Very dangerous. You wouldn\'t have gone, in your day.', tone: 'tone-bad' };
  return { text: 'You would be sending them to die.', tone: 'tone-death' };
}

const SLOTS: EquipSlot[] = ['weapon', 'armour', 'trinket'];

/** Shown while hovering a card, so you can see what they'd carry into the dungeon. */
function EquipmentPopup({ s, a }: { s: GameState; a: Adventurer }) {
  return (
    <div className={`panel ${styles.equipPopup}`} role="tooltip">
      {SLOTS.map((slot) => {
        const id = a.equipment[slot];
        const item = id ? s.items[id] : null;
        return (
          <div key={slot} className="row" style={{ gap: 6 }}>
            <span className="muted" style={{ width: 56, textTransform: 'capitalize' }}>
              {slot}
            </span>
            {item ? (
              <>
                <Sprite id={item.asset} />
                <span className={item.legendary ? 'tone-good' : ''}>{item.name}</span>
                <span className="faint">{itemStats(item)}</span>
              </>
            ) : (
              <span className="faint">none</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PartyBuilder({ game, draft, onDraftChange, onSent }: Props) {
  const { state: s, dispatch } = game;
  const residents = Object.values(s.adventurers).filter((a) => a.status === 'resident');
  const { objType, objLevel, setPortal, stance, retreat, returnBy, counsel, portalChoice } = draft;
  const [shopOpen, setShopOpen] = useState(false);
  const update = (patch: Partial<PartyDraft>) => onDraftChange({ ...draft, ...patch });
  const setObjType = (objType: ObjectiveType) => update({ objType });
  const setObjLevel = (objLevel: number) => update({ objLevel });
  const setGraveId = (graveId: string) => update({ graveId });
  const setSetPortal = (setPortal: boolean) => update({ setPortal });
  const setStance = (stance: Stance) => update({ stance });
  const setRetreat = (retreat: number) => update({ retreat });
  const setReturnBy = (returnBy: string) => update({ returnBy });
  const setCounsel = (counsel: boolean) => update({ counsel });
  const setPortalChoice = (portalChoice: string | null) => update({ portalChoice });
  const setSupplies = (supplies: Record<string, number>) => update({ supplies });

  // Things may have changed while the player was on another tab: drop what no longer applies.
  const members = draft.members.filter((id) => s.adventurers[id]?.status === 'resident');
  const graves = Object.values(s.graves).filter((g) => !g.recovered);
  const graveId = graves.some((g) => g.id === draft.graveId) ? draft.graveId : '';
  const stashByKind = useMemo(() => {
    const m = new Map<ItemKind, string[]>();
    for (const id of s.stash) {
      const it = s.items[id];
      if (!it || (it.slot !== 'scroll' && it.slot !== 'consumable')) continue;
      m.set(it.kind, [...(m.get(it.kind) ?? []), id]);
    }
    return m;
  }, [s.stash, s.items]);

  const toggle = (id: string) => {
    update({ members: members.includes(id) ? members.filter((x) => x !== id) : members.length >= balance.party.maxSize ? members : [...members, id] });
  };
  const supplies: Record<string, number> = {};
  for (const [kind, ids] of stashByKind) supplies[kind] = Math.min(draft.supplies[kind] ?? 0, ids.length);

  const power = members.reduce((t, id) => t + powerOf(s, s.adventurers[id]), 0);
  const effLevel = objType === 'recover' && graveId ? s.graves[graveId]?.level ?? objLevel : objLevel;
  const portals = portalsActive(s).filter((p) => p.level <= effLevel);
  const deepestPortal = portals
    .filter((p) => !p.decayed || s.gold >= balance.portals.decayedCost)
    .reduce<(typeof portals)[number] | null>((best, p) => (!best || p.level > best.level ? p : best), null);
  const portalId =
    portalChoice !== null && (portalChoice === '' || portals.some((p) => p.id === portalChoice)) ? portalChoice : deepestPortal?.id ?? '';
  const threat = objType === 'boss' && isBossLevel(effLevel) ? bossThreat(s, effLevel) : levelThreat(s, effLevel);
  const read = power > 0 ? dangerRead(threat / power) : null;
  const blocked = exertBlocked(s);
  const lvl = level(s, effLevel);
  const friction = orderFriction(s, members, {
    objective: { type: objType, level: effLevel, graveId: graveId || null, setPortal },
    stance,
    retreatHp: retreat / 100,
    returnByDay: null,
  });

  const send = () => {
    const supplyIds: string[] = [];
    for (const [kind, n] of Object.entries(supplies)) supplyIds.push(...(stashByKind.get(kind as ItemKind) ?? []).slice(0, n));
    const events = dispatch({
      type: 'SEND_PARTY',
      memberIds: members,
      orders: {
        objective: { type: objType, level: effLevel, graveId: objType === 'recover' ? graveId || null : null, setPortal: objType === 'push' && setPortal },
        stance,
        retreatHp: retreat / 100,
        returnByDay: returnBy ? Number(returnBy) : null,
      },
      counsel,
      supplyIds,
      startPortalId: portalId || null,
    });
    if (events.some((e) => e.type === 'PARTY_DEPARTED')) {
      // Keep the objective and orders for the next party; clear who went and what they took.
      onDraftChange({ ...draft, members: [], supplies: {}, portalChoice: null, counsel: false, returnBy: '' });
      onSent();
    }
  };

  return (
    <div className={styles.layout}>
      <section className="panel">
        <h3>
          Who goes <span className="faint">({members.length}/{balance.party.maxSize})</span>
        </h3>
        {residents.length === 0 && <p className="faint">Nobody is at the tavern.</p>}
        <div className={styles.cards}>
          {residents.map((a) => (
            <div key={a.id} className={styles.cardWrap}>
              <AdventurerCard s={s} a={a} compact selected={members.includes(a.id)} onClick={() => toggle(a.id)}>
                {a.hp < maxHp(s, a) * 0.5 && <span className="tone-bad" style={{ fontSize: 12 }}>Still hurt.</span>}
              </AdventurerCard>
              <EquipmentPopup s={s} a={a} />
            </div>
          ))}
        </div>
      </section>

      <section className={`panel ${styles.orders}`}>
        <h3>Orders</h3>
        <label>Objective</label>
        <div className="row">
          {OBJECTIVES.map((o) => (
            <button key={o.id} className={objType === o.id ? 'active' : ''} onClick={() => setObjType(o.id)} title={o.help}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="faint">{OBJECTIVES.find((o) => o.id === objType)!.help}</p>

        {objType === 'recover' ? (
          <div className="row">
            <label>Grave</label>
            <select value={graveId} onChange={(e) => setGraveId(e.target.value)}>
              <option value="">Choose…</option>
              {graves.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}, level {g.level}
                  {g.legendary ? ' (legendary, guarded)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="row">
            <label>Level</label>
            <input type="number" min={1} max={balance.dungeon.levels} value={objLevel} onChange={(e) => setObjLevel(Math.max(1, Math.min(balance.dungeon.levels, Number(e.target.value) || 1)))} style={{ width: 60 }} />
            {objType === 'boss' && !isBossLevel(objLevel) && <span className="tone-bad">Bosses live on every tenth level.</span>}
            {objType === 'push' && (
              <label className="muted">
                <input type="checkbox" checked={setPortal} onChange={(e) => setSetPortal(e.target.checked)} /> set a portal there (needs a portal scroll)
              </label>
            )}
          </div>
        )}
        <div className="faint">
          Level {effLevel}: {lvl.visited ? (lvl.mapped ? 'mapped' : `${Math.round(lvl.explored * 100)}% explored`) : 'nobody has been there'}
          {lvl.stairsKnown ? ', way down known' : ''}
          {isBossLevel(effLevel) && lvl.bossAlive ? ', the boss lives' : ''}
        </div>

        <label>Stance</label>
        <div className="row">
          {(['cautious', 'balanced', 'aggressive'] as Stance[]).map((st) => (
            <button key={st} className={stance === st ? 'active' : ''} onClick={() => setStance(st)} style={{ textTransform: 'capitalize' }}>
              {st}
            </button>
          ))}
        </div>

        <label>
          Turn back when the party is below {retreat}% health
        </label>
        <input type="range" min={10} max={80} step={5} value={retreat} onChange={(e) => setRetreat(Number(e.target.value))} />

        <div className="row">
          <label>Home by day</label>
          <input type="number" min={dayOf(s.hour)} placeholder="any" value={returnBy} onChange={(e) => setReturnBy(e.target.value)} style={{ width: 70 }} />
          <span className="faint">(today is day {dayOf(s.hour)})</span>
        </div>

        {portals.length > 0 && (
          <div className="row">
            <label>Start at</label>
            <select value={portalId} onChange={(e) => setPortalChoice(e.target.value)}>
              <option value="">the tavern steps</option>
              {portals.map((p) => (
                <option key={p.id} value={p.id}>
                  portal on level {p.level} ({p.usesLeft} uses{p.decayed ? `, decayed: ${balance.portals.decayedCost}g` : ''})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h4>Supplies</h4>
          <button onClick={() => setShopOpen(true)}>Buy supplies…</button>
        </div>
        {shopOpen && <SupplyShop game={game} onClose={() => setShopOpen(false)} />}
        {stashByKind.size === 0 && <span className="faint">Nothing in the stash to take.</span>}
        {[...stashByKind.entries()].map(([kind, ids]) => (
          <div key={kind} className="row">
            <Sprite id={s.items[ids[0]].asset} />
            <span style={{ width: 130 }}>{ITEM_KINDS[kind].names[0]}</span>
            <input
              type="number"
              min={0}
              max={ids.length}
              value={supplies[kind] ?? 0}
              onChange={(e) => setSupplies({ ...supplies, [kind]: Math.max(0, Math.min(ids.length, Number(e.target.value) || 0)) })}
              style={{ width: 50 }}
            />
            <span className="faint">of {ids.length}</span>
          </div>
        ))}

        <label className="tone-keeper" title={blocked ?? `Sit with them before they go. Costs about ${balance.keeper.counselDaysCost} days of your life.`}>
          <input type="checkbox" checked={counsel} disabled={!!blocked} onChange={(e) => setCounsel(e.target.checked)} /> Counsel them before they leave
          (costs you days)
        </label>

        {read && (
          <p className={read.tone}>
            Your read: {read.text}
          </p>
        )}
        {members.length > 0 && (
          <div className={styles.read}>
            <h4>Will they listen?</h4>
            {members.map((id) => (
              <div key={id} className="muted">
                {firstName(s.adventurers[id].name)}: {complianceWord(complianceChance(s, s.adventurers[id], { counsel, depth: effLevel, firstDay: false }))}
              </div>
            ))}
            {friction.map((f, i) => (
              <div key={i} className={f.kind === 'friends' ? 'tone-good' : 'tone-bad'}>
                {frictionText(f, s)}
              </div>
            ))}
          </div>
        )}
        <button className="primary" disabled={members.length === 0 || (objType === 'recover' && !graveId)} onClick={send}>
          Send them
        </button>
      </section>
    </div>
  );
}
