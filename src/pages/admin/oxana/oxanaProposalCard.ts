export type OxanaProposalCardStatus =
  | 'open'
  | 'submitting'
  | 'created'
  | 'cancelled'

export function proposalCardHeading(
  status: OxanaProposalCardStatus,
): string {
  return status === 'created' ? 'Задача создана' : 'Черновик задачи'
}

export function isProposalCardLocked(
  status: OxanaProposalCardStatus,
): boolean {
  return status !== 'open'
}
