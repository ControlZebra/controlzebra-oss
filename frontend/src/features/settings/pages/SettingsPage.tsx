/**
 * SettingsPage - Main area content for Settings view.
 * Shows category-specific settings forms.
 */
import { memo, type JSX } from 'react';
import { Settings } from 'lucide-react';
import { SETTINGS_CATEGORIES, type SettingsCategory } from '../../../constants';
import { useLayout } from '../../../context';
import GitConfigForm from '../components/GitConfigForm';
import GeneralSettings from '../components/GeneralSettings';

function SettingsPage(): JSX.Element {
  const { selectedSettingsCategory } = useLayout();
  
  const categoryInfo = SETTINGS_CATEGORIES.find(
    (c: SettingsCategory) => c.id === selectedSettingsCategory
  ) || SETTINGS_CATEGORIES[0];

  const renderCategoryContent = (): JSX.Element | null => {
    switch (selectedSettingsCategory) {
      case 'general':
        return <GeneralSettings />;
      case 'git-config':
        return <GitConfigForm />;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings style={{ width: 24, height: 24 }} className="text-theme-muted" />
            <h2 className="text-xl text-theme-primary font-medium">{categoryInfo.name}</h2>
          </div>
          <p className="text-theme-muted">{categoryInfo.description}</p>
        </div>
        
        {/* Category content */}
        {renderCategoryContent()}
      </div>
    </div>
  );
}

export default memo(SettingsPage);
