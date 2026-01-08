/**
 * GitInitForm - Repository initialization/clone form.
 * Allows users to either clone an existing repository or initialize a new one.
 * Supports Git LFS configuration with customizable attributes.
 */
import { memo, useState, useCallback, useMemo, useEffect } from 'react';
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
  Factory,
  Cog,
  Video,
} from 'lucide-react';
import { ICON_SIZES } from '../../../../constants';
import { Button, Input, Label, Badge } from '../../../ui';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../ui/card';
import { GetCustomLFSGroups } from '../../../../../bindings/changeme/services/settingsservice';

// Memoized icon styles
const iconStyleLg = { width: 48, height: 48 };
const iconStyleMd = { width: ICON_SIZES.md, height: ICON_SIZES.md };
const iconStyleSm = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconStyleXs = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

// ============================================================================
// LFS Extension Groups - Predefined groups organized by category
// ============================================================================
const LFS_EXTENSION_GROUPS = {
  industrial_automation: {
    label: 'Industrial Automation',
    icon: Factory,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    platforms: [
      {
        platform: 'Siemens TIA Portal',
        extensions: ['.ap14', '.ap15', '.ap16', '.ap17', '.ap18', '.ap19', '.zap19'],
        description: 'Proprietary project and compressed archive files.',
      },
      {
        platform: 'Rockwell Studio 5000',
        extensions: ['.acd'],
        description: 'Logix Designer project files.',
      },
      {
        platform: 'Schneider EcoStruxure',
        extensions: ['.stu', '.sta'],
        description: 'Unity Pro / Control Expert project and archive files.',
      },
    ],
  },
  cad_cam: {
    label: 'CAD / CAM',
    icon: Cog,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    platforms: [
      {
        platform: 'AutoCAD',
        extensions: ['.dwg', '.dxf'],
        description: 'Standard drawing formats.',
      },
      {
        platform: 'SOLIDWORKS',
        extensions: ['.sldprt', '.sldasm', '.slddrw'],
        description: 'Part, Assembly, and Drawing files.',
      },
      {
        platform: 'Autodesk Fusion',
        extensions: ['.f3d', '.f3z'],
        description: 'Cloud-based archive formats.',
      },
      {
        platform: '3D Exchange Standards',
        extensions: ['.step', '.stp', '.iges', '.igs', '.stl', '.obj', '.fbx'],
        description: 'Universal formats for CAD and Robotics simulations.',
      },
    ],
  },
  multimedia_editing: {
    label: 'Multimedia / Editing',
    icon: Video,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    platforms: [
      {
        platform: 'Adobe Creative Cloud',
        extensions: ['.psd', '.psb', '.ai', '.indd', '.prproj', '.aep'],
        description: 'Professional design and video project files.',
      },
      {
        platform: 'Audio DAWs',
        extensions: ['.logicx', '.cpr', '.ptx', '.als', '.flp'],
        description: 'Project files for Logic, Cubase, Pro Tools, Ableton, and FL Studio.',
      },
      {
        platform: 'General Media - Video',
        extensions: ['.mp4', '.mov', '.mkv', '.avi', '.m4v', '.webm', '.flv', '.wmv'],
        description: 'Compressed and container video formats.',
      },
      {
        platform: 'General Media - Audio',
        extensions: ['.wav', '.aif', '.mp3', '.flac', '.ogg', '.m4a', '.aac', '.wma'],
        description: 'Lossless and lossy audio assets.',
      },
      {
        platform: 'General Media - Imagery',
        extensions: ['.jpg', '.jpeg', '.png', '.gif', '.tiff', '.bmp', '.webp', '.heic'],
        description: 'Standard raster image assets.',
      },
      {
        platform: 'General Media - RAW Photography',
        extensions: ['.cr2', '.cr3', '.nef', '.arw', '.dng'],
        description: 'Uncompressed camera RAW files (highly recommended for LFS).',
      },
    ],
  },
};

// Flatten groups for individual pattern suggestions
const COMMON_LFS_PATTERNS = Object.values(LFS_EXTENSION_GROUPS).flatMap(category =>
  category.platforms.flatMap(platform =>
    platform.extensions.map(ext => ({
      pattern: `*${ext}`,
      description: `${platform.platform}`,
    }))
  )
);

