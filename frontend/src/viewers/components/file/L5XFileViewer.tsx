import { lazy, memo } from 'react';
import type { ViewerProps } from '../../registry/viewer-registry';
import L5XModeViewer from '../shared/L5XModeViewer';
import TextViewer from './TextViewer';

const L5XViewer = lazy(() => import('./L5XViewer'));

function L5XFileViewer(props: ViewerProps): JSX.Element {
  return (
    <L5XModeViewer
      key={props.filePath}
      filePath={props.filePath}
      pretty={<L5XViewer {...props} />}
      raw={<TextViewer {...props} />}
    />
  );
}

export default memo(L5XFileViewer);
