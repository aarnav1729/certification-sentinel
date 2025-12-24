import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Certification,
  CertificationAttachmentPayload,
  CertificationUpsertPayload,
  downloadCertificationAttachment,
} from "@/lib/db";
import { toast } from "sonner";

interface CertificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certification?: Certification;
  onSave: (data: CertificationUpsertPayload) => Promise<void>;
  nextSno: number;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const res = String(reader.result || "");
      // reader.result is a dataURL: data:<mime>;base64,<base64>
      const comma = res.indexOf(",");
      if (comma === -1) return reject(new Error("Invalid file encoding"));
      resolve(res.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  // Content-Disposition: attachment; filename="abc.pdf"
  const m =
    /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(
      disposition
    );
  const raw = (m?.[1] || m?.[2] || m?.[3] || "").trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export const CertificationModal = ({
  open,
  onOpenChange,
  certification,
  onSave,
  nextSno,
}: CertificationModalProps) => {
  const [loading, setLoading] = useState(false);

  const initialForm = useMemo(() => {
    return {
      sno: certification?.sno ?? nextSno,
      plant: certification?.plant ?? "",
      address: certification?.address ?? "",
      rNo: certification?.rNo ?? "",
      type: (certification?.type ?? "BIS") as "BIS" | "IEC",
      status: (certification?.status ?? "Pending") as Certification["status"],
      modelList: certification?.modelList ?? "",
      standard: certification?.standard ?? "",
      validityFrom: certification?.validityFrom ?? "",
      validityUpto: certification?.validityUpto ?? "",
      renewalStatus: certification?.renewalStatus ?? "",
      alarmAlert: certification?.alarmAlert ?? "",
      action: certification?.action ?? "",
    };
  }, [certification, nextSno]);

  const [formData, setFormData] = useState(initialForm);

  // Attachment upload (base64) + optional clear existing
  const [attachment, setAttachment] =
    useState<CertificationAttachmentPayload | null>(null);
  const [attachmentClear, setAttachmentClear] = useState(false);

  // ✅ CRITICAL FIX: when you click Edit on another row, props change but state won’t unless we sync.
  useEffect(() => {
    if (!open) return;
    setFormData(initialForm);
    setAttachment(null);
    setAttachmentClear(false);
  }, [open, initialForm]);
  

  const hasExistingAttachment = Boolean(
    certification?.hasAttachment && certification?.attachmentName
  );

  const handleDownloadExisting = async () => {
    if (!certification?.id) return;
    try {
      const res = await downloadCertificationAttachment(certification.id);
      const blobUrl = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = res.filename || certification.attachmentName || "attachment";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
    } catch (e: any) {
      toast.error(e?.message || "Failed to download attachment");
    }
  };

  const handleFileChange = async (file: File | null) => {
    if (!file) {
      setAttachment(null);
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      setAttachment({
        name: file.name,
        type: file.type || "application/octet-stream",
        base64,
      });
      setAttachmentClear(false); // replacing, not clearing
    } catch (e: any) {
      toast.error(e?.message || "Failed to read file");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.plant || !formData.rNo) {
      toast.error("Please fill in required fields");
      return;
    }

    setLoading(true);
    try {
      const payload: CertificationUpsertPayload = {
        ...formData,
        attachment: attachment || undefined,
        attachmentClear: attachmentClear || undefined,
      };

      await onSave(payload);
      toast.success(
        certification ? "Certification updated" : "Certification created"
      );
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || "Failed to save certification");
    } finally {
      setLoading(false);
    }
  };

  const onRemoveExistingAttachment = () => {
    setAttachment(null);
    setAttachmentClear(true);
    toast.message("Attachment will be removed when you click Save");
  };

  const onUndoRemoveAttachment = () => {
    setAttachmentClear(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {certification ? "Edit Certification" : "Create New Certification"}
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
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    sno: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="plant">Plant *</Label>
              <Input
                id="plant"
                value={formData.plant}
                onChange={(e) =>
                  setFormData({ ...formData, plant: e.target.value })
                }
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
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
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
                onChange={(e) =>
                  setFormData({ ...formData, rNo: e.target.value })
                }
                placeholder="e.g., R-63002356"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: "BIS" | "IEC") =>
                  setFormData({ ...formData, type: value })
                }
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
              onValueChange={(value: Certification["status"]) =>
                setFormData({ ...formData, status: value })
              }
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
              onChange={(e) =>
                setFormData({ ...formData, modelList: e.target.value })
              }
              placeholder="List of models..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="standard">Standard</Label>
            <Textarea
              id="standard"
              value={formData.standard}
              onChange={(e) =>
                setFormData({ ...formData, standard: e.target.value })
              }
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
                onChange={(e) =>
                  setFormData({ ...formData, validityFrom: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="validityUpto">Validity Upto</Label>
              <Input
                id="validityUpto"
                type="date"
                value={formData.validityUpto}
                onChange={(e) =>
                  setFormData({ ...formData, validityUpto: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="renewalStatus">Renewal Status</Label>
              <Input
                id="renewalStatus"
                value={formData.renewalStatus}
                onChange={(e) =>
                  setFormData({ ...formData, renewalStatus: e.target.value })
                }
                placeholder="e.g., Renewal initiated / date / remarks"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="alarmAlert">Alarm Alert</Label>
              <Input
                id="alarmAlert"
                value={formData.alarmAlert}
                onChange={(e) =>
                  setFormData({ ...formData, alarmAlert: e.target.value })
                }
                placeholder="e.g., - / Alert configured / rule"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="action">Action / Notes</Label>
            <Textarea
              id="action"
              value={formData.action}
              onChange={(e) =>
                setFormData({ ...formData, action: e.target.value })
              }
              placeholder="Any action items or notes..."
              rows={2}
            />
          </div>

          {/* Attachment */}
          <div className="space-y-2">
            <Label htmlFor="attachment">Attachment (optional)</Label>
            <Input
              id="attachment"
              type="file"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            />

            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-2">
              {hasExistingAttachment && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">
                        Current attachment
                      </div>
                      <div className="font-medium truncate">
                        {certification?.attachmentName}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadExisting}
                      >
                        Download
                      </Button>
                      {!attachmentClear ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={onRemoveExistingAttachment}
                        >
                          Remove
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={onUndoRemoveAttachment}
                        >
                          Undo Remove
                        </Button>
                      )}
                    </div>
                  </div>

                  {attachmentClear && (
                    <div className="text-xs text-destructive">
                      Attachment will be removed on Save.
                    </div>
                  )}
                </div>
              )}

              {attachment && (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      New attachment selected
                    </div>
                    <div className="font-medium truncate">
                      {attachment.name}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAttachment(null)}
                  >
                    Clear
                  </Button>
                </div>
              )}

              {!hasExistingAttachment && !attachment && (
                <div className="text-xs text-muted-foreground">
                  No attachment added.
                </div>
              )}
            </div>
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
              {loading ? "Saving..." : certification ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
