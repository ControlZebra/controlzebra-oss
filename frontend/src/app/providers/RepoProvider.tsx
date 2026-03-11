import { type ReactNode } from 'react';
import { RepoProvider as ContextRepoProvider } from '../../context';

interface RepoProviderProps {
  children: ReactNode;
}

export default function RepoProvider({ children }: RepoProviderProps): JSX.Element {
  return <ContextRepoProvider>{children}</ContextRepoProvider>;
}