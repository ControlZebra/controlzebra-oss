import { RepoProvider } from './context';
import { AppLayout } from './components/layout';

function App() {
  return (
    <RepoProvider>
      <AppLayout />
    </RepoProvider>
  );
}

export default App
