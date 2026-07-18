import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes, TableHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

/**
 * Shared data table primitives for consistent, modern CRUD tables.
 * Wrap in `Card` for the bordered/elevated surface.
 *
 * Usage:
 *   <Card className="overflow-hidden">
 *     <Table>
 *       <TableHeader>...</TableHeader>
 *       <TableBody>...</TableBody>
 *     </Table>
 *   </Card>
 */
export function Table({ children, className, ...props }: TableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <thead className={cn('bg-slate-50/80', className)}>{children}</thead>;
}

export function TableBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tbody className={cn('divide-y divide-slate-100', className)}>{children}</tbody>
  );
}

export function TableRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn('transition-colors hover:bg-slate-50/60', className)}>{children}</tr>
  );
}

interface TableColumnProps extends ThHTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
}

export function TableColumn({ children, className, ...props }: TableColumnProps) {
  return (
    <th
      scope="col"
      className={cn(
        'px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
}

export function TableCell({ children, className, ...props }: TableCellProps) {
  return (
    <td className={cn('px-5 py-3.5 text-sm text-slate-700', className)} {...props}>
      {children}
    </td>
  );
}