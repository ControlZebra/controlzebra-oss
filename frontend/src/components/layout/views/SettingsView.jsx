import { memo } from 'react';
import { SETTINGS_CATEGORIES } from '../../../constants';

function SettingsItem({ category }) {
  return (
    <div className="px-3 py-2 hover:bg-gray-700/50 cursor-pointer transition-colors">
      <p className="text-gray-200 text-sm">{category.name}</p>
      <p className="text-gray-500 text-xs">{category.description}</p>
    </div>
  );
}

function SettingsView() {
  return (
    <div className="py-1">
      {SETTINGS_CATEGORIES.map(category => (
        <SettingsItem key={category.id} category={category} />
      ))}
    </div>
  );
}

export default memo(SettingsView);
