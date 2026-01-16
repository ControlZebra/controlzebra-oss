/**
 * SettingsView - Settings sidebar navigation.
 * Displays settings categories; actual forms are shown in MainArea.
 */
import { memo } from 'react';
import { SETTINGS_CATEGORIES, type SettingsCategory } from '../../../constants';
import { useLayout } from '../../../context';

// ============================================================================
// Types
// ============================================================================

interface SettingsItemProps {
  category: SettingsCategory;
  isSelected: boolean;
  onSelect: () => void;
}

// ============================================================================
// Components
// ============================================================================

/**
 * SettingsItem - Category item in the settings list.
 */
const SettingsItem = memo(function SettingsItem({ category, isSelected, onSelect }: SettingsItemProps): JSX.Element {
  return (
    <div 
      onClick={onSelect}
      className={`px-3 py-2 cursor-pointer transition-colors ${
        isSelected 
          ? 'bg-blue-600/30 border-l-2 border-blue-500' 
          : 'hover-bg-theme-interactive border-l-2 border-transparent'
      }`}
    >
      <p className="text-theme-primary text-sm">{category.name}</p>
      <p className="text-theme-muted text-xs">{category.description}</p>
    </div>
  );
});

function SettingsView(): JSX.Element {
  const { selectedSettingsCategory, setSelectedSettingsCategory } = useLayout();

  return (
    <div className="flex flex-col h-full">
      {/* Category list */}
      <div>
        {SETTINGS_CATEGORIES.map(category => (
          <SettingsItem 
            key={category.id} 
            category={category} 
            isSelected={selectedSettingsCategory === category.id}
            onSelect={() => setSelectedSettingsCategory(category.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(SettingsView);
