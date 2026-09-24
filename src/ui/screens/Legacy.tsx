import { balance } from '../../engine/balance';
import { LEGENDARIES } from '../../engine/items';
import type { GameState, GenerationRecord, LegacyId } from '../../engine/types';
import { LEGACY_TEXT } from '../../text/templates';
import { Sprite } from '../components/Sprite';
import type { GameApi } from '../useGame';
import styles from './Legacy.module.css';

const LEGACY_ART: Record<LegacyId, string> = {
  journal: 'legacy_journal',
  portalStone: 'legacy_portalstone',
  keepersGear: `legendary_${LEGENDARIES[0].id}`,
  oldFriends: 'icon_loyalty',
};

function lastPortrait(s: GameState): string {
  return s.keeper.portrait === 'keeper' ? 'keeper_stage4' : `${s.keeper.portrait}_stage4`;
}

export function History({ records }: { records: GenerationRecord[] }) {
  return (
    <table className={styles.history}>
      <thead>
        <tr>
          <th>#</th>
          <th>Keeper</th>
          <th>Days</th>
          <th>Deepest</th>
          <th>Bosses</th>
          <th>Expeditions</th>
          <th>Fallen</th>
          <th>Died of</th>
          <th>Left behind</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr key={r.generation}>
            <td>{r.generation}</td>
            <td>{r.keeperName}</td>
            <td>{r.days}</td>
            <td>{r.maxDepth}</td>
            <td>{r.bossesKilled}</td>
            <td>{r.expeditions}</td>
            <td>{r.deaths}</td>
            <td>{r.causeOfDeath || '—'}</td>
            <td>{r.legacy ? LEGACY_TEXT[r.legacy].name : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Death screen, time skip and legacy reveal; also the ending screens. */
export function Legacy({ game }: { game: GameApi }) {
  const { state: s, dispatch } = game;
  const r = s.record;
  const allRecords = s.status === 'keeperDead' ? [...s.history, r] : s.history;

  if (s.status === 'won') {
    return (
      <div className={styles.overlay}>
        <div className={`panel ${styles.card}`}>
          <h2>The source is dead</h2>
          <p>
            It took {s.generation === 1 ? 'one keeper' : `${s.generation} keepers`} of the {s.keeper.name.split(' ').slice(-1)[0]} line. The curse is lifted. {s.keeper.name} lives to see
            it, and pours a drink for everyone who didn't.
          </p>
          <History records={allRecords} />
          <p className="faint">{s.journal.fallen.length} adventurers are remembered in the journal.</p>
          <button onClick={() => game.newGameWithSeed('')}>Begin a new story</button>
        </div>
      </div>
    );
  }

  if (s.status === 'lost') {
    return (
      <div className={styles.overlay}>
        <div className={`panel ${styles.card}`}>
          <Sprite id={lastPortrait(s)} scale={2} className={styles.grey} />
          <h2>The line ends</h2>
          <p>
            {s.keeper.name} was the last of the family. The tavern stays dark, and below, the source goes on growing.
          </p>
          <History records={allRecords} />
          <button onClick={() => game.newGameWithSeed('')}>Begin a new story</button>
        </div>
      </div>
    );
  }

  const t = s.transition;
  if (s.status !== 'keeperDead' || !t) return null;
  const legacy = LEGACY_TEXT[t.legacy];
  const heirPortrait = `heir_${s.generation}_stage1`;
  const lastOfLine = s.generation + 1 === balance.generation.maxGenerations;

  return (
    <div className={styles.overlay}>
      <div className={`panel ${styles.card}`}>
        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <Sprite id={lastPortrait(s)} scale={2} className={styles.grey} />
          <div className="col" style={{ gap: 4 }}>
            <h2>{s.keeper.name} is dead</h2>
            <div className="muted">
              After {r.days} days of keeping. {r.causeOfDeath === 'illness' ? 'The illness took them, as it was always going to.' : r.causeOfDeath === 'grief' ? 'Grief finished what the illness started.' : 'They spent the last of themselves on the others.'}
            </div>
            <div>
              The deepest anyone went was level {r.maxDepth}. {r.bossesKilled} boss{r.bossesKilled === 1 ? '' : 'es'} fell. {r.deaths} adventurer{r.deaths === 1 ? '' : 's'} did not come home.
            </div>
          </div>
        </div>

        <h3 className={styles.skip}>{t.yearsSkipped} years pass.</h3>
        <p>
          The dungeon grows back, deeper and meaner. Most of the graves are lost to it. The tavern is dusty, but it stands.
        </p>

        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <Sprite id={heirPortrait} scale={2} />
          <div className="col" style={{ gap: 6 }}>
            <h2>{t.heirName}</h2>
            <div className="muted">
              The heir. The cough has already started.{lastOfLine ? ' There is no one after them.' : ''}
            </div>
            <div className={styles.legacy}>
              <Sprite id={LEGACY_ART[t.legacy]} scale={2} />
              <div>
                <div className="tone-good">{legacy.name}</div>
                <div>{legacy.found}</div>
                <div className="faint">{legacy.effect}</div>
              </div>
            </div>
          </div>
        </div>

        {allRecords.length > 1 && <History records={allRecords} />}
        <button className="primary" onClick={() => dispatch({ type: 'BEGIN_GENERATION' })}>
          Open the tavern
        </button>
      </div>
    </div>
  );
}
