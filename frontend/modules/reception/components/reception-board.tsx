'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BootstrapPayload } from '@/shared/types/bootstrap';
import { getRealtimeSocket } from '@/shared/realtime/socket';
import { useReceptionDashboard, useReceptionTransition } from '../hooks/use-reception-dashboard';

const columns = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

export function ReceptionBoard({ bootstrap }: { bootstrap: BootstrapPayload }) {
  const branchId = bootstrap.branches[0]?.id;
  const dashboard = useReceptionDashboard(branchId);
  const transition = useReceptionTransition();
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getRealtimeSocket();
    socket.emit('dashboard.subscribe', { branchId });
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['reception-dashboard'] });
    socket.on('appointment.created', refresh);
    socket.on('appointment.updated', refresh);
    socket.on('appointment.checked_in', refresh);
    socket.on('dashboard.updated', refresh);
    return () => {
      socket.off('appointment.created', refresh);
      socket.off('appointment.updated', refresh);
      socket.off('appointment.checked_in', refresh);
      socket.off('dashboard.updated', refresh);
    };
  }, [branchId, queryClient]);

  if (dashboard.isLoading) return <section className="content-panel">Загрузка dashboard...</section>;
  if (dashboard.error || !dashboard.data) return <section className="content-panel error">Dashboard недоступен</section>;

  return (
    <div className="reception-layout">
      <section className="board">
        {columns.map((status) => (
          <div
            className="board-column"
            key={status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const id = event.dataTransfer.getData('appointment/id');
              if (id) transition.mutate({ id, status });
            }}
          >
            <h3>{status}</h3>
            {(dashboard.data.columns[status] ?? []).map((appointment) => (
              <article
                className="visit-card"
                key={appointment.id}
                draggable
                onDragStart={(event) => event.dataTransfer.setData('appointment/id', appointment.id)}
              >
                <strong>{appointment.patient.fullName}</strong>
                <span>{new Date(appointment.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="badge">{appointment.service?.name ?? 'Визит'}</span>
                <button onClick={() => transition.mutate({ id: appointment.id, status: 'CHECKED_IN' })}>Check-in</button>
              </article>
            ))}
          </div>
        ))}
      </section>
      <aside className="content-panel queue-panel">
        <h2>Очередь</h2>
        {dashboard.data.queue.map((item, index) => (
          <div className="queue-row" key={item.id}>
            <strong>#{index + 1}</strong>
            <span>{item.patient.fullName}</span>
            <span>{item.status}</span>
          </div>
        ))}
      </aside>
    </div>
  );
}