// ============================================================================
// LFS Attribute Tag Input Component with Grouped Dropdown
// ============================================================================
const LFSAttributeInput = memo(function LFSAttributeInput({ 
  attributes, 
  onAdd, 
  onRemove, 
  suggestions = COMMON_LFS_PATTERNS 
}) {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [activeTab, setActiveTab] = useState('groups'); // 'groups', 'custom', or 'search'
  const [customGroups, setCustomGroups] = useState([]);
  const [customGroupsLoaded, setCustomGroupsLoaded] = useState(false);

  // Define loadCustomGroups before the useEffect that depends on it
  const loadCustomGroups = useCallback(async () => {
    try {
      const data = await GetCustomLFSGroups();
      setCustomGroups(data.groups || []);
    } catch (error) {
      console.error('Failed to load custom LFS groups:', error);
    } finally {
      setCustomGroupsLoaded(true);
    }
  }, []);

  // Load custom groups when dropdown opens
  useEffect(() => {
    if (showDropdown && !customGroupsLoaded) {
      loadCustomGroups();
    }
  }, [showDropdown, customGroupsLoaded, loadCustomGroups]);

  // Get already added patterns as a set for filtering
  const addedPatterns = useMemo(() => 
    new Set(attributes.map(a => a.pattern)),
    [attributes]
  );

  // Filter suggestions based on input for search mode (include custom groups in search)
  const filteredSuggestions = useMemo(() => {
    if (!inputValue) return [];
    
    // Combine predefined and custom group patterns
    const allPatterns = [...suggestions];
    customGroups.forEach(group => {
      group.extensions.forEach(ext => {
        allPatterns.push({
          pattern: `*${ext}`,
          description: `${group.name} (Custom)`,
        });
      });
    });
    
    return allPatterns.filter(s => 
      !addedPatterns.has(s.pattern) &&
      (s.pattern.toLowerCase().includes(inputValue.toLowerCase()) ||
       s.description.toLowerCase().includes(inputValue.toLowerCase()))
    );
  }, [inputValue, addedPatterns, suggestions, customGroups]);

  // Toggle category expansion
  const toggleCategory = useCallback((categoryKey) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryKey]: !prev[categoryKey],
    }));
  }, []);

  // Add entire platform group
  const handleAddPlatformGroup = useCallback((platform) => {
    platform.extensions.forEach(ext => {
      const pattern = `*${ext}`;
      if (!addedPatterns.has(pattern)) {
        onAdd({ pattern, description: platform.platform });
      }
    });
  }, [addedPatterns, onAdd]);

  // Add entire custom group
  const handleAddCustomGroup = useCallback((group) => {
    group.extensions.forEach(ext => {
      const pattern = `*${ext}`;
      if (!addedPatterns.has(pattern)) {
        onAdd({ pattern, description: group.name });
      }
    });
  }, [addedPatterns, onAdd]);

  // Add single extension
  const handleAddExtension = useCallback((ext, platformName) => {
    const pattern = `*${ext}`;
    if (!addedPatterns.has(pattern)) {
      onAdd({ pattern, description: platformName });
    }
  }, [addedPatterns, onAdd]);

  // Check if a platform is fully added
  const isPlatformFullyAdded = useCallback((platform) => {
    return platform.extensions.every(ext => addedPatterns.has(`*${ext}`));
  }, [addedPatterns]);

  // Check if a platform is partially added
  const isPlatformPartiallyAdded = useCallback((platform) => {
    const added = platform.extensions.filter(ext => addedPatterns.has(`*${ext}`));
    return added.length > 0 && added.length < platform.extensions.length;
  }, [addedPatterns]);

  // Check if a custom group is fully added
  const isCustomGroupFullyAdded = useCallback((group) => {
    return group.extensions.every(ext => addedPatterns.has(`*${ext}`));
  }, [addedPatterns]);

  // Check if a custom group is partially added
  const isCustomGroupPartiallyAdded = useCallback((group) => {
    const added = group.extensions.filter(ext => addedPatterns.has(`*${ext}`));
    return added.length > 0 && added.length < group.extensions.length;
  }, [addedPatterns]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      // Check if it matches a suggestion
      const matchedSuggestion = filteredSuggestions.find(
        s => s.pattern.toLowerCase() === inputValue.toLowerCase()
      );
      onAdd(matchedSuggestion || { pattern: inputValue.trim(), description: 'Custom pattern' });
      setInputValue('');
    }
  }, [inputValue, filteredSuggestions, onAdd]);

  const handleSuggestionClick = useCallback((suggestion) => {
    onAdd(suggestion);
    setInputValue('');
  }, [onAdd]);

  const handleInputFocus = useCallback(() => {
    setShowDropdown(true);
  }, []);

  const handleInputBlur = useCallback(() => {
    // Delay to allow click on dropdown items
    setTimeout(() => setShowDropdown(false), 250);
  }, []);

  // Determine if we should show custom tab
  const hasCustomGroups = customGroups.length > 0;

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
      
      {/* Input with grouped dropdown */}
      <div className="relative">
        <Input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setActiveTab(e.target.value ? 'search' : 'groups');
          }}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder="Click to browse groups or type to search..."
          className="w-full"
        />
        
        {/* Dropdown with tabs */}
        {showDropdown && (
          <div className="absolute z-20 w-full mt-1 max-h-72 overflow-hidden rounded-lg border border-theme-default bg-theme-surface shadow-xl">
            {/* Tab buttons */}
            <div className="flex border-b border-theme-default bg-theme-base/50">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setActiveTab('groups')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  activeTab === 'groups'
                    ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
                    : 'text-theme-secondary hover:text-theme-primary'
                }`}
              >
                Predefined
              </button>
              {hasCustomGroups && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setActiveTab('custom')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    activeTab === 'custom'
                      ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/5'
                      : 'text-theme-secondary hover:text-theme-primary'
                  }`}
                >
                  My Groups ({customGroups.length})
                </button>
              )}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setActiveTab('search')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  activeTab === 'search'
                    ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
                    : 'text-theme-secondary hover:text-theme-primary'
                }`}
              >
                Search
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto">
              {activeTab === 'groups' ? (
                /* Predefined Groups View */
                <div className="py-1">
                  {Object.entries(LFS_EXTENSION_GROUPS).map(([categoryKey, category]) => {
                    const CategoryIcon = category.icon;
                    const isExpanded = expandedCategories[categoryKey];
                    
                    return (
                      <div key={categoryKey} className="border-b border-theme-default last:border-b-0">
                        {/* Category Header */}
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => toggleCategory(categoryKey)}
                          className="w-full px-3 py-2.5 flex items-center gap-2 hover-bg-theme-interactive transition-colors"
                        >
                          <div className={`p-1.5 rounded ${category.bgColor}`}>
                            <CategoryIcon style={iconStyleSm} className={category.color} />
                          </div>
                          <span className="flex-1 text-left text-sm font-medium text-theme-primary">
                            {category.label}
                          </span>
                          <span className="text-xs text-theme-muted mr-2">
                            {category.platforms.length} platforms
                          </span>
                          {isExpanded ? (
                            <ChevronDown style={iconStyleXs} className="text-theme-muted" />
                          ) : (
                            <ChevronRight style={iconStyleXs} className="text-theme-muted" />
                          )}
                        </button>
                        
                        {/* Platforms within category */}
                        {isExpanded && (
                          <div className="bg-theme-base/30">
                            {category.platforms.map((platform, idx) => {
                              const isFullyAdded = isPlatformFullyAdded(platform);
                              const isPartiallyAdded = isPlatformPartiallyAdded(platform);
                              
                              return (
                                <div
                                  key={`${categoryKey}-${idx}`}
                                  className="border-t border-theme-default/50"
                                >
                                  {/* Platform Header */}
                                  <div className="px-4 py-2 flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm text-theme-primary font-medium">
                                          {platform.platform}
                                        </span>
                                        {isFullyAdded && (
                                          <Badge variant="success" className="text-[10px] py-0 px-1.5">
                                            Added
                                          </Badge>
                                        )}
                                        {isPartiallyAdded && !isFullyAdded && (
                                          <Badge variant="warning" className="text-[10px] py-0 px-1.5">
                                            Partial
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-theme-muted mt-0.5 truncate">
                                        {platform.description}
                                      </p>
                                    </div>
                                    {!isFullyAdded && (
                                      <button
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => handleAddPlatformGroup(platform)}
                                        className="ml-2 px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors flex items-center gap-1"
                                      >
                                        <Plus style={{ width: 10, height: 10 }} />
                                        Add All
                                      </button>
                                    )}
                                  </div>
                                  
                                  {/* Extension chips */}
                                  <div className="px-4 pb-2 flex flex-wrap gap-1">
                                    {platform.extensions.map((ext) => {
                                      const pattern = `*${ext}`;
                                      const isAdded = addedPatterns.has(pattern);
                                      
                                      return (
                                        <button
                                          key={ext}
                                          type="button"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => !isAdded && handleAddExtension(ext, platform.platform)}
                                          disabled={isAdded}
                                          className={`px-2 py-0.5 text-xs rounded font-mono transition-colors ${
                                            isAdded
                                              ? 'bg-green-500/20 text-green-400 cursor-default'
                                              : 'bg-theme-muted/30 text-theme-secondary hover:bg-blue-500/20 hover:text-blue-400'
                                          }`}
                                        >
                                          {isAdded && <Check style={{ width: 10, height: 10, display: 'inline', marginRight: 2 }} />}
                                          {ext}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : activeTab === 'custom' ? (
                /* Custom Groups View */
                <div className="py-1">
                  {customGroups.map((group) => {
                    const isFullyAdded = isCustomGroupFullyAdded(group);
                    const isPartiallyAdded = isCustomGroupPartiallyAdded(group);
                    
                    return (
                      <div key={group.id} className="border-b border-theme-default last:border-b-0">
                        {/* Group Header */}
                        <div className="px-3 py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="p-1.5 rounded bg-purple-500/10">
                              <FileCode style={iconStyleSm} className="text-purple-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-theme-primary">
                                  {group.name}
                                </span>
                                {isFullyAdded && (
                                  <Badge variant="success" className="text-[10px] py-0 px-1.5">
                                    Added
                                  </Badge>
                                )}
                                {isPartiallyAdded && !isFullyAdded && (
                                  <Badge variant="warning" className="text-[10px] py-0 px-1.5">
                                    Partial
                                  </Badge>
                                )}
                              </div>
                              {group.description && (
                                <p className="text-xs text-theme-muted mt-0.5 truncate">
                                  {group.description}
                                </p>
                              )}
                            </div>
                          </div>
                          {!isFullyAdded && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleAddCustomGroup(group)}
                              className="ml-2 px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors flex items-center gap-1"
                            >
                              <Plus style={{ width: 10, height: 10 }} />
                              Add All
                            </button>
                          )}
                        </div>
                        
                        {/* Extension chips */}
                        <div className="px-3 pb-2 flex flex-wrap gap-1">
                          {group.extensions.map((ext) => {
                            const pattern = `*${ext}`;
                            const isAdded = addedPatterns.has(pattern);
                            
                            return (
                              <button
                                key={ext}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => !isAdded && handleAddExtension(ext, group.name)}
                                disabled={isAdded}
                                className={`px-2 py-0.5 text-xs rounded font-mono transition-colors ${
                                  isAdded
                                    ? 'bg-green-500/20 text-green-400 cursor-default'
                                    : 'bg-purple-500/10 text-purple-300 hover:bg-purple-500/30 hover:text-purple-200'
                                }`}
                              >
                                {isAdded && <Check style={{ width: 10, height: 10, display: 'inline', marginRight: 2 }} />}
                                {ext}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Search View */
                <div>
                  {filteredSuggestions.length > 0 ? (
                    filteredSuggestions.slice(0, 15).map((suggestion, index) => (
                      <button
                        key={`${suggestion.pattern}-${index}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="w-full px-3 py-2 text-left text-sm hover-bg-theme-interactive transition-colors flex items-center justify-between"
                      >
                        <span className="text-theme-primary font-mono">{suggestion.pattern}</span>
                        <span className="text-theme-muted text-xs">{suggestion.description}</span>
                      </button>
                    ))
                  ) : inputValue ? (
                    <div className="px-3 py-4 text-center">
                      <p className="text-sm text-theme-secondary">No matching extensions found</p>
                      <p className="text-xs text-theme-muted mt-1">
                        Press Enter to add "{inputValue}" as a custom pattern
                      </p>
                    </div>
                  ) : (
                    <div className="px-3 py-4 text-center text-theme-muted text-sm">
                      Type to search for file extensions...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      <p className="text-xs text-theme-muted">
        Browse predefined groups, your custom groups, or type patterns like *.bin
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
