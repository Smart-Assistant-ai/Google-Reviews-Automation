import { QueryClient } from '@tanstack/react-query';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AppRoot from './AppRoot';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5000 } },
});

const root = document.getElementById('root')!;
// The home page, privacy policy and terms arrive already rendered (see prerender.tsx), and have
// played their entrance by the time the app takes over. This tells the app not to play it again.
if (root.hasChildNodes()) document.documentElement.dataset.prerendered = '';

ReactDOM.createRoot(root).render(
  <BrowserRouter>
    <AppRoot queryClient={queryClient} />
  </BrowserRouter>,
);
