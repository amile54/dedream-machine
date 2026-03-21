import { useEffect } from 'react';
import { useProjectStore } from './stores/projectStore';
import { WelcomeScreen } from './components/welcome/WelcomeScreen';
import { MainLayout } from './components/layout/MainLayout';
import './App.css';

const AUTO_SAVE_INTERVAL = 2 * 60 * 1000; // 2 minutes

function App() {
  const workspace = useProjectStore(s => s.workspace);

  // Auto-save every 2 minutes when there are unsaved changes
  useEffect(() => {
    const timer = setInterval(() => {
      const { isDirty, project, workspace: ws } = useProjectStore.getState();
      if (isDirty && project && ws) {
        console.log('[AutoSave] Saving project...');
        useProjectStore.getState().saveProject();
      }
    }, AUTO_SAVE_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  if (!workspace) {
    return <WelcomeScreen />;
  }

  return <MainLayout />;
}

export default App;
