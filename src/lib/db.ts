// src/lib/db.ts
// Switch from IndexedDB to Backend API (MSSQL)
export type CertificationStatus =
  | "Active"
  | "Under process"
  | "Expired"
  | "Pending";

export interface Certification {
  id: string;
  sno: number;
  plant: string;
  address: string;

  // derived overall type
  type: "BIS" | "IEC" | "BIS & IEC";

  // ✅ NEW (row-wise) fields (single record == one type: BIS or IEC)
  rNo?: string;
  status?: CertificationStatus;
  modelList?: string;
  standard?: string;
  validityFrom?: string; // YYYY-MM-DD
  validityUpto?: string; // YYYY-MM-DD
  renewalStatus?: string;
  alarmAlert?: string;
  action?: string;

  // BIS fields
  bisRNo?: string;
  bisStatus?: CertificationStatus;


  bisModelList?: string;
  bisStandard?: string;
  bisValidityFrom?: string; // YYYY-MM-DD
  bisValidityUpto?: string; // YYYY-MM-DD
  bisRenewalStatus?: string;
  bisAlarmAlert?: string;
  bisAction?: string;

  // IEC fields
  iecRNo?: string;
  iecStatus?: CertificationStatus;

  iecModelList?: string;
  iecStandard?: string;
  iecValidityFrom?: string; // YYYY-MM-DD
  iecValidityUpto?: string; // YYYY-MM-DD
  iecRenewalStatus?: string;
  iecAlarmAlert?: string;
  iecAction?: string;

  // Attachment (optional; file stored in backend)
  hasAttachment?: boolean;
  attachmentName?: string;
  attachmentType?: string;

  createdAt: string;
  updatedAt: string;
}

export type CertificationAttachmentPayload = {
  name: string;
  type: string;
  base64: string; // raw base64 (no dataURL prefix)
};

export type CertificationUpsertPayload = {
  sno: number;
  plant: string;
  address?: string;
  type: "BIS" | "IEC" | "BIS & IEC";

  // ✅ row-wise fields (preferred)
  rNo?: string;
  status?: CertificationStatus;
  modelList?: string;
  standard?: string;
  validityFrom?: string; // YYYY-MM-DD
  validityUpto?: string; // YYYY-MM-DD
  renewalStatus?: string;
  alarmAlert?: string;
  action?: string;

  // ✅ legacy fields (kept for backwards compatibility / old rows)
  bisRNo?: string;
  bisStatus?: CertificationStatus;
  bisModelList?: string;
  bisStandard?: string;
  bisValidityFrom?: string;
  bisValidityUpto?: string;
  bisRenewalStatus?: string;
  bisAlarmAlert?: string;
  bisAction?: string;

  iecRNo?: string;
  iecStatus?: CertificationStatus;
  iecModelList?: string;
  iecStandard?: string;
  iecValidityFrom?: string;
  iecValidityUpto?: string;
  iecRenewalStatus?: string;
  iecAlarmAlert?: string;
  iecAction?: string;

  attachment?: CertificationAttachmentPayload;
  attachmentClear?: boolean;
};



export interface EmailRecipient {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  // backend returns updatedAt too; safe to keep optional
  updatedAt?: string;
}

export interface EmailLog {
  id: string;
  certificationId: string;
  recipientEmail: string;
  emailType: "reminder" | "overdue";
  milestone: string;
  sentAt: string;
  status: "sent" | "failed";
}

const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE_URL?.trim?.() ||
  window.location.origin;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (res.status === 204) return undefined as unknown as T;

  let payload: any = null;
  const text = await res.text();
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!res.ok) {
    const msg =
      (payload && (payload.error || payload.message)) ||
      `Request failed (${res.status})`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload as T;
}

/* ========================= Certifications ========================= */

export const getAllCertifications = async (): Promise<Certification[]> => {
  return api<Certification[]>("/api/certifications");
};

export const getCertification = async (
  id: string
): Promise<Certification | undefined> => {
  try {
    return await api<Certification>(
      `/api/certifications/${encodeURIComponent(id)}`
    );
  } catch (e: any) {
    if (e?.status === 404) return undefined;
    throw e;
  }
};

export const addCertification = async (
  cert: CertificationUpsertPayload
): Promise<Certification> => {
  return api<Certification>("/api/certifications", {
    method: "POST",
    body: JSON.stringify(cert),
  });
};

export const updateCertification = async (
  id: string,
  updates: Partial<Certification> & {
    attachment?: CertificationAttachmentPayload;
    attachmentClear?: boolean;
  }
): Promise<Certification | undefined> => {
  try {
    return await api<Certification>(
      `/api/certifications/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      }
    );
  } catch (e: any) {
    if (e?.status === 404) return undefined;
    throw e;
  }
};

export const deleteCertification = async (id: string): Promise<void> => {
  await api<void>(`/api/certifications/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

/* ========================= Attachment (download) ========================= */

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
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

export const downloadCertificationAttachment = async (
  id: string
): Promise<{ blob: Blob; filename: string | null; mime: string | null }> => {
  const url = `${API_BASE}/api/certifications/${encodeURIComponent(
    id
  )}/attachment`;

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Failed to download attachment (${res.status})`);
  }

  const mime = res.headers.get("content-type");
  const disposition = res.headers.get("content-disposition");
  const filename = filenameFromDisposition(disposition);
  const blob = await res.blob();

  return { blob, filename, mime };
};

export const removeCertificationAttachment = async (
  id: string
): Promise<void> => {
  await api<void>(`/api/certifications/${encodeURIComponent(id)}/attachment`, {
    method: "DELETE",
  });
};

/* ========================= Email Recipients ========================= */

export const getAllRecipients = async (): Promise<EmailRecipient[]> => {
  return api<EmailRecipient[]>("/api/recipients");
};

export const addRecipient = async (
  recipient: Omit<EmailRecipient, "id" | "createdAt">
): Promise<EmailRecipient> => {
  return api<EmailRecipient>("/api/recipients", {
    method: "POST",
    body: JSON.stringify(recipient),
  });
};

export const updateRecipient = async (
  id: string,
  updates: Partial<EmailRecipient>
): Promise<EmailRecipient | undefined> => {
  try {
    return await api<EmailRecipient>(
      `/api/recipients/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      }
    );
  } catch (e: any) {
    if (e?.status === 404) return undefined;
    throw e;
  }
};

export const deleteRecipient = async (id: string): Promise<void> => {
  await api<void>(`/api/recipients/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

/* ========================= Email Logs ========================= */

export const getEmailLogsForCertification = async (
  certificationId: string
): Promise<EmailLog[]> => {
  const q = new URLSearchParams({ certificationId }).toString();
  return api<EmailLog[]>(`/api/email-logs?${q}`);
};

// logs are server-managed; keep function so any accidental imports don’t break builds
export const addEmailLog = async (
  _log: Omit<EmailLog, "id">
): Promise<EmailLog> => {
  throw new Error(
    "Email logs are server-managed. Use /api/email-logs (read-only)."
  );
};

/* ========================= Seed ========================= */
// Backend seeds on startup (seedIfEmpty). Keep this as no-op so hooks don’t need changes.
export const seedInitialData = async (): Promise<void> => {
  return;
};

/* ========================= Optional: trigger notifications ========================= */
export const runNotificationsNow = async (): Promise<{
  ok: boolean;
  sent: number;
  skipped: number;
}> => {
  return api<{ ok: boolean; sent: number; skipped: number }>(
    "/api/notifications/run",
    {
      method: "POST",
    }
  );
};
