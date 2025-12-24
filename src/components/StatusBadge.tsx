import { Badge } from '@/components/ui/badge';
import { Certification } from '@/lib/db';

interface StatusBadgeProps {
  status: Certification['status'];
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const variants: Record<Certification['status'], 'success' | 'warning' | 'destructive' | 'muted'> = {
    'Active': 'success',
    'Under process': 'warning',
    'Expired': 'destructive',
    'Pending': 'muted',
  };

  return (
    <Badge variant={variants[status]} className="animate-fade-in">
      {status}
    </Badge>
  );
};
