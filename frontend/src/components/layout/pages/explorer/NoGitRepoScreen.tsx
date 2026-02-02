/**
 * NoGitRepoScreen - Warning screen when a folder is opened but has no git initialized.
 * Provides a friendly message and option to initialize version control.
 * When "Start Tracking Changes" is clicked, transitions to the GitInitForm.
 */
import { memo, useState, useCallback, useEffect, type CSSProperties } from 'react';
import { AlertTriangle, GitBranch } from 'lucide-react';
import { ICON_STYLES } from '../../../../lib/gitHelpers';
import { Button } from '../../../ui';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../ui/card';
import GitInitForm from './GitInitForm';
import type { GitInitOptions } from '../../../../context/RepoContext.types';

// ============================================================================
// Types
// ============================================================================

interface NoGitRepoScreenProps {
  folderName: string;
  onInitialize?: (options?: GitInitOptions) => Promise<boolean>;
  isLoading?: boolean;
}

// Internal type for GitInitForm data (compatible with GitInitOptions)
interface GitInitFormData {
  type: 'clone' | 'init';
  [key: string]: unknown;
}

interface WarningCardProps {
  folderName: string;
  onStartTracking: () => void;
  isFading: boolean;
}

// ============================================================================
// Components
// ============================================================================

/**
 * WarningCard - The initial warning state showing no version control message.
 */
const WarningCard = memo(function WarningCard({ folderName, onStartTracking, isFading }: WarningCardProps): JSX.Element {
  return (
    <div 
      className={`flex-1 flex items-center justify-center p-8 transition-opacity duration-500 overflow-y-auto ${
        isFading ? 'opacity-0' : 'opacity-100 animate-screen-enter'
      }`}
    >
      <Card className="max-w-md w-full">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
            <AlertTriangle style={ICON_STYLES.xxl as CSSProperties} className="text-yellow-500" />
          </div>
          <CardTitle className="text-xl">No Version Control</CardTitle>
          <CardDescription className="text-base mt-2">
            <span className="font-medium text-theme-primary">{folderName}</span> is not being tracked
          </CardDescription>
        </CardHeader>
        
        <CardContent className="text-center text-theme-secondary text-sm">
          <p>
            Version control helps you track changes, undo mistakes, and safely collaborate. 
            Without it, you can't save checkpoints or sync your work.
          </p>
        </CardContent>
        
        <CardFooter className="flex justify-center pt-2">
          <Button 
            onClick={onStartTracking} 
            className="gap-2"
          >
            <GitBranch style={ICON_STYLES.sm as CSSProperties} />
            Start Tracking Changes
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
});

function NoGitRepoScreen({ folderName, onInitialize, isLoading = false }: NoGitRepoScreenProps): JSX.Element {
  const [showForm, setShowForm] = useState(false);
  const [isFading, setIsFading] = useState(false);

  // Reset to initial view when folder changes
  useEffect(() => {
    setShowForm(false);
    setIsFading(false);
  }, [folderName]);

  // Handle the transition from warning card to form
  const handleStartTracking = useCallback((): void => {
    setIsFading(true);
    // After fade animation completes (500ms), show the form
    setTimeout(() => {
      setShowForm(true);
      setIsFading(false);
    }, 500);
  }, []);

  // Handle going back from the form to the warning card
  const handleBackFromForm = useCallback((): void => {
    setIsFading(true);
    setTimeout(() => {
      setShowForm(false);
      setIsFading(false);
    }, 500);
  }, []);

  // Handle form submission - convert form data to GitInitOptions
  const handleFormSubmit = useCallback((data: GitInitFormData): void => {
    console.log('Repository initialization data:', data);
    // Pass the form data as GitInitOptions to the initialize function
    onInitialize?.(data as GitInitOptions);
  }, [onInitialize]);

  // Show the initialization form
  if (showForm) {
    return (
      <div className={`flex-1 overflow-y-auto transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
        <GitInitForm
          folderName={folderName}
          onBack={handleBackFromForm}
          onSubmit={handleFormSubmit}
          isLoading={isLoading}
        />
      </div>
    );
  }

  // Show the warning card
  return (
    <WarningCard
      folderName={folderName}
      onStartTracking={handleStartTracking}
      isFading={isFading}
    />
  );
}

export default memo(NoGitRepoScreen);
