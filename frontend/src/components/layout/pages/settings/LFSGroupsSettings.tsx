/**
 * LFSGroupsSettings - Manage custom LFS extension groups.
 * Allows users to create, edit, delete, import, and export custom LFS groups.
 */
import { memo, useState, useCallback, useEffect, useMemo, type CSSProperties, type KeyboardEvent, type ChangeEvent, type FormEvent, type JSX } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  X,
  FileCode,
  FolderArchive,
} from 'lucide-react';
import { toast } from 'sonner';
import { ICON_SIZES } from '../../../../constants';
import { Button, Input, Label, Badge } from '../../../ui';
import {
  GetCustomLFSGroups,
  AddCustomLFSGroup,
  UpdateCustomLFSGroup,
  DeleteCustomLFSGroup,
  ExportCustomLFSGroups,
  ImportCustomLFSGroups,
} from '../../../../../bindings/controlzebra/services/settingsservice';

const iconStyleSm: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconStyleXs: CSSProperties = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

// ============================================================================
// Types
// ============================================================================

interface ColorOption {
  id: string;
  class: string;
  bg: string;
}

interface CustomLFSGroup {
  id: string;
  name: string;
  color: string;
  description?: string;
  extensions: string[];
}

interface GroupFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (group: CustomLFSGroup) => void;
  initialData?: CustomLFSGroup | null;
  isLoading?: boolean;
}

interface GroupCardProps {
  group: CustomLFSGroup;
  onEdit: (group: CustomLFSGroup) => void;
  onDelete: (id: string) => void;
}

interface FormData {
  name: string;
  color: string;
  description: string;
  extensions: string[];
}

interface FormErrors {
  name?: string;
  extension?: string;
  extensions?: string;
}

