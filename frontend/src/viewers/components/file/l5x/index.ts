/**
 * L5X Viewer internal components
 */
export { TabBar } from './TabBar';
export { DataTypeTable, type DataTypeTableProps } from './DataTypeTable';
export { 
  useTabs, 
  type Tab, 
  type TabData, 
  type TabType, 
  generateTabId,
  getCachedTabState,
  clearCachedTabState,
  clearAllTabStates,
} from './useTabs';
