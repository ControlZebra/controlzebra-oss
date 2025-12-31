/**
 * GitConfigForm - Form for setting Git user name and email.
 */
import { memo, useCallback, useState, useEffect } from 'react';
import { User, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { ICON_SIZES } from '../../../../constants';
import { Button, Input, Label } from '../../../ui';
import { GetUserProfile, SetUserProfile } from '../../../../../bindings/changeme/services/settingsservice';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

function GitConfigForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalValues, setOriginalValues] = useState({ name: '', email: '' });

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

  useEffect(() => {
    setHasChanges(name !== originalValues.name || email !== originalValues.email);
  }, [name, email, originalValues]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setMessage(null);
    
    try {
      const result = await SetUserProfile('', { name, email }, true);
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
    setTimeout(() => setMessage(null), 4000);
  }, [name, email]);

  return (
    <div className="bg-neutral-900 rounded-lg p-6 border border-neutral-700">
      <h3 className="text-neutral-200 font-medium mb-4">Git Identity</h3>
      <p className="text-neutral-500 text-sm mb-6">This information will be used for your commits</p>
      
      <div className="space-y-4">
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

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-700">
        {message ? (
          <div className={`flex items-center gap-1.5 text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.type === 'success' 
              ? <CheckCircle style={iconStyle} /> 
              : <AlertCircle style={iconStyle} />
            }
            <span>{message.text}</span>
          </div>
        ) : (
          <span className="text-neutral-500 text-sm">Applied globally for all repositories</span>
        )}
        
        <Button
          onClick={handleSave}
          disabled={!hasChanges}
          loading={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

export default memo(GitConfigForm);
