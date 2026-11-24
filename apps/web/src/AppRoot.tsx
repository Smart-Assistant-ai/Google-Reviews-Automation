import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { StrictMode } from 'react';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { ColorModeProvider } from './theme/ColorModeContext';

// The app with everything it sits in, apart from the router. The browser runs it inside a
// BrowserRouter, and the build renders the public pages with it inside a StaticRouter, so the
// pages built ahead of time are the same ones the app shows.
export default function AppRoot({ queryClient }: { queryClient: QueryClient }) {
  return (
    <StrictMode>
      <ColorModeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </QueryClientProvider>
      </ColorModeProvider>
    </StrictMode>
  );
}
