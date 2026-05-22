'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/client-api';
import { Appointment, Doctor, Service } from '@/shared/types/bootstrap';

type ListResponse<T> = { items: T[]; total: number; page: number; pageSize: number };

export function useAppointments(branchId?: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const params = new URLSearchParams({
    dateFrom: today.toISOString(),
    dateTo: tomorrow.toISOString(),
    ...(branchId ? { branchId } : {})
  });
  return useQuery({ queryKey: ['appointments', branchId], queryFn: () => apiFetch<ListResponse<Appointment>>(`/appointments?${params}`) });
}

export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: () => apiFetch<Service[]>('/services') });
}

export function useDoctors() {
  return useQuery({ queryKey: ['doctors'], queryFn: () => apiFetch<Doctor[]>('/doctors') });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { branchId: string; patientId: string; employeeId: string; serviceId?: string; startAt: string; endAt: string; notes?: string }) =>
      apiFetch<Appointment>('/appointments', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['reception-dashboard'] });
    }
  });
}

export function useTransitionAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'confirm' | 'check-in' | 'cancel' }) =>
      apiFetch<Appointment>(`/appointments/${id}/${action}`, { method: 'POST', body: JSON.stringify({ reason: action }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['reception-dashboard'] });
    }
  });
}

