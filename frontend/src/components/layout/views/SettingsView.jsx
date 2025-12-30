import { memo, useState, useEffect, useCallback } from 'react';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import CircularProgress from '@mui/material/CircularProgress';
import { ICON_SIZES, SETTINGS_CATEGORIES } from '../../../constants';
import { GetUserProfile, SetUserProfile } from '../../../../bindings/changeme/services/settingsservice';

const iconStyle = { fontSize: ICON_SIZES.sm };

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

  // Track changes
  useEffect(() => {
    setHasChanges(name !== originalValues.name || email !== originalValues.email);
  }, [name, email, originalValues]);

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
        <div>
          <label className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <PersonIcon sx={iconStyle} />
            <span>Name</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name for commits"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        
        <div>
          <label className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <EmailIcon sx={iconStyle} />
            <span>Email</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email for commits"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        {message ? (
          <div className={`flex items-center gap-1.5 text-xs ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.type === 'success' ? <CheckCircleIcon sx={iconStyle} /> : <ErrorIcon sx={iconStyle} />}
            <span>{message.text}</span>
          </div>
        ) : (
          <span className="text-gray-500 text-xs">This will be used globally for all repos</span>
        )}
        
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white text-xs font-medium transition-colors"
        >
          {isSaving ? (
            <>
              <CircularProgress size={12} sx={{ color: 'white' }} />
              <span>Saving...</span>
            </>
          ) : (
            <span>Save</span>
          )}
        </button>
      </div>
    </div>
  );
}

function SettingsItem({ category, isSelected, onSelect }) {
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
}

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
