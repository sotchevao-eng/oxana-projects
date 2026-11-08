import type { OxanaTask, UpdateTaskInput } from './types.js'

export function timestampsEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left && !right) {
    return true
  }
  if (!left || !right) {
    return false
  }
  const leftTime = new Date(left).getTime()
  const rightTime = new Date(right).getTime()
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return false
  }
  return leftTime === rightTime
}

function hasOwn<T extends object>(value: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export function resolveTaskUpdateGuard(
  task: OxanaTask,
  input: UpdateTaskInput,
  expectedUpdatedAt?: string | null,
): 'apply' | 'replay' | 'conflict' {
  if (!expectedUpdatedAt) {
    return 'apply'
  }
  const sameVersion = timestampsEqual(task.updatedAt, expectedUpdatedAt)
  if (!sameVersion) {
    return 'conflict'
  }
  if (taskPatchAlreadyApplied(task, input)) {
    return 'replay'
  }
  return 'apply'
}

export function taskPatchAlreadyApplied(
  task: OxanaTask,
  input: UpdateTaskInput,
): boolean {
  if (input.title !== undefined && task.title !== input.title) {
    return false
  }
  if (hasOwn(input, 'description') && (task.description ?? null) !== (input.description ?? null)) {
    return false
  }
  if (hasOwn(input, 'dueAt') && !timestampsEqual(task.dueAt, input.dueAt)) {
    return false
  }
  if (input.priority !== undefined && task.priority !== input.priority) {
    return false
  }
  if (input.status !== undefined && task.status !== input.status) {
    return false
  }
  if (hasOwn(input, 'projectId') && (task.projectId ?? null) !== (input.projectId ?? null)) {
    return false
  }
  if (hasOwn(input, 'archivedAt') && !timestampsEqual(task.archivedAt, input.archivedAt)) {
    return false
  }
  return true
}
