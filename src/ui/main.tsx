import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Milestone 1 is engine-only; the tavern UI arrives in milestone 2.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p>Last Orders: the engine runs headless. Try <code>npm run sim</code>.</p>
  </StrictMode>,
);
