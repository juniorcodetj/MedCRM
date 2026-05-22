'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BootstrapPayload } from '@/shared/types/bootstrap';
import { getRealtimeSocket } from '@/shared/realtime/socket';
import { CreateAppointmentForm } from './create-appointment-form';
import { useAppointments, useTransitionAppointment } from '../hooks/use-scheduling';

export function CalendarPage({ bootstrap }: { bootstrap: BootstrapPayload }) {
  const branchId = bootstrap.branches[0]?.id;
  const appointments = useAppointments(branchId);
  const transition = useTransitionAppointment();
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getRealtimeSocket();
    socket.emit('dashboard.subscribe', { branchId });
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['reception-dashboard'] });
    };
    socket.on('appointment.created', refresh);
    socket.on('appointment.updated', refresh);
    socket.on('appointment.checked_in', refresh);
    return () => {
      socket.off('appointment.created', refresh);
      socket.off('appointment.updated', refresh);
      socket.off('appointment.checked_in', refresh);
    };
  }, [branchId, queryClient]);

  return (
    <div className="grid-two">
      <section className="content-panel">
        <h1>Календарь на сегодня</h1>
        {appointments.isLoading ? <p className="muted">Загрузка...</p> : null}
        <div className="list">
          {appointments.data?.items.map((appointment) => (
            <div className="row" key={appointment.id}>
              <strong>{new Date(appointment.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {appointment.patient.fullName}</strong>
              <span className={`badge status-${appointment.status.toLowerCase()}`}>{appointment.status}</span>
              <span>{appointment.service?.name ?? 'Без услуги'}</span>
              <div className="inline-actions">
                <button onClick={() => transition.mutate({ id: appointment.id, action: 'confirm' })}>Confirm</button>
                <button onClick={() => transition.mutate({ id: appointment.id, action: 'check-in' })}>Check-in</button>
                <button onClick={() => transition.mutate({ id: appointment.id, action: 'cancel' })}>Cancel</button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <CreateAppointmentForm bootstrap={bootstrap} />
    </div>
  );
}

