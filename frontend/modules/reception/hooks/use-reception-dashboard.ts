'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/client-api';
import { Appointment } from '@/shared/types/bootstrap';

export type ReceptionDashboard = {
  branchId: string;
  date: string;
  columns: Record<string, Appointment[]>;
  queue: Appointment[];
};

export function useReceptionDashboard(branchId?: string) {
  return useQuery({
    queryKey: ['reception-dashboard', branchId],
    queryFn: () => apiFetch<ReceptionDashboard>(`/reception/dashboard${branchId ? `?branchId=${branchId}` : ''}`)
  });
}

export function useReceptionTransition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => {
      if (status === 'CHECKED_IN') return apiFetch<Appointment>(`/appointments/${id}/check-in`, { method: 'POST', body: '{}' });
      if (status === 'CANCELLED') return apiFetch<Appointment>(`/appointments/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Reception board' }) });
      if (status === 'CONFIRMED') return apiFetch<Appointment>(`/appointments/${id}/confirm`, { method: 'POST', body: '{}' });
      return apiFetch<Appointment>(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reception-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    }
  });
}

