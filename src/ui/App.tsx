import { useState } from 'react';
import type { ObjectiveType } from '../engine/types';
import { EventLog } from './components/EventLog';
import { Notices } from './components/Notices';
import { Sprite } from './components/Sprite';
import { clockText, dateText, generationDay } from './format';
import { PartyBuilder } from './screens/PartyBuilder';
import { DepthView } from './screens/DepthView';
import { Journal } from './screens/Journal';
import { Legacy } from './screens/Legacy';
import { Roster } from './screens/Roster';
import { Tavern } from './screens/Tavern';
import { type Speed, useGame } from './useGame';
import styles from './App.module.css';

type Tab = 'tavern' | 'roster' | 'party' | 'depth' | 'journal';

const TABS: { id: Tab; label: string }[] = [
  { id: 'tavern', label: 'Tavern' },
  { id: 'roster', label: 'Roster' },
  { id: 'party', label: 'Send a party' },
  { id: 'depth', label: 'The dungeon' },
  { id: 'journal', label: 'Journal' },
];

export function App() {
  const game = useGame();
  const { state } = game;
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return TABS.some((x) => x.id === t) ? (t as Tab) : 'tavern';
  });
  const [selected, setSelected] = useState<string | null>(null);

  const [plan, setPlan] = useState<{ type: ObjectiveType; level: number; graveId?: string; key: number } | null>(null);

  const openAdventurer = (id: string) => {
    setSelected(id);
    setTab('roster');
  };
  const planParty = (type: ObjectiveType, level: number, graveId?: string) => {
    setPlan({ type, level, graveId, key: Date.now() });
    setTab('party');
  };

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.title}>Last Orders</div>
        <div className={styles.date}>
          <Sprite id="icon_day" />
          <span>{dateText(state)}</span>
          <span className="muted">{clockText(state.hour)}</span>
          <span className="faint">day {generationDay(state)} of {state.keeper.name.split(' ')[0]}'s keeping</span>
        </div>
        <div className={styles.stat} title="Gold">
          <Sprite id="icon_gold" /> {state.gold}
        </div>
        <div className={styles.stat} title="Reputation">
          <Sprite id="icon_reputation" /> {Math.round(state.reputation)}
        </div>
        <div className={styles.speed}>
          {([0, 1, 2, 4] as Speed[]).map((sp) => (
            <button
              key={sp}
              className={game.speed === sp ? 'active' : ''}
              onClick={() => game.setSpeed(sp)}
              disabled={state.status !== 'playing'}
              title={sp === 0 ? 'Pause (space)' : `${sp}x`}
            >
              {sp === 0 ? '❚❚' : `${sp}×`}
            </button>
          ))}
          <label className={styles.autopause} title="Pause every evening, when recruits arrive">
            <input type="checkbox" checked={game.autoPauseEvening} onChange={(e) => game.setAutoPauseEvening(e.target.checked)} />
            pause at evening
          </label>
        </div>
      </header>

      <nav className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className={styles.main}>
        {tab === 'tavern' && <Tavern game={game} onOpenAdventurer={openAdventurer} />}
        {tab === 'roster' && <Roster game={game} selected={selected} onSelect={setSelected} />}
        {tab === 'party' && (
          <PartyBuilder key={plan?.key ?? 0} game={game} initialObjective={plan ?? undefined} onSent={() => setTab('tavern')} />
        )}
        {tab === 'journal' && <Journal game={game} />}
        {tab === 'depth' && (
          <DepthView game={game} onRecover={(graveId, level) => planParty('recover', level, graveId)} onSendTo={(level) => planParty('push', level)} />
        )}
      </main>

      <aside className={styles.log}>
        <EventLog state={state} log={game.log} />
      </aside>

      <Legacy game={game} />
      <Notices notices={game.notices} onDismiss={game.dismissNotice} />
    </div>
  );
}
