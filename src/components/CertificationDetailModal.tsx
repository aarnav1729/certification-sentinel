import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Certification } from '@/lib/db';
import { formatDate } from '@/lib/expiryUtils';
import { ExpiryBadge } from './ExpiryBadge';
import { StatusBadge } from './StatusBadge';
import { TypeBadge } from './TypeBadge';
import { Separator } from '@/components/ui/separator';

interface CertificationDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certification: Certification | null;
}

export const CertificationDetailModal = ({
  open,
  onOpenChange,
  certification,
}: CertificationDetailModalProps) => {
  if (!certification) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-3">
            {certification.plant}
            <TypeBadge type={certification.type} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="flex flex-wrap gap-3">
            <StatusBadge status={certification.status} />
            {certification.validityUpto && (
              <ExpiryBadge validityUpto={certification.validityUpto} />
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">R-No / ID</h4>
              <p className="font-mono">{certification.rNo}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">S.No</h4>
              <p>{certification.sno}</p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Address</h4>
            <p className="text-sm">{certification.address || '-'}</p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Validity From</h4>
              <p>{formatDate(certification.validityFrom)}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Validity Upto</h4>
              <p>{formatDate(certification.validityUpto)}</p>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Model List</h4>
            <pre className="text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap font-mono">
              {certification.modelList || '-'}
            </pre>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Standard</h4>
            <pre className="text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap">
              {certification.standard || '-'}
            </pre>
          </div>

          {certification.action && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Action / Notes</h4>
              <p className="text-sm bg-accent p-3 rounded-lg">{certification.action}</p>
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-6 text-xs text-muted-foreground">
            <div>
              <span>Created: </span>
              <span>{new Date(certification.createdAt).toLocaleString()}</span>
            </div>
            <div>
              <span>Updated: </span>
              <span>{new Date(certification.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
