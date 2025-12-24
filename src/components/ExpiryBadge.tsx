import { Badge } from '@/components/ui/badge';
import { getExpiryStatus, getExpiryLabel, getExpiryColor } from '@/lib/expiryUtils';
import { AlertCircle, Clock, CheckCircle2 } from 'lucide-react';

interface ExpiryBadgeProps {
  validityUpto: string;
}

export const ExpiryBadge = ({ validityUpto }: ExpiryBadgeProps) => {
  const status = getExpiryStatus(validityUpto);
  const label = getExpiryLabel(status);
  const color = getExpiryColor(status);

  const Icon = status === 'overdue' || status === 'day-before' || status === 'week' 
    ? AlertCircle 
    : status === 'safe' 
    ? CheckCircle2 
    : Clock;

  return (
    <Badge variant={color} className="gap-1 animate-fade-in">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
};
