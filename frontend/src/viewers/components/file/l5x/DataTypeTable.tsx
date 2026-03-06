/**
 * DataTypeTable - Displays UDT (User Defined Type) structure members
 * Adapted from ladder-visualizer demo
 */
import { memo } from 'react';
import type { NormalizedDataType } from 'ladder-visualizer';

interface DataTypeTableProps {
  dataType: NormalizedDataType;
}

export const DataTypeTable = memo(function DataTypeTable({ dataType }: DataTypeTableProps) {
  const members = dataType.members || [];

  if (members.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-theme-secondary">
        <p>This is a primitive data type with no member structure.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-theme-elevated">
          <tr className="border-b border-theme-default">
            <th className="text-left px-3 py-2 font-medium text-theme-secondary">Name</th>
            <th className="text-left px-3 py-2 font-medium text-theme-secondary">Data Type</th>
            <th className="text-center px-3 py-2 font-medium text-theme-secondary">Dim</th>
            <th className="text-left px-3 py-2 font-medium text-theme-secondary">Style</th>
            <th className="text-left px-3 py-2 font-medium text-theme-secondary">External Access</th>
            <th className="text-center px-3 py-2 font-medium text-theme-secondary">Hidden</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member, index) => (
            <tr 
              key={member.name || index}
              className="border-b border-theme-default hover:bg-theme-muted"
            >
              <td className="px-3 py-1.5 font-mono text-theme-primary">{member.name}</td>
              <td className="px-3 py-1.5 font-mono text-theme-secondary">{member.dataType}</td>
              <td className="px-3 py-1.5 text-center font-mono text-theme-secondary">
                {member.dimension && member.dimension > 0 ? `[${member.dimension}]` : ''}
              </td>
              <td className="px-3 py-1.5 text-theme-secondary">{member.radix || '-'}</td>
              <td className="px-3 py-1.5 text-theme-secondary">{member.externalAccess || '-'}</td>
              <td className="px-3 py-1.5 text-center text-theme-secondary">
                {member.hidden ? 'Yes' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
