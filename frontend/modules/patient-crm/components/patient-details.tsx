'use client';

import { useState } from 'react';
import { usePatient, useUpdatePatient } from '../hooks/use-patients';

export function PatientDetails({ id }: { id: string }) {
  const patient = usePatient(id);
  const updatePatient = useUpdatePatient(id);
  const [status, setStatus] = useState('ACTIVE');

  if (patient.isLoading) return <section className="content-panel">Загрузка...</section>;
  if (patient.error || !patient.data) return <section className="content-panel error">Пациент не найден</section>;

  return (
    <section className="content-panel">
      <h1>{patient.data.fullName}</h1>
      <p className="muted">{patient.data.patientCode}</p>
      <div className="badges">
        <span className="badge">{patient.data.status}</span>
        {patient.data.contacts.map((contact) => (
          <span className="badge" key={contact.id}>{contact.type}: {contact.value}</span>
        ))}
      </div>
      <form
        className="inline-actions"
        onSubmit={(event) => {
          event.preventDefault();
          updatePatient.mutate({ status });
        }}
      >
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option>NEW</option>
          <option>ACTIVE</option>
          <option>SLEEPING</option>
          <option>VIP</option>
          <option>BLOCKED</option>
        </select>
        <button className="button">Обновить статус</button>
      </form>
    </section>
  );
}

