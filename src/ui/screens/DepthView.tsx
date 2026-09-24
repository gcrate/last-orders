import { useState } from 'react';
import { balance } from '../../engine/balance';
import { bandOf, bossThreat, gravesOnLevel, isBossLevel, levelThreat, portalsActive } from '../../engine/dungeon';
import { bossForBand } from '../../engine/monsters';
import type { GameState, Level } from '../../engine/types';
import { featureName } from '../../text/templates';
import { Sprite } from '../components/Sprite';
import { firstName } from '../format';
import type { GameApi } from '../useGame';
import styles from './DepthView.module.css';

export const BAND_NAMES = ['Old cellars and crypts', 'Fungal caverns', 'Drowned ruins', 'The forge deeps', 'The Heart'];

interface Props {
  game: GameApi;
  onRecover: (graveId: string, level: number) => void;
  onSendTo: (level: number) => void;
}

function partiesOn(s: GameState, depth: number) {
  return Object.values(s.expeditions).filter((e) => e.level === depth);
}

/** A word for how dangerous a level looks right now, relative to its depth. */
function dangerWord(l: Level): string {
  if (!l.visited) return 'unknown';
  if (l.population < 0.3) return 'quiet';
  if (l.population < 0.7) return 'stirring';
  return l.knownFeatures.includes('lair') ? 'infested' : 'dangerous';
}

export function DepthView({ game, onRecover, onSendTo }: Props) {
  const { state: s } = game;
  const [selected, setSelected] = useState<number>(1);
  const portals = portalsActive(s);
  const bands = [1, 2, 3, 4, 5];

  return (
    <div className={styles.layout}>
      <section className={`panel ${styles.track}`}>
        {bands.map((band) => (
          <div key={band} className={styles.band}>
            <div className={styles.bandHead}>
              <Sprite id={`band_${band}`} scale={1} />
              <div className={styles.bandTitle}>
                <div>{BAND_NAMES[band - 1]}</div>
                <div className="faint">
                  levels {(band - 1) * 10 + 1}–{band * 10}
                </div>
              </div>
            </div>
            {s.levels
              .filter((l) => bandOf(l.depth) === band)
              .map((l) => {
                const graves = gravesOnLevel(s, l.depth);
                const portal = portals.find((p) => p.level === l.depth);
                const here = partiesOn(s, l.depth);
                return (
                  <div
                    key={l.depth}
                    className={`${styles.level} ${selected === l.depth ? styles.selected : ''} ${l.visited ? '' : styles.unvisited}`}
                    onClick={() => setSelected(l.depth)}
                  >
                    <span className={styles.depth}>{l.depth}</span>
                    <div className={styles.explored} title={`${Math.round(l.explored * 100)}% explored`}>
                      <div style={{ width: `${l.explored * 100}%` }} />
                    </div>
                    <span className={styles.icons}>
                      {l.stairsKnown && <Sprite id="stairs" scale={1} title="Way down known" />}
                      {isBossLevel(l.depth) && (
                        <span className={l.bossAlive ? 'tone-bad' : 'faint'} title={l.bossAlive ? 'The boss lives' : 'The boss is dead'}>
                          {l.bossAlive ? '☠' : '✝'}
                        </span>
                      )}
                      {portal && <Sprite id={portal.decayed ? 'portal_decayed' : 'portal_active'} title={`Portal (${portal.usesLeft} uses)`} />}
                      {graves.map((g) => (
                        <Sprite key={g.id} id={g.legendary ? 'grave_legendary' : 'grave'} title={g.name} />
                      ))}
                    </span>
                    <span className={styles.parties}>
                      {here.map((e) => (
                        <span key={e.id} className={styles.party} title={e.phase === 'returning' ? 'heading home' : 'exploring'}>
                          {e.phase === 'returning' ? '↑ ' : '↓ '}
                          {e.memberIds.map((id) => firstName(s.adventurers[id].name)).join(', ')}
                        </span>
                      ))}
                    </span>
                    <span className={`${styles.danger} faint`}>{dangerWord(l)}</span>
                  </div>
                );
              })}
          </div>
        ))}
      </section>
      <LevelDetail s={s} depth={selected} onRecover={onRecover} onSendTo={onSendTo} game={game} />
    </div>
  );
}

