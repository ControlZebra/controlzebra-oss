/**
 * RepoSettingsView - Repository settings sidebar navigation.
 * Displays repository settings categories; actual forms are shown in MainArea.
 */
import { memo } from 'react';
import { REPO_SETTINGS_CATEGORIES } from '../../../constants';
import { useLayout } from '../../../context';

/**
 * SettingsItem - Category item in the repo settings list.
 */
const SettingsItem = memo(function SettingsItem({ category, isSelected, onSelect }) {
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

function RepoSettingsView() {
  const { selectedRepoSettingsCategory, setSelectedRepoSettingsCategory } = useLayout();

  return (
    <div className="flex flex-col h-full">
      {/* Category list */}
      <div>
        {REPO_SETTINGS_CATEGORIES.map(category => (
          <SettingsItem 
            key={category.id} 
            category={category} 
            isSelected={selectedRepoSettingsCategory === category.id}
            onSelect={() => setSelectedRepoSettingsCategory(category.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(RepoSettingsView);
