import { useProjectStore } from './stores/projectStore';
import { WelcomeScreen } from './components/welcome/WelcomeScreen';
import { MainLayout } from './components/layout/MainLayout';
import './App.css';

function App() {
  const workspace = useProjectStore(s => s.workspace);

  if (!workspace) {
    return <WelcomeScreen />;
  }

  return <MainLayout />;
}

export default App;
