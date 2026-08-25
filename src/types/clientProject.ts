import type { ClientProjectStatus, ClientProjectType } from '../data/clientProjects'

export interface Client {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  messenger: string | null
  notes: string | null
  createdAt: string
}

export interface ClientProject {
  id: string
  clientId: string
  title: string
  projectType: string
  description: string | null
  task: string | null
  notes: string | null
  budget: string | null
  deadline: string | null
  status: ClientProjectStatus | string
  briefToken: string
  proposalToken: string
  createdAt: string
  updatedAt: string
  client?: Client | null
}

export interface ClientProjectListItem extends ClientProject {
  client: Client
}

export interface ClientFormValues {
  name: string
  company: string
  email: string
  phone: string
  messenger: string
  notes: string
}

export interface ClientProjectFormValues {
  clientMode: 'existing' | 'new'
  clientId: string
  client: ClientFormValues
  title: string
  projectType: ClientProjectType | string
  description: string
  task: string
  notes: string
  budget: string
  deadline: string
  status: ClientProjectStatus | string
}

export function emptyClientForm(): ClientFormValues {
  return {
    name: '',
    company: '',
    email: '',
    phone: '',
    messenger: '',
    notes: '',
  }
}

export function emptyClientProjectForm(): ClientProjectFormValues {
  return {
    clientMode: 'new',
    clientId: '',
    client: emptyClientForm(),
    title: '',
    projectType: 'Сайт',
    description: '',
    task: '',
    notes: '',
    budget: '',
    deadline: '',
    status: 'Новый',
  }
}
