import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppHeader } from "@/components/AppHeader";
import { useEmailRecipients } from "@/hooks/useEmailRecipients";
import { EmailRecipient } from "@/lib/db";
import { Plus, Pencil, Trash2, Mail, Bell, Clock } from "lucide-react";
import { toast } from "sonner";

const Settings = () => {
  const { recipients, loading, add, update, remove } = useEmailRecipients();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editRecipient, setEditRecipient] = useState<EmailRecipient | null>(
    null
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await remove(deleteId);
      toast.success("Recipient deleted");
    } catch {
      toast.error("Failed to delete recipient");
    } finally {
      setDeleteId(null);
    }
  };

  const handleToggleActive = async (recipient: EmailRecipient) => {
    try {
      await update(recipient.id, { isActive: !recipient.isActive });
      toast.success(
        recipient.isActive ? "Recipient deactivated" : "Recipient activated"
      );
    } catch {
      toast.error("Failed to update recipient");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">
            Email Settings
          </h1>
          <p className="text-muted-foreground">
            Configure email recipients and notification preferences for
            certification expiry alerts.
          </p>
        </div>

        {/* Email Schedule Info */}
        <Card className="mb-8 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Notification Schedule
            </CardTitle>
            <CardDescription>
              Automatic email reminders are sent at these intervals before
              certification expiry:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {[
                "6 months",
                "3 months",
                "1 month",
                "2 weeks",
                "1 week",
                "1 day",
              ].map((interval) => (
                <div
                  key={interval}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border"
                >
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{interval} before</span>
                </div>
              ))}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                <Mail className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium text-destructive">
                  Daily after expiry
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recipients Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Email Recipients</CardTitle>
              <CardDescription>
                Manage who receives certification expiry notifications.
              </CardDescription>
            </div>
            <Button onClick={() => setAddModalOpen(true)} variant="hero">
              <Plus className="h-4 w-4" />
              Add Recipient
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : recipients.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>No recipients added yet.</p>
                <p className="text-sm">
                  Add email recipients to receive certification expiry
                  notifications.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map((recipient, index) => (
                    <TableRow
                      key={recipient.id}
                      className="animate-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <TableCell className="font-medium">
                        {recipient.name}
                      </TableCell>
                      <TableCell>{recipient.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.role}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={recipient.isActive}
                          onCheckedChange={() => handleToggleActive(recipient)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditRecipient(recipient)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(recipient.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Add/Edit Modal */}
      <RecipientModal
        open={addModalOpen || !!editRecipient}
        onOpenChange={(open) => {
          if (!open) {
            setAddModalOpen(false);
            setEditRecipient(null);
          }
        }}
        recipient={editRecipient}
        onSave={async (data) => {
          if (editRecipient) {
            await update(editRecipient.id, data);
            toast.success("Recipient updated");
          } else {
            await add({ ...data, isActive: true });
            toast.success("Recipient added");
          }
          setAddModalOpen(false);
          setEditRecipient(null);
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recipient</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this recipient from receiving all certification
              notifications.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface RecipientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipient: EmailRecipient | null;
  onSave: (data: {
    name: string;
    email: string;
    role: string;
  }) => Promise<void>;
}

const RecipientModal = ({
  open,
  onOpenChange,
  recipient,
  onSave,
}: RecipientModalProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: recipient?.name || "",
    email: recipient?.email || "",
    role: recipient?.role || "",
  });

  // Reset form when modal opens with different recipient
  useEffect(() => {
    setFormData({
      name: recipient?.name || "",
      email: recipient?.email || "",
      role: recipient?.role || "",
    });
  }, [recipient, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      toast.error("Please fill in required fields");
      return;
    }
    setLoading(true);
    try {
      await onSave(formData);
      setFormData({ name: "", email: "", role: "" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">
            {recipient ? "Edit Recipient" : "Add Recipient"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="John Doe"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="john@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Input
              id="role"
              value={formData.role}
              onChange={(e) =>
                setFormData({ ...formData, role: e.target.value })
              }
              placeholder="e.g., Compliance Manager"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="hero" disabled={loading}>
              {loading ? "Saving..." : recipient ? "Update" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default Settings;
