/**
 * SettingsView - Application settings panel.
 * Displays settings categories and forms for Git configuration.
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { User, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { ICON_SIZES, SETTINGS_CATEGORIES } from '../../../constants';
import { GetUserProfile, SetUserProfile } from '../../../../bindings/changeme/services/settingsservice';
import { Button, Input, Label } from '../../ui';

// Shared icon style
const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

/**
 * GitConfigForm - Form for setting Git user name and email.
 * Saves to global git config.
 */
function GitConfigForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }
  const [hasChanges, setHasChanges] = useState(false);
  const [originalValues, setOriginalValues] = useState({ name: '', email: '' });

  // Load current git config on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await GetUserProfile('');
        setName(profile.name || '');
        setEmail(profile.email || '');
        setOriginalValues({ name: profile.name || '', email: profile.email || '' });
      } catch (err) {
        console.error('Failed to load user profile:', err);
      }
    };
    loadProfile();
  }, []);

  // Track if form has unsaved changes
  useEffect(() => {
    setHasChanges(name !== originalValues.name || email !== originalValues.email);
  }, [name, email, originalValues]);

  // Save git configuration
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setMessage(null);
    
    try {
      const result = await SetUserProfile('', { name, email }, true); // global = true
      if (result.success) {
        setMessage({ type: 'success', text: 'Git configuration saved' });
        setOriginalValues({ name, email });
        setHasChanges(false);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to save' });
    }
    
    setIsSaving(false);
    
    // Clear message after delay
    setTimeout(() => setMessage(null), 4000);
  }, [name, email]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {/* Name field */}
        <div>
          <Label>
            <User style={iconStyle} />
            <span>Name</span>
          </Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name for commits"
          />
        </div>
        
        {/* Email field */}
        <div>
          <Label>
            <Mail style={iconStyle} />
            <span>Email</span>
          </Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email for commits"
          />
        </div>
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between">
        {message ? (
          <div className={`flex items-center gap-1.5 text-xs ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.type === 'success' 
              ? <CheckCircle style={iconStyle} /> 
              : <AlertCircle style={iconStyle} />
            }
            <span>{message.text}</span>
          </div>
        ) : (
          <span className="text-gray-500 text-xs">This will be used globally for all repos</span>
        )}
        
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!hasChanges}
          loading={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

/**
 * SettingsItem - Category item in the settings list.
 */
const SettingsItem = memo(function SettingsItem({ category, isSelected, onSelect }) {
  return (
    <div 
      onClick={onSelect}
      className={`px-3 py-2 cursor-pointer transition-colors ${
        isSelected 
          ? 'bg-blue-600/30 border-l-2 border-blue-500' 
          : 'hover:bg-gray-700/50 border-l-2 border-transparent'
      }`}
    >
      <p className="text-gray-200 text-sm">{category.name}</p>
      <p className="text-gray-500 text-xs">{category.description}</p>
    </div>
  );
});

function SettingsView() {
  const [selectedCategory, setSelectedCategory] = useState('git-config');

  return (
    <div className="flex flex-col h-full">
      {/* Category list */}
      <div className="border-b border-gray-700">
        {SETTINGS_CATEGORIES.map(category => (
          <SettingsItem 
            key={category.id} 
            category={category} 
            isSelected={selectedCategory === category.id}
            onSelect={() => setSelectedCategory(category.id)}
          />
        ))}
      </div>
      
      {/* Settings content */}
      <div className="flex-1 p-3 overflow-y-auto">
        {selectedCategory === 'git-config' && <GitConfigForm />}
        {selectedCategory === 'general' && (
          <p className="text-gray-500 text-sm">General settings coming soon</p>
        )}
        {selectedCategory === 'accounts' && (
          <p className="text-gray-500 text-sm">Account connections coming soon</p>
        )}
      </div>
    </div>
  );
}

export default memo(SettingsView);
