/**
 * GitInitForm - Repository initialization/clone form.
 * Allows users to either clone an existing repository or initialize a new one.
 * Supports Git LFS configuration with customizable attributes.
 */
import { memo, useState, useCallback, useMemo } from 'react';
import {
  GitBranch,
  Download,
  FolderPlus,
  X,
  Plus,
  Check,
  ArrowLeft,
  Info,
  Link as LinkIcon,
  User,
  Mail,
  FileCode,
  Shield,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { ICON_SIZES } from '../../../../constants';
import { Button, Input, Label, Badge } from '../../../ui';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../ui/card';

// Memoized icon styles
const iconStyleLg = { width: 48, height: 48 };
const iconStyleMd = { width: ICON_SIZES.md, height: ICON_SIZES.md };
const iconStyleSm = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconStyleXs = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

// Common LFS patterns for industrial automation files
const COMMON_LFS_PATTERNS = [
  { pattern: '*.acd', description: 'Rockwell Studio 5000 projects' },
  { pattern: '*.L5K', description: 'Rockwell L5K exports' },
  { pattern: '*.L5X', description: 'Rockwell L5X exports' },
  { pattern: '*.ap*', description: 'TIA Portal projects' },
  { pattern: '*.zap*', description: 'TIA Portal archives' },
  { pattern: '*.apa', description: 'TIA Portal archives' },
  { pattern: '*.mer', description: 'FactoryTalk ME applications' },
  { pattern: '*.avi', description: 'Video files' },
  { pattern: '*.pdf', description: 'PDF documents' },
  { pattern: '*.dwg', description: 'AutoCAD drawings' },
  { pattern: '*.dxf', description: 'CAD exchange format' },
  { pattern: '*.step', description: 'STEP CAD files' },
  { pattern: '*.stp', description: 'STEP CAD files' },
  { pattern: '*.stl', description: '3D model files' },
];

// ============================================================================
// LFS Attribute Tag Input Component
// ============================================================================
const LFSAttributeInput = memo(function LFSAttributeInput({ 
  attributes, 
  onAdd, 
  onRemove, 
  suggestions = COMMON_LFS_PATTERNS 
}) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Filter suggestions based on input and already added attributes
  const filteredSuggestions = useMemo(() => {
    if (!inputValue && !showSuggestions) return [];
    const addedPatterns = new Set(attributes.map(a => a.pattern));
    return suggestions.filter(s => 
      !addedPatterns.has(s.pattern) &&
      (inputValue === '' || s.pattern.toLowerCase().includes(inputValue.toLowerCase()))
    );
  }, [inputValue, attributes, suggestions, showSuggestions]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      // Check if it matches a suggestion
      const matchedSuggestion = filteredSuggestions.find(
        s => s.pattern.toLowerCase() === inputValue.toLowerCase()
      );
      onAdd(matchedSuggestion || { pattern: inputValue.trim(), description: 'Custom pattern' });
      setInputValue('');
      setShowSuggestions(false);
    }
  }, [inputValue, filteredSuggestions, onAdd]);

  const handleSuggestionClick = useCallback((suggestion) => {
    onAdd(suggestion);
    setInputValue('');
    setShowSuggestions(false);
  }, [onAdd]);

  const handleInputFocus = useCallback(() => {
    setShowSuggestions(true);
  }, []);

  const handleInputBlur = useCallback(() => {
    // Delay to allow click on suggestion
    setTimeout(() => setShowSuggestions(false), 200);
  }, []);

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <FileCode style={iconStyleSm} className="text-theme-muted" />
        LFS File Patterns
        <span className="text-theme-muted font-normal">(optional)</span>
      </Label>
      <p className="text-xs text-theme-muted -mt-1 mb-2">
        Large files matching these patterns will be tracked with Git LFS
      </p>
      
      {/* Added attributes as tags */}
      {attributes.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attributes.map((attr, index) => (
            <Badge
              key={`${attr.pattern}-${index}`}
              variant="info"
              className="flex items-center gap-1 pr-1"
            >
              <span>{attr.pattern}</span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="ml-1 p-0.5 rounded hover:bg-blue-600/30 transition-colors"
                aria-label={`Remove ${attr.pattern}`}
              >
                <X style={iconStyleXs} />
              </button>
            </Badge>
          ))}
        </div>
      )}
      
      {/* Input with suggestions dropdown */}
      <div className="relative">
        <Input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder="e.g., *.pdf, *.acd, *.zip"
          className="w-full"
        />
        
        {/* Suggestions dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto rounded border border-theme-default bg-theme-surface shadow-lg">
            {filteredSuggestions.map((suggestion, index) => (
              <button
                key={suggestion.pattern}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full px-3 py-2 text-left text-sm hover-bg-theme-interactive transition-colors flex items-center justify-between"
              >
                <span className="text-theme-primary font-mono">{suggestion.pattern}</span>
                <span className="text-theme-muted text-xs">{suggestion.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      
      <p className="text-xs text-theme-muted">
        Press Enter to add a pattern. Click suggestions or type custom patterns like *.bin
      </p>
    </div>
  );
});

// ============================================================================
// Mode Selection Component
// ============================================================================
const ModeSelection = memo(function ModeSelection({ onSelectMode, onBack }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center mb-6">
        <h2 className="text-lg font-medium text-theme-primary">How would you like to start?</h2>
        <p className="text-sm text-theme-secondary mt-1">
          Choose to clone an existing project or start fresh
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Clone Repository Option */}
        <button
          type="button"
          onClick={() => onSelectMode('clone')}
          className="group p-6 rounded-lg border border-theme-default bg-theme-surface hover:border-blue-500/50 hover:bg-theme-surface/80 transition-all text-left"
        >
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
            <Download style={iconStyleLg} className="text-blue-500 !w-6 !h-6" />
          </div>
          <h3 className="text-base font-medium text-theme-primary mb-1">Clone Repository</h3>
          <p className="text-sm text-theme-secondary">
            Download an existing project from GitHub, GitLab, or another Git remote
          </p>
        </button>
        
        {/* Initialize New Repository Option */}
        <button
          type="button"
          onClick={() => onSelectMode('init')}
          className="group p-6 rounded-lg border border-theme-default bg-theme-surface hover:border-green-500/50 hover:bg-theme-surface/80 transition-all text-left"
        >
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-4 group-hover:bg-green-500/20 transition-colors">
            <FolderPlus style={iconStyleLg} className="text-green-500 !w-6 !h-6" />
          </div>
          <h3 className="text-base font-medium text-theme-primary mb-1">Initialize New Repository</h3>
          <p className="text-sm text-theme-secondary">
            Start version control for files already in this folder
          </p>
        </button>
      </div>
      
      <div className="flex justify-center pt-4">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft style={iconStyleSm} />
          Cancel
        </Button>
      </div>
    </div>
  );
});

