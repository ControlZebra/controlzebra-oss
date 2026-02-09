/**
 * WelcomeView - Welcome screen sidebar navigation.
 * Displays welcome categories when no repo is open; actual pages are shown in MainArea.
 * Mirrors the SettingsView pattern.
 */
import { memo, type CSSProperties } from 'react';
import { Clock, FolderPlus, Download, FolderOpen } from 'lucide-react';
import { WELCOME_CATEGORIES, type SettingsCategory } from '../../../constants';
import { ICON_STYLES } from '../../../lib/gitHelpers';
import { useLayout } from '../../../context';

// ============================================================================
// Types
// ============================================================================

interface WelcomeItemProps {
  category: SettingsCategory;
  icon: JSX.Element;
  isSelected: boolean;
  onSelect: () => void;
}

// ============================================================================
// Icon Mapping
// ============================================================================

const CATEGORY_ICONS: Record<string, JSX.Element> = {
  'recent-projects': <Clock style={ICON_STYLES.sm as CSSProperties} className="text-theme-muted shrink-0" />,
  'new-project':     <FolderPlus style={ICON_STYLES.sm as CSSProperties} className="text-theme-muted shrink-0" />,
  'clone-project':   <Download style={ICON_STYLES.sm as CSSProperties} className="text-theme-muted shrink-0" />,
  'open-folder':     <FolderOpen style={ICON_STYLES.sm as CSSProperties} className="text-theme-muted shrink-0" />,
};

// ============================================================================
// Components
// ============================================================================

/**
 * WelcomeItem - Category item in the welcome sidebar list.
 */
const WelcomeItem = memo(function WelcomeItem({ category, icon, isSelected, onSelect }: WelcomeItemProps): JSX.Element {
  return (
    <div 
      onClick={onSelect}
      className={`px-3 py-2 cursor-pointer transition-colors flex items-start gap-2.5 ${
        isSelected 
          ? 'bg-blue-600/30 border-l-2 border-blue-500' 
          : 'hover-bg-theme-interactive border-l-2 border-transparent'
      }`}
    >
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-theme-primary text-sm">{category.name}</p>
        <p className="text-theme-muted text-xs">{category.description}</p>
      </div>
    </div>
  );
});

function WelcomeView(): JSX.Element {
  const { selectedWelcomeCategory, setSelectedWelcomeCategory } = useLayout();

  return (
    <div className="flex flex-col h-full">
      {/* Category list */}
      <div>
        {WELCOME_CATEGORIES.map(category => (
          <WelcomeItem 
            key={category.id} 
            category={category}
            icon={CATEGORY_ICONS[category.id] || <FolderOpen style={ICON_STYLES.sm as CSSProperties} className="text-theme-muted shrink-0" />}
            isSelected={selectedWelcomeCategory === category.id}
            onSelect={() => setSelectedWelcomeCategory(category.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(WelcomeView);
