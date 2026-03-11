import { type ReactNode } from 'react';
import { AuthProvider as ContextAuthProvider } from '../../context';

interface AuthProviderProps {
  children: ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  return <ContextAuthProvider>{children}</ContextAuthProvider>;
}