// Available color options for custom groups
const COLOR_OPTIONS: ColorOption[] = [
  { id: 'cyan', class: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  { id: 'green', class: 'text-green-400', bg: 'bg-green-500/20' },
  { id: 'yellow', class: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  { id: 'red', class: 'text-red-400', bg: 'bg-red-500/20' },
  { id: 'pink', class: 'text-pink-400', bg: 'bg-pink-500/20' },
  { id: 'indigo', class: 'text-indigo-400', bg: 'bg-indigo-500/20' },
  { id: 'teal', class: 'text-teal-400', bg: 'bg-teal-500/20' },
  { id: 'amber', class: 'text-amber-400', bg: 'bg-amber-500/20' },
];

// Generate unique ID
const generateId = (): string => `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// ============================================================================
// Group Form Modal
// ============================================================================
const GroupFormModal = memo(function GroupFormModal({
  isOpen,
  onClose,
  onSave,
  initialData = null,
  isLoading = false,
}: GroupFormModalProps): JSX.Element | null {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    color: 'cyan',
    description: '',
    extensions: [],
  });
  const [extensionInput, setExtensionInput] = useState<string>('');
  const [errors, setErrors] = useState<FormErrors>({});

  // Initialize form data when editing
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        color: initialData.color || 'cyan',
        description: initialData.description || '',
        extensions: initialData.extensions || [],
      });
    } else {
      setFormData({
        name: '',
        color: 'cyan',
        description: '',
        extensions: [],
      });
    }
    setExtensionInput('');
    setErrors({});
  }, [initialData, isOpen]);

  const handleAddExtension = useCallback((): void => {
    let ext = extensionInput.trim();
    if (!ext) return;

    // Normalize extension format
    if (!ext.startsWith('.')) {
      ext = '.' + ext;
    }
    ext = ext.toLowerCase();

    // Check for duplicates
    if (formData.extensions.includes(ext)) {
      setErrors(prev => ({ ...prev, extension: 'Extension already added' }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      extensions: [...prev.extensions, ext],
    }));
    setExtensionInput('');
    setErrors(prev => ({ ...prev, extension: undefined }));
  }, [extensionInput, formData.extensions]);

  const handleRemoveExtension = useCallback((index: number): void => {
    setFormData(prev => ({
      ...prev,
      extensions: prev.extensions.filter((_, i) => i !== index),
    }));
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddExtension();
    }
  }, [handleAddExtension]);

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (formData.extensions.length === 0) {
      newErrors.extensions = 'At least one extension is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback((e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!validate()) return;

    onSave({
      id: initialData?.id || generateId(),
      name: formData.name.trim(),
      color: formData.color,
      description: formData.description.trim(),
      extensions: formData.extensions,
    });
  }, [formData, initialData, validate, onSave]);

  const selectedColorOption = useMemo(
    () => COLOR_OPTIONS.find(c => c.id === formData.color) || COLOR_OPTIONS[0],
    [formData.color]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-theme-surface border border-theme-default rounded-xl shadow-2xl w-full max-w-md mx-4 animate-fade-in">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-theme-default">
            <h3 className="text-lg font-medium text-theme-primary">
              {initialData ? 'Edit Group' : 'Create Custom Group'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover-bg-theme-interactive text-theme-muted hover:text-theme-primary transition-colors"
            >
              <X style={iconStyleSm} />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            {/* Group Name */}
            <div>
              <Label htmlFor="groupName">
                Group Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="groupName"
                type="text"
                value={formData.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => 
                  setFormData(prev => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., My Custom Tools"
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && (
                <p className="text-red-400 text-xs mt-1">{errors.name}</p>
              )}
            </div>

            {/* Color Selection */}
            <div>
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, color: color.id }))}
                    className={`w-8 h-8 rounded-full ${color.bg} flex items-center justify-center transition-all ${
                      formData.color === color.id
                        ? 'ring-2 ring-offset-2 ring-offset-theme-surface ring-blue-500 scale-110'
                        : 'hover:scale-105'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full ${color.class} bg-current`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">
                Description <span className="text-theme-muted">(optional)</span>
              </Label>
              <Input
                id="description"
                type="text"
                value={formData.description}
                onChange={(e: ChangeEvent<HTMLInputElement>) => 
                  setFormData(prev => ({ ...prev, description: e.target.value }))
                }
                placeholder="e.g., Project files for XYZ software"
              />
            </div>

            {/* Extensions */}
            <div>
              <Label>
                File Extensions <span className="text-red-400">*</span>
              </Label>
              <p className="text-xs text-theme-muted mb-2">
                Add extensions without the asterisk (e.g., .bin, .dat)
              </p>

              {/* Extension tags */}
              {formData.extensions.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.extensions.map((ext, index) => (
                    <Badge
                      key={ext}
                      variant="info"
                      className={`flex items-center gap-1 pr-1 ${selectedColorOption.bg} ${selectedColorOption.class}`}
                    >
                      <span>{ext}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveExtension(index)}
                        className="ml-1 p-0.5 rounded hover:bg-red-500/30 transition-colors"
                      >
                        <X style={iconStyleXs} />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Extension input */}
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={extensionInput}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setExtensionInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder=".bin"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleAddExtension}
                  className="shrink-0"
                >
                  <Plus style={iconStyleSm} />
                </Button>
              </div>
              {errors.extension && (
                <p className="text-yellow-400 text-xs mt-1">{errors.extension}</p>
              )}
              {errors.extensions && (
                <p className="text-red-400 text-xs mt-1">{errors.extensions}</p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-theme-default">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading}>
              {initialData ? 'Save Changes' : 'Create Group'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
});

// ============================================================================
// Group Card
// ============================================================================
const GroupCard = memo(function GroupCard({ group, onEdit, onDelete }: GroupCardProps): JSX.Element {
  const colorOption = useMemo(
    () => COLOR_OPTIONS.find(c => c.id === group.color) || COLOR_OPTIONS[0],
    [group.color]
  );

  return (
    <div className="bg-theme-base border border-theme-default rounded-lg p-4 hover:border-theme-muted transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded ${colorOption.bg}`}>
            <FolderArchive style={iconStyleSm} className={colorOption.class} />
          </div>
          <div>
            <h4 className="text-sm font-medium text-theme-primary">{group.name}</h4>
            {group.description && (
              <p className="text-xs text-theme-muted mt-0.5">{group.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(group)}
            className="p-1.5 rounded hover-bg-theme-interactive text-theme-muted hover:text-blue-400 transition-colors"
            title="Edit group"
          >
            <Edit2 style={iconStyleXs} />
          </button>
          <button
            onClick={() => onDelete(group.id)}
            className="p-1.5 rounded hover-bg-theme-interactive text-theme-muted hover:text-red-400 transition-colors"
            title="Delete group"
          >
            <Trash2 style={iconStyleXs} />
          </button>
        </div>
      </div>

      {/* Extensions */}
      <div className="flex flex-wrap gap-1">
        {group.extensions.slice(0, 8).map((ext) => (
          <span
            key={ext}
            className={`px-2 py-0.5 text-xs rounded ${colorOption.bg} ${colorOption.class}`}
          >
            {ext}
          </span>
        ))}
        {group.extensions.length > 8 && (
          <span className="px-2 py-0.5 text-xs rounded bg-theme-muted/30 text-theme-muted">
            +{group.extensions.length - 8} more
          </span>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================
function LFSGroupsSettings(): JSX.Element {
  const [groups, setGroups] = useState<CustomLFSGroup[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingGroup, setEditingGroup] = useState<CustomLFSGroup | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const loadGroups = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const data = await GetCustomLFSGroups();
      setGroups(data.groups || []);
    } catch (error) {
      console.error('Failed to load LFS groups:', error);
      toast.error('Failed to load groups');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load groups on mount
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleOpenCreate = useCallback((): void => {
    setEditingGroup(null);
    setIsModalOpen(true);
  }, []);

  const handleOpenEdit = useCallback((group: CustomLFSGroup): void => {
    setEditingGroup(group);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback((): void => {
    setIsModalOpen(false);
    setEditingGroup(null);
  }, []);

  const handleSaveGroup = useCallback(async (groupData: CustomLFSGroup): Promise<void> => {
    setIsSaving(true);
    try {
      // Ensure description is always a string for the backend
      const apiData = { ...groupData, description: groupData.description || '' };
      if (editingGroup) {
        const result = await UpdateCustomLFSGroup(apiData);
        if (!result.success) {
          throw new Error(result.error);
        }
        toast.success('Group updated successfully');
      } else {
        const result = await AddCustomLFSGroup(apiData);
        if (!result.success) {
          throw new Error(result.error);
        }
        toast.success('Group created successfully');
      }

      await loadGroups();
      handleCloseModal();
    } catch (error) {
      console.error('Failed to save group:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save group';
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  }, [editingGroup, loadGroups, handleCloseModal]);

  const handleDeleteGroup = useCallback(async (groupId: string): Promise<void> => {
    if (!confirm('Are you sure you want to delete this group?')) return;

    try {
      const result = await DeleteCustomLFSGroup(groupId);
      if (!result.success) {
        throw new Error(result.error);
      }
      toast.success('Group deleted successfully');
      await loadGroups();
    } catch (error) {
      console.error('Failed to delete group:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete group';
      toast.error(errorMessage);
    }
  }, [loadGroups]);

  const handleExport = useCallback(async (): Promise<void> => {
    try {
      const result = await ExportCustomLFSGroups();
      if (result.success) {
        toast.success(`Exported to ${result.path}`);
      } else if (result.error !== 'Export cancelled') {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to export groups:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to export groups';
      toast.error(errorMessage);
    }
  }, []);

  const handleImport = useCallback(async (merge: boolean = true): Promise<void> => {
    try {
      const result = await ImportCustomLFSGroups(merge);
      if (result.success) {
        toast.success(`Imported ${result.importedCount} group(s)`);
        await loadGroups();
      } else if (result.error !== 'Import cancelled') {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to import groups:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to import groups';
      toast.error(errorMessage);
    }
  }, [loadGroups]);

  return (
    <div className="bg-theme-surface rounded-lg border border-theme-default">
      {/* Header */}
      <div className="p-6 border-b border-theme-default">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <FileCode style={{ width: 20, height: 20 }} className="text-purple-400" />
            </div>
            <div>
              <h3 className="text-base font-medium text-theme-primary">Custom LFS Groups</h3>
              <p className="text-sm text-theme-muted">
                Create your own file extension groups for Git LFS
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus style={iconStyleSm} />
            Create Group
          </Button>
          <Button variant="secondary" onClick={handleExport} className="gap-2" disabled={groups.length === 0}>
            <Download style={iconStyleSm} />
            Export
          </Button>
          <Button variant="secondary" onClick={() => handleImport(true)} className="gap-2">
            <Upload style={iconStyleSm} />
            Import (Merge)
          </Button>
          <Button variant="ghost" onClick={() => handleImport(false)} className="gap-2 text-theme-muted">
            <Upload style={iconStyleSm} />
            Import (Replace)
          </Button>
        </div>
      </div>

      {/* Groups list */}
      <div className="p-6">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-theme-muted text-sm">Loading groups...</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-8">
            <FolderArchive style={{ width: 48, height: 48 }} className="text-theme-muted mx-auto mb-3" />
            <p className="text-theme-secondary mb-1">No custom groups yet</p>
            <p className="text-theme-muted text-sm">
              Create a custom group to organize your LFS file extensions
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                onEdit={handleOpenEdit}
                onDelete={handleDeleteGroup}
              />
            ))}
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="px-6 pb-6">
        <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <h4 className="text-sm font-medium text-blue-400 mb-2">💡 Tips</h4>
          <ul className="text-xs text-theme-muted space-y-1">
            <li>• Custom groups appear in the LFS extension picker when initializing a repository</li>
            <li>• Use <strong>Export</strong> to share your groups with teammates</li>
            <li>• <strong>Import (Merge)</strong> adds new groups without overwriting existing ones</li>
            <li>• <strong>Import (Replace)</strong> replaces all custom groups with the imported file</li>
          </ul>
        </div>
      </div>

      {/* Form Modal */}
      <GroupFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveGroup}
        initialData={editingGroup}
        isLoading={isSaving}
      />
    </div>
  );
}

export default memo(LFSGroupsSettings);
