import { attackOf, defenceOf, maxHp, powerOf, relation, spellOf, trapSenseOf, xpToNext } from '../../engine/adventurers';
import { balance } from '../../engine/balance';
import { exertBlocked } from '../../engine/keeper';
import type { Adventurer, EquipSlot } from '../../engine/types';
import { STATS } from '../../engine/types';
import { AdventurerCard, TraitChips } from '../components/AdventurerCard';
import { Sprite } from '../components/Sprite';
import { CLASS_LABELS, STAT_LABELS, STAT_SHORT, firstName, moodWord } from '../format';
import type { GameApi } from '../useGame';
import { ItemLabel } from './Tavern';
import styles from './Roster.module.css';

interface Props {
  game: GameApi;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

const STATUS_ORDER: Adventurer['status'][] = ['resident', 'expedition', 'retired'];

export function Roster({ game, selected, onSelect }: Props) {
  const { state: s } = game;
  const people = Object.values(s.adventurers)
    .filter((a) => a.status === 'resident' || a.status === 'expedition' || (a.status === 'retired' && a.generation === s.generation))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.level - a.level);
  const current = selected ? s.adventurers[selected] : null;

  return (
    <div className={current ? styles.layout : styles.single}>
      <section className={`panel ${styles.tableWrap}`}>
        <h3>Roster</h3>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Class</th>
              <th>Lvl</th>
              {STATS.map((st) => (
                <th key={st} title={STAT_LABELS[st]}>
                  {STAT_SHORT[st]}
                </th>
              ))}
              <th>Power</th>
              <th>HP</th>
              <th>Morale</th>
              <th>Loyalty</th>
              <th>Where</th>
            </tr>
          </thead>
          <tbody>
            {people.map((a) => (
              <tr key={a.id} className={`${styles.row} ${a.id === selected ? styles.selected : ''}`} onClick={() => onSelect(a.id)}>
                <td>
                  <Sprite id={a.portrait} scale={1} />
                </td>
                <td>
                  {a.name}
                  <div>
                    <TraitChips a={a} />
                  </div>
                </td>
                <td>{CLASS_LABELS[a.classId]}</td>
                <td>{a.level}</td>
                {STATS.map((st) => (
                  <td key={st}>{a.stats[st]}</td>
                ))}
                <td>{Math.round(powerOf(s, a))}</td>
                <td>
                  {a.hp}/{maxHp(s, a)}
                </td>
                <td>{moodWord(a.morale)}</td>
                <td>{moodWord(a.loyalty)}</td>
                <td className="muted">{a.status === 'expedition' ? 'below' : a.status === 'resident' ? 'here' : a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {people.length === 0 && <p className="faint">Nobody yet. Hire someone at the bar.</p>}
      </section>
      {current && <Detail game={game} a={current} />}
    </div>
  );
}

function Detail({ game, a }: { game: GameApi; a: Adventurer }) {
  const { state: s, dispatch } = game;
  const here = a.status === 'resident';
  const k = balance.keeper;
  const blocked = exertBlocked(s);
  const stashFor = (slot: EquipSlot) => s.stash.map((id) => s.items[id]).filter((i) => i && i.slot === slot);
  const relations = Object.entries(a.relations)
    .filter(([id, v]) => Math.abs(v) >= 15 && s.adventurers[id])
    .sort((x, y) => y[1] - x[1]);

  return (
    <section className={`panel ${styles.detail}`}>
      <AdventurerCard s={s} a={a} />
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <table style={{ width: 'auto' }}>
          <tbody>
            <tr>
              <td className="muted">Attack</td>
              <td>{Math.round(attackOf(s, a))}</td>
            </tr>
            <tr>
              <td className="muted">Spellpower</td>
              <td>{Math.round(spellOf(s, a))}</td>
            </tr>
            <tr>
              <td className="muted">Defence</td>
              <td>{Math.round(defenceOf(s, a))}</td>
            </tr>
            <tr>
              <td className="muted">Trap sense</td>
              <td>{Math.round(trapSenseOf(s, a))}</td>
            </tr>
            <tr>
              <td className="muted">XP</td>
              <td>
                {Math.round(a.xp)}/{xpToNext(a)}
              </td>
            </tr>
            <tr>
              <td className="muted">Expeditions</td>
              <td>{a.expeditions}</td>
            </tr>
            <tr>
              <td className="muted">Kills</td>
              <td>{a.kills}</td>
            </tr>
            <tr>
              <td className="muted">Purse</td>
              <td>{a.purse}g</td>
            </tr>
          </tbody>
        </table>
        <div className="col">
          <h4>Relationships</h4>
          {relations.length === 0 && <span className="faint">No strong feelings yet.</span>}
          {relations.map(([id, v]) => (
            <span key={id} className={v > 0 ? 'tone-good' : 'tone-bad'}>
              {firstName(s.adventurers[id].name)}: {v >= balance.relations.friendThreshold ? 'friend' : v <= balance.relations.rivalThreshold ? 'rival' : v > 0 ? 'warm' : 'cool'} ({relation(a, id)})
            </span>
          ))}
        </div>
      </div>

      <h4>Equipment</h4>
      {(['weapon', 'armour', 'trinket'] as EquipSlot[]).map((slot) => {
        const id = a.equipment[slot];
        const item = id ? s.items[id] : null;
        return (
          <div key={slot} className="row" style={{ marginBottom: 4 }}>
            <span className="muted" style={{ width: 60, textTransform: 'capitalize' }}>
              {slot}
            </span>
            {item ? <ItemLabel item={item} /> : <span className="faint">none</span>}
            {here && item && <button onClick={() => dispatch({ type: 'UNEQUIP', adventurerId: a.id, slot })}>Take off</button>}
            {here && stashFor(slot).length > 0 && (
              <select value="" onChange={(e) => e.target.value && dispatch({ type: 'EQUIP', adventurerId: a.id, itemId: e.target.value })}>
                <option value="">Give from stash…</option>
                {stashFor(slot).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} (atk {i.attack} def {i.defence} spell {i.spell})
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}

      {here && (
        <>
          <h4>Training</h4>
          <div className={styles.training}>
            {STATS.map((st) => (
              <div key={st} className="row">
                <span style={{ width: 70 }}>{STAT_LABELS[st]}</span>
                <span style={{ width: 24 }}>{a.stats[st]}</span>
                <button
                  onClick={() => dispatch({ type: 'KEEPER', action: { type: 'TRAIN', adventurerId: a.id, stat: st } })}
                  disabled={!!blocked || a.stats[st] >= balance.adventurer.statMax}
                  title={blocked ?? `Train them yourself. Costs about ${k.trainDaysCost} days of your life. Builds loyalty.`}
                  className="tone-keeper"
                >
                  Train yourself
                </button>
                <button
                  onClick={() => dispatch({ type: 'KEEPER', action: { type: 'HIRE_TRAINER', adventurerId: a.id, stat: st } })}
                  disabled={s.gold < k.trainerCost || a.stats[st] >= balance.adventurer.statMax}
                  title="A weaker lesson, paid in gold."
                >
                  Hire trainer ({k.trainerCost}g)
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <button onClick={() => dispatch({ type: 'DISMISS', adventurerId: a.id })}>Ask them to leave</button>
          </div>
        </>
      )}
      {a.status === 'expedition' && <p className="muted">Below, in the dungeon.</p>}
    </section>
  );
}
