/**
 * MainArea - Central content area that updates based on active view.
 * 
 * Uses VIEW_REGISTRY pattern to map view IDs to page components.
 * Each page is a separate file in ./pages/ for maintainability.
 * 
 * To add a new page:
 * 1. Create the page component in ./pages/YourPage.tsx
 * 2. Add it to VIEW_REGISTRY in ./pages/index.ts
 * 3. Add the view ID to constants/index.ts VIEWS
 */
import { memo } from 'react';
import { useLayout } from '../../context';
import { VIEW_REGISTRY, ExplorerPage } from '../../components/layout/pages';

function MainArea(): JSX.Element {
  const { activeView } = useLayout();

  // Get the page component from registry, fallback to Explorer
  const PageComponent = VIEW_REGISTRY[activeView] || ExplorerPage;

  return (
    <main className="flex-1 bg-theme-elevated flex flex-col min-w-0 min-h-0">
      <PageComponent />
    </main>
  );
}

export default memo(MainArea);
