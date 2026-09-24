import { sightingsNeeded } from '../../engine/advice';
import { bandOf } from '../../engine/dungeon';
import { MONSTERS } from '../../engine/monsters';
import { INSIGHT_TEXT } from '../../text/insights';
import { featureName } from '../../text/templates';
import { Sprite } from '../components/Sprite';
import { CLASS_LABELS } from '../format';
import type { GameApi } from '../useGame';
import { BAND_NAMES } from './DepthView';
import styles from './Journal.module.css';

export function Journal({ game }: { game: GameApi }) {
  const { state: s } = game;
  const known = s.levels.filter((l) => l.visited || l.knownFeatures.length > 0 || l.stairsKnown);
  const need = sightingsNeeded(s);
  const fallen = [...s.journal.fallen].reverse();

  return (
    <div className={styles.layout}>
      <section className="panel">
        <h3>What you remember</h3>
        {s.journal.inherited && <p className="tone-keeper">Some of these pages are in another hand. You kept them anyway.</p>}
        {MONSTERS.filter((m) => m.band > 0 || s.journal.insights.includes(m.id)).map((m) => {
          const unlocked = s.journal.insights.includes(m.id);
          const seen = s.journal.sightings[m.id] ?? 0;
          if (!unlocked && seen === 0) return null;
          return (
            <div key={m.id} className={styles.entry}>
              <div>
                <strong style={{ textTransform: 'capitalize' }}>{m.name}</strong>{' '}
                <span className="faint">{m.band > 0 ? BAND_NAMES[m.band - 1] : 'graves'}</span>
              </div>
              {unlocked ? (
                <div className="tone-keeper">{INSIGHT_TEXT[m.id]}</div>
              ) : (
                <div className="faint">
                  Reported {seen} time{seen === 1 ? '' : 's'}. Not enough to place it yet ({Math.round((seen / need) * 100)}%).
                </div>
              )}
            </div>
          );
        })}
        {Object.keys(s.journal.sightings).length === 0 && s.journal.insights.length === 0 && <p className="faint">Nothing reported yet.</p>}
      </section>

      <section className="panel">
        <h3>Known levels</h3>
        {known.length === 0 && <p className="faint">The map is blank.</p>}
        <table>
          <thead>
            <tr>
              <th>Level</th>
              <th>Band</th>
              <th>Explored</th>
              <th>Features</th>
            </tr>
          </thead>
          <tbody>
            {known.map((l) => (
              <tr key={l.depth}>
                <td>{l.depth}</td>
                <td className="faint">{BAND_NAMES[bandOf(l.depth) - 1]}</td>
                <td>
                  {l.mapped ? 'mapped' : `${Math.round(l.explored * 100)}%`}
                  {l.stairsKnown ? '' : <span className="faint"> (no way down)</span>}
                </td>
                <td>{l.knownFeatures.map((f) => featureName(f)).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>The fallen</h3>
        {fallen.length === 0 && <p className="faint">No one yet.</p>}
        {fallen.map((f) => (
          <div key={`${f.adventurerId}-${f.day}`} className={styles.fallen}>
            <Sprite id={s.adventurers[f.adventurerId]?.portrait ?? 'grave'} />
            <div>
              <div>
                {f.name} <span className="faint">{CLASS_LABELS[f.classId]}, level {f.adventurerLevel}</span>
              </div>
              <div className="muted">
                Died on level {f.level}, day {f.day}{f.generation !== s.generation ? ` of the ${ordinal(f.generation)} keeping` : ''}. {capital(f.cause)}.
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function capital(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function ordinal(n: number): string {
  return ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth'][n] ?? `${n}th`;
}
