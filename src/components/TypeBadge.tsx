import { Badge } from '@/components/ui/badge';
import { Certification } from '@/lib/db';

interface TypeBadgeProps {
  type: Certification['type'];
}

export const TypeBadge = ({ type }: TypeBadgeProps) => {
  return (
    <Badge 
      variant={type === 'BIS' ? 'default' : 'secondary'} 
      className="animate-fade-in font-mono"
    >
      {type}
    </Badge>
  );
};
