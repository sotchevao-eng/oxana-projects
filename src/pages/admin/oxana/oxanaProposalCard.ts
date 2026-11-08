export type OxanaProposalCardStatus =
  | 'open'
  | 'submitting'
  | 'created'
  | 'updated'
  | 'cancelled'

export type OxanaProposalCardKind = 'create_task' | 'update_task'

export function proposalCardHeading(
  status: OxanaProposalCardStatus,
  kind: OxanaProposalCardKind = 'create_task',
): string {
  if (kind === 'update_task') {
    return status === 'updated' ? 'Задача изменена' : 'Предлагаемые изменения'
  }
  return status === 'created' ? 'Задача создана' : 'Черновик задачи'
}

export function isProposalCardLocked(
  status: OxanaProposalCardStatus,
): boolean {
  return status !== 'open'
}

export function updateDiffLabel(name: string, current: string): string {
  return `${name} · ${current} →`
}
