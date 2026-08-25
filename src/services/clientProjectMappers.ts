import type { Client, ClientFormValues, ClientProject } from '../types/clientProject'
import type { ClientProjectRow, ClientRow } from '../types/database'

function toNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed : null
}

export function mapClientRow(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    messenger: row.messenger,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

export function mapClientProjectRow(
  row: ClientProjectRow,
  client?: Client | null,
): ClientProject {
  const nested = row.clients
  const nestedClient = Array.isArray(nested) ? nested[0] : nested

  return {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    projectType: row.project_type,
    description: row.description,
    task: row.task,
    notes: row.notes,
    budget: row.budget,
    deadline: row.deadline,
    status: row.status,
    briefToken: row.brief_token,
    proposalToken: row.proposal_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    client: client ?? (nestedClient ? mapClientRow(nestedClient) : null),
  }
}

export function clientFormToInsert(values: ClientFormValues) {
  return {
    name: values.name.trim(),
    company: toNullable(values.company),
    email: toNullable(values.email),
    phone: toNullable(values.phone),
    messenger: toNullable(values.messenger),
    notes: toNullable(values.notes),
  }
}
