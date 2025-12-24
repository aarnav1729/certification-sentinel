import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Certification {
  id: string;
  sno: number;
  plant: string;
  address: string;
  rNo: string;
  type: 'BIS' | 'IEC';
  status: 'Active' | 'Under process' | 'Expired' | 'Pending';
  modelList: string;
  standard: string;
  validityFrom: string;
  validityUpto: string;
  renewalStatus?: string;
  alarmAlert?: string;
  action?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailRecipient {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export interface EmailLog {
  id: string;
  certificationId: string;
  recipientEmail: string;
  emailType: 'reminder' | 'overdue';
  milestone: string;
  sentAt: string;
  status: 'sent' | 'failed';
}

interface CertificationDB extends DBSchema {
  certifications: {
    key: string;
    value: Certification;
    indexes: { 'by-plant': string; 'by-status': string };
  };
  emailRecipients: {
    key: string;
    value: EmailRecipient;
    indexes: { 'by-email': string };
  };
  emailLogs: {
    key: string;
    value: EmailLog;
    indexes: { 'by-certification': string };
  };
}

let dbPromise: Promise<IDBPDatabase<CertificationDB>> | null = null;

export const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<CertificationDB>('certification-tracker', 1, {
      upgrade(db) {
        const certStore = db.createObjectStore('certifications', { keyPath: 'id' });
        certStore.createIndex('by-plant', 'plant');
        certStore.createIndex('by-status', 'status');

        const recipientStore = db.createObjectStore('emailRecipients', { keyPath: 'id' });
        recipientStore.createIndex('by-email', 'email');

        const logStore = db.createObjectStore('emailLogs', { keyPath: 'id' });
        logStore.createIndex('by-certification', 'certificationId');
      },
    });
  }
  return dbPromise;
};

// Certification CRUD
export const getAllCertifications = async (): Promise<Certification[]> => {
  const db = await getDB();
  return db.getAll('certifications');
};

export const getCertification = async (id: string): Promise<Certification | undefined> => {
  const db = await getDB();
  return db.get('certifications', id);
};