// ============================================================================
// Clone Repository Form
// ============================================================================
const CloneForm = memo(function CloneForm({ onBack, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    remoteUrl: '',
    branch: '',
    depth: '',
    recursive: true,
  });
  const [lfsEnabled, setLfsEnabled] = useState(true);
  const [lfsAttributes, setLfsAttributes] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleChange = useCallback((field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleAddLfsAttribute = useCallback((attr) => {
    setLfsAttributes(prev => [...prev, attr]);
  }, []);

  const handleRemoveLfsAttribute = useCallback((index) => {
    setLfsAttributes(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    onSubmit({
      type: 'clone',
      ...formData,
      lfsEnabled,
      lfsAttributes,
    });
  }, [formData, lfsEnabled, lfsAttributes, onSubmit]);

  // Validation
  const isValid = useMemo(() => {
    return formData.remoteUrl.trim().length > 0;
  }, [formData.remoteUrl]);

  // Detect remote type from URL
  const remoteType = useMemo(() => {
    const url = formData.remoteUrl.toLowerCase();
    if (url.includes('github.com')) return 'GitHub';
    if (url.includes('gitlab.com') || url.includes('gitlab')) return 'GitLab';
    if (url.includes('bitbucket')) return 'Bitbucket';
    if (url.includes('azure')) return 'Azure DevOps';
    if (url.startsWith('git@') || url.startsWith('https://')) return 'Git';
    return null;
  }, [formData.remoteUrl]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded hover-bg-theme-interactive transition-colors text-theme-secondary hover:text-theme-primary"
          aria-label="Go back"
        >
          <ArrowLeft style={iconStyleMd} />
        </button>
        <div>
          <h2 className="text-lg font-medium text-theme-primary">Clone Repository</h2>
          <p className="text-sm text-theme-secondary">
            Enter the remote URL to download the repository
          </p>
        </div>
      </div>

      {/* Remote URL */}
      <div>
        <Label htmlFor="remoteUrl" className="flex items-center gap-2">
          <LinkIcon style={iconStyleSm} className="text-theme-muted" />
          Repository URL
          <span className="text-red-400">*</span>
        </Label>
        <div className="relative">
          <Input
            id="remoteUrl"
            type="text"
            value={formData.remoteUrl}
            onChange={handleChange('remoteUrl')}
            placeholder="https://github.com/username/repository.git"
            required
          />
          {remoteType && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Badge variant="outline" className="text-xs">
                {remoteType}
              </Badge>
            </div>
          )}
        </div>
        <p className="text-xs text-theme-muted mt-1">
          HTTPS or SSH URL from GitHub, GitLab, or any Git remote
        </p>
      </div>

      {/* Advanced Options Toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
      >
        {showAdvanced ? (
          <ChevronDown style={iconStyleSm} />
        ) : (
          <ChevronRight style={iconStyleSm} />
        )}
        Advanced Options
      </button>

      {showAdvanced && (
        <div className="space-y-4 pl-4 border-l-2 border-theme-default animate-fade-in">
          {/* Branch */}
          <div>
            <Label htmlFor="branch">
              Branch
              <span className="text-theme-muted font-normal">(optional)</span>
            </Label>
            <Input
              id="branch"
              type="text"
              value={formData.branch}
              onChange={handleChange('branch')}
              placeholder="main (default)"
            />
            <p className="text-xs text-theme-muted mt-1">
              Leave empty to clone the default branch
            </p>
          </div>

          {/* Shallow Clone Depth */}
          <div>
            <Label htmlFor="depth">
              Clone Depth
              <span className="text-theme-muted font-normal">(optional)</span>
            </Label>
            <Input
              id="depth"
              type="number"
              min="1"
              value={formData.depth}
              onChange={handleChange('depth')}
              placeholder="Full history (default)"
            />
            <p className="text-xs text-theme-muted mt-1">
              Shallow clone with limited history (faster for large repos)
            </p>
          </div>

          {/* Recursive Submodules */}
          <div className="flex items-center gap-3">
            <input
              id="recursive"
              type="checkbox"
              checked={formData.recursive}
              onChange={handleChange('recursive')}
              className="w-4 h-4 rounded border-theme-default bg-theme-surface text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="recursive" className="mb-0 cursor-pointer">
              Include submodules
            </Label>
          </div>
        </div>
      )}

      {/* LFS Section */}
      <div className="border-t border-theme-default pt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield style={iconStyleMd} className="text-purple-400" />
            <div>
              <h3 className="text-sm font-medium text-theme-primary">Git LFS (Large File Storage)</h3>
              <p className="text-xs text-theme-secondary">Track large binary files efficiently</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={lfsEnabled}
              onChange={(e) => setLfsEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-theme-muted peer-focus:ring-2 peer-focus:ring-blue-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {lfsEnabled && (
          <LFSAttributeInput
            attributes={lfsAttributes}
            onAdd={handleAddLfsAttribute}
            onRemove={handleRemoveLfsAttribute}
          />
        )}
      </div>

      {/* Submit */}
      <CardFooter className="flex justify-end gap-3 px-0 pt-4 border-t border-theme-default">
        <Button type="button" variant="ghost" onClick={onBack}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!isValid}
          loading={isLoading}
          className="gap-2"
        >
          <Download style={iconStyleSm} />
          Clone Repository
        </Button>
      </CardFooter>
    </form>
  );
});

