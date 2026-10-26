// Une vue d'écran à chaque changement de route. Rien d'autre : `capture_pageview`
// est coupé côté PostHog pour que l'URL complète (qui porte l'identifiant de
// l'élève consulté) ne parte jamais telle quelle — voir `src/lib/analytics.js`.
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageview } from '../lib/analytics';

export default function AnalyticsRouteTracker() {
  const { pathname } = useLocation();
  useEffect(() => { trackPageview(pathname); }, [pathname]);
  return null;
}
