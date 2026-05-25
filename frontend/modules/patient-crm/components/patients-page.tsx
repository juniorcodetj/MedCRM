'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Filter, Plus, Search, UserPlus } from 'lucide-react';
import { BootstrapPayload } from '@/shared/types/bootstrap';
import { can } from '@/shared/permissions/can';
import { statusLabel, statusTone } from '@/shared/ui/status';
import { useCreatePatient, usePatients, useListTags } from '../hooks/use-patients';

export function PatientsPage({ bootstrap }: { bootstrap: BootstrapPayload }) {
  const [q, setQ] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const patients = usePatients(
    q,
    selectedStatus || undefined,
    selectedTagId || undefined
  );
  const createPatient = useCreatePatient();
  const allTags = useListTags();
  const branchId = bootstrap.branches[0]?.id;

  return (
    <>
      <div className="page-header">
        <div>
          <span className="eyebrow">CRM база</span>
          <h1>Пациенты</h1>
          <p>Единый реестр пациентов, контактов, статусов, тегов и возможных дублей.</p>
        </div>
        {can(bootstrap, 'patients.create') ? (
          <div className="page-actions">
            <a className="button" href="#new-patient">
              <Plus size={18} />
              Создать пациента
            </a>
          </div>
        ) : null}
      </div>

      <div className="grid-two" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>
        <section className="content-panel">
          <div className="toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <label className="global-search search" style={{ flex: 1 }}>
                <Search size={18} />
                <input placeholder="Поиск по ФИО, телефону или коду" value={q} onChange={(event) => setQ(event.target.value)} />
              </label>
              <button
                className={`secondary-button ${showFilters ? 'active' : ''}`}
                onClick={() => setShowFilters(!showFilters)}
                type="button"
              >
                <Filter size={17} />
                Фильтры
              </button>
            </div>

            {showFilters && (
              <div className="filter-panel" style={{ display: 'flex', gap: '16px', padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="field" style={{ margin: 0, minWidth: '160px', flex: 1 }}>
                  <label htmlFor="statusFilter" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Статус</label>
                  <select
                    id="statusFilter"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    style={{ padding: '8px', width: '100%', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--ink)' }}
                  >
                    <option value="">Все статусы</option>
                    <option value="NEW">Новый</option>
                    <option value="ACTIVE">Активный</option>
                    <option value="SLEEPING">Спящий</option>
                    <option value="VIP">VIP</option>
                    <option value="BLOCKED">Ограничен</option>
                  </select>
                </div>

                <div className="field" style={{ margin: 0, minWidth: '160px', flex: 1 }}>
                  <label htmlFor="tagFilter" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Тег</label>
                  <select
                    id="tagFilter"
                    value={selectedTagId}
                    onChange={(e) => setSelectedTagId(e.target.value)}
                    style={{ padding: '8px', width: '100%', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--ink)' }}
                  >
                    <option value="">Все теги</option>
                    {allTags.data?.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {(selectedStatus || selectedTagId) && (
                  <button
                    className="secondary-button"
                    style={{ height: '38px', minHeight: 'auto', padding: '0 16px' }}
                    onClick={() => {
                      setSelectedStatus('');
                      setSelectedTagId('');
                    }}
                    type="button"
                  >
                    Сбросить
                  </button>
                )}
              </div>
            )}
          </div>

          {patients.isLoading ? <p className="muted">Загрузка...</p> : null}
          {patients.error ? <p className="error">Не удалось загрузить пациентов</p> : null}
          {patients.data?.duplicateCandidates?.length ? <p className="warn">Найдены возможные дубли: {patients.data.duplicateCandidates.length}</p> : null}

          {patients.data?.items.length ? (
            <div className="data-surface">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Пациент</th>
                    <th>Контакт</th>
                    <th>Статус</th>
                    <th>Филиал</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.data.items.map((patient) => (
                    <tr key={patient.id}>
                      <td>
                        <Link className="person-cell" href={`/patients/${patient.id}`}>
                          <span className="avatar">{patient.firstName[0]}{patient.lastName[0]}</span>
                          <span>
                            <strong>{patient.fullName}</strong>
                            <span>{patient.patientCode}</span>
                          </span>
                        </Link>
                      </td>
                      <td>{patient.contacts[0]?.value ?? <span className="muted">Без контакта</span>}</td>
                      <td>
                        <span className={`status-badge status-${statusTone(patient.status, 'patient')}`}>
                          {statusLabel(patient.status, 'patient')}
                        </span>
                      </td>
                      <td>{bootstrap.branches.find((branch) => branch.id === patient.registrationBranchId)?.name ?? 'Не указан'}</td>
                      <td>
                        <Link className="secondary-button" href={`/patients/${patient.id}`}>Открыть</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !patients.isLoading ? (
            <div className="empty-state">
              <div>
                <strong>Пациенты не найдены</strong>
                <span>Измените поиск или создайте новую карточку пациента.</span>
              </div>
            </div>
          ) : null}
        </section>

        {can(bootstrap, 'patients.create') ? (
          <aside className="content-panel" id="new-patient">
            <div className="panel-header">
              <div>
                <h2>Новый пациент</h2>
                <p className="muted">Минимальная CRM-карточка для быстрой записи.</p>
              </div>
              <UserPlus size={20} />
            </div>
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
              <div className="field">
                <label htmlFor="firstName">Имя</label>
                <input id="firstName" placeholder="Например, Мадина" value={firstName} onChange={(event) => setFirstName(event.target.value)} style={{ color: 'var(--ink)' }} />
              </div>
              <div className="field">
                <label htmlFor="lastName">Фамилия</label>
                <input id="lastName" placeholder="Например, Азизова" value={lastName} onChange={(event) => setLastName(event.target.value)} style={{ color: 'var(--ink)' }} />
              </div>
              <div className="field">
                <label htmlFor="phone">Телефон</label>
                <input id="phone" placeholder="+992..." value={phone} onChange={(event) => setPhone(event.target.value)} style={{ color: 'var(--ink)' }} />
              </div>
              <button className="button" disabled={createPatient.isPending}>
                {createPatient.isPending ? 'Создание...' : 'Создать'}
              </button>
            </form>
          </aside>
        ) : null}
      </div>
    </>
  );
}
