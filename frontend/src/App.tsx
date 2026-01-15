import { RepoProvider } from './context';
import { AppLayout } from './components/layout';

function App(): JSX.Element {
  return (
    <RepoProvider>
      <AppLayout />
    </RepoProvider>
  );
}

export default App;
