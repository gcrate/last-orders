import { useRef, useState } from 'react';
import { STATE_VERSION } from '../../engine/state';
import { deserialize, serialize } from '../../save/save';
import type { GameApi } from '../useGame';
import styles from './GameMenu.module.css';

/** Save, load and new game. Saves also happen automatically every evening. */
export function GameMenu({ game, onClose }: { game: GameApi; onClose: () => void }) {
  const [seed, setSeed] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const s = game.state;

  const exportSave = () => {
    const blob = new Blob([serialize(s, game.log, new Date().toISOString())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `last-orders-gen${s.generation}-day${Math.floor((s.hour - s.generationStartHour) / 24) + 1}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Save file downloaded.');
  };

  const importSave = async (file: File) => {
    try {
      const save = deserialize(await file.text());
      game.loadSave(save);
      setMessage('Save loaded.');
      onClose();
    } catch (err) {
      setMessage(`Could not load that file: ${(err as Error).message}`);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={`panel ${styles.menu}`} onClick={(e) => e.stopPropagation()}>
        <h2>The ledger</h2>
        <p className="faint">
          The game saves itself every evening and whenever you act. Seed <code>{s.seed}</code>, save version {STATE_VERSION}.
        </p>
        <div className="row">
          <button onClick={() => game.saveNow().then(() => setMessage('Saved.'))}>Save now</button>
          <button onClick={exportSave}>Export save file</button>
          <button onClick={() => fileInput.current?.click()}>Load save file…</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importSave(f);
              e.target.value = '';
            }}
          />
        </div>

        <h4>A new story</h4>
        <div className="row">
          <input placeholder="seed (optional)" value={seed} onChange={(e) => setSeed(e.target.value)} />
          {!confirmNew ? (
            <button onClick={() => setConfirmNew(true)}>Start over…</button>
          ) : (
            <>
              <span className="tone-bad">This ends the current game.</span>
              <button
                className="primary"
                onClick={() => {
                  game.newGameWithSeed(seed.trim());
                  onClose();
                }}
              >
                Yes, start over
              </button>
              <button onClick={() => setConfirmNew(false)}>No</button>
            </>
          )}
        </div>

        {message && <p className="muted">{message}</p>}
        <div style={{ textAlign: 'right' }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
