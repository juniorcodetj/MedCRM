'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BootstrapPayload } from '@/shared/types/bootstrap';
import { can } from '@/shared/permissions/can';
import { useCreatePatient, usePatients } from '../hooks/use-patients';

export function PatientsPage({ bootstrap }: { bootstrap: BootstrapPayload }) {
  const [q, setQ] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const patients = usePatients(q);
  const createPatient = useCreatePatient();
  const branchId = bootstrap.branches[0]?.id;

  return (
    <div className="grid-two">
      <section className="content-panel">
        <h1>Пациенты</h1>
        <input className="search" placeholder="Поиск по ФИО, телефону или коду" value={q} onChange={(event) => setQ(event.target.value)} />
        {patients.isLoading ? <p className="muted">Загрузка...</p> : null}
        {patients.error ? <p className="error">Не удалось загрузить пациентов</p> : null}
        {patients.data?.duplicateCandidates?.length ? <p className="warn">Найдены возможные дубли: {patients.data.duplicateCandidates.length}</p> : null}
        <div className="list">
          {patients.data?.items.map((patient) => (
            <Link className="row" key={patient.id} href={`/patients/${patient.id}`}>
              <strong>{patient.fullName}</strong>
              <span>{patient.patientCode}</span>
              <span>{patient.contacts[0]?.value ?? 'Без контакта'}</span>
            </Link>
          ))}
        </div>
      </section>

      {can(bootstrap, 'patients.create') ? (
        <section className="content-panel">
          <h2>Новый пациент</h2>
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              createPatient.mutate(
                { firstName, lastName, phone, registrationBranchId: branchId },
                {
                  onSuccess: () => {
                    setFirstName('');
                    setLastName('');
                    setPhone('');
                  }
                }
              );
            }}
          >
            <input placeholder="Имя" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            <input placeholder="Фамилия" value={lastName} onChange={(event) => setLastName(event.target.value)} />
            <input placeholder="Телефон" value={phone} onChange={(event) => setPhone(event.target.value)} />
            <button className="button" disabled={createPatient.isPending}>
              {createPatient.isPending ? 'Создание...' : 'Создать'}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

