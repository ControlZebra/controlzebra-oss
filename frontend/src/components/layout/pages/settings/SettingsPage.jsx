/**
 * SettingsPage - Main area content for Settings view.
 * Shows category-specific settings forms.
 */
import { memo } from 'react';
import { Settings } from 'lucide-react';
import { SETTINGS_CATEGORIES } from '../../../../constants';
import { useLayout } from '../../../../context';
import GitConfigForm from './GitConfigForm';
import AccountsSettings from './AccountsSettings';

function SettingsPage() {
  const { selectedSettingsCategory } = useLayout();
  
  const categoryInfo = SETTINGS_CATEGORIES.find(c => c.id === selectedSettingsCategory) || SETTINGS_CATEGORIES[0];

  const renderCategoryContent = () => {
    switch (selectedSettingsCategory) {
      case 'git-config':
        return <GitConfigForm />;
      case 'general':
        return (
          <div className="bg-neutral-900 rounded-lg p-6 border border-neutral-700">
            <p className="text-neutral-500 text-center">General settings coming soon</p>
          </div>
        );
      case 'accounts':
        return <AccountsSettings />;
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
            <Settings style={{ width: 24, height: 24 }} className="text-neutral-500" />
            <h2 className="text-xl text-neutral-200 font-medium">{categoryInfo.name}</h2>
          </div>
          <p className="text-neutral-500">{categoryInfo.description}</p>
        </div>
        
        {/* Category content */}
        {renderCategoryContent()}
      </div>
    </div>
  );
}

export default memo(SettingsPage);
