import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useCertifications } from "@/hooks/useCertifications";
import { CertificationTable } from "@/components/CertificationTable";
import { CertificationModal } from "@/components/CertificationModal";
import { CertificationDetailModal } from "@/components/CertificationDetailModal";
import { AppHeader } from "@/components/AppHeader";
import { Certification } from "@/lib/db";
import { getExpiryStatus } from "@/lib/expiryUtils";

const Index = () => {
  const { certifications, loading, add, update, remove } = useCertifications();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editCert, setEditCert] = useState<Certification | null>(null);
  const [viewCert, setViewCert] = useState<Certification | null>(null);

  const SOON = new Set([
    "6-months",
    "3-months",
    "month",
    "2-weeks",
    "week",
    "day-before",
  ]);

  const isActive = (s: any) =>
    String(s || "")
      .trim()
      .toLowerCase() === "active";

  const stats = {
    total: certifications.length,

    // Active if ANY of status / bisStatus / iecStatus is Active
    active: certifications.filter((c) =>
      [c.status, (c as any).bisStatus, (c as any).iecStatus].some(isActive)
    ).length,

    // Expiring Soon if ANY of validityUpto / bisValidityUpto / iecValidityUpto is in soon buckets
    expiringSoon: certifications.filter((c) => {
      const candidates = [
        (c as any).validityUpto,
        (c as any).bisValidityUpto,
        (c as any).iecValidityUpto,
      ].filter(Boolean);

      return candidates.some((v) => SOON.has(getExpiryStatus(v)));
    }).length,

    // Overdue if ANY of validityUpto / bisValidityUpto / iecValidityUpto is overdue
    overdue: certifications.filter((c) => {
      const candidates = [
        (c as any).validityUpto,
        (c as any).bisValidityUpto,
        (c as any).iecValidityUpto,
      ].filter(Boolean);

      return candidates.some((v) => getExpiryStatus(v) === "overdue");
    }).length,
  };

  const handleCreate = async (
    data: Omit<Certification, "id" | "createdAt" | "updatedAt">
  ) => {
    await add(data);
  };

  const handleUpdate = async (
    data: Omit<Certification, "id" | "createdAt" | "updatedAt">
  ) => {
    if (editCert) {
      await update(editCert.id, data);
      setEditCert(null);
    }
  };

  const nextSno =
    certifications.length > 0
      ? Math.max(...certifications.map((c) => c.sno)) + 1
      : 1;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold mb-2">
              Certification Dashboard
            </h1>
            <p className="text-muted-foreground">
              Track and manage your solar panel certifications with automated
              expiry alerts.
            </p>
          </div>
          <Button
            onClick={() => setCreateModalOpen(true)}
            variant="hero"
            size="lg"
            className="shrink-0"
          >
            <Plus className="h-5 w-5" />
            Create New
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total Certifications"
            value={stats.total}
            color="primary"
          />
          <StatCard label="Active" value={stats.active} color="success" />
          <StatCard
            label="Expiring Soon"
            value={stats.expiringSoon}
            color="warning"
          />
          <StatCard label="Overdue" value={stats.overdue} color="destructive" />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <CertificationTable
            certifications={certifications}
            onEdit={setEditCert}
            onDelete={remove}
            onView={setViewCert}
          />
        )}
      </main>

      {/* Modals */}
      <CertificationModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSave={handleCreate}
        nextSno={nextSno}
      />

      <CertificationModal
        open={!!editCert}
        onOpenChange={(open) => !open && setEditCert(null)}
        certification={editCert || undefined}
        onSave={handleUpdate}
        nextSno={nextSno}
      />

      <CertificationDetailModal
        open={!!viewCert}
        onOpenChange={(open) => !open && setViewCert(null)}
        certification={viewCert}
      />
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: number;
  color: "primary" | "success" | "warning" | "destructive";
}

const StatCard = ({ label, value, color }: StatCardProps) => {
  const bgColors = {
    primary: "bg-primary/10 border-primary/20",
    success: "bg-success/10 border-success/20",
    warning: "bg-warning/10 border-warning/20",
    destructive: "bg-destructive/10 border-destructive/20",
  };

  const textColors = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };

  return (
    <div className={`rounded-xl border p-4 ${bgColors[color]} animate-fade-in`}>
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className={`text-3xl font-display font-bold ${textColors[color]}`}>
        {value}
      </p>
    </div>
  );
};

export default Index;