export const addCertification = async (cert: Omit<Certification, 'id' | 'createdAt' | 'updatedAt'>): Promise<Certification> => {
  const db = await getDB();
  const newCert: Certification = {
    ...cert,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.add('certifications', newCert);
  return newCert;
};

export const updateCertification = async (id: string, updates: Partial<Certification>): Promise<Certification | undefined> => {
  const db = await getDB();
  const existing = await db.get('certifications', id);
  if (!existing) return undefined;
  
  const updated: Certification = {
    ...existing,
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  };
  await db.put('certifications', updated);
  return updated;
};

export const deleteCertification = async (id: string): Promise<void> => {
  const db = await getDB();
  await db.delete('certifications', id);
};

// Email Recipients CRUD
export const getAllRecipients = async (): Promise<EmailRecipient[]> => {
  const db = await getDB();
  return db.getAll('emailRecipients');
};

export const addRecipient = async (recipient: Omit<EmailRecipient, 'id' | 'createdAt'>): Promise<EmailRecipient> => {
  const db = await getDB();
  const newRecipient: EmailRecipient = {
    ...recipient,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await db.add('emailRecipients', newRecipient);
  return newRecipient;
};

export const updateRecipient = async (id: string, updates: Partial<EmailRecipient>): Promise<EmailRecipient | undefined> => {
  const db = await getDB();
  const existing = await db.get('emailRecipients', id);
  if (!existing) return undefined;
  
  const updated: EmailRecipient = { ...existing, ...updates, id };
  await db.put('emailRecipients', updated);
  return updated;
};

export const deleteRecipient = async (id: string): Promise<void> => {
  const db = await getDB();
  await db.delete('emailRecipients', id);
};

// Email Logs
export const addEmailLog = async (log: Omit<EmailLog, 'id'>): Promise<EmailLog> => {
  const db = await getDB();
  const newLog: EmailLog = { ...log, id: crypto.randomUUID() };
  await db.add('emailLogs', newLog);
  return newLog;
};

export const getEmailLogsForCertification = async (certificationId: string): Promise<EmailLog[]> => {
  const db = await getDB();
  return db.getAllFromIndex('emailLogs', 'by-certification', certificationId);
};

// Seed initial data
export const seedInitialData = async (): Promise<void> => {
  const db = await getDB();
  const existing = await db.getAll('certifications');
  
  if (existing.length === 0) {
    const initialData: Omit<Certification, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        sno: 1,
        plant: 'PEPPL (P2)',
        address: 'PLOT NO 8/B/1 AND 8/B/2, SY NO 62 P 63 P AND 88 P, E CITY, RAVIRYALA VILLAGE, MAHESHWARAM MANDAL, RANGA REDDY, TELANGANA, 501359',
        rNo: 'R-63002356',
        type: 'BIS',
        status: 'Active',
        modelList: 'Perc Monofacial M10: PE-XXXHM(where xxx- 555 to 520)\nPerc Transparent BS M10: PE-XXXHB(where xxx- 550 to 525)\nPerc Dual Glass M10: PE-XXXHGB(where xxx- 550 to 525)',
        standard: 'IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004',
        validityFrom: '2021-07-29',
        validityUpto: '2028-07-28',
        renewalStatus: '7/28/2028',
        alarmAlert: '-',
        action: '-',
      },
      {
        sno: 2,
        plant: 'PEPPL (P2)',
        address: 'PLOT NO 8/B/1 AND 8/B/2, SY NO 62 P 63 P AND 88 P, E CITY, RAVIRYALA VILLAGE, MAHESHWARAM MANDAL, RANGA REDDY, TELANGANA, 501359',
        rNo: 'ID 1111296708',
        type: 'IEC',
        status: 'Active',
        modelList: 'Perc Monofacial M10: PE-XXXHM(where xxx- 555 to 520)\nPerc Transparent BS M10: PE-XXXHB(where xxx- 555 to 525)\nPerc Dual Glass M10: PE-XXXHGB(where xxx- 560 to 525)\nTopCON Dual Glass M10: PEI-144-xxxTHGB-M10 (where xxx- 590 to 560)\nPERC Dual Glass G12: PEI-132-xxxHGB-G12(where xxx-670 to 645)\nTopCON Dual Glass G12R: PE-132-xxxTHGB-G12R (where xxx-630 to 570)',
        standard: 'IEC 61215-1:2021\nIEC 61215-1-1:2021\nIEC 61215-2:2021\nIEC 61730-1:2023\nIEC 61730-2:2023',
        validityFrom: '2025-01-24',
        validityUpto: '2030-01-23',
      },
      {
        sno: 3,
        plant: 'PEIPL (P4)',
        address: 'PLOT NOS. S-95, S-96, S-100, S-101, S-102, S-103 & S-104, RAVIRYALA, RAVIRYAL(V),MAHESWARAM(M), RANGAREDDY(D)- 501359',
        rNo: 'R-63003719',
        type: 'BIS',
        status: 'Under process',
        modelList: 'Perc Transparent M10: PEI-144-xxxHB-M10 (where xxx- 555 to 525)\nPerc Dual Glass M10: PEI-144-xxxHGB-M10 (where xxx- 555 to 525)\nTopCON Dual Glass M10: PEI-144-xxxTHGB-M10 (where xxx- 590 to 560)',
        standard: 'IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004',
        validityFrom: '2023-12-19',
        validityUpto: '2025-12-18',
        action: 'Samples are already submitted. Expected BIS certification by W3 of Jan\'26',
      },
      {
        sno: 4,
        plant: 'PEGEPL (P5)',
        address: 'S-95,S-96,S-100,S-101,S-102,S-103 AND S-104/ PART 1, E CITY,RAVIRYALA,MAHESWARAM, MAHESWARAM,RANGAREDDY-501359 TELANGANA,India-501359',
        rNo: 'R-63004740',
        type: 'BIS',
        status: 'Active',
        modelList: 'TopCON Dual Glass M10: PEI-144-xxxTHGB-M10 (where xxx- 590 to 560)\nTopCON Dual Glass G12R: PE-132-xxxTHGB-G12R (where xxx-630 to 600)\nTopCON Dual Glass G12: PE-132-xxxTHGB-G12 (where xxx-680 to 710)',
        standard: 'IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004',
        validityFrom: '2025-01-21',
        validityUpto: '2027-01-09',
      },
      {
        sno: 5,
        plant: 'PEGEPL (P6)',
        address: '303, 304, 305 AND 306/2, IALA-MAHESWARAM, RANGAREDDY',
        rNo: 'R-63005460',
        type: 'BIS',
        status: 'Active',
        modelList: 'TopCON Dual Glass G12R: PE-132-xxxTHGB-G12R (where xxx-630 to 600)',
        standard: 'IS 14286 (PART 1/SEC 1) : 2023/ IEC 61215-1-1: 2021 & IS/IEC 61730-1: 2016 & IS/IEC 61730-2: 2016',
        validityFrom: '2025-12-11',
        validityUpto: '2027-12-10',
      },
      {
        sno: 6,
        plant: 'PEGEPL (P7)',
        address: 'TBD',
        rNo: 'TBD',
        type: 'BIS',
        status: 'Pending',
        modelList: 'TBD',
        standard: 'TBD',
        validityFrom: '',
        validityUpto: '',
        action: 'Samples are already submitted. Expected BIS certification by WW3 of Jan\'26',
      },
    ];

    for (const cert of initialData) {
      await addCertification(cert);
    }
  }
};
