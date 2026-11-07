import { createHash } from 'node:crypto'
import type { CreateTaskInput } from './types.js'

export function hashTaskCreateInput(input: CreateTaskInput): string {
  const canonical = JSON.stringify({
    title: input.title,
    description: input.description ?? null,
    dueAt: input.dueAt ?? null,
    projectId: input.projectId ?? null,
    priority: input.priority,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export function taskCreateKeyMapId(userId: string, key: string): string {
  return `${userId}:${key}`
}
