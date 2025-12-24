import { useState, useEffect, useCallback } from 'react';
import { 
  EmailRecipient, 
  getAllRecipients, 
  addRecipient, 
  updateRecipient, 
  deleteRecipient 
} from '@/lib/db';

export const useEmailRecipients = () => {
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRecipients = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllRecipients();
      setRecipients(data);
      setError(null);
    } catch (err) {
      setError('Failed to load recipients');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecipients();
  }, [loadRecipients]);

  const add = async (recipient: Omit<EmailRecipient, 'id' | 'createdAt'>) => {
    try {
      const newRecipient = await addRecipient(recipient);
      setRecipients(prev => [...prev, newRecipient]);
      return newRecipient;
    } catch (err) {
      setError('Failed to add recipient');
      throw err;
    }
  };

  const update = async (id: string, updates: Partial<EmailRecipient>) => {
    try {
      const updated = await updateRecipient(id, updates);
      if (updated) {
        setRecipients(prev => prev.map(r => r.id === id ? updated : r));
      }
      return updated;
    } catch (err) {
      setError('Failed to update recipient');
      throw err;
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteRecipient(id);
      setRecipients(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setError('Failed to delete recipient');
      throw err;
    }
  };

  return {
    recipients,
    loading,
    error,
    add,
    update,
    remove,
    refresh: loadRecipients,
  };
};