// ============================================================================
// Initialize Repository Form
// ============================================================================
const InitForm = memo(function InitForm({ onBack, onSubmit, isLoading, folderName }) {
  const [formData, setFormData] = useState({
    userName: '',
    userEmail: '',
    initialBranch: 'main',
    createReadme: true,
    createGitignore: true,
  });
  const [lfsEnabled, setLfsEnabled] = useState(true);
  const [lfsAttributes, setLfsAttributes] = useState([
    // Pre-select common automation patterns
    { pattern: '*.acd', description: 'Rockwell Studio 5000 projects' },
    { pattern: '*.L5X', description: 'Rockwell L5X exports' },
    { pattern: '*.ap*', description: 'TIA Portal projects' },
    { pattern: '*.mer', description: 'FactoryTalk ME applications' },
  ]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleChange = useCallback((field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleAddLfsAttribute = useCallback((attr) => {
    setLfsAttributes(prev => [...prev, attr]);
  }, []);

  const handleRemoveLfsAttribute = useCallback((index) => {
    setLfsAttributes(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    onSubmit({
      type: 'init',
      ...formData,
      lfsEnabled,
      lfsAttributes,
    });
  }, [formData, lfsEnabled, lfsAttributes, onSubmit]);

  // Validation - user info is optional for init but recommended
  const isValid = useMemo(() => {
    // For init, we just need to make sure we can proceed
    // Username and email are optional (can use git global config)
    return true;
  }, []);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded hover-bg-theme-interactive transition-colors text-theme-secondary hover:text-theme-primary"
          aria-label="Go back"
        >
          <ArrowLeft style={iconStyleMd} />
        </button>
        <div>
          <h2 className="text-lg font-medium text-theme-primary">Initialize Repository</h2>
          <p className="text-sm text-theme-secondary">
            Start version control for <span className="font-medium text-theme-primary">{folderName}</span>
          </p>
        </div>
      </div>

      {/* Git User Config (Optional) */}
      <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <div className="flex items-start gap-2 mb-3">
          <Info style={iconStyleSm} className="text-blue-400 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-theme-primary">Committer Identity</h4>
            <p className="text-xs text-theme-secondary mt-0.5">
              This identifies you in the version history. Leave blank to use your global Git settings.
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="userName" className="flex items-center gap-2">
              <User style={iconStyleSm} className="text-theme-muted" />
              Your Name
            </Label>
            <Input
              id="userName"
              type="text"
              value={formData.userName}
              onChange={handleChange('userName')}
              placeholder="John Doe"
            />
          </div>
          <div>
            <Label htmlFor="userEmail" className="flex items-center gap-2">
              <Mail style={iconStyleSm} className="text-theme-muted" />
              Your Email
            </Label>
            <Input
              id="userEmail"
              type="email"
              value={formData.userEmail}
              onChange={handleChange('userEmail')}
              placeholder="john@example.com"
            />
          </div>
        </div>
      </div>

      {/* Initial Files */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-theme-primary">Initial Files</h4>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.createReadme}
              onChange={handleChange('createReadme')}
              className="w-4 h-4 rounded border-theme-default bg-theme-surface text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-theme-primary">Create README.md</span>
            <span className="text-xs text-theme-muted">Describe your project</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.createGitignore}
              onChange={handleChange('createGitignore')}
              className="w-4 h-4 rounded border-theme-default bg-theme-surface text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-theme-primary">Create .gitignore</span>
            <span className="text-xs text-theme-muted">Exclude temporary files</span>
          </label>
        </div>
      </div>

      {/* Advanced Options Toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
      >
        {showAdvanced ? (
          <ChevronDown style={iconStyleSm} />
        ) : (
          <ChevronRight style={iconStyleSm} />
        )}
        Advanced Options
      </button>

      {showAdvanced && (
        <div className="space-y-4 pl-4 border-l-2 border-theme-default animate-fade-in">
          {/* Initial Branch Name */}
          <div>
            <Label htmlFor="initialBranch">
              Initial Branch Name
            </Label>
            <Input
              id="initialBranch"
              type="text"
              value={formData.initialBranch}
              onChange={handleChange('initialBranch')}
              placeholder="main"
            />
            <p className="text-xs text-theme-muted mt-1">
              The name for the first branch (recommended: main)
            </p>
          </div>
        </div>
      )}

      {/* LFS Section */}
      <div className="border-t border-theme-default pt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield style={iconStyleMd} className="text-purple-400" />
            <div>
              <h3 className="text-sm font-medium text-theme-primary">Git LFS (Large File Storage)</h3>
              <p className="text-xs text-theme-secondary">Track large binary files efficiently</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={lfsEnabled}
              onChange={(e) => setLfsEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-theme-muted peer-focus:ring-2 peer-focus:ring-blue-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {lfsEnabled && (
          <LFSAttributeInput
            attributes={lfsAttributes}
            onAdd={handleAddLfsAttribute}
            onRemove={handleRemoveLfsAttribute}
          />
        )}
      </div>

      {/* Submit */}
      <CardFooter className="flex justify-end gap-3 px-0 pt-4 border-t border-theme-default">
        <Button type="button" variant="ghost" onClick={onBack}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!isValid}
          loading={isLoading}
          className="gap-2"
        >
          <Check style={iconStyleSm} />
          Initialize Repository
        </Button>
      </CardFooter>
    </form>
  );
});

// ============================================================================
// Main GitInitForm Component
// ============================================================================
function GitInitForm({ folderName, onBack, onSubmit, isLoading }) {
  const [mode, setMode] = useState(null); // null | 'clone' | 'init'

  const handleBack = useCallback(() => {
    if (mode) {
      setMode(null);
    } else {
      onBack();
    }
  }, [mode, onBack]);

  const handleSubmit = useCallback((data) => {
    // For now, just log - backend integration will be added later
    console.log('Git Init Form submitted:', data);
    onSubmit?.(data);
  }, [onSubmit]);

  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-fade-in">
      <Card className="max-w-2xl w-full">
        <CardContent className="p-6">
          {!mode && (
            <ModeSelection 
              onSelectMode={setMode} 
              onBack={onBack}
            />
          )}
          
          {mode === 'clone' && (
            <CloneForm
              onBack={handleBack}
              onSubmit={handleSubmit}
              isLoading={isLoading}
            />
          )}
          
          {mode === 'init' && (
            <InitForm
              onBack={handleBack}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              folderName={folderName}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default memo(GitInitForm);
