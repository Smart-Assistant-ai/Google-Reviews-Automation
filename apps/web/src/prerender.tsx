import { QueryClient } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import AppRoot from './AppRoot';

// The pages anyone can read without an account, rendered to HTML when the app is built. Google's
// verification reads the home page and the privacy policy without running JavaScript, so they
// must arrive with their text already in them. Each page is saved as the file named here, which
// the web server sends for that path (see deploy/nginx-site.conf). Every other path gets the
// empty index.html, and the app draws the page once its script loads.
export const PAGES: Record<string, string> = {
  '/': 'home.html',
  '/privacy': 'privacy.html',
  '/terms': 'terms.html',
};

// What a visitor with no session sees at this path, as HTML.
export function render(path: string): string {
  return renderToString(
    <StaticRouter location={path}>
      <AppRoot queryClient={new QueryClient()} />
    </StaticRouter>,
  );
}
