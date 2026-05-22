'use client';

import { useState } from 'react';
import { BootstrapPayload } from '@/shared/types/bootstrap';
import { usePatients } from '@/modules/patient-crm/hooks/use-patients';
import { useCreateAppointment, useDoctors, useServices } from '../hooks/use-scheduling';

export function CreateAppointmentForm({ bootstrap }: { bootstrap: BootstrapPayload }) {
  const branchId = bootstrap.branches[0]?.id ?? '';
  const [patientQuery, setPatientQuery] = useState('');
  const [patientId, setPatientId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [startAt, setStartAt] = useState('');
  const patients = usePatients(patientQuery);
  const doctors = useDoctors();
  const services = useServices();
  const create = useCreateAppointment();

  const selectedService = services.data?.find((service) => service.id === serviceId);
  const endAt = startAt
    ? new Date(new Date(startAt).getTime() + (selectedService?.durationMinutes ?? 30) * 60000).toISOString()
    : '';

  return (
    <section className="content-panel">
      <h2>Создать запись</h2>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ branchId, patientId, employeeId, serviceId: serviceId || undefined, startAt: new Date(startAt).toISOString(), endAt });
        }}
      >
        <input placeholder="Поиск пациента" value={patientQuery} onChange={(event) => setPatientQuery(event.target.value)} />
        <select value={patientId} onChange={(event) => setPatientId(event.target.value)}>
          <option value="">Пациент</option>
          {patients.data?.items.map((patient) => (
            <option key={patient.id} value={patient.id}>{patient.fullName}</option>
          ))}
        </select>
        <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
          <option value="">Врач</option>
          {doctors.data?.map((doctor) => (
            <option key={`${doctor.id}:${doctor.branchId}`} value={doctor.id}>{doctor.name} · {doctor.role}</option>
          ))}
        </select>
        <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
          <option value="">Услуга</option>
          {services.data?.map((service) => (
            <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes} мин</option>
          ))}
        </select>
        <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
        {create.error ? <p className="error">Не удалось создать запись: {create.error.message}</p> : null}
        <button className="button" disabled={!patientId || !employeeId || !startAt || create.isPending}>
          {create.isPending ? 'Создание...' : 'Записать'}
        </button>
      </form>
    </section>
  );
}

