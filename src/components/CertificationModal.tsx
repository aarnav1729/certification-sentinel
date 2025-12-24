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
import { Checkbox } from "@/components/ui/checkbox";

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

function parseTypeFlags(t: string | undefined) {
  const s = String(t || "").toUpperCase();
  return {
    bis: s.includes("BIS"),
    iec: s.includes("IEC"),
  };
}

function flagsToType(bis: boolean, iec: boolean): "BIS" | "IEC" | "BIS & IEC" {
  if (bis && iec) return "BIS & IEC";
  if (iec) return "IEC";
  return "BIS";
}

type StatusValue = "Active" | "Under process" | "Expired" | "Pending";

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
      type: (certification?.type ?? "BIS") as "BIS" | "IEC" | "BIS & IEC",

      // BIS
      bisRNo: certification?.bisRNo ?? "",
      bisStatus: (certification?.bisStatus ?? "Pending") as StatusValue,
      bisModelList: certification?.bisModelList ?? "",
      bisStandard: certification?.bisStandard ?? "",
      bisValidityFrom: certification?.bisValidityFrom ?? "",
      bisValidityUpto: certification?.bisValidityUpto ?? "",
      bisRenewalStatus: certification?.bisRenewalStatus ?? "",
      bisAlarmAlert: certification?.bisAlarmAlert ?? "",
      bisAction: certification?.bisAction ?? "",

      // IEC
      iecRNo: certification?.iecRNo ?? "",
      iecStatus: (certification?.iecStatus ?? "Pending") as StatusValue,
      iecModelList: certification?.iecModelList ?? "",
      iecStandard: certification?.iecStandard ?? "",
      iecValidityFrom: certification?.iecValidityFrom ?? "",
      iecValidityUpto: certification?.iecValidityUpto ?? "",
      iecRenewalStatus: certification?.iecRenewalStatus ?? "",
      iecAlarmAlert: certification?.iecAlarmAlert ?? "",
      iecAction: certification?.iecAction ?? "",
    };
  }, [certification, nextSno]);

  const [formData, setFormData] = useState(initialForm);

  // Attachment upload (base64) + optional clear existing
  const [attachment, setAttachment] =
    useState<CertificationAttachmentPayload | null>(null);
  const [attachmentClear, setAttachmentClear] = useState(false);

  // ✅ when modal opens or row changes, sync state to props
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

    const flags = parseTypeFlags(formData.type);

    if (!String(formData.plant || "").trim()) {
      toast.error("Please fill in required fields");
      return;
    }
    if (flags.bis && !String(formData.bisRNo || "").trim()) {
      toast.error("Please enter BIS R-No / ID");
      return;
    }
    if (flags.iec && !String(formData.iecRNo || "").trim()) {
      toast.error("Please enter IEC R-No / ID");
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

  const StatusSelect = ({
    value,
    onChange,
  }: {
    value: StatusValue;
    onChange: (v: StatusValue) => void;
  }) => {
    return (
      <Select value={value} onValueChange={(v) => onChange(v as StatusValue)}>
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
    );
  };

  const flags = parseTypeFlags(formData.type);

  const renderModelList = () => {
    if (flags.bis && flags.iec) {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bisModelList">BIS Model List</Label>
            <Textarea
              id="bisModelList"
              value={formData.bisModelList}
              onChange={(e) =>
                setFormData({ ...formData, bisModelList: e.target.value })
              }
              placeholder="List of BIS models..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="iecModelList">IEC Model List</Label>
            <Textarea
              id="iecModelList"
              value={formData.iecModelList}
              onChange={(e) =>
                setFormData({ ...formData, iecModelList: e.target.value })
              }
              placeholder="List of IEC models..."
              rows={3}
            />
          </div>
        </div>
      );
    }

    if (flags.bis) {
      return (
        <div className="space-y-2">
          <Label htmlFor="bisModelList">BIS Model List</Label>
          <Textarea
            id="bisModelList"
            value={formData.bisModelList}
            onChange={(e) =>
              setFormData({ ...formData, bisModelList: e.target.value })
            }
            placeholder="List of BIS models..."
            rows={3}
          />
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <Label htmlFor="iecModelList">IEC Model List</Label>
        <Textarea
          id="iecModelList"
          value={formData.iecModelList}
          onChange={(e) =>
            setFormData({ ...formData, iecModelList: e.target.value })
          }
          placeholder="List of IEC models..."
          rows={3}
        />
      </div>
    );
  };

  const renderStandard = () => {
    if (flags.bis && flags.iec) {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bisStandard">BIS Standard</Label>
            <Textarea
              id="bisStandard"
              value={formData.bisStandard}
              onChange={(e) =>
                setFormData({ ...formData, bisStandard: e.target.value })
              }
              placeholder="Applicable BIS standards..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="iecStandard">IEC Standard</Label>
            <Textarea
              id="iecStandard"
              value={formData.iecStandard}
              onChange={(e) =>
                setFormData({ ...formData, iecStandard: e.target.value })
              }
              placeholder="Applicable IEC standards..."
              rows={2}
            />
          </div>
        </div>
      );
    }

    if (flags.bis) {
      return (
        <div className="space-y-2">
          <Label htmlFor="bisStandard">BIS Standard</Label>
          <Textarea
            id="bisStandard"
            value={formData.bisStandard}
            onChange={(e) =>
              setFormData({ ...formData, bisStandard: e.target.value })
            }
            placeholder="Applicable BIS standards..."
            rows={2}
          />
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <Label htmlFor="iecStandard">IEC Standard</Label>
        <Textarea
          id="iecStandard"
          value={formData.iecStandard}
          onChange={(e) =>
            setFormData({ ...formData, iecStandard: e.target.value })
          }
          placeholder="Applicable IEC standards..."
          rows={2}
        />
      </div>
    );
  };

  const renderValidity = () => {
    if (flags.bis && flags.iec) {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-sm font-medium">BIS Validity</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bisValidityFrom">From</Label>
                <Input
                  id="bisValidityFrom"
                  type="date"
                  value={formData.bisValidityFrom}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bisValidityFrom: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bisValidityUpto">Upto</Label>
                <Input
                  id="bisValidityUpto"
                  type="date"
                  value={formData.bisValidityUpto}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bisValidityUpto: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-sm font-medium">IEC Validity</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="iecValidityFrom">From</Label>
                <Input
                  id="iecValidityFrom"
                  type="date"
                  value={formData.iecValidityFrom}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      iecValidityFrom: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="iecValidityUpto">Upto</Label>
                <Input
                  id="iecValidityUpto"
                  type="date"
                  value={formData.iecValidityUpto}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      iecValidityUpto: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (flags.bis) {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bisValidityFrom">BIS Validity From</Label>
            <Input
              id="bisValidityFrom"
              type="date"
              value={formData.bisValidityFrom}
              onChange={(e) =>
                setFormData({ ...formData, bisValidityFrom: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bisValidityUpto">BIS Validity Upto</Label>
            <Input
              id="bisValidityUpto"
              type="date"
              value={formData.bisValidityUpto}
              onChange={(e) =>
                setFormData({ ...formData, bisValidityUpto: e.target.value })
              }
            />
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="iecValidityFrom">IEC Validity From</Label>
          <Input
            id="iecValidityFrom"
            type="date"
            value={formData.iecValidityFrom}
            onChange={(e) =>
              setFormData({ ...formData, iecValidityFrom: e.target.value })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="iecValidityUpto">IEC Validity Upto</Label>
          <Input
            id="iecValidityUpto"
            type="date"
            value={formData.iecValidityUpto}
            onChange={(e) =>
              setFormData({ ...formData, iecValidityUpto: e.target.value })
            }
          />
        </div>
      </div>
    );
  };

  const renderRenewalAndAlarm = () => {
    if (flags.bis && flags.iec) {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-sm font-medium">BIS Renewal / Alarm</div>
            <div className="space-y-2">
              <Label htmlFor="bisRenewalStatus">Renewal Status</Label>
              <Input
                id="bisRenewalStatus"
                value={formData.bisRenewalStatus}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bisRenewalStatus: e.target.value,
                  })
                }
                placeholder="e.g., Renewal initiated / date / remarks"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bisAlarmAlert">Alarm Alert</Label>
              <Input
                id="bisAlarmAlert"
                value={formData.bisAlarmAlert}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bisAlarmAlert: e.target.value,
                  })
                }
                placeholder="e.g., - / Alert configured / rule"
              />
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-sm font-medium">IEC Renewal / Alarm</div>
            <div className="space-y-2">
              <Label htmlFor="iecRenewalStatus">Renewal Status</Label>
              <Input
                id="iecRenewalStatus"
                value={formData.iecRenewalStatus}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    iecRenewalStatus: e.target.value,
                  })
                }
                placeholder="e.g., Renewal initiated / date / remarks"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iecAlarmAlert">Alarm Alert</Label>
              <Input
                id="iecAlarmAlert"
                value={formData.iecAlarmAlert}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    iecAlarmAlert: e.target.value,
                  })
                }
                placeholder="e.g., - / Alert configured / rule"
              />
            </div>
          </div>
        </div>
      );
    }

    if (flags.bis) {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bisRenewalStatus">BIS Renewal Status</Label>
            <Input
              id="bisRenewalStatus"
              value={formData.bisRenewalStatus}
              onChange={(e) =>
                setFormData({ ...formData, bisRenewalStatus: e.target.value })
              }
              placeholder="e.g., Renewal initiated / date / remarks"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bisAlarmAlert">BIS Alarm Alert</Label>
            <Input
              id="bisAlarmAlert"
              value={formData.bisAlarmAlert}
              onChange={(e) =>
                setFormData({ ...formData, bisAlarmAlert: e.target.value })
              }
              placeholder="e.g., - / Alert configured / rule"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="iecRenewalStatus">IEC Renewal Status</Label>
          <Input
            id="iecRenewalStatus"
            value={formData.iecRenewalStatus}
            onChange={(e) =>
              setFormData({ ...formData, iecRenewalStatus: e.target.value })
            }
            placeholder="e.g., Renewal initiated / date / remarks"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="iecAlarmAlert">IEC Alarm Alert</Label>
          <Input
            id="iecAlarmAlert"
            value={formData.iecAlarmAlert}
            onChange={(e) =>
              setFormData({ ...formData, iecAlarmAlert: e.target.value })
            }
            placeholder="e.g., - / Alert configured / rule"
          />
        </div>
      </div>
    );
  };

  const renderAction = () => {
    if (flags.bis && flags.iec) {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bisAction">BIS Action / Notes</Label>
            <Textarea
              id="bisAction"
              value={formData.bisAction}
              onChange={(e) =>
                setFormData({ ...formData, bisAction: e.target.value })
              }
              placeholder="Any BIS action items or notes..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="iecAction">IEC Action / Notes</Label>
            <Textarea
              id="iecAction"
              value={formData.iecAction}
              onChange={(e) =>
                setFormData({ ...formData, iecAction: e.target.value })
              }
              placeholder="Any IEC action items or notes..."
              rows={2}
            />
          </div>
        </div>
      );
    }

    if (flags.bis) {
      return (
        <div className="space-y-2">
          <Label htmlFor="bisAction">BIS Action / Notes</Label>
          <Textarea
            id="bisAction"
            value={formData.bisAction}
            onChange={(e) =>
              setFormData({ ...formData, bisAction: e.target.value })
            }
            placeholder="Any BIS action items or notes..."
            rows={2}
          />
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <Label htmlFor="iecAction">IEC Action / Notes</Label>
        <Textarea
          id="iecAction"
          value={formData.iecAction}
          onChange={(e) =>
            setFormData({ ...formData, iecAction: e.target.value })
          }
          placeholder="Any IEC action items or notes..."
          rows={2}
        />
      </div>
    );
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
            {/* R-No / ID (BIS/IEC conditional) */}
            <div className="space-y-2">
              {(() => {
                // BIS & IEC => show both
                if (flags.bis && flags.iec) {
                  return (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bisRNo">BIS R-No / ID *</Label>
                        <Input
                          id="bisRNo"
                          value={formData.bisRNo}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              bisRNo: e.target.value,
                            })
                          }
                          placeholder="e.g., R-63002356"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="iecRNo">IEC R-No / ID *</Label>
                        <Input
                          id="iecRNo"
                          value={formData.iecRNo}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              iecRNo: e.target.value,
                            })
                          }
                          placeholder="e.g., ID 1111296708"
                          required
                        />
                      </div>
                    </div>
                  );
                }

                // Single type => show only that one
                if (flags.bis) {
                  return (
                    <div className="space-y-2">
                      <Label htmlFor="bisRNo">BIS R-No / ID *</Label>
                      <Input
                        id="bisRNo"
                        value={formData.bisRNo}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            bisRNo: e.target.value,
                          })
                        }
                        placeholder="e.g., R-63002356"
                        required
                      />
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    <Label htmlFor="iecRNo">IEC R-No / ID *</Label>
                    <Input
                      id="iecRNo"
                      value={formData.iecRNo}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          iecRNo: e.target.value,
                        })
                      }
                      placeholder="e.g., ID 1111296708"
                      required
                    />
                  </div>
                );
              })()}
            </div>

            {/* Type checkboxes */}
            <div className="space-y-2">
              <Label>Type</Label>
              {(() => {
                const current = parseTypeFlags(formData.type);

                const setFlags = (next: { bis: boolean; iec: boolean }) => {
                  // enforce at least one selected
                  if (!next.bis && !next.iec) next.bis = true;

                  setFormData({
                    ...formData,
                    type: flagsToType(next.bis, next.iec),
                  });
                };

                return (
                  <div className="flex items-center gap-6 rounded-md border p-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={current.bis}
                        onCheckedChange={(v) =>
                          setFlags({ bis: Boolean(v), iec: current.iec })
                        }
                      />
                      <span className="text-sm">BIS</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={current.iec}
                        onCheckedChange={(v) =>
                          setFlags({ bis: current.bis, iec: Boolean(v) })
                        }
                      />
                      <span className="text-sm">IEC</span>
                    </label>

                    <div className="ml-auto text-xs text-muted-foreground">
                      Selected:{" "}
                      <span className="font-medium">{formData.type}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Status */}
          {(() => {
            if (flags.bis && flags.iec) {
              return (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>BIS Status</Label>
                    <StatusSelect
                      value={formData.bisStatus}
                      onChange={(v) =>
                        setFormData({ ...formData, bisStatus: v })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>IEC Status</Label>
                    <StatusSelect
                      value={formData.iecStatus}
                      onChange={(v) =>
                        setFormData({ ...formData, iecStatus: v })
                      }
                    />
                  </div>
                </div>
              );
            }

            if (flags.bis) {
              return (
                <div className="space-y-2">
                  <Label>BIS Status</Label>
                  <StatusSelect
                    value={formData.bisStatus}
                    onChange={(v) => setFormData({ ...formData, bisStatus: v })}
                  />
                </div>
              );
            }

            return (
              <div className="space-y-2">
                <Label>IEC Status</Label>
                <StatusSelect
                  value={formData.iecStatus}
                  onChange={(v) => setFormData({ ...formData, iecStatus: v })}
                />
              </div>
            );
          })()}

          {/* Model List */}
          {renderModelList()}

          {/* Standard */}
          {renderStandard()}

          {/* Validity (From/Upto) */}
          {renderValidity()}

          {/* Renewal + Alarm */}
          {renderRenewalAndAlarm()}

          {/* Action */}
          {renderAction()}

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
