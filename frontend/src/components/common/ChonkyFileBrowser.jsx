/**
 * ChonkyFileBrowser - File browser component using Chonky.
 * Displays the current project folder and allows navigation into subfolders.
 */
import { memo, useState, useCallback, useMemo, useEffect } from 'react';
import {
  FileBrowser,
  FileNavbar,
  FileToolbar,
  FileList,
  FileContextMenu,
  ChonkyActions,
} from 'chonky';
import { ListDirectory, OpenFile } from '../../../bindings/changeme/services/filesystemservice';

/**
 * Convert FileSystemService entries to Chonky FileData format.
 */
function toChonkyFiles(entries) {
  if (!entries || entries.length === 0) return [];
  
  return entries.map((entry) => ({
    id: entry.path,
    name: entry.name,
    isDir: entry.isDirectory,
    size: entry.isDirectory ? undefined : entry.size,
    ext: entry.extension ? `.${entry.extension}` : undefined,
  }));
}

/**
 * Build folder chain from current path to root.
 * The folder chain shows breadcrumb navigation in Chonky.
 */
function buildFolderChain(currentPath, rootPath) {
  if (!currentPath || !rootPath) return [];
  
  const chain = [];
  let path = currentPath;
  
  // Add all folders from current path up to (and including) root
  while (path && path.length >= rootPath.length) {
    const name = path.split('/').pop() || path;
    chain.unshift({
      id: path,
      name: name,
      isDir: true,
    });
    
    // Stop at root
    if (path === rootPath) break;
    
    // Go up one level
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    if (parentPath === path || !parentPath) break;
    path = parentPath;
  }
  
  return chain;
}

function ChonkyFileBrowser({ repoPath }) {
  const [currentPath, setCurrentPath] = useState(repoPath);
  const [files, setFiles] = useState(null); // null = loading
  const [error, setError] = useState(null);

  // Reset current path when repo changes
  useEffect(() => {
    setCurrentPath(repoPath);
  }, [repoPath]);

  // Load directory contents when path changes
  useEffect(() => {
    const loadDirectory = async () => {
      if (!currentPath) {
        setFiles([]);
        return;
      }

      setFiles(null); // Show loading state
      setError(null);

      try {
        const result = await ListDirectory(currentPath);
        if (result.error) {
          setError(result.error);
          setFiles([]);
        } else {
          setFiles(toChonkyFiles(result.entries || []));
        }
      } catch (err) {
        console.error('Failed to load directory:', err);
        setError('Failed to load directory');
        setFiles([]);
      }
    };

    loadDirectory();
  }, [currentPath]);

  // Build folder chain for breadcrumb navigation
  const folderChain = useMemo(
    () => buildFolderChain(currentPath, repoPath),
    [currentPath, repoPath]
  );

  // Handle file actions (open folder, open file, etc.)
  const handleFileAction = useCallback(
    async (data) => {
      if (data.id === ChonkyActions.OpenFiles.id) {
        const { targetFile, files: selectedFiles } = data.payload;
        const fileToOpen = targetFile ?? selectedFiles[0];

        if (!fileToOpen) return;

        if (fileToOpen.isDir) {
          // Navigate into folder
          setCurrentPath(fileToOpen.id);
        } else {
          // Open file with system default application
          try {
            const result = await OpenFile(fileToOpen.id);
            if (!result.success) {
              console.error('Failed to open file:', result.error);
            }
          } catch (err) {
            console.error('Failed to open file:', err);
          }
        }
      }
    },
    []
  );

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden chonky-container">
      <FileBrowser
        files={files}
        folderChain={folderChain}
        onFileAction={handleFileAction}
        defaultFileViewActionId={ChonkyActions.EnableListView.id}
        disableDragAndDrop={true}
        disableDefaultFileActions={[
          ChonkyActions.ToggleHiddenFiles.id,
          ChonkyActions.SelectAllFiles.id,
          ChonkyActions.ClearSelection.id,
          ChonkyActions.ToggleShowFoldersFirst.id,
          ChonkyActions.SortFilesByName.id,
          ChonkyActions.SortFilesBySize.id,
          ChonkyActions.SortFilesByDate.id,
        ]}
      >
        <FileNavbar />
        <FileToolbar />
        <FileList />
        <FileContextMenu />
      </FileBrowser>
    </div>
  );
}

export default memo(ChonkyFileBrowser);
