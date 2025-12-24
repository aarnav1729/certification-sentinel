import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Certification } from '@/lib/db';
import { toast } from 'sonner';

interface CertificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certification?: Certification;
  onSave: (data: Omit<Certification, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  nextSno: number;
}

export const CertificationModal = ({
  open,
  onOpenChange,
  certification,
  onSave,
  nextSno,
}: CertificationModalProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    sno: certification?.sno || nextSno,
    plant: certification?.plant || '',
    address: certification?.address || '',
    rNo: certification?.rNo || '',
    type: certification?.type || 'BIS' as 'BIS' | 'IEC',
    status: certification?.status || 'Pending' as Certification['status'],
    modelList: certification?.modelList || '',
    standard: certification?.standard || '',
    validityFrom: certification?.validityFrom || '',
    validityUpto: certification?.validityUpto || '',
    renewalStatus: certification?.renewalStatus || '',
    alarmAlert: certification?.alarmAlert || '',
    action: certification?.action || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.plant || !formData.rNo) {
      toast.error('Please fill in required fields');
      return;
    }

    setLoading(true);
    try {
      await onSave(formData);
      toast.success(certification ? 'Certification updated' : 'Certification created');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save certification');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {certification ? 'Edit Certification' : 'Create New Certification'}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sno">S.No</Label>
              <Input
                id="sno"
                type="number"
                value={formData.sno}
                onChange={(e) => setFormData({ ...formData, sno: parseInt(e.target.value) || 0 })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="plant">Plant *</Label>
              <Input
                id="plant"
                value={formData.plant}
                onChange={(e) => setFormData({ ...formData, plant: e.target.value })}
                placeholder="e.g., PEPPL (P2)"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Full address"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rNo">R-No / ID *</Label>
              <Input
                id="rNo"
                value={formData.rNo}
                onChange={(e) => setFormData({ ...formData, rNo: e.target.value })}
                placeholder="e.g., R-63002356"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: 'BIS' | 'IEC') => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BIS">BIS</SelectItem>
                  <SelectItem value="IEC">IEC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value: Certification['status']) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Under process">Under Process</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="modelList">Model List</Label>
            <Textarea
              id="modelList"
              value={formData.modelList}
              onChange={(e) => setFormData({ ...formData, modelList: e.target.value })}
              placeholder="List of models..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="standard">Standard</Label>
            <Textarea
              id="standard"
              value={formData.standard}
              onChange={(e) => setFormData({ ...formData, standard: e.target.value })}
              placeholder="Applicable standards..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="validityFrom">Validity From</Label>
              <Input
                id="validityFrom"
                type="date"
                value={formData.validityFrom}
                onChange={(e) => setFormData({ ...formData, validityFrom: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="validityUpto">Validity Upto</Label>
              <Input
                id="validityUpto"
                type="date"
                value={formData.validityUpto}
                onChange={(e) => setFormData({ ...formData, validityUpto: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="action">Action / Notes</Label>
            <Textarea
              id="action"
              value={formData.action}
              onChange={(e) => setFormData({ ...formData, action: e.target.value })}
              placeholder="Any action items or notes..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="hero" disabled={loading}>
              {loading ? 'Saving...' : certification ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
