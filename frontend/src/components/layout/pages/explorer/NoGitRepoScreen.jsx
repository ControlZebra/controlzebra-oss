/**
 * NoGitRepoScreen - Warning screen when a folder is opened but has no git initialized.
 * Provides a friendly message and option to initialize version control.
 */
import { memo } from 'react';
import { AlertTriangle, GitBranch } from 'lucide-react';
import { ICON_SIZES } from '../../../../constants';
import { Button } from '../../../ui';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../ui/card';

// Memoized icon styles
const iconStyleLg = { width: 48, height: 48 };
const iconStyleSm = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

function NoGitRepoScreen({ folderName, onInitialize, isLoading }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-screen-enter">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
            <AlertTriangle style={iconStyleLg} className="text-yellow-500" />
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
            onClick={onInitialize} 
            loading={isLoading}
            className="gap-2"
          >
            <GitBranch style={iconStyleSm} />
            Start Tracking Changes
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default memo(NoGitRepoScreen);
