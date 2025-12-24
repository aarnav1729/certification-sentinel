import { useState, useEffect, useCallback } from 'react';
import { 
  Certification, 
  getAllCertifications, 
  addCertification, 
  updateCertification, 
  deleteCertification,
  seedInitialData 
} from '@/lib/db';

export const useCertifications = () => {
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCertifications = useCallback(async () => {
    try {
      setLoading(true);
      await seedInitialData();
      const data = await getAllCertifications();
      setCertifications(data.sort((a, b) => a.sno - b.sno));
      setError(null);
    } catch (err) {
      setError('Failed to load certifications');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCertifications();
  }, [loadCertifications]);

  const add = async (cert: Omit<Certification, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newCert = await addCertification(cert);
      setCertifications(prev => [...prev, newCert].sort((a, b) => a.sno - b.sno));
      return newCert;
    } catch (err) {
      setError('Failed to add certification');
      throw err;
    }
  };

  const update = async (id: string, updates: Partial<Certification>) => {
    try {
      const updated = await updateCertification(id, updates);
      if (updated) {
        setCertifications(prev => 
          prev.map(c => c.id === id ? updated : c).sort((a, b) => a.sno - b.sno)
        );
      }
      return updated;
    } catch (err) {
      setError('Failed to update certification');
      throw err;
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteCertification(id);
      setCertifications(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError('Failed to delete certification');
      throw err;
    }
  };

  return {
    certifications,
    loading,
    error,
    add,
    update,
    remove,
    refresh: loadCertifications,
  };
};