function LevelDetail({ s, depth, onRecover, onSendTo, game }: { s: GameState; depth: number; game: GameApi } & Omit<Props, 'game'>) {
  const l = s.levels[depth - 1];
  const graves = gravesOnLevel(s, depth);
  const portal = portalsActive(s).find((p) => p.level === depth);
  const [bounty, setBounty] = useState(50);
  const band = bandOf(depth);
  const boss = isBossLevel(depth) ? bossForBand(band) : null;
  return (
    <section className={`panel ${styles.detail}`}>
      <h2>Level {depth}</h2>
      <div className="muted">{BAND_NAMES[band - 1]}</div>
      <Sprite id={`band_${band}`} scale={1} />
      {!l.visited && <p className="faint">Nobody from this tavern has been here.</p>}
      <table>
        <tbody>
          <tr>
            <td className="muted">Explored</td>
            <td>{Math.round(l.explored * 100)}%{l.mapped ? ' (mapped)' : ''}</td>
          </tr>
          <tr>
            <td className="muted">Way down</td>
            <td>{l.stairsKnown ? 'known' : 'not found'}</td>
          </tr>
          <tr>
            <td className="muted">Danger</td>
            <td>
              {dangerWord(l)} <span className="faint">(threat {Math.round(levelThreat(s, depth))})</span>
            </td>
          </tr>
          {boss && (
            <tr>
              <td className="muted">Boss</td>
              <td>
                {boss.name} {l.bossAlive ? <span className="tone-bad">lives (threat {Math.round(bossThreat(s, depth))})</span> : <span className="faint">is dead</span>}
              </td>
            </tr>
          )}
          <tr>
            <td className="muted">Known features</td>
            <td>{l.knownFeatures.length ? l.knownFeatures.map((f) => featureName(f)).join(', ') : <span className="faint">none</span>}</td>
          </tr>
          {portal && (
            <tr>
              <td className="muted">Portal</td>
              <td>
                {portal.usesLeft} uses left{portal.decayed ? ', decayed' : ''}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {boss && l.bossAlive && (
        <div className="row">
          <Sprite id={`boss_${boss.id}`} scale={2} />
          <span className="muted">It guards the way down.</span>
        </div>
      )}
      <button onClick={() => onSendTo(depth)}>Send a party here…</button>

      <h4>Graves</h4>
      {graves.length === 0 && <span className="faint">None.</span>}
      {graves.map((g) => (
        <div key={g.id} className={styles.grave}>
          <div className="row">
            <Sprite id={g.legendary ? 'grave_legendary' : 'grave'} />
            <span>
              {g.name} {g.legendary && <span className="tone-keeper">(legendary{g.guardianAlive ? ', guarded' : ''})</span>}
            </span>
          </div>
          <div className="faint">
            {g.itemIds.length} item{g.itemIds.length === 1 ? '' : 's'}, {g.gold} gold
            {g.bounty > 0 ? `, bounty ${g.bounty}g` : ''}
          </div>
          <div className="row">
            <button onClick={() => onRecover(g.id, g.level)}>Send a recovery party…</button>
            {s.upgrades.noticeBoard > 0 && (
              <>
                <input type="number" min={10} step={10} value={bounty} onChange={(e) => setBounty(Number(e.target.value) || 0)} style={{ width: 60 }} />
                <button onClick={() => game.dispatch({ type: 'POST_BOUNTY', graveId: g.id, gold: bounty })} disabled={s.gold < bounty || bounty <= 0}>
                  Post bounty
                </button>
              </>
            )}
          </div>
        </div>
      ))}
      <p className="faint" style={{ fontSize: 12 }}>
        Cleared levels stay quieter for a while, then fill up again. Everything regrows at {Math.round(balance.dungeon.repopulatePerDay * 100)}% a day.
      </p>
    </section>
  );
}
